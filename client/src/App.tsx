import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page"; 
import HomePage from "@/pages/home-page";
import DatabasePage from "@/pages/database-page";
import ExternalLinksPage from "@/pages/external-links-page";
import ExternalCalendarsPage from "@/pages/external-calendars-page";
import SyncDataPage from "@/pages/sync-data-page";
import { FamilyExclusionsPage } from "@/pages/exclusions-page";
import ComplementPage from "@/pages/complement-page";
import PlanningPage from "@/pages/planning-page";
import TerminalsPage from "@/pages/terminals-page";
import ImportHistoryPage from "@/pages/import-history-page";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import { Switch, Route, Redirect } from "wouter";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Switch>
          <Route path="/auth" component={AuthPage} />
          <ProtectedRoute path="/" component={HomePage} />
          <ProtectedRoute path="/database" component={DatabasePage} />
          <ProtectedRoute path="/external-links" component={ExternalLinksPage} />
          <ProtectedRoute path="/external-calendars" component={ExternalCalendarsPage} />
          <ProtectedRoute path="/sync-data" component={SyncDataPage} />
          <Route path="/exclusions">
            {() => <Redirect to="/exclusions/family" />}
          </Route>
          <Route path="/exclusions/simple">
            {() => <Redirect to="/exclusions/family" />}
          </Route>
          <ProtectedRoute path="/exclusions/family" component={FamilyExclusionsPage} />
          <ProtectedRoute path="/complement" component={ComplementPage} />
          <ProtectedRoute path="/planning" component={PlanningPage} />
          <ProtectedRoute path="/terminals" component={TerminalsPage} />
          <ProtectedRoute path="/import-history" component={ImportHistoryPage} />
          <Route component={NotFound} />
        </Switch>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}