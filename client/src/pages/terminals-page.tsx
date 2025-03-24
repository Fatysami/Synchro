import { MainLayout } from "@/components/ui/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TriStateCheckbox } from "@/components/ui/tri-state-checkbox";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Terminal, parseTerminalsFromXML, parseTechniciansFromXML, parseDepotsFromXML } from "@/utils/xml-parser";

interface SelectedCommercial {
  id: string;
  label: string;
}

export default function TerminalsPage() {
  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);
  const terminals = user?.ConfigConnecteur ? parseTerminalsFromXML(user.ConfigConnecteur) : [];
  const techniciens = user?.ConfigConnecteur ? parseTechniciansFromXML(user.ConfigConnecteur) : [];
  const depots = user?.ConfigConnecteur ? parseDepotsFromXML(user.ConfigConnecteur) : [];

  const [selectedCommercials, setSelectedCommercials] = useState<SelectedCommercial[]>([]);
  const { toast } = useToast();

  const updateConfigMutation = useMutation({
    mutationFn: async (updatedTerminal: Terminal) => {
      console.log('Envoi de la mise à jour:', updatedTerminal);
      const res = await apiRequest("PATCH", "/api/config/terminal", {
        terminalIndex: updatedTerminal.xmlIndex,
        terminal: {
          Nom: updatedTerminal.Nom,
          ID_Tablette: updatedTerminal.ID_Tablette,
          ID_Smartphone: updatedTerminal.ID_Smartphone,
          Filtres: {
            Techniciens: {
              Technicien: {
                IDInterne: updatedTerminal.technicienId
              }
            },
            Depots: {
              Depot: {
                IDInterne: updatedTerminal.depotId
              }
            },
            Commerciaux: {
              Commercial: updatedTerminal.commerciaux.map(c => ({
                IDInterne: c.IDInterne,
                Libelle: c.Libelle
              }))
            }
          },
          Autorisations: {
            Autorisation: updatedTerminal.authorizations.map(auth => ({
              ID: auth.ID,
              Autorise: auth.Autorise,
              Libelle: auth.Libelle
            }))
          }
        }
      });

      if (!res.ok) {
        console.error("Error updating config:", res.status, await res.text());
        const error = await res.text();
        throw new Error(error || 'Une erreur est survenue lors de la sauvegarde');
      }

      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Succès",
        description: "Les modifications ont été enregistrées avec succès",
      });
    },
    onError: (error: Error) => {
      console.error('Erreur de mise à jour:', error);
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la sauvegarde",
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    if (terminals.length > 0 && !selectedTerminal) {
      setSelectedTerminal(terminals[0]);
      setSelectedCommercials(
        terminals[0].commerciaux.map(c => ({
          id: c.IDInterne,
          label: c.Libelle
        }))
      );
    }
  }, [terminals]);

  const [editableTerminal, setEditableTerminal] = useState<Terminal | null>(null);

  useEffect(() => {
    if (selectedTerminal) {
      setEditableTerminal({ ...selectedTerminal });
      setSelectedCommercials(
        selectedTerminal.commerciaux.map(c => ({
          id: c.IDInterne,
          label: c.Libelle
        }))
      );
    }
  }, [selectedTerminal]);

  const handleInputChange = (field: keyof Terminal, value: string) => {
    if (editableTerminal) {
      setEditableTerminal({
        ...editableTerminal,
        [field]: value
      });
    }
  };

  const handleCommercialSelect = (commercialId: string) => {
    const commercial = techniciens.find(c => c.IDInterne === commercialId);
    if (commercial) {
      const newCommercial = {
        id: commercial.IDInterne,
        label: `${commercial.Nom} ${commercial.Prenom}`
      };
      setSelectedCommercials([...selectedCommercials, newCommercial]);
    }
  };

  const handleCommercialRemove = (commercialId: string) => {
    setSelectedCommercials(selectedCommercials.filter(c => c.id !== commercialId));
  };

  const handleCheckAll = () => {
    if (selectedTerminal) {
      const updatedTerminal = { ...selectedTerminal };
      updatedTerminal.authorizations = updatedTerminal.authorizations.map(auth => ({
        ...auth,
        Autorise: 1
      }));
      setSelectedTerminal(updatedTerminal);
    }
  };

  const handleUncheckAll = () => {
    if (selectedTerminal) {
      const updatedTerminal = { ...selectedTerminal };
      updatedTerminal.authorizations = updatedTerminal.authorizations.map(auth => ({
        ...auth,
        Autorise: 0
      }));
      setSelectedTerminal(updatedTerminal);
    }
  };

  const handleValidate = () => {
    console.log("Handle Validate called");
    if (!editableTerminal || !selectedTerminal) return;

    const updatedTerminal: Terminal = {
      ...editableTerminal,
      xmlIndex: selectedTerminal.xmlIndex,
      commerciaux: selectedCommercials.map(commercial => ({
        IDInterne: commercial.id,
        Libelle: commercial.label
      }))
    };

    console.log('Validation du terminal:', updatedTerminal);
    updateConfigMutation.mutate(updatedTerminal);
  };

  return (
    <MainLayout>
      <div className="flex gap-6 h-[calc(100vh-4rem)]">
        <div className="w-1/3 border rounded-lg">
          <div className="p-3 bg-muted font-medium">
            Liste des terminaux
          </div>
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="p-4 space-y-2">
              {terminals.map((terminal, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg cursor-pointer hover:bg-accent/50 ${
                    selectedTerminal === terminal
                      ? 'border-[#36599D] border-2 bg-blue-50'
                      : 'border border-gray-200'
                  }`}
                  onClick={() => setSelectedTerminal(terminal)}
                >
                  <div className={`font-medium ${selectedTerminal === terminal ? 'text-[#36599D]' : ''} flex justify-between`}>
                    <span>{terminal.Nom}</span>
                    <span className="text-gray-500 text-xs">{terminal.xmlIndex + 1}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Tablette: {terminal.ID_Tablette}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Smartphone: {terminal.ID_Smartphone}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 border rounded-lg">
          <div className="p-3 bg-muted font-medium flex justify-between items-center">
            <span>Édition du terminal</span>
            <Button
              onClick={handleValidate}
              disabled={!editableTerminal || updateConfigMutation.isPending}
              className="w-[116px] h-[38px] bg-[#36599E] hover:bg-[#0A2A69] active:bg-[#85A3DE] text-white text-[14px] rounded-[4px] font-normal gap-2"
            >
              {updateConfigMutation.isPending ? (
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

          <div className="p-4">
            {editableTerminal ? (
              <div className="space-y-4">
                <div className="grid grid-cols-[200px,1fr] items-center gap-4">
                  <label className="text-sm font-medium">
                    Nom de l'utilisateur
                  </label>
                  <Input
                    value={editableTerminal.Nom}
                    onChange={(e) => handleInputChange('Nom', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-[200px,1fr] items-center gap-4">
                  <label className="text-sm font-medium">
                    Identifiant Tablette / PC
                  </label>
                  <Input
                    value={editableTerminal.ID_Tablette}
                    onChange={(e) => handleInputChange('ID_Tablette', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-[200px,1fr] items-center gap-4">
                  <label className="text-sm font-medium">
                    Identifiant Smartphone
                  </label>
                  <Input
                    value={editableTerminal.ID_Smartphone}
                    onChange={(e) => handleInputChange('ID_Smartphone', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-[200px,1fr] items-center gap-4">
                  <label className="text-sm font-medium">
                    Technicien par défaut
                  </label>
                  <Select
                    value={editableTerminal.technicienId}
                    onValueChange={(e) => handleInputChange('technicienId', e)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un technicien" />
                    </SelectTrigger>
                    <SelectContent>
                      {techniciens.map((tech) => (
                        <SelectItem key={tech.IDInterne} value={tech.IDInterne}>
                          {`${tech.Nom} ${tech.Prenom}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-[200px,1fr] items-center gap-4">
                  <label className="text-sm font-medium">
                    Dépôt par défaut
                  </label>
                  <Select
                    value={editableTerminal.depotId}
                    onValueChange={(e) => handleInputChange('depotId', e)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un dépôt" />
                    </SelectTrigger>
                    <SelectContent>
                      {depots.map((depot) => (
                        <SelectItem key={depot.IDInterne} value={depot.IDInterne}>
                          {depot.Libelle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-[200px,1fr] items-start gap-4">
                  <label className="text-sm font-medium">
                    Filtre Commerciaux
                  </label>
                  <div>
                    <Select onValueChange={handleCommercialSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un commercial" />
                      </SelectTrigger>
                      <SelectContent>
                        {techniciens.map((tech) => (
                          <SelectItem key={tech.IDInterne} value={tech.IDInterne}>
                            {`${tech.Nom} ${tech.Prenom}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 min-h-[3rem] border rounded-md p-2 flex gap-1 flex-wrap">
                      {selectedCommercials.map((commercial) => (
                        <div key={commercial.id} className="px-2 py-1 bg-[#36599E] text-white rounded flex items-center gap-2 text-sm">
                          {commercial.label}
                          <button
                            className="hover:bg-[#0A2A69] rounded p-1"
                            onClick={() => handleCommercialRemove(commercial.id)}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Autorisations</span>
                    <div className="space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCheckAll}
                        className="text-xs"
                      >
                        Tout cocher
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUncheckAll}
                        className="text-xs"
                      >
                        Tout décocher
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-md">
                    <div className="grid grid-cols-[100px,1fr] gap-4 p-2 bg-muted font-medium text-sm">
                      <div>État</div>
                      <div>Fonctionnalités</div>
                    </div>
                    <ScrollArea className="h-[120px]">
                      <div className="p-1 space-y-0.5">
                        {selectedTerminal?.authorizations?.map((auth, index) => (
                          <div key={auth.ID} className="grid grid-cols-[100px,1fr] gap-4 items-center px-2 py-0.5 hover:bg-accent/50">
                            <div className="flex justify-center">
                              <TriStateCheckbox
                                state={auth.Autorise}
                                onStateChange={(newState) => {
                                  const updatedTerminal = { ...selectedTerminal };
                                  updatedTerminal.authorizations[index].Autorise = newState;
                                  setSelectedTerminal(updatedTerminal);
                                }}
                              />
                            </div>
                            <div className="text-sm">{auth.Libelle}</div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                Sélectionnez un terminal pour l'éditer
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}