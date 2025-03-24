import { MainLayout } from "@/components/ui/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { decodeXMLValue } from "@/lib/xml-utils";

interface SourceData {
  Provider: string;
  Serveur: string;
  Nom_BDD: string;
  Lecture_Seule: string;
  Utilisateur: string;
  MDP: string;
}

const PROVIDERS = [
  { display: "Pas de connexion", value: "empty" },
  { display: "CLOUD POUR VERSION SAAS", value: "CLOUD" },
  { display: "ODBC 32/64 bits", value: "MSDASQL" },
  { display: "OLE DB POUR SQL Server", value: "SQLOLEDB" },
  { display: "OLE DB POUR Access 97", value: "Microsoft.Jet.OLEDB.3.51" },
  { display: "OLE DB POUR Access 2000", value: "Microsoft.Jet.OLEDB.4.0" },
  { display: "Natif HFSQL C/S", value: "WinDevClientServeurHF" },
  { display: "Natif HFSQL Classic", value: "WinDevHF7" }
];

interface DatabaseConnectionBlockProps {
  source: SourceData;
  index: number;
  onChange: (index: number, field: keyof SourceData, value: string) => void;
}

function DatabaseConnectionBlock({ source, index, onChange }: DatabaseConnectionBlockProps) {
  const providerValue = source.Provider === "" ? "empty" : source.Provider;
  console.log(`[🔍 Block ${index}] Rendering with source:`, { ...source, MDP: '***' });

  return (
    <div className="p-6 border rounded-lg space-y-[3px] bg-card w-[700px]">
      <div className="grid gap-[3px]">
        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-right">Provider</Label>
          <Select
            value={providerValue}
            onValueChange={(value) => onChange(index, "Provider", value === "empty" ? "" : value)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Sélectionner un provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((provider) => (
                <SelectItem key={provider.value} value={provider.value}>
                  {provider.display}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-right">Serveur</Label>
          <div className="flex items-center gap-4">
            <Input
              value={source.Serveur}
              onChange={(e) => onChange(index, "Serveur", e.target.value)}
              type="text"
              className="h-9 flex-1"
            />
            <div className="flex items-center gap-2">
              <Label className="text-right whitespace-nowrap">Lecture seule</Label>
              <Switch
                checked={source.Lecture_Seule === "1"}
                onCheckedChange={(checked) => onChange(index, "Lecture_Seule", checked ? "1" : "0")}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-right">Base de données</Label>
          <Input
            value={source.Nom_BDD}
            onChange={(e) => onChange(index, "Nom_BDD", e.target.value)}
            type="text"
            className="h-9"
          />
        </div>

        <div className="grid grid-cols-[200px_1fr] items-center gap-4">
          <Label className="text-right">Utilisateur</Label>
          <div className="grid grid-cols-2 gap-4">
            <Input
              value={source.Utilisateur}
              onChange={(e) => onChange(index, "Utilisateur", e.target.value)}
              type="text"
              className="h-9"
            />
            <div className="grid grid-cols-[auto_1fr] items-center gap-4">
              <Label className="text-right whitespace-nowrap">Mot de passe</Label>
              <Input
                value={source.MDP}
                onChange={(e) => onChange(index, "MDP", e.target.value)}
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

export default function DatabasePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sources, setSources] = useState<SourceData[]>([]);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"]
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('\n=== DÉBUT SAUVEGARDE SOURCES ===');
      console.log('📄 [1] Sources à sauvegarder:', sources.map(s => ({ ...s, MDP: '***' })));

      console.log('\n🔄 [2] Préparation de la requête API');
      const apiUrl = "/api/database/sources";
      console.log('- URL API:', apiUrl);
      console.log('- Méthode: POST');
      console.log('- Corps:', { sources: sources.map(s => ({ ...s, MDP: '***' })) });

      const response = await apiRequest("POST", apiUrl, { sources });
      console.log("📡 [3] Réponse brute:", {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
      });

      const responseText = await response.text();
      console.log("📝 [4] Corps de la réponse:", responseText);

      if (!response.ok) {
        console.error("❌ [5] Erreur réponse:", responseText);
        const error = new Error(responseText || "Échec de la sauvegarde des sources de données");
        error.stack = response.headers.get('x-error-stack') || error.stack;
        throw error;
      }

      return responseText;
    },
    onSuccess: () => {
      console.log("✅ [Sauvegarde] Succès");
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Succès",
        description: "Les paramètres de connexion ont été sauvegardés",
      });
    },
    onError: (error: Error) => {
      console.error("❌ [Sauvegarde] Erreur mutation:", error);
      toast({
        title: "Erreur de sauvegarde",
        description: `Erreur technique: ${error.message}\n\nVérifiez les logs de la console pour plus de détails.\nStack trace: ${error.stack}`,
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const parseSources = (xmlStr: string): SourceData[] => {
    console.log("🔍 [Parse] Début parsing XML");
    if (!xmlStr) {
      console.warn("⚠️ [Parse] XML vide");
      return [];
    }

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, "text/xml");

      if (xmlDoc.querySelector('parsererror')) {
        console.error("❌ [Parse] Erreur parsing XML:", xmlDoc.querySelector('parsererror')?.textContent);
        return [];
      }

      const sources: SourceData[] = [];
      const sourceElements = xmlDoc.querySelectorAll("Connexion > Sources > Source");
      console.log(`🔍 [Parse] Nombre de sources trouvées: ${sourceElements.length}`);

      sourceElements.forEach((source, idx) => {
        const sourceData = {
          Provider: decodeXMLValue(source.querySelector("Provider")?.textContent || ""),
          Serveur: decodeXMLValue(source.querySelector("Serveur")?.textContent || ""),
          Nom_BDD: decodeXMLValue(source.querySelector("Nom_BDD")?.textContent || ""),
          Lecture_Seule: decodeXMLValue(source.querySelector("Lecture_Seule")?.textContent || "0"),
          Utilisateur: decodeXMLValue(source.querySelector("Utilisateur")?.textContent || ""),
          MDP: decodeXMLValue(source.querySelector("MDP")?.textContent || ""),
        };
        console.log(`🔍 [Parse] Source ${idx + 1}:`, { ...sourceData, MDP: '***' });
        sources.push(sourceData);
      });

      while (sources.length < 4) {
        sources.push({
          Provider: "",
          Serveur: "",
          Nom_BDD: "",
          Lecture_Seule: "0",
          Utilisateur: "",
          MDP: "",
        });
      }

      console.log("✅ [Parse] Parsing terminé avec succès");
      return sources;
    } catch (e) {
      console.error("❌ [Parse] Erreur lors du parsing:", e);
      return [];
    }
  };

  useEffect(() => {
    if (user?.ConfigConnecteur) {
      console.log("🔄 [Init] Initialisation des sources depuis la config utilisateur");
      setSources(parseSources(user.ConfigConnecteur));
    }
  }, [user?.ConfigConnecteur]);

  const handleSourceChange = (index: number, field: keyof SourceData, value: string) => {
    console.log(`🔄 [Change] Modification source ${index}, champ ${field}:`, field === 'MDP' ? '***' : value);
    const newSources = [...sources];
    newSources[index] = { ...newSources[index], [field]: value };
    setSources(newSources);
  };

  const handleSave = () => {
    console.log("🔄 [Save] Début sauvegarde");
    saveMutation.mutate();
  };

  const displaySources = sources.length ? sources : user?.ConfigConnecteur ? parseSources(user.ConfigConnecteur) : [];
  console.log("🔍 [Render] Sources affichées:", displaySources.length);

  return (
    <MainLayout>
      <div className="flex justify-end mb-6">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="w-[116px] h-[38px] bg-[#36599E] hover:bg-[#0A2A69] active:bg-[#85A3DE] text-white text-[14px] rounded-[4px] font-normal gap-2"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Sauvegarde
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
              </svg>
              Valider
            </>
          )}
        </Button>
      </div>
      <div className="space-y-3 flex flex-col items-center">
        <div className="space-y-[3px] w-full">
          {displaySources.map((source, index) => (
            <div key={index} className="flex justify-center">
              <DatabaseConnectionBlock
                source={source}
                index={index}
                onChange={handleSourceChange}
              />
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}