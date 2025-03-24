import { users, syncConfigs, type User, type InsertUser, type SyncConfig, type InsertSyncConfig } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { authPool } from "./db";  // Import authPool for direct database access

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getSyncConfig(userId: number): Promise<SyncConfig | undefined>;
  updateSyncConfig(userId: number, config: InsertSyncConfig): Promise<SyncConfig>;
  updateUserConfig(userId: number, configXml: string): Promise<void>;
  sessionStore: session.Store;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private configs: Map<number, SyncConfig>;
  currentId: number;
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.configs = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    try {
      const connection = await authPool().getConnection();
      try {
        console.log('🔍 [DB] Exécution de getUser pour ID:', id);
        const [rows] = await connection.execute(
          'SELECT * FROM licences2 WHERE ID = ?',
          [id]
        );
        console.log('✅ [DB] Résultat getUser:', rows);
        return rows[0];
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('❌ [DB] Erreur dans getUser:', error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getSyncConfig(userId: number): Promise<SyncConfig | undefined> {
    return this.configs.get(userId);
  }

  async updateSyncConfig(userId: number, config: InsertSyncConfig): Promise<SyncConfig> {
    const syncConfig: SyncConfig = {
      ...config,
      id: userId,
      lastSync: new Date(),
    };
    this.configs.set(userId, syncConfig);
    return syncConfig;
  }

  async updateUserConfig(userId: number, configXml: string): Promise<void> {
    try {
      console.log('\n=== DÉBUT MISE À JOUR CONFIGURATION UTILISATEUR ===');
      console.log('📄 [1] Informations initiales:');
      console.log(`- ID Utilisateur: ${userId}`);
      console.log(`- Taille XML: ${configXml.length} caractères`);
      console.log(`- Premier caractère XML: "${configXml.charAt(0)}"`);
      console.log(`- Début XML: "${configXml.substring(0, 50)}..."`);

      // Vérification de la connexion au pool
      console.log('\n🔌 [2] Vérification du pool de connexion');
      const pool = authPool();
      console.log('- Pool obtenu avec succès');

      // Test de ping sur le pool
      console.log('\n🏓 [3] Test de ping sur le pool');
      await pool.getConnection().then(async (conn) => {
        await conn.ping();
        conn.release();
        console.log('- Ping réussi, connexion fonctionnelle');
      });

      // Obtention d'une connexion dédiée
      console.log('\n🔗 [4] Obtention d\'une connexion dédiée');
      const connection = await pool.getConnection();
      console.log('- Connexion obtenue avec succès');

      try {
        // Vérification de l'existence de l'utilisateur
        console.log('\n🔍 [5] Vérification de l\'existence de l\'utilisateur');
        const [userCheck] = await connection.execute(
          'SELECT ID, IDSynchro FROM licences2 WHERE ID = ?',
          [userId]
        );
        console.log('- Résultat vérification:', userCheck);

        if (!Array.isArray(userCheck) || userCheck.length === 0) {
          console.error('❌ [5.1] Utilisateur non trouvé:', userId);
          throw new Error(`Utilisateur ${userId} non trouvé dans la base de données`);
        }
        console.log('✅ [5.2] Utilisateur trouvé:', userCheck[0]);

        // Lecture de la configuration actuelle
        console.log('\n📖 [6] Lecture de la configuration actuelle');
        const [currentConfig] = await connection.execute(
          'SELECT ConfigConnecteur FROM licences2 WHERE ID = ?',
          [userId]
        );
        console.log('- Configuration actuelle:', {
          exists: !!currentConfig[0]?.ConfigConnecteur,
          length: currentConfig[0]?.ConfigConnecteur?.length || 0
        });

        // Exécution de l'UPDATE
        console.log('\n💾 [7] Exécution de la requête UPDATE');
        const updateQuery = 'UPDATE licences2 SET ConfigConnecteur = ? WHERE ID = ?';
        console.log('- Requête SQL:', updateQuery);
        console.log('- Paramètres:', {
          userId,
          xmlLength: configXml.length
        });

        const [result] = await connection.execute(updateQuery, [configXml, userId]);

        // Analyse détaillée du résultat
        console.log('\n📊 [8] Analyse du résultat de l\'UPDATE');
        const affectedRows = (result as any)?.affectedRows || 0;
        console.log('- Résultat brut:', result);
        console.log('- Lignes affectées:', affectedRows);
        console.log('- Succès:', affectedRows > 0 ? 'Oui' : 'Non');

        if (affectedRows === 0) {
          throw new Error(`Échec de la mise à jour - aucune ligne modifiée pour l'utilisateur ${userId}`);
        }

        // Vérification après UPDATE
        console.log('\n✅ [9] Vérification post-UPDATE');
        const [verifyResult] = await connection.execute(
          'SELECT ConfigConnecteur FROM licences2 WHERE ID = ?',
          [userId]
        );
        console.log('- Nouvelle configuration:', {
          exists: !!verifyResult[0]?.ConfigConnecteur,
          length: verifyResult[0]?.ConfigConnecteur?.length || 0,
          changed: verifyResult[0]?.ConfigConnecteur?.length !== currentConfig[0]?.ConfigConnecteur?.length
        });

        console.log('\n✨ [10] Mise à jour terminée avec succès');
      } finally {
        // Libération de la connexion
        console.log('\n🔌 [11] Libération des ressources');
        connection.release();
        console.log('- Connexion libérée');
      }
    } catch (error) {
      console.error('\n❌ [ERROR] Erreur lors de la mise à jour:', error);
      console.error('- Message:', error.message);
      console.error('- Stack:', error.stack);
      throw error;
    }
  }
}

export const storage = new MemStorage();