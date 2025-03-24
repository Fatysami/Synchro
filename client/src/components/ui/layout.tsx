import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { MainNavigation } from "./main-navigation";
import { SidebarProvider, Sidebar, SidebarContent } from "./sidebar";
import { Button } from "./button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

function extractLogicielFromTablettes(tablettes: string): string {
  if (!tablettes) return 'NC';
  try {
    // Séparer la chaîne par des points-virgules et prendre la 2ème valeur
    const values = tablettes.split(';');
    return values[1] || 'NC';
  } catch (e) {
    console.error('Erreur extraction logiciel:', e);
    return 'NC';
  }
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { logoutMutation, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const logicielTitle = user?.Tablettes ? `Synchro pour ${extractLogicielFromTablettes(user.Tablettes)}` : 'Synchro pour EBP GesCom Open Line';

  const handleRefreshPlannings = async () => {
    console.log("\n=== DÉBUT REFRESH PLANIFICATIONS ===");
    console.log("1. État initial:", {
      userID: user?.ID,
      IDSynchro: user?.IDSynchro,
      planningCounts: user?.planningCounts
    });

    try {
      // Étape 2: Invalider le cache
      console.log("2. Invalidation du cache...");
      await queryClient.cancelQueries({ queryKey: ["/api/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      // Étape 3: Recharger les données
      console.log("3. Tentative de rechargement des données");
      const updatedUser = await queryClient.fetchQuery({ 
        queryKey: ["/api/user"],
        staleTime: 0
      });

      console.log("4. Données reçues:", {
        hasData: !!updatedUser,
        rawData: updatedUser
      });

      if (!updatedUser) {
        throw new Error("Aucune donnée reçue du serveur");
      }

      // Étape 5: Formater le résultat
      const planningCounts = updatedUser.planningCounts || { C: 0, R: 0, I: 0 };
      const formatted = `${planningCounts.C} Complète / ${planningCounts.R} Incrémentale / ${planningCounts.I} Importation`;

      console.log("5. Résultat formaté:", {
        planningCounts,
        formatted
      });

      toast({
        title: "Rafraîchissement des planifications",
        description: formatted,
      });

      console.log("=== FIN REFRESH PLANIFICATIONS ===\n");
    } catch (error) {
      console.error("❌ ERREUR REFRESH:", error);
      console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Échec du rafraîchissement des planifications",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/nuxilog-logo.svg" alt="Nuxilog" className="h-8" />
            <h1 className="text-xl font-semibold text-[#36599E]">
              Connecteur NuxiDev
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshPlannings}
              className="flex items-center gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              Test Refresh Plannif
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const response = await fetch('/api/server-ip');
                  const data = await response.json();
                  alert(`Adresse IP du serveur: ${data.ip}`);
                } catch (error) {
                  console.error('Erreur lors de la récupération de l\'IP du serveur:', error);
                  alert('Impossible de récupérer l\'adresse IP du serveur');
                }
              }}
            >
              IP Srv
            </Button>
            <button
              onClick={() => logoutMutation.mutate()}
              className="text-sm text-muted-foreground hover:text-foreground"
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Déconnexion"
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content with sidebar */}
      <SidebarProvider>
        <div className="flex min-h-[calc(100vh-3.5rem)]">
          <Sidebar>
            <SidebarContent className="pt-24">
              <MainNavigation />
            </SidebarContent>
          </Sidebar>
          <main className="flex-1 p-6">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-[#F3F5F6] h-[1px] top-1/2 -translate-y-1/2"></div>
              <div className="absolute inset-0 w-[1px] bg-[#F3F5F6] left-40"></div>
              <h1 className="text-xl font-semibold text-[#36599E] bg-background relative inline-block pr-4">
                {logicielTitle}
              </h1>
            </div>
            {children}
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}

function MenuItem({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <li>
      <Link href={href}>
        <span
          className={`block px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer ${
            active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
      </Link>
    </li>
  );
}