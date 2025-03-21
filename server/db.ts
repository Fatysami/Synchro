import mysql from 'mysql2/promise';
import { getSyncHistory } from './db-histosync';

// Configuration des pools de connexion MySQL
const createPool = (prefix: string) => {
  try {
    const config = {
      host: process.env[`${prefix}_MYSQL_HOST`],
      port: parseInt(process.env[`${prefix}_MYSQL_PORT`] || "35217"),
      user: process.env[`${prefix}_MYSQL_USER`],
      password: process.env[`${prefix}_MYSQL_PASSWORD`],
      database: process.env[`${prefix}_MYSQL_DATABASE`],
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };

    console.log(`
=== TENTATIVE DE CONNEXION ${prefix} ===
Host: ${config.host}
Port: ${config.port}
Database: ${config.database}
User: ${config.user}
`);

    const pool = mysql.createPool(config);
    console.log(`✅ Pool ${prefix} créé avec succès`);
    return pool;
  } catch (error) {
    console.error(`❌ Erreur lors de la création du pool ${prefix}:`, error);
    throw error;
  }
};

let _authPool: mysql.Pool | null = null;

// Test de connexion initial
async function testConnection(pool: mysql.Pool, name: string) {
  try {
    console.log(`TEST CONNEXION ${name}`);
    const connection = await pool.getConnection();
    await connection.ping();
    console.log(`✅ Connexion ${name} OK`);

    const [result] = await connection.execute('SELECT 1 as test');
    console.log(`✅ Test requête ${name} OK:`, result);

    connection.release();
  } catch (error) {
    console.error(`❌ Erreur de connexion ${name}:`, error);
    throw error;
  }
}

// Export du pool avec initialisation lazy
export function authPool(): mysql.Pool {
  if (!_authPool) {
    console.log('🔄 Initialisation du pool AUTH');
    _authPool = createPool('AUTH');
  }
  return _authPool;
}

// Création des pools
const pools = {
  syncPool: null as mysql.Pool | null,
  histoSyncPool: null as mysql.Pool | null,
  syncNuxiDevPool: null as mysql.Pool | null
};

// Initialisation des bases de données
export async function initializeDatabases() {
  try {
    console.log('\n=== DÉBUT INITIALISATION BASES DE DONNÉES ===');

    // Création des pools
    pools.syncPool = createPool('SYNC');
    pools.histoSyncPool = createPool('HISTOSYNC');
    pools.syncNuxiDevPool = createPool('SYNCNUXIDEV');

    // Test des connexions
    await testConnection(authPool(), 'AUTH');
    await testConnection(pools.syncPool, 'SYNC');
    await testConnection(pools.histoSyncPool, 'HISTOSYNC');
    await testConnection(pools.syncNuxiDevPool, 'SYNCNUXIDEV');

    console.log('✅ Toutes les connexions aux bases de données sont établies\n');
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation des bases de données:', error);
    throw error;
  }
}


// Export des pools avec vérification de connexion
export const syncPool = () => {
  if (!pools.syncPool) {
    console.error('❌ Sync pool non initialisé');
    throw new Error('Sync pool not initialized');
  }
  return pools.syncPool;
};

export const histoSyncPool = () => {
  if (!pools.histoSyncPool) {
    console.error('❌ HistoSync pool non initialisé');
    throw new Error('HistoSync pool not initialized');
  }
  return pools.histoSyncPool;
};

export const syncNuxiDevPool = () => {
  if (!pools.syncNuxiDevPool) {
    console.error('❌ SyncNuxiDev pool non initialisé');
    throw new Error('SyncNuxiDev pool not initialized');
  }
  return pools.syncNuxiDevPool;
};

// Fonction de validation utilisateur avec logs améliorés
export async function validateUser(IDSynchro: string, IDClient: string) {
  try {
    console.log('\n=== VALIDATION UTILISATEUR ===');
    console.log('Tentative de connexion avec:', { IDSynchro, IDClient });

    const pool = authPool();
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute(
        'SELECT ID, IDSynchro, IDClient, ConfigConnecteur, Premium, Options, Tablettes FROM licences2 WHERE IDSynchro = ? AND IDClient = ?',
        [IDSynchro, IDClient]
      );

      const users = rows as any[];
      if (users.length === 0) {
        console.log('❌ Aucun utilisateur trouvé');
        return null;
      }

      const user = users[0];
      console.log('✅ Utilisateur trouvé:', {
        ID: user.ID,
        IDSynchro: user.IDSynchro,
        Premium: user.Premium ? 'Oui' : 'Non'
      });

      if (!user.Tablettes) {
        user.Tablettes = "1;Indéfini;EBPGesComOL|GesCom;5;GesCom";
      }

      return user;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Erreur base de données:', error);
    throw new Error('Database authentication error');
  }
}

// Fonction pour récupérer les comptages de planification avec logs détaillés
export async function getPlanningCounts(IDSynchro: string): Promise<{ C: number; R: number; I: number }> {
  console.log('\n=== DÉBUT GETPLANNINGCOUNTS ===');
  console.log('IDSynchro reçu:', IDSynchro);

  try {
    // Vérification préliminaire avec select count
    const [countCheck] = await syncPool().execute(
      'SELECT COUNT(*) as total FROM Synchro WHERE IDSynchro = ?',
      [IDSynchro]
    );
    console.log('Nombre total d\'enregistrements trouvés:', countCheck[0]['total']);

    // Utiliser la requête qui fonctionne dans SQL Management
    const query = `
      SELECT Ordre, COUNT(*) as total
      FROM Synchro 
      WHERE IDSynchro = ?
      GROUP BY Ordre`;

    console.log('Query:', query);
    console.log('Params:', [IDSynchro]);

    const [rows] = await syncPool().execute(query, [IDSynchro]) as any[];
    console.log('Résultat brut MySQL:', JSON.stringify(rows, null, 2));

    // Initialiser les compteurs
    const counts = { C: 0, R: 0, I: 0 };

    // Traiter chaque ligne en utilisant la notation bracket
    for (const row of rows) {
      console.log('Traitement ligne:', {
        ordre: row['Ordre'],
        total: row['total']
      });

      const ordre = row['Ordre'];
      const total = parseInt(row['total'], 10);

      if (!isNaN(total)) {
        switch (ordre) {
          case 'C':
            counts.C = total;
            break;
          case 'R':
            counts.R = total;
            break;
          case 'I':
            counts.I = total;
            break;
        }
      }
    }

    console.log('Comptages finaux:', counts);
    return counts;
  } catch (error) {
    console.error('❌ ERREUR dans getPlanningCounts:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

export async function getUserPlannings(IDSynchro: string) {
  try {
    console.log('\n=== RÉCUPÉRATION DES PLANIFICATIONS ===');
    console.log('IDSynchro reçu:', IDSynchro);

    // Vérifications préliminaires sur la connexion et la base de données
    console.log('Vérification du pool de connexion SYNC...');
    const pool = syncPool();
    console.log('Pool SYNC obtenu avec succès');

    // Vérification de la base de données
    try {
      const [dbInfo] = await pool.execute('SELECT DATABASE() as db_name');
      console.log('Base de données actuellement sélectionnée:', (dbInfo as any[])[0].db_name);
    } catch (dbErr) {
      console.error('❌ Erreur lors de la vérification de la base de données:', dbErr);
    }

    // Vérification de l'existence de la table Synchro
    try {
      const [tableInfo] = await pool.execute('SHOW TABLES LIKE "Synchro"');
      console.log('Table Synchro existe:', (tableInfo as any[]).length > 0 ? 'Oui' : 'Non');

      if ((tableInfo as any[]).length === 0) {
        console.error('❌ La table Synchro n\'existe pas dans la base de données!');

        // Lister toutes les tables disponibles
        const [allTables] = await pool.execute('SHOW TABLES');
        console.log('Tables disponibles dans la base de données:',
          (allTables as any[]).map(row => Object.values(row)[0]).join(', '));
      }
    } catch (tableErr) {
      console.error('❌ Erreur lors de la vérification de la table Synchro:', tableErr);
    }

    const query = `
      SELECT Jour, 
             TIME_FORMAT(Heure, "%H:%i") as Heure, 
             Ordre 
      FROM Synchro 
      WHERE IDSynchro = ? 
      ORDER BY Heure, Jour`;

    console.log('Exécution requête SQL:', query);
    console.log('Paramètres:', [IDSynchro]);

    const [rows] = await pool.execute(query, [IDSynchro]);
    console.log('Résultat brut:', rows);

    if (!rows || (rows as any[]).length === 0) {
      console.log('⚠️ Aucune planification trouvée');

      // Vérification des tables et structure
      console.log('\n=== VÉRIFICATIONS SUPPLÉMENTAIRES ===');

      // Vérifier le nombre total d'enregistrements
      const [checkResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM Synchro WHERE IDSynchro = ?',
        [IDSynchro]
      );
      console.log('Nombre total d\'enregistrements pour cet IDSynchro:', (checkResult as any[])[0].total);

      // Vérifier le nombre total d'enregistrements dans la table
      const [totalRecords] = await pool.execute('SELECT COUNT(*) as total FROM Synchro');
      console.log('Nombre total d\'enregistrements dans la table Synchro:', (totalRecords as any[])[0].total);

      // Lister quelques exemples d'IDSynchro existants
      const [syncIds] = await pool.execute(
        'SELECT DISTINCT IDSynchro FROM Synchro LIMIT 5'
      );
      console.log('Exemples d\'IDSynchro existants:',
        (syncIds as any[]).map(row => row.IDSynchro).join(', '));

      // Vérifier la structure de la table
      const [tableStructure] = await pool.execute('DESCRIBE Synchro');
      console.log('Structure de la table Synchro:', JSON.stringify(tableStructure, null, 2));
    } else {
      console.log('Nombre de planifications trouvées:', (rows as any[]).length);
    }

    return rows as Array<{
      Jour: string;
      Heure: string;
      Ordre: string;
    }>;
  } catch (error) {
    console.error('❌ Erreur critique lors de la récupération des planifications:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw new Error('Failed to fetch plannings');
  }
}

export function extractMobileConfig(tablettes: string) {
  try {
    const values = tablettes.split(';');
    const thirdValue = values[2] || '';
    const fifthValue = values[4] || '';

    const sTemp = thirdValue.split('|');
    const gsLogicielMaitreCode = sTemp[0] || '';
    const gsLogicielMobileCode = fifthValue;

    // Étape 5: Construction de l'URL
    const url = `https://nuxidev.fr/download/config/NuxiDev5-${gsLogicielMaitreCode}-${gsLogicielMobileCode}.xml`;

    // Utiliser console.info pour s'assurer que les logs sont plus visibles dans la console
    console.info('\n🔗 DÉTAILS DE L\'URL GÉNÉRÉE DANS DB.TS:');
    console.info('┌───────────────────────────────────────────────────────────');
    console.info('│ Base URL:              https://nuxidev.fr/download/config/');
    console.info(`│ Nom du fichier:        NuxiDev5-${gsLogicielMaitreCode}-${gsLogicielMobileCode}.xml`);
    console.info(`│ Logiciel Maître:       ${gsLogicielMaitreCode}`);
    console.info(`│ Logiciel Mobile:       ${gsLogicielMobileCode}`);
    console.info('└───────────────────────────────────────────────────────────');
    console.info(`📌 URL FINALE: ${url}`);
    console.info('=== FIN EXTRACT MOBILE CONFIG ===\n');


    return {
      gsLogicielMaitreCode,
      gsLogicielMobileCode
    };
  } catch (error) {
    console.error('Error extracting mobile config:', error);
    return null;
  }
}



export async function savePlannings(IDSynchro: string, plannings: Planning[], xmlInfo: { exe: string; serial: string }) {
  const connection = await syncPool().getConnection();
  try {
    await connection.beginTransaction();

    // 1. Supprimer les planifications existantes
    await connection.execute(
      'DELETE FROM Synchro WHERE IDSynchro = ?',
      [IDSynchro]
    );

    // 2. Insérer les nouvelles planifications
    for (const planning of plannings) {
      await connection.execute(
        'INSERT INTO Synchro (IDSynchro, Serial, Jour, Heure, Ordre, Execution, Exe, ip) VALUES (?, ?, ?, ?, ?, NOW(), ?, NULL)',
        [
          IDSynchro,
          xmlInfo.serial,
          planning.day,
          planning.time + ':00', // Ajouter les secondes pour le format TIME
          planning.type,
          xmlInfo.exe
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('Error saving plannings:', error);
    throw new Error('Failed to save plannings');
  } finally {
    connection.release();
  }
}


interface Planning {
  day: string;
  time: string;
  type: string;
}

export { getSyncHistory };