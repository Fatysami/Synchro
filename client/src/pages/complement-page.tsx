import { MainLayout } from "@/components/ui/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { decodeXMLValue } from "@/lib/xml-utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function ComplementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const [googleApiKey, setGoogleApiKey] = useState('');
  const [driveType, setDriveType] = useState('none');  // Valeur par défaut 'none' au lieu de ''
  const [sendReport, setSendReport] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [notifError, setNotifError] = useState(false);
  const [notifImport, setNotifImport] = useState(false);
  const [notifInfo, setNotifInfo] = useState(false);
  const [globalizeImport, setGlobalizeImport] = useState(false);
  const [complementScript, setComplementScript] = useState('');

  useEffect(() => {
    if (user?.ConfigConnecteur) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(user.ConfigConnecteur, "text/xml");

        // Extraire les valeurs du XML avec décodage
        const getXMLValue = (path: string): string => {
          const value = xmlDoc.evaluate(
            `//${path}/text()`,
            xmlDoc,
            null,
            XPathResult.STRING_TYPE,
            null
          ).stringValue;
          return decodeXMLValue(value || '');
        };

        setGoogleApiKey(getXMLValue('Connexion/Complement/APIKey_Google'));
        const typeDrive = getXMLValue('Connexion/Complement/Drive/Type_Drive');
        setDriveType(typeDrive || 'none');  // Si vide, utiliser 'none'
        setSendReport(getXMLValue('Connexion/Complement/Mail_Rapport/Envoyer_Rapport') === '1');
        setRecipientEmail(getXMLValue('Connexion/Complement/Mail_Rapport/MailDestinataire'));
        setNotifError(getXMLValue('Connexion/Complement/Mail_Rapport/NotifErr') === '1');
        setNotifImport(getXMLValue('Connexion/Complement/Mail_Rapport/NotifInf') === '1');
        setNotifInfo(getXMLValue('Connexion/Complement/Mail_Rapport/NotifImp') === '1');
        setGlobalizeImport(getXMLValue('Connexion/Complement/Mail_Rapport/Globaliser_Enreg_Import') === '1');
        setComplementScript(getXMLValue('Connexion/Complement/ScriptComplementaire'));

      } catch (e) {
        console.error('Erreur parsing XML:', e);
      }
    }
  }, [user?.ConfigConnecteur]);

  // Mutation pour sauvegarder
  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('=== DÉBUT SAUVEGARDE COMPLÉMENT ===');
      const complementData = {
        googleApiKey,
        driveType: driveType === 'none' ? '' : driveType,  // Convertir 'none' en '' pour le XML
        mailRapport: {
          envoyerRapport: sendReport,
          mailDestinataire: recipientEmail,
          notifErr: notifError,
          notifInf: notifImport,
          notifImp: notifInfo,
          globaliserEnregImport: globalizeImport
        },
        scriptComplementaire: complementScript
      };

      console.log('📄 Données à sauvegarder:', complementData);

      const response = await apiRequest("POST", "/api/database/complement", complementData);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Échec de la sauvegarde des compléments");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Sauvegarde réussie",
        description: "Les paramètres complémentaires ont été mis à jour.",
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
      <div className="space-y-6">
        {/* API de géocodage */}
        <div className="grid grid-cols-[200px,1fr] items-center gap-4">
          <label className="text-sm font-medium">Api de géocodage</label>
          <Input 
            value={googleApiKey} 
            onChange={(e) => setGoogleApiKey(e.target.value)}
          />
        </div>

        {/* Drive pour la GED */}
        <div className="grid grid-cols-[200px,1fr,auto] items-center gap-4">
          <label className="text-sm font-medium">Drive pour la GED</label>
          <Select value={driveType} onValueChange={setDriveType}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un type de drive" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Pas de Drive</SelectItem>
              <SelectItem value="google">Google Drive</SelectItem>
              <SelectItem value="onedrive">OneDrive</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            className="w-[116px] h-[38px] rounded-[4px] bg-white text-[#36599E] hover:bg-[#E3E6EA] active:bg-[#36599E] active:text-white border-[#36599E] border text-[14px] font-normal"
          >
            Connecter
          </Button>
        </div>

        {/* Section rapport de synchronisation */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              checked={sendReport}
              onCheckedChange={(checked) => setSendReport(checked as boolean)}
            />
            <label className="text-sm">Envoyer un rapport de synchro par mail</label>
          </div>

          <div className="grid grid-cols-[200px,1fr,auto] items-center gap-4">
            <label className="text-sm font-medium">Notification par email</label>
            <Input 
              value={recipientEmail} 
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
            <Button 
              variant="outline"
              className="w-[116px] h-[38px] rounded-[4px] bg-white text-[#36599E] hover:bg-[#E3E6EA] active:bg-[#36599E] active:text-white border-[#36599E] border text-[14px] font-normal"
            >
              Test rapport
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                checked={notifError}
                onCheckedChange={(checked) => setNotifError(checked as boolean)}
              />
              <label className="text-sm">Notification Erreur</label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                checked={notifImport}
                onCheckedChange={(checked) => setNotifImport(checked as boolean)}
              />
              <label className="text-sm">Notification Import</label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                checked={notifInfo}
                onCheckedChange={(checked) => setNotifInfo(checked as boolean)}
              />
              <label className="text-sm">Notification Info</label>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              checked={globalizeImport}
              onCheckedChange={(checked) => setGlobalizeImport(checked as boolean)}
            />
            <div className="space-x-2">
              <label className="text-sm">Globaliser les importations des saisies mobiles</label>
              <span className="text-xs text-muted-foreground">Plus rapide mais moins précis, les logs seront également globalisés</span>
            </div>
          </div>
        </div>

        {/* Script complémentaire */}
        <div className="grid grid-cols-[200px,1fr] items-start gap-4">
          <label className="text-sm font-medium">Script complémentaire</label>
          <Textarea 
            value={complementScript}
            onChange={(e) => setComplementScript(e.target.value)}
            className="font-mono"
            rows={10}
          />
        </div>
      </div>
    </MainLayout>
  );
}