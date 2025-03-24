import { MainLayout } from "@/components/ui/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { decodeXMLValue } from "@/lib/xml-utils";
import React from 'react';

interface Employee {
  id: string;
  display: string;
}

interface AgendaMapping {
  ID_Salarie: string;
  ID_Agenda: string;
}

interface GoogleCalendar {
  id: string;
  name: string;
}

const AGENDA_TYPES = [
  { display: "Pas d'agenda Externe", value: "empty" },
  { display: "Compte Gmail Google Agenda", value: "Google" },
  { display: "Compte Office 365 Outlook", value: "Microsoft" }
];

function extractEmployeesFromXML(xmlDoc: Document): Employee[] {
  if (!xmlDoc) return [];

  const employees: Employee[] = [
    { id: "empty", display: "Libre" }
  ];

  try {
    const employeeNodes = xmlDoc.evaluate(
      '//Connexion/Data/CMB_SALARIES/SALARIES',
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < employeeNodes.snapshotLength; i++) {
      const employee = employeeNodes.snapshotItem(i) as Element;
      const nom = decodeXMLValue(employee.querySelector('Nom')?.textContent || '');
      const prenom = decodeXMLValue(employee.querySelector('Prenom')?.textContent || '');
      const idInterne = decodeXMLValue(employee.querySelector('IDInterne')?.textContent || '');

      employees.push({
        id: idInterne || "empty",
        display: `${nom} ${prenom}`.trim()
      });
    }
  } catch (e) {
    console.error('Erreur extraction employés:', e);
  }

  return employees;
}

function extractAgendaMappingsFromXML(xmlDoc: Document): AgendaMapping[] {
  if (!xmlDoc) return [];

  const mappings: AgendaMapping[] = [];
  try {
    const mappingNodes = xmlDoc.evaluate(
      '//Connexion/Liaisons_Externes/Agenda/Correspondances/Correspondance',
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < mappingNodes.snapshotLength; i++) {
      const mapping = mappingNodes.snapshotItem(i) as Element;
      mappings.push({
        ID_Salarie: decodeXMLValue(mapping.querySelector('ID_Salarie')?.textContent || "empty"),
        ID_Agenda: decodeXMLValue(mapping.querySelector('ID_Agenda')?.textContent || "-1")
      });
    }
  } catch (e) {
    console.error('Erreur extraction mappings:', e);
  }

  return mappings;
}

export default function ExternalCalendarsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const [agendaType, setAgendaType] = React.useState("empty");
  const [mappings, setMappings] = React.useState<AgendaMapping[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [calendars, setCalendars] = React.useState<GoogleCalendar[]>([]);

  React.useEffect(() => {
    if (user?.ConfigConnecteur) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(user.ConfigConnecteur, "text/xml");

        // Extraire les employés
        const extractedEmployees = extractEmployeesFromXML(xmlDoc);
        setEmployees(extractedEmployees);

        // Extraire les mappings
        const extractedMappings = extractAgendaMappingsFromXML(xmlDoc);
        setMappings(extractedMappings);

        // Extraire le type d'agenda
        const typeAgenda = xmlDoc.evaluate(
          '//Connexion/Liaisons_Externes/Agenda/Type_Agenda/text()',
          xmlDoc,
          null,
          XPathResult.STRING_TYPE,
          null
        ).stringValue;

        setAgendaType(decodeXMLValue(typeAgenda) || "empty");
      } catch (e) {
        console.error('Erreur parsing XML:', e);
      }
    }
  }, [user?.ConfigConnecteur]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('\n=== DÉBUT SAUVEGARDE AGENDAS EXTERNES ===');
      console.log('📄 [1] Données à sauvegarder:', {
        agendaType,
        mappings
      });

      const response = await apiRequest("POST", "/api/database/external-calendars", {
        agendaType,
        mappings
      });

      console.log("📡 [2] Réponse brute:", {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
      });

      const responseText = await response.text();
      console.log("📝 [3] Corps de la réponse:", responseText);

      if (!response.ok) {
        throw new Error(responseText || "Échec de la sauvegarde des agendas externes");
      }

      return responseText;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Sauvegarde réussie",
        description: "Les agendas externes ont été mis à jour avec succès.",
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

  const handleMappingChange = (index: number, field: keyof AgendaMapping, value: string) => {
    setMappings(prev => prev.map((mapping, i) =>
      i === index ? { ...mapping, [field]: value } : mapping
    ));
  };

  const handleGoogleAuth = async () => {
    try {
      const response = await apiRequest("GET", "/api/google-calendar/auth");
      const data = await response.json();

      // Open Google auth in a new window
      const authWindow = window.open(data.url, '_blank', 'width=600,height=700');

      // Listen for the callback
      window.addEventListener('message', async (event) => {
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          authWindow?.close();

          // Fetch calendars
          const calendarsResponse = await apiRequest("GET", "/api/google-calendar/calendars");
          const calendarsData = await calendarsResponse.json();
          setCalendars(calendarsData);

          toast({
            title: "Connexion réussie",
            description: "Les agendas Google ont été récupérés avec succès",
          });
        }
      });
    } catch (error) {
      console.error('Erreur lors de l\'authentification Google:', error);
      toast({
        title: "Erreur de connexion",
        description: "Impossible de se connecter à Google Calendar",
        variant: "destructive",
      });
    }
  };

  return (
    <MainLayout>
      <div className="flex justify-end mb-6">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-[116px] h-[38px] bg-[#36599E] hover:bg-[#0A2A69] active:bg-[#85A3DE] text-white text-[14px] rounded-[4px] font-normal gap-2"
        >
          {saveMutation.isPending ? (
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sauvegarde
            </div>
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
      <div className="space-y-3">
        {/* Type d'agenda */}
        <div className="flex items-center gap-4">
          <div className="w-80">
            <Select
              value={agendaType}
              onValueChange={setAgendaType}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sélectionner un type d'agenda" />
              </SelectTrigger>
              <SelectContent>
                {AGENDA_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.display}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bouton Connexion Google avec le nouveau style */}
          {agendaType === "Google" && (
            <Button 
              variant="outline" 
              className="w-[116px] h-[38px] rounded-[4px] bg-white text-[#36599E] hover:bg-[#E3E6EA] active:bg-[#36599E] active:text-white border-[#36599E] border text-[14px] font-normal"
              onClick={handleGoogleAuth}
            >
              Connexion
            </Button>
          )}
        </div>

        {/* Table des correspondances */}
        <div className="grid grid-cols-[minmax(300px,1fr)_minmax(300px,1fr)] gap-x-6">
          <div className="font-medium">Salariés</div>
          <div className="font-medium">Agendas</div>

          {mappings.map((mapping, index) => (
            <div key={index} className="contents">
              <div className="pb-[3px]">
                <Select
                  value={mapping.ID_Salarie}
                  onValueChange={(value) => handleMappingChange(index, 'ID_Salarie', value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Sélectionner un salarié" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pb-[3px]">
                <Select
                  value={mapping.ID_Agenda}
                  onValueChange={(value) => handleMappingChange(index, 'ID_Agenda', value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Sélectionner un agenda" />
                  </SelectTrigger>
                  <SelectContent>
                    {agendaType === "Google" && calendars.length > 0 ? (
                      calendars.map((calendar) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          {calendar.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="-1">-1</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}