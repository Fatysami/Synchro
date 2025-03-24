import { Link, useLocation } from "wouter";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  GeneralIcon,
  DatabaseIcon,
  ExternalLinksIcon,
  CalendarIcon,
  SyncDataIcon,
  ExclusionsIcon,
  ComplementIcon,
  PlanningIcon,
  TerminalsIcon,
  HistoryIcon,
} from "@/components/ui/icons";

export function MainNavigation() {
  const [location] = useLocation();

  const buttonStyles = {
    base: "w-[235px] h-[45px] rounded-lg text-[#35589C] bg-white hover:border-2 hover:border-[#E3E6EA] data-[active=true]:bg-[#E3E6EA] flex items-center px-4",
    icon: "w-5 h-5 mr-3",
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/"}
          className={buttonStyles.base}
        >
          <Link href="/">
            <GeneralIcon />
            <span>Général</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/database"}
          className={buttonStyles.base}
        >
          <Link href="/database">
            <DatabaseIcon />
            <span>Base de données source</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/external-links"}
          className={buttonStyles.base}
        >
          <Link href="/external-links">
            <ExternalLinksIcon />
            <span>Liaisons externes</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/external-calendars"}
          className={buttonStyles.base}
        >
          <Link href="/external-calendars">
            <CalendarIcon />
            <span>Agendas externes</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/sync-data"}
          className={buttonStyles.base}
        >
          <Link href="/sync-data">
            <SyncDataIcon />
            <span>Données à synchroniser</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location.startsWith("/exclusions")}
          className={buttonStyles.base}
        >
          <Link href="/exclusions/family">
            <ExclusionsIcon />
            <span>Exclusions de la synchro</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/complement"}
          className={buttonStyles.base}
        >
          <Link href="/complement">
            <ComplementIcon />
            <span>Complément</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/planning"}
          className={buttonStyles.base}
        >
          <Link href="/planning">
            <PlanningIcon />
            <span>Planification</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/terminals"}
          className={buttonStyles.base}
        >
          <Link href="/terminals">
            <TerminalsIcon />
            <span>Terminaux</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location === "/import-history"}
          className={buttonStyles.base}
        >
          <Link href="/import-history">
            <HistoryIcon />
            <span>Historique d'importation</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}