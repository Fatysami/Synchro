import React from "react";
import { MainLayout } from "@/components/ui/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { decodeXMLValue } from "@/lib/xml-utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface FamilyItem {
  IDFamille: string;
  LibelleFamille: string;
  subItems: {
    IDInterne: string;
    Libelle: string;
    isChecked: boolean;
  }[];
  isChecked: boolean;
}

interface ExclusionValue {
  familyId: string;
  subFamilyId: string | null;
}

function parseFamilyData(xmlDoc: Document, path: string, prefix: string): FamilyItem[] {
  if (!xmlDoc) return [];

  const families: FamilyItem[] = [];
  const processedIds = new Set<string>(); 

  try {
    const familyNodes = xmlDoc.evaluate(
      path,
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    
    for (let i = 0; i < familyNodes.snapshotLength; i++) {
      const family = familyNodes.snapshotItem(i) as Element;
      const idFamille = family.querySelector('IDFamille')?.textContent || '';
      const libelleFamille = decodeXMLValue(family.querySelector('LibelleFamille')?.textContent || '');

      const rawId = idFamille.split('|')[0];

      
      if (idFamille && libelleFamille && !processedIds.has(rawId)) {
        processedIds.add(rawId);
        families.push({
          IDFamille: rawId,
          LibelleFamille: libelleFamille,
          subItems: [],
          isChecked: false
        });
      }
    }

    
    for (let i = 0; i < familyNodes.snapshotLength; i++) {
      const family = familyNodes.snapshotItem(i) as Element;
      const idFamille = family.querySelector('IDFamille')?.textContent || '';
      const idInterne = family.querySelector('IDInterne')?.textContent || '';
      const libelle = decodeXMLValue(family.querySelector('Libelle')?.textContent || '');

      if (idInterne && libelle) {
        const parentId = idFamille.split('|')[0];
        const parentFamily = families.find(f => f.IDFamille === parentId);

        
        if (parentFamily && !parentFamily.subItems.some(item => item.IDInterne === idInterne)) {
          parentFamily.subItems.push({
            IDInterne: idInterne,
            Libelle: libelle,
            isChecked: false
          });
        }
      }
    }
  } catch (e) {
    console.error('Erreur extraction familles:', e);
  }

  return families;
}

function getExclusions(xmlDoc: Document): ExclusionValue[] {
  const exclusions: ExclusionValue[] = [];
  try {
    const exclusionNodes = xmlDoc.evaluate(
      '//Connexion/Exclusions/Exclusion/Valeurs/Valeur/IDInterne',
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < exclusionNodes.snapshotLength; i++) {
      const exclusion = exclusionNodes.snapshotItem(i) as Element;
      const idInterne = decodeXMLValue(exclusion.textContent || '');
      if (idInterne) {
        const [familyId, subFamilyId] = idInterne.split('|');
        exclusions.push({
          familyId,
          subFamilyId: subFamilyId || null
        });
      }
    }
  } catch (e) {
    console.error('Erreur extraction exclusions:', e);
  }
  return exclusions;
}

function markExclusions(families: FamilyItem[], exclusions: ExclusionValue[]): FamilyItem[] {
  return families.map(family => {
    const familyExclusions = exclusions.filter(e => e.familyId === family.IDFamille);

    
    const isExplicitlyExcluded = familyExclusions.some(e => !e.subFamilyId);

    
    const subItemsWithExclusions = family.subItems.map(item => ({
      ...item,
      isChecked: familyExclusions.some(e => e.subFamilyId === item.IDInterne)
    }));

    return {
      ...family,
      isChecked: isExplicitlyExcluded,
      subItems: subItemsWithExclusions
    };
  });
}

export function FamilyExclusionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const [itemFamilies, setItemFamilies] = React.useState<FamilyItem[]>([]);
  const [customerFamilies, setCustomerFamilies] = React.useState<FamilyItem[]>([]);
  const [supplierFamilies, setSupplierFamilies] = React.useState<FamilyItem[]>([]);

  React.useEffect(() => {
    if (user?.ConfigConnecteur) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(user.ConfigConnecteur, "text/xml");

        const exclusions = getExclusions(xmlDoc);

        const items = parseFamilyData(xmlDoc, '//Connexion/Data/CMB_FAMILLEARTICLE/FAMILLEARTICLE', 'ART');
        setItemFamilies(markExclusions(items, exclusions));

        const customers = parseFamilyData(xmlDoc, '//Connexion/Data/CMB_FAMILLECLIENT/FAMILLECLIENT', 'CLI');
        setCustomerFamilies(markExclusions(customers, exclusions));

        const suppliers = parseFamilyData(xmlDoc, '//Connexion/Data/CMB_FAMILLEFOURNISSEUR/FAMILLEFOURNISSEUR', 'FOU');
        setSupplierFamilies(markExclusions(suppliers, exclusions));

      } catch (e) {
        console.error('Erreur lors du parsing XML:', e);
      }
    }
  }, [user?.ConfigConnecteur]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('=== DÉBUT SAUVEGARDE EXCLUSIONS ===');

      const getExclusions = (families: FamilyItem[], prefix: string) => {
        const exclusions: { id: string, type: string }[] = [];

        families.forEach(family => {
          
          if (family.isChecked) {
            exclusions.push({
              id: family.IDFamille,
              type: prefix
            });
          } else {
            
            family.subItems.forEach(subItem => {
              if (subItem.isChecked) {
                exclusions.push({
                  id: `${family.IDFamille}|${subItem.IDInterne}`,
                  type: prefix
                });
              }
            });
          }
        });

        return exclusions;
      };

      const allExclusions = [
        ...getExclusions(itemFamilies, 'ART'),
        ...getExclusions(customerFamilies, 'CLI'),
        ...getExclusions(supplierFamilies, 'FOU')
      ];

      console.log('📄 Exclusions à sauvegarder:', allExclusions);

      const response = await apiRequest("POST", "/api/database/exclusions", {
        exclusions: allExclusions
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Échec de la sauvegarde des exclusions");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Sauvegarde réussie",
        description: "Les exclusions ont été mises à jour.",
      });
    },
    onError: (error: Error) => {
      console.error("❌ [Sauvegarde] Erreur:", error);
      toast({
        title: "Erreur de sauvegarde",
        description: `Une erreur est survenue : ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return (
    <MainLayout>
      <div className="flex justify-end mb-6">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-[116px] h-[38px] bg-[#36599E] hover:bg-[#0A2A69] active:bg-[#85A3DE] text-white text-[14px] rounded-[4px] font-normal gap-2"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sauvegarde
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
      {/* Grille des familles */}
      <div className="grid grid-cols-3 gap-6">
        {/* Famille articles */}
        <div className="border rounded-lg p-6 shadow-sm bg-white">
          <h3 className="font-medium mb-4">Famille articles</h3>
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-1">
              {itemFamilies.map((family) => (
                <div key={family.IDFamille} className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={family.isChecked}
                      onCheckedChange={(checked) => {
                        setItemFamilies(prev => prev.map(f =>
                          f.IDFamille === family.IDFamille
                            ? { ...f, isChecked: checked as boolean }
                            : f
                        ));
                      }}
                    />
                    <span>{family.LibelleFamille}</span>
                  </div>
                  {family.subItems.map((subItem) => (
                    <div key={subItem.IDInterne} className="flex items-center space-x-2 ml-6">
                      <Checkbox
                        checked={family.isChecked || subItem.isChecked}
                        disabled={family.isChecked}
                        onCheckedChange={(checked) => {
                          setItemFamilies(prev => prev.map(f =>
                            f.IDFamille === family.IDFamille
                              ? {
                                  ...f,
                                  subItems: f.subItems.map(si =>
                                    si.IDInterne === subItem.IDInterne
                                      ? { ...si, isChecked: checked as boolean }
                                      : si
                                  )
                                }
                              : f
                          ));
                        }}
                      />
                      <span>{subItem.Libelle}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Famille clients */}
        <div className="border rounded-lg p-6 shadow-sm bg-white">
          <h3 className="font-medium mb-4">Famille clients</h3>
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-1">
              {customerFamilies.map((family) => (
                <div key={family.IDFamille} className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={family.isChecked}
                      onCheckedChange={(checked) => {
                        setCustomerFamilies(prev => prev.map(f =>
                          f.IDFamille === family.IDFamille
                            ? { ...f, isChecked: checked as boolean }
                            : f
                        ));
                      }}
                    />
                    <span>{family.LibelleFamille}</span>
                  </div>
                  {family.subItems.map((subItem) => (
                    <div key={subItem.IDInterne} className="flex items-center space-x-2 ml-6">
                      <Checkbox
                        checked={family.isChecked || subItem.isChecked}
                        disabled={family.isChecked}
                        onCheckedChange={(checked) => {
                          setCustomerFamilies(prev => prev.map(f =>
                            f.IDFamille === family.IDFamille
                              ? {
                                  ...f,
                                  subItems: f.subItems.map(si =>
                                    si.IDInterne === subItem.IDInterne
                                      ? { ...si, isChecked: checked as boolean }
                                      : si
                                  )
                                }
                              : f
                          ));
                        }}
                      />
                      <span>{subItem.Libelle}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Famille fournisseurs */}
        <div className="border rounded-lg p-6 shadow-sm bg-white">
          <h3 className="font-medium mb-4">Famille fournisseurs</h3>
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-1">
              {supplierFamilies.map((family) => (
                <div key={family.IDFamille} className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={family.isChecked}
                      onCheckedChange={(checked) => {
                        setSupplierFamilies(prev => prev.map(f =>
                          f.IDFamille === family.IDFamille
                            ? { ...f, isChecked: checked as boolean }
                            : f
                        ));
                      }}
                    />
                    <span>{family.LibelleFamille}</span>
                  </div>
                  {family.subItems.map((subItem) => (
                    <div key={subItem.IDInterne} className="flex items-center space-x-2 ml-6">
                      <Checkbox
                        checked={family.isChecked || subItem.isChecked}
                        disabled={family.isChecked}
                        onCheckedChange={(checked) => {
                          setSupplierFamilies(prev => prev.map(f =>
                            f.IDFamille === family.IDFamille
                              ? {
                                  ...f,
                                  subItems: f.subItems.map(si =>
                                    si.IDInterne === subItem.IDInterne
                                      ? { ...si, isChecked: checked as boolean }
                                      : si
                                  )
                                }
                              : f
                          ));
                        }}
                      />
                      <span>{subItem.Libelle}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </MainLayout>
  );
}

export default FamilyExclusionsPage;