import { useEffect, useState } from "react";
import { MainLayout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { decodeXMLValue } from "@/lib/xml-utils";
import { Trash2, Loader2 } from "lucide-react";

// autres interfaces restent inchangées
interface User {
  ID: number;
  IDSynchro: string;
  IDClient: number;
  ConfigConnecteur: string;
}

interface Planning {
  day: string;
  time: string;
  type: string;
}

interface DBPlanning {
  Jour: string;
  Heure: string;
  Ordre: string;
}

const DAYS = [
  { value: "1", label: "Lundi" },
  { value: "2", label: "Mardi" },
  { value: "3", label: "Mercredi" },
  { value: "4", label: "Jeudi" },
  { value: "5", label: "Vendredi" },
  { value: "6", label: "Samedi" },
  { value: "7", label: "Dimanche" },
  { value: "8", label: "Tous les jours" },
];

const SYNC_TYPES = [
  { value: "C", label: "Complète" },
  { value: "R", label: "Incrémentale" },
  { value: "I", label: "Import Saisies Mobiles" },
];

const TIMEZONES = [
  { value: "GMT", label: "Greenwich Mean Time" },
  { value: "GMT+1", label: "Central European Time" },
  { value: "GMT+2", label: "Eastern European Time" },
  { value: "GMT+3", label: "Moscow Time" },
  { value: "GMT+4", label: "Dubai Time" },
  { value: "GMT+5", label: "Pakistan Time" },
  { value: "GMT+6", label: "Bangladesh Time" },
  { value: "GMT+7", label: "Vietnam Time" },
  { value: "GMT+8", label: "China Time" },
  { value: "GMT+9", label: "Japan Time" },
  { value: "GMT+10", label: "Sydney Time" },
  { value: "GMT+11", label: "Solomon Islands Time" },
  { value: "GMT+12", label: "New Zealand Time" },
  { value: "GMT-1", label: "Azores Time" },
  { value: "GMT-2", label: "South Georgia Time" },
  { value: "GMT-3", label: "Buenos Aires Time" },
  { value: "GMT-4", label: "Atlantic Time" },
  { value: "GMT-5", label: "Eastern Time" },
  { value: "GMT-6", label: "Central Time" },
  { value: "GMT-7", label: "Mountain Time" },
  { value: "GMT-8", label: "Pacific Time" },
  { value: "GMT-9", label: "Alaska Time" },
  { value: "GMT-10", label: "Hawaii Time" },
  { value: "GMT-11", label: "Midway Islands Time" },
  { value: "GMT-12", label: "Baker Island Time" },
];

function generateHours() {
  const hours = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hStr = h.toString().padStart(2, "0");
      const mStr = m.toString().padStart(2, "0");
      const time = `${hStr}:${mStr}`;
      hours.push({ value: time, label: time });
    }
  }
  return hours;
}

const HOURS = generateHours();

function extractPlanningsFromXML(xmlDoc: Document): Planning[] {
  const plannings: Planning[] = [];

  try {
    const planningNodes = xmlDoc.evaluate(
      '//Planifications/Planning',
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < planningNodes.snapshotLength; i++) {
      const planning = planningNodes.snapshotItem(i) as Element;
      plannings.push({
        day: decodeXMLValue(planning.getElementsByTagName('Jour')[0]?.textContent || '8'),
        time: decodeXMLValue(planning.getElementsByTagName('Heure')[0]?.textContent || '00:00'),
        type: decodeXMLValue(planning.getElementsByTagName('Ordre')[0]?.textContent || 'C')
      });
    }
  } catch (e) {
    console.error('Erreur extraction plannings:', e);
  }

  return plannings;
}


export default function PlanningPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [timeZoneValue, setTimeZoneValue] = useState<string>("");
  const [timeZoneLabel, setTimeZoneLabel] = useState<string>("");
  const [plannings, setPlannings] = useState<Planning[]>([]);
  const [xmlInfo, setXmlInfo] = useState<{ exe: string; serial: string }>({ exe: "", serial: "" });
  const [isLoading, setIsLoading] = useState(true);

  // Get user data for XML config
  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  // Get plannings from MySQL database
  const { data: dbPlannings, isLoading: isPlanningsLoading, error: planningsError } = useQuery<DBPlanning[]>({
    queryKey: ["/api/plannings"],
    enabled: Boolean(user?.IDSynchro),
    onSuccess: (data) => {
      console.log("Planifications récupérées avec succès", data);
      // Mettre à jour les planifications immédiatement avec les données reçues
      if (data) {
        setPlannings(data.map(p => ({
          day: p.Jour,
          time: p.Heure,
          type: p.Ordre
        })));
      }
      setIsLoading(false);
    },
    onError: (error) => {
      console.error("Erreur lors de la récupération des planifications:", error);
      setIsLoading(false);
      toast({
        title: "Erreur",
        description: "Impossible de récupérer les planifications",
        variant: "destructive",
      });
    }
  });

  // Save plannings mutation
  const savePlanningsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/plannings", {
        plannings,
        xmlInfo
      });
      if (!response.ok) {
        throw new Error("Failed to save plannings");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plannings"] });
      toast({
        title: "Succès",
        description: "Les planifications ont été sauvegardées avec succès",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder les planifications : " + error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (user?.ConfigConnecteur) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(user.ConfigConnecteur, "text/xml");

        // Récupérer les valeurs du fuseau horaire
        const savedValue = decodeXMLValue(xmlDoc.evaluate(
          `/Connexion/Planifications/FuseauHoraireValeur`,
          xmlDoc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue?.textContent || '');
        const savedLabel = decodeXMLValue(xmlDoc.evaluate(
          `/Connexion/Planifications/FuseauHoraire`,
          xmlDoc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue?.textContent || '');
        setTimeZoneValue(savedValue);
        setTimeZoneLabel(savedLabel);

        // Récupérer les informations Exe et Serial
        const exe = decodeXMLValue(xmlDoc.evaluate(
          `/Connexion/Info/Exe`,
          xmlDoc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue?.textContent || '');
        const serial = decodeXMLValue(xmlDoc.evaluate(
          `/Connexion/Info/Serial`,
          xmlDoc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue?.textContent || '');
        setXmlInfo({ exe, serial });

        //  Extract plannings from XML
        const xmlPlannings = extractPlanningsFromXML(xmlDoc);
        setPlannings(xmlPlannings);
        setIsLoading(false);


      } catch (e) {
        console.error('Erreur parsing XML:', e);
        setIsLoading(false);
      }
    }
  }, [user?.ConfigConnecteur]);

  // Update plannings when database data changes
  useEffect(() => {
    if (dbPlannings) {
      console.log("Mise à jour des planifications:", dbPlannings);
      setPlannings(dbPlannings.map(p => ({
        day: p.Jour,
        time: p.Heure,
        type: p.Ordre
      })));
    }
  }, [dbPlannings]);

  const handleAddPlanning = () => {
    setPlannings([...plannings, { day: "8", time: "00:00", type: "C" }]);
  };

  const handleDeletePlanning = (index: number) => {
    setPlannings(plannings.filter((_, i) => i !== index));
  };

  const handleTimeZoneChange = (value: string) => {
    const selectedTimeZone = TIMEZONES.find(tz => tz.value === value);
    if (selectedTimeZone) {
      setTimeZoneValue(selectedTimeZone.value);
      setTimeZoneLabel(selectedTimeZone.label);
    }
  };

  const handleSave = () => {
    savePlanningsMutation.mutate();
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="grid grid-cols-[auto,1fr] items-center gap-4">
            <div className="text-sm font-medium">Votre fuseau horaire actuel :</div>
            <Select value={timeZoneValue} onValueChange={handleTimeZoneChange}>
              <SelectTrigger className="max-w-[240px]">
                <SelectValue>
                  {timeZoneValue ? `${timeZoneValue} ${timeZoneLabel}` : "Sélectionnez un fuseau horaire"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[200px]">
                  {TIMEZONES.map(tz => (
                    <SelectItem
                      key={tz.label}
                      value={tz.value}
                      className="cursor-pointer"
                    >
                      {`${tz.value} ${tz.label}`}
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleAddPlanning} 
              className="w-[116px] h-[38px] rounded-[4px] bg-white text-[#36599E] hover:bg-[#E3E6EA] active:bg-[#36599E] active:text-white border-[#36599E] border text-[14px] font-normal"
            >
              Ajouter
            </Button>
            <Button
              onClick={handleSave}
              disabled={savePlanningsMutation.isPending}
              className="w-[116px] h-[38px] bg-[#36599E] hover:bg-[#0A2A69] active:bg-[#85A3DE] text-white text-[14px] rounded-[4px] font-normal gap-2"
            >
              {savePlanningsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Validation...
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
        </div>

        <div className="border rounded-md">
          <div className="grid grid-cols-[1fr,1fr,1fr,auto] gap-4 p-3 bg-muted font-medium text-sm">
            <div>Jours de synchronisation</div>
            <div>Heure synchro</div>
            <div>Type synchro</div>
            <div>Action</div>
          </div>

          {(isLoading || isPlanningsLoading) && !plannings.length ? (
            <div className="flex justify-center items-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2">Chargement des planifications...</span>
            </div>
          ) : planningsError ? (
            <div className="p-4 text-center text-red-600">
              Une erreur s'est produite lors du chargement des planifications.
            </div>
          ) : plannings.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              Aucune planification trouvée. Cliquez sur "Ajouter" pour créer une nouvelle planification.
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-16rem)]">
              <div className="p-3 space-y-2">
                {plannings.map((planning, index) => (
                  <div key={index} className="grid grid-cols-[1fr,1fr,1fr,auto] gap-4 items-center">
                    <Select
                      value={planning.day}
                      onValueChange={(value) => {
                        const newPlannings = [...plannings];
                        newPlannings[index] = { ...planning, day: value };
                        setPlannings(newPlannings);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS.map(day => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={planning.time}
                      onValueChange={(value) => {
                        const newPlannings = [...plannings];
                        newPlannings[index] = { ...planning, time: value };
                        setPlannings(newPlannings);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map(hour => (
                          <SelectItem key={hour.value} value={hour.value}>
                            {hour.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={planning.type}
                      onValueChange={(value) => {
                        const newPlannings = [...plannings];
                        newPlannings[index] = { ...planning, type: value };
                        setPlannings(newPlannings);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SYNC_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDeletePlanning(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </MainLayout>
  );
}