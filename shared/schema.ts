import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Type pour les comptages de planification
export type PlanningCounts = {
  C: number;
  R: number;
  I: number;
};

// Type pour les données utilisateur de l'authentification MySQL
export type AuthUser = {
  ID: number;
  IDSynchro: string;
  IDClient: string;
  ConfigConnecteur: string;
  Premium: number;
  Options: string;
  Tablettes: string;
  planningCounts?: PlanningCounts;
};

// Table PostgreSQL pour les utilisateurs
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const syncConfigs = pgTable("sync_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  timezone: text("timezone").notNull(),
  databaseProvider: text("database_provider"),
  databaseServer: text("database_server"),
  databaseName: text("database_name"),
  databaseUsername: text("database_username"),
  databasePassword: text("database_password"),
  masterSoftwarePath: text("master_software_path"),
  masterConfigPath: text("master_config_path"),
  softwareUsername: text("software_username"),
  softwarePassword: text("software_password"),
  importDirectory: text("import_directory"),
  exportDirectory: text("export_directory"),
  syncSchedule: text("sync_schedule").notNull(),
  syncTime: text("sync_time").notNull(),
  syncType: text("sync_type").notNull(),
  lastSync: timestamp("last_sync"),
  isReadOnly: boolean("is_read_only").default(false),
});

// Type for syncsav table entries
export interface SyncHistoryEntry {
  IDSyncNuxiDev: number;
  IDSynchro: string;
  TypeEnreg: string;
  IDiSaisie: number;
  NumLigne: number;
  DateHeure: string;
  Enreg: string;
  RefDoc: string;
  TypeElement: string;
  IDInterne: string;
  Etat: number;
  Log: string;
  Import: string;
}

// Type for the table display data
export interface ImportHistoryItem {
  idInterne: string;
  traite: boolean | "indeterminate";
  typeElement: string;
  refDoc: string;
  dhExport: string;
  nbLigne: number;
  typeTraitement: string;
  fichierNom: string;
}

export const insertUserSchema = createInsertSchema(users);
export const insertSyncConfigSchema = createInsertSchema(syncConfigs);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertSyncConfig = z.infer<typeof insertSyncConfigSchema>;
export type User = AuthUser; // Now User includes PlanningCounts
export type SyncConfig = typeof syncConfigs.$inferSelect;