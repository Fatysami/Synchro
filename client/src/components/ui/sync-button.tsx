import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CloudSyncIcon, IncrementalSyncIcon, MobileImportIcon } from "./icons";

interface SyncResponse {
  retSync: number;
  retInfo: string;
}

interface SyncButtonProps {
  type: "C" | "R" | "I";
  children: React.ReactNode;
  className?: string;
}

export function SyncButton({ type, children, className }: SyncButtonProps) {
  const { toast } = useToast();

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sync-automate", { type });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.retInfo || "Erreur de synchronisation");
      }
      return data as SyncResponse;
    },
    onSuccess: (data) => {
      toast({
        title: "Synchronisation",
        description: data.retInfo,
        variant: data.retSync === 1 ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Synchronisation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getSyncIcon = () => {
    if (syncMutation.isPending) {
      return <Loader2 className="h-4 w-4 animate-spin mr-2" />;
    }

    switch (type) {
      case "C":
        return <CloudSyncIcon />;
      case "R":
        return <IncrementalSyncIcon />;
      case "I":
        return <MobileImportIcon />;
      default:
        return <CloudSyncIcon />;
    }
  };

  return (
    <Button 
      onClick={() => syncMutation.mutate()}
      disabled={syncMutation.isPending}
      className={className}
    >
      {getSyncIcon()}
      {syncMutation.isPending ? "Synchronisation en cours..." : children}
    </Button>
  );
}