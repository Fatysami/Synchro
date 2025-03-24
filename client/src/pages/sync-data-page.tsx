import { MainLayout } from "@/components/ui/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Spinner, SpinnerOverlay } from "@/components/ui/spinner";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { decodeXMLValue } from "@/lib/xml-utils";

interface SyncDataItem {
  Reference: string;
  Complete: string;
  Libelle: string;
  Histo: string;
  CanHaveHistory: boolean;
}

interface ElementSync {
  Code: string;
  Histo: string;
}

function parseDataFromXML(xmlStr: string): SyncDataItem[] {
  if (!xmlStr) {
    console.log('XML vide, retour tableau vide');
    return [];
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
  const dataList: SyncDataItem[] = [];

  try {
    console.log('Début parsing XML');

    // Vérifier les erreurs de parsing
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      console.error('Erreur parsing XML:', parseError.textContent);
      return [];
    }

    // Récupérer d'abord les éléments de synchronisation et leurs configurations d'historique
    const elementsSync: ElementSync[] = [];
    const elementsSyncNode = xmlDoc.querySelector('Connexion > Data > ElementsSync');
    if (elementsSyncNode) {
      const elements = elementsSyncNode.getElementsByTagName('Element');
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        elementsSync.push({
          Code: decodeXMLValue(element.querySelector('Code')?.textContent || ''),
          Histo: decodeXMLValue(element.querySelector('Histo')?.textContent || '0')
        });
      }
    }

    // Récupérer les données à synchroniser
    const donneesNode = xmlDoc.querySelector('Connexion > Donnees_A_Synchroniser');
    if (!donneesNode) {
      console.log('Noeud Donnees_A_Synchroniser non trouvé');
      return [];
    }

    const donnees = donneesNode.getElementsByTagName('Donnee');
    console.log(`Nombre de données trouvées: ${donnees.length}`);

    for (let i = 0; i < donnees.length; i++) {
      const donnee = donnees[i];
      const reference = decodeXMLValue(donnee.querySelector('Reference')?.textContent || '');

      // Vérifier si cet élément peut avoir un historique
      const elementSync = elementsSync.find(el => el.Code === reference);
      const canHaveHistory = elementSync?.Histo === '1';

      const item: SyncDataItem = {
        Reference: reference,
        Complete: decodeXMLValue(donnee.querySelector('Complete')?.textContent || '0'),
        Libelle: decodeXMLValue(donnee.querySelector('Libelle')?.textContent || ''),
        Histo: decodeXMLValue(donnee.querySelector('Histo')?.textContent || '0'),
        CanHaveHistory: canHaveHistory
      };
      console.log(`Donnée ${i + 1}:`, {
        ...item,
        canHaveHistory: item.CanHaveHistory ? 'Oui' : 'Non'
      });
      dataList.push(item);
    }

    console.log('Parsing terminé avec succès');
  } catch (e) {
    console.error('Erreur lors du parsing XML:', e);
  }

  return dataList;
}

export default function SyncDataPage() {
  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [syncDataList, setSyncDataList] = useState<SyncDataItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  useEffect(() => {
    console.log('Effect - Initialisation des données');
    if (user?.ConfigConnecteur) {
      console.log('ConfigConnecteur trouvé, parsing...');
      const data = parseDataFromXML(user.ConfigConnecteur);
      setSyncDataList(data);
      setIsLoading(false);
    }
  }, [user?.ConfigConnecteur]);

  const [selectAll, setSelectAll] = useState(false);

  const handleSelectAll = (checked: boolean) => {
    console.log('Sélection globale:', checked);
    setSelectAll(checked);
    setSyncDataList(syncDataList.map(data => ({
      ...data,
      Complete: checked ? "1" : "0"
    })));
  };

  const handleCheckboxChange = async (reference: string, checked: boolean) => {
    console.log('Changement checkbox:', { reference, checked });
    setIsUpdating(reference);

    setSyncDataList(prevList =>
      prevList.map(item =>
        item.Reference === reference ? { ...item, Complete: checked ? "1" : "0" } : item
      )
    );

    setIsUpdating(null);
  };

  const handleHistoChange = (reference: string, value: string) => {
    console.log('Changement historique:', { reference, value });
    // Ne garder que les chiffres
    const numericValue = value.replace(/[^0-9]/g, '');
    setSyncDataList(syncDataList.map(data =>
      data.Reference === reference ? { ...data, Histo: numericValue } : data
    ));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('\n=== DÉBUT SAUVEGARDE ===');
      console.log('Données à sauvegarder:', syncDataList.length, 'éléments');

      const response = await apiRequest('POST', '/api/sync-data/save', {
        syncData: syncDataList,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erreur réponse:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(errorText);
      }

      return response.json();
    },
    onSuccess: () => {
      console.log('Sauvegarde réussie');
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Succès",
        description: "Les données de synchronisation ont été sauvegardées",
      });
    },
    onError: (error: Error) => {
      console.error('Erreur sauvegarde:', error);
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la sauvegarde",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    console.log("Début de la sauvegarde");
    saveMutation.mutate();
  };

  return (
    <MainLayout>
      {isLoading && <SpinnerOverlay message="Chargement des données à synchroniser..." />}

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={selectAll}
              onCheckedChange={handleSelectAll}
            />
            <label htmlFor="select-all" className="text-sm font-medium">
              Tout
            </label>
          </div>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-[116px] h-[38px] bg-[#36599E] hover:bg-[#0A2A69] active:bg-[#85A3DE] text-white text-[14px] rounded-[4px] font-normal gap-2"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                </svg>
                Valider
              </>
            )}
          </Button>
        </div>

        <div className="border rounded-md">
          <div className="grid grid-cols-[100px,1fr,120px] gap-3 p-2 bg-muted font-medium text-sm">
            <div className="text-center">Synchroniser</div>
            <div className="text-center">Données à synchroniser</div>
            <div className="text-right">Historique</div>
          </div>
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
            {syncDataList.map((data, index) => (
              <div
                key={data.Reference}
                className="grid grid-cols-[100px,1fr,120px] gap-3 px-2 py-1 items-center hover:bg-accent/50 text-sm"
              >
                <div className="flex justify-center">
                  <Checkbox
                    checked={data.Complete === "1"}
                    onCheckedChange={(checked) => handleCheckboxChange(data.Reference, checked as boolean)}
                  />
                  {isUpdating === data.Reference && <Spinner className="ml-2 h-4 w-4" />}
                </div>
                <div>{data.Libelle}</div>
                <div className="w-32 text-right flex items-center justify-end gap-2">
                  {data.CanHaveHistory && (
                    <>
                      <Input
                        type="number"
                        min="0"
                        max="10000"
                        step="1"
                        value={data.Histo === "0" ? "" : data.Histo}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (!isNaN(value) && value <= 10000) {
                            handleHistoChange(data.Reference, e.target.value);
                          }
                        }}
                        className="text-right h-7 w-20"
                        onKeyDown={(e) => {
                          // Empêcher la saisie de décimales
                          if (e.key === '.' || e.key === ',') {
                            e.preventDefault();
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {data.Histo && parseInt(data.Histo) > 0 && 
                          (parseInt(data.Histo) <= 10 ? "Documents" : "Jours")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}