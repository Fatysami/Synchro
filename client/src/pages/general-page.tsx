import { MainLayout } from "@/components/layouts/main-layout";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "@/lib/types";
import { SyncButton } from "@/components/ui/sync-button";
import { useToast } from "@/hooks/use-toast";

// Fonction utilitaire pour extraire le logiciel
function extractLogicielFromTablettes(tablettes: string): string {
  if (!tablettes) return 'NC';
  try {
    const match = tablettes.match(/Libelle="([^"]+)"/);
    return match ? match[1] : 'NC';
  } catch (e) {
    console.error('Erreur extraction logiciel:', e);
    return 'NC';
  }
}

// Fonction pour récupérer des valeurs du XML
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

// Fonction pour parser le XML
function parseXML(xmlString: string): Document | null {
  try {
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, "text/xml");
  } catch (e) {
    console.error('Erreur parsing XML:', e);
    return null;
  }
}

export default function GeneralPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Requête des données utilisateur
  const { data: user, error: userError, isLoading, refetch } = useQuery<User>({
    queryKey: ["/api/user"],
    retry: false
  });

  // Fonction de rafraîchissement améliorée
  const handleRefreshPlannings = async () => {
    console.log("🔄 [Refresh] Début rafraîchissement planifications...");
    try {
      await queryClient.cancelQueries({ queryKey: ["/api/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      const result = await refetch();

      if (result.data?.planningCounts) {
        toast({
          title: "Rafraîchissement réussi",
          description: `Planifications: ${result.data.planningCounts.C} Complète, ${result.data.planningCounts.R} Incrémentale, ${result.data.planningCounts.I} Importation`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erreur de rafraîchissement",
          description: "Impossible de récupérer les planifications",
        });
      }
    } catch (error) {
      console.error("❌ [Refresh] Erreur:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Échec du rafraîchissement des planifications",
      });
    }
  };

  let xmlDoc = null;
  if (user?.ConfigConnecteur) {
    try {
      xmlDoc = parseXML(user.ConfigConnecteur);
    } catch (e) {
      console.error('Erreur parsing XML:', e);
    }
  }

  // Formatage des comptages
  const planningCounts = user?.planningCounts || { C: 0, R: 0, I: 0 };
  const formattedPlanningCounts = `${planningCounts.C} Complète / ${planningCounts.R} Incrémentale / ${planningCounts.I} Importation`;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshPlannings}
            className="flex items-center gap-1"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Test Refresh Plannif</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div className="text-right font-medium">ID de synchronisation:</div>
          <div>{user?.IDSynchro || 'NC'}</div>

          <div className="text-right font-medium">Logiciel à synchroniser:</div>
          <div>{user?.Tablettes ? extractLogicielFromTablettes(user.Tablettes) : 'NC'}</div>

          <div className="text-right font-medium">Licence NuxiDev Premium:</div>
          <div>{user?.Premium === 1 ? 'OUI' : 'NON'}</div>

          <div className="text-right font-medium">Version du connecteur:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/Info/VersionConnecteur')}</div>

          <div className="text-right font-medium">Version de NuxiAutomate installée:</div>
          {(() => {
            const nuxiAutomateInstall = getXMLValue(xmlDoc, 'Connexion/Info/NuxiAutomateInstall');
            const nuxiAutomateLibelle = getXMLValue(xmlDoc, 'Connexion/Info/NuxiAutomateLibelle');

            if (nuxiAutomateInstall === "0") {
              return <div>Service Non Installé</div>;
            } else {
              return <div>{nuxiAutomateLibelle}</div>;
            }
          })()}

          <div className="text-right font-medium">Date de configuration:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/Info/DateConfiguration')}</div>

          <div className="text-right font-medium">Etat de la connexion aux Bases:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/Info/ConnexionBDDEtat')}</div>

          <div className="text-right font-medium">Date de dernière synchro:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/DerSynchro/DateHeure')}</div>

          <div className="text-right font-medium">Type dernière synchro:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/DerSynchro/TypeDeSync')}</div>

          <div className="text-right font-medium">Durée totale dernière synchronisation:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/DerSynchro/Duree')}</div>

          <div className="text-right font-medium">Nombre d'enregistrements:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/DerSynchro/NbEnreg')}</div>

          <div className="text-right font-medium">Vitesse de synchro BDD Lecture/Ecriture:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/DerSynchro/VitesseEnregMin')} Enregistrements par minute</div>

          <div className="text-right font-medium">Volume de données:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/DerSynchro/VolumeDonnees')} Mo</div>

          <div className="text-right font-medium">API key Google restants:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/Complement/APIKey_Google')}</div>

          <div className="text-right font-medium">Nombre de terminaux autorisés:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/Info/NbTerminauxAutorises')}</div>

          <div className="text-right font-medium">Nombre de terminaux déclarés:</div>
          <div>{getXMLValue(xmlDoc, 'Connexion/Info/NbTerminauxDeclares')}</div>

          <div className="text-right font-medium">Nombre de planifications:</div>
          <div>{formattedPlanningCounts}</div>

          <div className="text-right font-medium">Support technique :</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open('https://get.teamviewer.com/9x86qyq', '_blank')}>
              Teamviewer
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open('https://sav.nuxilog.fr/', '_blank')}>
              sav.nuxilog.fr
            </Button>
          </div>

          <div className="text-right font-medium">Accéder à l'espace client :</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open('https://nuxilog.fr/customer/login', '_blank')}>
              Espace client
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open('https://nuxilog.fr/', '_blank')}>
              www.nuxilog.fr
            </Button>
          </div>

          <div className="text-right font-medium">Lancer une synchronisation :</div>
          <div className="flex gap-2">
            <SyncButton type="C" className="bg-blue-600 hover:bg-blue-700">
              Complète
            </SyncButton>
            <SyncButton type="R" className="bg-green-600 hover:bg-green-700">
              Incrémentale
            </SyncButton>
            <SyncButton type="I" className="bg-purple-600 hover:bg-purple-700">
              Import de saisies
            </SyncButton>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}