import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Database,
  Link as LinkIcon,
  Calendar,
  Settings,
  Ban,
  Clock,
  Home,
  LogOut,
} from "lucide-react";

interface SidebarNavProps {
  items: {
    title: string;
    href: string;
    icon: React.ReactNode;
  }[];
}

const sidebarNavItems = [
  {
    title: "General",
    href: "/",
    icon: <Home className="h-4 w-4" />,
  },
  {
    title: "Database Source",
    href: "/database",
    icon: <Database className="h-4 w-4" />,
  },
  {
    title: "External Connections",
    href: "/connections",
    icon: <LinkIcon className="h-4 w-4" />,
  },
  {
    title: "External Agendas",
    href: "/agendas",
    icon: <Calendar className="h-4 w-4" />,
  },
  {
    title: "Data to Sync",
    href: "/data",
    icon: <Settings className="h-4 w-4" />,
  },
  {
    title: "Sync Exclusions",
    href: "/exclusions",
    icon: <Ban className="h-4 w-4" />,
  },
  {
    title: "Planning",
    href: "/planning",
    icon: <Clock className="h-4 w-4" />,
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logoutMutation } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-primary text-primary-foreground border-r">
        <div className="p-6 flex items-center gap-2">
          <img
            src="/nuxilog-logo.svg"
            alt="Logo"
            className="h-6 w-6"
          />
          <span className="font-semibold">EBP GesCom Sync</span>
        </div>
        <ScrollArea className="h-[calc(100vh-5rem)]">
          <div className="space-y-4 py-4">
            <div className="px-3 py-2">
              <div className="space-y-1">
                <h2 className="mb-2 px-4 text-sm font-semibold">
                  Sync Configuration
                </h2>
                <nav className="space-y-1">
                  {sidebarNavItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                      <a className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-primary-foreground/10">
                        {item.icon}
                        {item.title}
                      </a>
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          </div>
        </ScrollArea>
        <div className="absolute bottom-4 left-4">
          <Button
            variant="ghost"
            className="text-primary-foreground"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="h-16 border-b flex items-center px-6">
          <h1 className="text-lg font-medium">
            Welcome back, {user?.username}
          </h1>
        </div>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}