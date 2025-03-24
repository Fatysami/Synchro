import { MainLayout } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { EditDialog } from "@/components/ui/import-history/edit-dialog";
import { EditButton, LogButton, FileButton } from "@/components/ui/import-history/action-buttons";
import { LogDialog } from "@/components/ui/import-history/log-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SyncHistoryEntry } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Spinner components...
const Spinner = ({ size = "default" }) => (
  <div className={`animate-spin rounded-full border-2 border-gray-800 border-t-gray-200 h-${size === "sm" ? "4" : "8"} w-${size === "sm" ? "4" : "8"}`}></div>
);

const SpinnerOverlay = ({ message }: { message: string }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50 z-50">
    <div className="bg-white p-4 rounded-lg shadow-lg flex items-center">
      <Spinner />
      <p className="ml-4 text-gray-700">{message}</p>
    </div>
  </div>
);

export default function ImportHistoryPage() {
  const [date, setDate] = useState<Date>();
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [selectedIDInterne, setSelectedIDInterne] = useState<string>("");
  const [isStatusUpdating, setIsStatusUpdating] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: historyData, isLoading } = useQuery<{ data: SyncHistoryEntry[], total: number }>({
    queryKey: ["/api/sync-history", currentPage, showErrorsOnly, date?.toISOString(), searchText],
    queryFn: async () => {
      const dateParam = date ? date.toISOString() : undefined;

      const searchParams = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        errorOnly: showErrorsOnly.toString(),
        ...(dateParam && { date: dateParam }),
        ...(searchText && { search: searchText })
      });

      const response = await fetch(`/api/sync-history?${searchParams}`);
      if (!response.ok) throw new Error('Failed to fetch history');
      return response.json();
    }
  });

  const totalPages = Math.ceil((historyData?.total || 0) / pageSize);

  const handleEditClick = (idInterne: string) => {
    setSelectedIDInterne(idInterne);
    setEditDialogOpen(true);
  };

  const handleLogClick = (idInterne: string) => {
    setSelectedIDInterne(idInterne);
    setLogDialogOpen(true);
  };

  const handleStatusChange = async (idInterne: string, currentStatus: number) => {
    setIsStatusUpdating(idInterne);
    let newStatus: number;
    if (currentStatus === 0) newStatus = 1;
    else if (currentStatus === 1) newStatus = -1;
    else newStatus = 0;

    try {
      const response = await fetch(`/api/sync-history/${idInterne}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      queryClient.invalidateQueries({ queryKey: ["/api/sync-history"] });
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setIsStatusUpdating(null);
    }
  };

  return (
    <MainLayout>
      {isLoading && <SpinnerOverlay message="Chargement de l'historique en cours..." />}

      <div className="space-y-4">
        {/* Filtres */}
        <div className="flex items-center gap-4">
          <div className="w-[250px]">
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="w-[240px] justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yyyy", { locale: fr }) : "Choisir une date"}
                  </Button>
                  {date && (
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setDate(undefined)}
                      title="Effacer la date"
                    >
                      <span className="sr-only">Effacer la date</span>
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor"/>
                      </svg>
                    </Button>
                  )}
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(newDate) => {
                    setDate(newDate);
                    document.body.click();
                  }}
                  locale={fr}
                />
              </PopoverContent>
            </Popover>
          </div>

          <Input
            type="search"
            placeholder="Rechercher..."
            className="w-[250px]"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          <div className="flex items-center space-x-2">
            <Checkbox
              id="errors"
              checked={showErrorsOnly}
              onCheckedChange={(checked) => setShowErrorsOnly(checked as boolean)}
            />
            <label
              htmlFor="errors"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Afficher uniquement les erreurs
            </label>
          </div>
        </div>

        {/* Tableau */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Traité</TableHead>
                <TableHead className="w-[70px]">Actions</TableHead>
                <TableHead className="w-[120px]">Type d'élément</TableHead>
                <TableHead className="w-[180px]">Référence</TableHead>
                <TableHead className="w-[140px]">Date/Heure Export</TableHead>
                <TableHead className="text-right w-[80px] text-center">Nb Lignes</TableHead>
                <TableHead className="w-[100px] text-center">Type Traitement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyData?.data.map((item) => (
                <TableRow key={item.IDInterne}>
                  <TableCell>
                    <div className="flex justify-center">
                      {isStatusUpdating === item.IDInterne ? (
                        <Spinner size="sm" />
                      ) : (
                        <Checkbox
                          checked={item.Etat === 1}
                          data-state={item.Etat === -1 ? "indeterminate" : undefined}
                          className={
                            item.Etat === 1
                              ? "border-green-500 bg-green-500 text-white data-[state=checked]:bg-green-500"
                              : item.Etat === -1
                              ? "border-red-500 bg-red-500 text-white data-[state=indeterminate]:bg-red-500"
                              : ""
                          }
                          onClick={() => handleStatusChange(item.IDInterne, item.Etat)}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <EditButton onClick={() => handleEditClick(item.IDInterne)} idInterne={item.IDInterne} />
                      <LogButton onClick={() => handleLogClick(item.IDInterne)} idInterne={item.IDInterne} />
                      <FileButton onClick={() => {}} idInterne={item.IDInterne} />
                    </div>
                  </TableCell>
                  <TableCell>{item.TypeEnreg}</TableCell>
                  <TableCell>{item.RefDoc}</TableCell>
                  <TableCell>{format(new Date(item.DateHeure), "dd/MM/yyyy HH:mm", { locale: fr })}</TableCell>
                  <TableCell className="text-right text-center align-middle">{item.NumLigne}</TableCell>
                  <TableCell className="text-center align-middle">{item.TypeElement}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
            disabled={currentPage === 1}
          >
            Précédent
          </Button>
          <div className="text-sm text-muted-foreground">
            Page {currentPage} sur {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
          >
            Suivant
          </Button>
        </div>

        {/* Dialogues */}
        <EditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          idInterne={selectedIDInterne}
        />

        <LogDialog
          open={logDialogOpen}
          onOpenChange={setLogDialogOpen}
          idInterne={selectedIDInterne}
        />
      </div>
    </MainLayout>
  );
}