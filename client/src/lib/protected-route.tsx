import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

type ProtectedRouteProps = {
  path: string;
  component: React.ComponentType;
} | {
  children: React.ReactNode;
  path: string;
};

export function ProtectedRoute(props: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  console.log(`ProtectedRoute - Auth state:`, { user, isLoading });

  return (
    <Route path={props.path}>
      {isLoading ? (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      ) : !user ? (
        <Redirect to="/auth" />
      ) : 'component' in props ? (
        <props.component />
      ) : (
        props.children
      )}
    </Route>
  );
}