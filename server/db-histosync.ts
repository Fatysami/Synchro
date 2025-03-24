import mysql from 'mysql2/promise';
import { SyncHistoryEntry } from '@shared/schema';
import { histoSyncPool } from './db';

interface GetSyncHistoryOptions {
  idSynchro: string;
  page: number;
  pageSize: number;
  errorOnly?: boolean;
  dateFilter?: Date;
  searchText?: string;
}

export async function getSyncHistory({
  idSynchro,
  page,
  pageSize,
  errorOnly = false,
  dateFilter,
  searchText
}: GetSyncHistoryOptions): Promise<{ data: SyncHistoryEntry[], total: number }> {
  try {
    let whereConditions = ['IDSynchro = ?'];
    const params: any[] = [idSynchro];

    if (errorOnly) {
      whereConditions.push('Etat = -1');
    }

    if (dateFilter) {
      // Simplifier en utilisant la fonction DATE() de MySQL pour comparer seulement les dates sans l'heure
      whereConditions.push('DATE(DateHeure) = DATE(?)');
      params.push(dateFilter);
      
      console.log('Date filtrée (simple):', dateFilter);
    }

    if (searchText) {
      whereConditions.push('(RefDoc LIKE ? OR Enreg LIKE ? OR TypeEnreg LIKE ?)');
      const searchPattern = `%${searchText}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = whereConditions.join(' AND ');

    console.log('\n=== REQUÊTE HISTORIQUE SYNC ===');
    console.log('Configuration HISTOSYNC:');
    console.log('Host:', process.env.HISTOSYNC_MYSQL_HOST);
    console.log('Port:', process.env.HISTOSYNC_MYSQL_PORT || "35414");
    console.log('Database:', process.env.HISTOSYNC_MYSQL_DATABASE);
    console.log('\nParamètres de recherche:');
    console.log('IDSynchro:', idSynchro);
    console.log('Page:', page);
    console.log('Taille de page:', pageSize);
    console.log('Erreurs uniquement:', errorOnly);
    console.log('Filtre date:', dateFilter);
    console.log('Texte recherché:', searchText);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM syncsav WHERE ${whereClause}`;
    console.log('\nRequête de comptage:', countQuery);
    console.log('Paramètres:', params);

    const [countResult] = await histoSyncPool().query(
      countQuery,
      params
    ) as any[];

    const total = countResult[0].total;
    console.log('Nombre total d\'enregistrements:', total);

    // Get paginated data
    const offset = (page - 1) * pageSize;
    const dataQuery = `
      SELECT * FROM syncsav 
      WHERE ${whereClause}
      ORDER BY IDSyncNuxiDev DESC 
      LIMIT ? OFFSET ?`;

    console.log('\nRequête de données:', dataQuery);
    console.log('Paramètres complets:', [...params, pageSize, offset]);

    const [rows] = await histoSyncPool().query(
      dataQuery,
      [...params, pageSize, offset]
    ) as [SyncHistoryEntry[], any];

    console.log('Nombre d\'enregistrements récupérés:', rows.length);
    if (rows.length > 0) {
      console.log('Premier enregistrement:', rows[0]);
    }

    return { data: rows, total };
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    throw new Error('Impossible de récupérer l\'historique de synchronisation');
  }
}

export async function getSyncLog(idInterne: string, userSyncId: string): Promise<string | null> {
  try {
    console.log('Récupération du log pour:', { idInterne, userSyncId });

    const [rows] = await histoSyncPool().query(
      'SELECT Log FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
      [idInterne, userSyncId]
    ) as any[];

    if (!rows || rows.length === 0) {
      console.log('Aucun log trouvé');
      return null;
    }

    console.log('Log trouvé');
    return rows[0].Log || null;
  } catch (error) {
    console.error('Erreur lors de la récupération du log:', error);
    throw new Error('Impossible de récupérer le log');
  }
}