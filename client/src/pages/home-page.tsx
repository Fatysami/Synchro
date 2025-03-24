import React from "react";
import { MainLayout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Loader2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SyncButton } from "@/components/ui/sync-button";

function parseXML(xmlStr: string) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
  if (xmlDoc.querySelector('parsererror')) {
    console.error('XML parsing failed:', xmlDoc.querySelector('parsererror')?.textContent);
    return null;
  }
  return xmlDoc;
}

function extractLogicielFromTablettes(tablettes: string): string {
  if (!tablettes) return 'NC';
  const parts = tablettes.split('|');
  for (const part of parts) {
    const values = part.split(';');
    if (values.length >= 2) {
      return decodeURIComponent(escape(values[1]));
    }
  }
  return 'NC';
}

function extractFromOptions(options: string): number {
  if (!options) return 0;
  const value = options.split(';')[0];
  return parseInt(value) || 0;
}

function formatDateMAJ(dateStr: string): string {
  if (!dateStr || dateStr === 'NC' || dateStr.length < 14) return dateStr;

  try {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(8, 10);
    const minute = dateStr.substring(10, 12);

    return `${day}/${month}/${year} ${hour}:${minute}`;
  } catch (e) {
    console.error('Erreur de formatage de date:', e);
    return dateStr;
  }
}

function getConnectionStatus(xmlDoc: Document | null): { text: string, statuses: { index: number, status: string, label: string }[], hasError: boolean } {
  if (!xmlDoc) return { text: 'NC', statuses: [], hasError: false };

  const statuses: { index: number, status: string, label: string }[] = [];
  let hasError = false;
  try {
    const sourceNodes = xmlDoc.evaluate(
      '//Connexion/Sources/Source',
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < sourceNodes.snapshotLength; i++) {
      const sourceNode = sourceNodes.snapshotItem(i) as Element;
      const status = sourceNode.querySelector('Status')?.textContent || '';
      const label = sourceNode.querySelector('StatusLibelle')?.textContent || '';

      if (label.trim()) {
        if (status === "0") {
          hasError = true;
        }
        statuses.push({
          index: i + 1,
          status,
          label: decodeURIComponent(escape(label.trim()))
        });
      }
    }

    return { text: '', statuses, hasError };
  } catch (e) {
    console.error('Erreur extraction status:', e);
    return { text: 'NC', statuses: [], hasError: false };
  }
}

function getXMLValue(xmlDoc: Document | null, path: string): string {
  if (!xmlDoc) return 'NC';
  try {
    const result = xmlDoc.evaluate(
      `//${path}`,
      xmlDoc,
      null,
      XPathResult.STRING_TYPE,
      null
    ).stringValue;

    return result ? decodeURIComponent(escape(result)) : 'NC';
  } catch (e) {
    console.error(`Erreur extraction ${path}:`, e);
    return 'NC';
  }
}

export default function HomePage() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  let xmlDoc = null;
  if (user?.ConfigConnecteur) {
    try {
      xmlDoc = parseXML(user.ConfigConnecteur);
    } catch (e) {
      console.error('Erreur parsing XML:', e);
    }
  }

  const lastSyncDateStr = getXMLValue(xmlDoc, 'Connexion/DerSynchro/DateHeure');
  const lastSyncDate = new Date(formatDateMAJ(lastSyncDateStr));
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - lastSyncDate.getTime());
  const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
  const isOldSync = diffHours > 72;

  const formatPlanningCounts = (counts: { C: number, R: number, I: number } = { C: 0, R: 0, I: 0 }) => {
    if (!counts) return 'NC';
    const completes = `${counts.C} Complète${counts.C > 1 ? 's' : ''}`;
    const incrementales = `${counts.R} Incrémentale${counts.R > 1 ? 's' : ''}`;
    const importations = `${counts.I} Importation${counts.I > 1 ? 's' : ''}`;
    return `${completes} / ${incrementales} / ${importations}`;
  };

  const formattedPlanningCounts = formatPlanningCounts(user?.planningCounts);

  const countTerminals = (): number => {
    if (!xmlDoc) return 0;
    let count = 0;
    try {
      const terminals = xmlDoc.evaluate(
        '//Connexion/Terminaux/Terminal',
        xmlDoc,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      for (let i = 0; i < terminals.snapshotLength; i++) {
        const terminal = terminals.snapshotItem(i) as Element;
        const idSmartphone = terminal.querySelector('ID_Smartphone')?.textContent || '';
        const idTablette = terminal.querySelector('ID_Tablette')?.textContent || '';
        if (idSmartphone.trim() !== '' || idTablette.trim() !== '') {
          count++;
        }
      }
    } catch (e) {
      console.error('Erreur comptage terminaux:', e);
    }
    return count;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const response = await fetch('/api/server-ip');
                const data = await response.json();
                alert(`Adresse IP du serveur: ${data.ip}`);
              } catch (error) {
                console.error('Erreur lors de la récupération de l\'IP du serveur:', error);
                alert('Impossible de récupérer l\'adresse IP du serveur');
              }
            }}
          >
            Mon IP
          </Button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div className="text-right font-medium">ID de synchronisation:</div>
            <div className="text-[#36599E]">{user?.IDSynchro || 'NC'}</div>

            <div className="text-right font-medium">Logiciel à synchroniser:</div>
            <div className="text-[#36599E]">{user?.Tablettes ? extractLogicielFromTablettes(user.Tablettes) : 'NC'}</div>

            <div className="text-right font-medium">Licence NuxiDev Premium:</div>
            <div className="text-[#36599E]">{user?.Premium === 1 ? 'OUI' : 'NON'}</div>

            <div className="text-right font-medium">Version du connecteur:</div>
            <div className="text-[#36599E]">{getXMLValue(xmlDoc, 'Connexion/Info/VersionConnecteur')}</div>

            <div className="text-right font-medium">Version de NuxiAutomate installée:</div>
            {(() => {
              const nuxiAutomateInstall = getXMLValue(xmlDoc, 'Connexion/Info/NuxiAutomateInstall');
              const nuxiAutomateLibelle = getXMLValue(xmlDoc, 'Connexion/Info/NuxiAutomateLibelle');

              if (nuxiAutomateInstall === "0") {
                return <div className="text-[#36599E]">Service Non Installé</div>;
              }

              if (nuxiAutomateInstall === "-1") {
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <span style={{ color: 'red' }} className="font-bold">
                            {nuxiAutomateLibelle}
                          </span>
                          <AlertTriangle className="h-4 w-4" style={{ color: 'red' }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[400px] text-gray-600">
                        <p className="font-normal">
                          NuxiAutomate nécessite une mise à jour sur votre serveur. Depuis le connecteur de synchronisation,
                          cliquez sur "Mise à jour de NuxiAutomate" pour actualiser ce service Windows.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }

              return <div className="text-[#36599E]">{nuxiAutomateLibelle}</div>;
            })()}

            <div className="text-right font-medium">Date de configuration:</div>
            <div className="text-[#36599E]">{formatDateMAJ(getXMLValue(xmlDoc, 'Connexion/Info/DateMAJConfig'))}</div>

            <div className="text-right font-medium">Etat de la connexion aux Bases:</div>
            {(() => {
              const { statuses, hasError } = getConnectionStatus(xmlDoc);
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-2">
                          {statuses.map((s, i) => (
                            <span
                              key={i}
                              className={s.status === "0" ? "text-red-500 font-bold" : "text-[#36599E]"}
                            >
                              {i > 0 ? " - " : ""}Cnx {s.index} {s.label}
                            </span>
                          ))}
                        </div>
                        {hasError && <AlertTriangle className="h-4 w-4" style={{ color: 'red' }} />}
                      </div>
                    </TooltipTrigger>
                    {hasError && (
                      <TooltipContent className="max-w-[400px] text-gray-600">
                        <p className="font-normal">
                          La connexion à votre base de données à votre ERP a échoué, empêchant les synchronisations.
                          Veuillez utiliser l'utilitaire de reconnexion ou accéder au logiciel de synchronisation
                          pour rétablir la connexion et assurer le bon fonctionnement de NuxiDev.
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              );
            })()}

            <div className="text-right font-medium">Date de dernière synchro:</div>
            <div className={`${isOldSync ? 'text-red-500 font-bold' : 'text-[#36599E]'}`}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center">
                      {formatDateMAJ(getXMLValue(xmlDoc, 'Connexion/DerSynchro/DateHeure'))}
                      {isOldSync && <AlertTriangle className="h-4 w-4 ml-1" style={{ color: 'red' }} />}
                    </span>
                  </TooltipTrigger>
                  {isOldSync && (
                    <TooltipContent className="text-gray-600">
                      <p className="font-normal">Synchronisation requise</p>
                      <p className="font-normal">Votre dernière synchronisation date de plus de 72 heures. Vérifiez vos paramètres de connexion et de planification pour garantir un accès à jour aux données.</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="text-right font-medium">Type dernière synchro:</div>
            <div className="text-[#36599E]">{getXMLValue(xmlDoc, 'Connexion/DerSynchro/TypeDeSync')}</div>

            <div className="text-right font-medium">Durée totale dernière synchronisation:</div>
            {(() => {
              const duree = getXMLValue(xmlDoc, 'Connexion/DerSynchro/Duree');
              const dureeAlerte = getXMLValue(xmlDoc, 'Connexion/DerSynchro/DureeAlerte') === "1";

              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <span className={dureeAlerte ? "text-red-500 font-bold" : "text-[#36599E]"}>
                          {duree}
                        </span>
                        {dureeAlerte && <AlertTriangle className="h-4 w-4" style={{ color: 'red' }} />}
                      </div>
                    </TooltipTrigger>
                    {dureeAlerte && (
                      <TooltipContent className="max-w-[400px] text-gray-600">
                        <p className="font-normal">
                          La durée de synchronisation est excessive. Cela peut être dû au volume de données ou à une lenteur d'accès aux données sources de votre ERP. Informez Nuxilog de cet avertissement.
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              );
            })()}

            <div className="text-right font-medium">Nombre d'enregistrements:</div>
            <div className="text-[#36599E]">{getXMLValue(xmlDoc, 'Connexion/DerSynchro/NbEnreg')}</div>

            <div className="text-right font-medium">Vitesse de synchro BDD Lecture/Ecriture:</div>
            <div className="text-[#36599E]">{getXMLValue(xmlDoc, 'Connexion/DerSynchro/Vitesse')} Enregistrements par minute</div>

            <div className="text-right font-medium">Volume de données:</div>
            {(() => {
              const taille = getXMLValue(xmlDoc, 'Connexion/DerSynchro/Taille');
              const tailleAlerte = getXMLValue(xmlDoc, 'Connexion/DerSynchro/TailleAlerte') === "1";

              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <span className={tailleAlerte ? "text-red-500 font-bold" : "text-[#36599E]"}>
                          {taille}
                        </span>
                        {tailleAlerte && <AlertTriangle className="h-4 w-4" style={{ color: 'red' }} />}
                      </div>
                    </TooltipTrigger>
                    {tailleAlerte && (
                      <TooltipContent className="max-w-[400px] text-gray-600">
                        <p className="font-normal">
                          Le volume de données que vous synchronisez est important. Pensez à l'optimiser en réduisant l'historique ou en ne synchronisant que les éléments utiles aux utilisateurs itinérants à partir du menu "Données à synchroniser", afin de fluidifier la récupération sur les Smartphones/Tablettes.
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              );
            })()}

            <div className="text-right font-medium">API key Google restants:</div>
            <div className="text-[#36599E]">NC</div>

            <div className="text-right font-medium">Nombre de terminaux autorisés:</div>
            <div className="text-[#36599E]">{user?.Options ? extractFromOptions(user.Options) : 'NC'}</div>

            <div className="text-right font-medium">Nombre de terminaux déclarés:</div>
            <div className="text-[#36599E]">{countTerminals()}</div>

            <div className="text-right font-medium">Nombre de planifications:</div>
            <div className="text-[#36599E]">{formattedPlanningCounts}</div>
          </div>


          {/* Section du bas avec les trois groupes de boutons */}
          <div className="mt-8 space-y-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div className="text-right font-medium flex items-center justify-end">Support technique :</div>
              <div className="flex gap-2">
                <Button className="btn-nav" variant="ghost" onClick={() => window.open('https://get.teamviewer.com/9x86qyq', '_blank')}>
                  Teamviewer
                </Button>
                <Button className="btn-nav" variant="ghost" onClick={() => window.open('https://sav.nuxilog.fr/', '_blank')}>
                  sav.nuxilog.fr
                </Button>
              </div>

              <div className="text-right font-medium flex items-center justify-end">Accéder à l'espace client :</div>
              <div className="flex gap-2">
                <Button className="btn-nav" variant="ghost" onClick={() => window.open('https://nuxilog.fr/customer/login', '_blank')}>
                  Espace client
                </Button>
                <Button className="btn-nav" variant="ghost" onClick={() => window.open('https://nuxilog.fr/', '_blank')}>
                  www.nuxilog.fr
                </Button>
              </div>

              <div className="text-right font-medium flex items-center justify-end">Lancer une synchronisation :</div>
              <div className="flex gap-2">
                <SyncButton type="C" className="btn-sync">
                  Complète
                </SyncButton>
                <SyncButton type="R" className="btn-sync">
                  Incrémentale
                </SyncButton>
                <SyncButton type="I" className="btn-sync">
                  Import des saisies
                </SyncButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}