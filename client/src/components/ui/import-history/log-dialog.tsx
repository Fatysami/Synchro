import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface LogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idInterne: string;
}

export function LogDialog({ open, onOpenChange, idInterne }: LogDialogProps) {
  const { toast } = useToast();
  const { data: log, isLoading } = useQuery({
    queryKey: [`/api/sync-history/${idInterne}/log`],
    enabled: open && !!idInterne,
  });

  const copyToClipboard = async () => {
    if (log) {
      try {
        await navigator.clipboard.writeText(log);
        toast({
          title: "Copié !",
          description: "Le log a été copié dans le presse-papier",
        });
      } catch (error) {
        toast({
          title: "Erreur",
          description: "Impossible de copier le log",
          variant: "destructive",
        });
      }
    }
  };

  // Fonction pour décoder le contenu UTF-8
  const decodeLogContent = (content: string | null) => {
    if (!content) return '';
    try {
      return decodeURIComponent(escape(content));
    } catch (e) {
      console.error('Erreur de décodage UTF-8:', e);
      return content;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <div>
            <DialogTitle>Log de synchronisation</DialogTitle>
            <DialogDescription>
              Détails de la synchronisation
            </DialogDescription>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={copyToClipboard}
            disabled={!log || isLoading}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : log ? (
          <div className="bg-white rounded-lg p-4 overflow-auto font-mono text-sm whitespace-pre-wrap">
            {decodeLogContent(log)}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            Aucun log disponible
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}