import { MainLayout } from "@/components/ui/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { decodeXMLValue } from "@/lib/xml-utils";
import React from 'react';

interface ExternalLink {
  Logiciel: string;
  Config: string;
  Utilisateur: string;
  MDP: string;
}

interface ExternalLinksData {
  Dossier_Import: string;
  Dossier_Export: string;
  Liaisons: ExternalLink[];
}

function parseLiaisonsFromXML(xmlStr: string): ExternalLinksData {
  if (!xmlStr) {
    return {
      Dossier_Import: '',
      Dossier_Export: '',
      Liaisons: []
    };
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "text/xml");

  const dossierImport = decodeXMLValue(xmlDoc.evaluate(
    "//Connexion/Liaisons_Externes/Dossier_Import/text()",
    xmlDoc,
    null,
    XPathResult.STRING_TYPE,
    null
  ).stringValue || '');

  const dossierExport = decodeXMLValue(xmlDoc.evaluate(
    "//Connexion/Liaisons_Externes/Dossier_Export/text()",
    xmlDoc,
    null,
    XPathResult.STRING_TYPE,
    null
  ).stringValue || '');

  const liaisons: ExternalLink[] = [];
  const liaisonNodes = xmlDoc.evaluate(
    "//Connexion/Liaisons_Externes/Liaisons/Liaison",
    xmlDoc,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );

  for (let i = 0; i < liaisonNodes.snapshotLength; i++) {
    const liaison = liaisonNodes.snapshotItem(i) as Element;
    liaisons.push({
      Logiciel: decodeXMLValue(liaison.querySelector('Logiciel')?.textContent || ''),
      Config: decodeXMLValue(liaison.querySelector('Config')?.textContent || ''),
      Utilisateur: decodeXMLValue(liaison.querySelector('Utilisateur')?.textContent || ''),
      MDP: decodeXMLValue(liaison.querySelector('MDP')?.textContent || '')
    });
  }

  while (liaisons.length < 4) {
    liaisons.push({
      Logiciel: '',
      Config: '',
      Utilisateur: '',
      MDP: ''
    });
  }

  return {
    Dossier_Import: dossierImport,
    Dossier_Export: dossierExport,
    Liaisons: liaisons
  };
}

function ExternalLinkBlock({
  liaison,
  index,
  onChange
}: {
  liaison: ExternalLink;
  index: number;
  onChange: (index: number, field: keyof ExternalLink, value: string) => void;
}) {
  return (
    <div className="p-6 border rounded-lg space-y-[3px] bg-card w-[700px]">
      <div className="grid gap-[3px]">
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-right">Logiciel maître</Label>
          <Input
            value={liaison.Logiciel}
            onChange={(e) => onChange(index, 'Logiciel', e.target.value)}
            type="text"
            className="h-9"
          />
        </div>

        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-right">Configuration maître</Label>
          <Input
            value={liaison.Config}
            onChange={(e) => onChange(index, 'Config', e.target.value)}
            type="text"
            className="h-9"
          />
        </div>

        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-right">Utilisateur logiciel</Label>
          <div className="grid grid-cols-2 gap-4">
            <Input
              value={liaison.Utilisateur}
              onChange={(e) => onChange(index, 'Utilisateur', e.target.value)}
              type="text"
              className="h-9"
            />
            <div className="grid grid-cols-[auto_1fr] items-center gap-4">
              <Label className="text-right whitespace-nowrap">Mot de passe</Label>
              <Input
                value={liaison.MDP}
                onChange={(e) => onChange(index, 'MDP', e.target.value)}
                type="password"
                className="h-9"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExternalLinksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const [formData, setFormData] = React.useState<ExternalLinksData>({
    Dossier_Import: '',
    Dossier_Export: '',
    Liaisons: []
  });

  React.useEffect(() => {
    if (user?.ConfigConnecteur) {
      const parsedData = parseLiaisonsFromXML(user.ConfigConnecteur);
      setFormData(parsedData);
    }
  }, [user?.ConfigConnecteur]);

  const handleLiaisonChange = (index: number, field: keyof ExternalLink, value: string) => {
    setFormData(prev => ({
      ...prev,
      Liaisons: prev.Liaisons.map((liaison, i) =>
        i === index ? { ...liaison, [field]: value } : liaison
      )
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('\n=== DÉBUT SAUVEGARDE LIAISONS EXTERNES ===');
      console.log('📄 [1] Données à sauvegarder:', {
        ...formData,
        Liaisons: formData.Liaisons.map(l => ({ ...l, MDP: '***' }))
      });

      const response = await apiRequest("POST", "/api/database/external-links", formData);

      console.log("📡 [2] Réponse brute:", {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
      });

      const responseText = await response.text();
      console.log("📝 [3] Corps de la réponse:", responseText);

      if (!response.ok) {
        throw new Error(responseText || "Échec de la sauvegarde des liaisons externes");
      }

      return responseText;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Sauvegarde réussie",
        description: "Les liaisons externes ont été mises à jour avec succès.",
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
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sauvegarde
            </div>
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
      <div className="space-y-3 flex flex-col items-center">
        <div className="space-y-[3px] w-[700px]">
          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-right">Répertoire d'import</Label>
            <Input
              value={formData.Dossier_Import}
              onChange={(e) => setFormData(prev => ({ ...prev, Dossier_Import: e.target.value }))}
              type="text"
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-[200px_1fr] items-center gap-4">
            <Label className="text-right">Répertoire d'export</Label>
            <Input
              value={formData.Dossier_Export}
              onChange={(e) => setFormData(prev => ({ ...prev, Dossier_Export: e.target.value }))}
              type="text"
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-4 w-full">
          {formData.Liaisons.map((liaison, index) => (
            <div key={index} className="flex justify-center">
              <ExternalLinkBlock
                liaison={liaison}
                index={index}
                onChange={handleLiaisonChange}
              />
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}