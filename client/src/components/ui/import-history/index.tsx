import React, { useState } from "react";
import { Button } from "../button";
import { LogDialog } from "./log-dialog";
import { EditButton, LogButton, FileButton } from "./action-buttons";
import { DataTable } from "./data-table";
import { columns } from "./columns";
import { useImportHistory } from "./use-import-history";

export function ImportHistoryActions({ row }: { row: any }) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  return (
    <div className="flex gap-1">
      <EditButton onClick={() => setEditDialogOpen(true)} idInterne={row.IDInterne} />
      <LogButton onClick={() => {
        console.log("Log button clicked", row.IDInterne);
        setLogDialogOpen(true);
      }} idInterne={row.IDInterne} />
      <FileButton onClick={() => {}} idInterne={row.IDInterne} />

      <EditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        idInterne={row.IDInterne}
      />

      <LogDialog
        open={logDialogOpen}
        onOpenChange={(open) => {
          console.log("LogDialog state change:", open);
          setLogDialogOpen(open);
        }}
        idInterne={row.IDInterne}
      />
    </div>
  );
}


export default function ImportHistory() {
  const { data, isLoading } = useImportHistory();
  //const [selectedId, setSelectedId] = useState<string | null>(null); // Removed as state is now managed in ImportHistoryActions
  //const [isLogDialogOpen, setIsLogDialogOpen] = useState(false); // Removed as state is now managed in ImportHistoryActions

  //const handleLogClick = (id: string) => { // Removed as this function is no longer needed
  //  setSelectedId(id);
  //  setIsLogDialogOpen(true);
  //};

  return (
    <div className="container mx-auto py-10">
      <DataTable 
        columns={columns} 
        data={data || []} 
        isLoading={isLoading}
        actionButtons={(row) => (
          <ImportHistoryActions row={row}/>
        )}
      />
      {/* Removed conditional rendering of LogDialog as it's now handled within ImportHistoryActions */}
    </div>
  );
}