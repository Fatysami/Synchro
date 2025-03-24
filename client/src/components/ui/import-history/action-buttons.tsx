import { Button } from "@/components/ui/button";
import { Edit, FileText, FileCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ActionButtonProps {
  onClick: () => void;
  idInterne: string; // Changed to required
}

export function EditButton({ onClick }: ActionButtonProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick}>
      <Edit className="h-4 w-4" />
    </Button>
  );
}

export function LogButton({ onClick }: ActionButtonProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick}>
      <FileText className="h-4 w-4" />
    </Button>
  );
}

export function FileButton({ onClick, idInterne }: ActionButtonProps) {
  const { toast } = useToast();

  const handleFileDownload = async () => {
    try {
      if (!idInterne) {
        toast({
          title: "Erreur",
          description: "Identifiant de fichier manquant.",
          variant: "destructive",
        });
        return;
      }

      // Déclencher le téléchargement via une requête GET
      const response = await fetch(`/api/sync-history/${idInterne}/file`);

      if (response.status === 404) {
        toast({
          title: "Fichier non disponible",
          description: "Aucun fichier n'est disponible pour cet enregistrement.",
          variant: "destructive",
        });
        return;
      }

      if (!response.ok) {
        throw new Error("Erreur lors du téléchargement du fichier");
      }

      // Créer un blob à partir de la réponse
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Créer un lien temporaire pour déclencher le téléchargement
      const link = document.createElement('a');
      link.href = url;

      // Récupérer le nom du fichier depuis l'en-tête Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition && contentDisposition.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'download.xml';

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      onClick(); // Appeler le callback parent si nécessaire
    } catch (error) {
      console.error('Erreur lors du téléchargement:', error);
      toast({
        title: "Erreur",
        description: "Impossible de télécharger le fichier.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button variant="ghost" size="icon" onClick={handleFileDownload}>
      <FileCode className="h-4 w-4" />
    </Button>
  );
}