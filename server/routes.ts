import type { Express } from "express";
import express, { Router } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import databaseRoutes from './routes/database';
import googleCalendarRoutes from './routes/google-calendar';
import syncDataRoutes from './routes/sync-data';
import { getUserPlannings, savePlannings, getPlanningCounts, getSyncHistory } from "./db";
import { getSyncLog } from "./db-histosync"; 
import { DOMParser, XMLSerializer } from 'xmldom';
import * as http from 'http';
import { histoSyncPool } from './db';
import * as https from 'https';
import { syncPool, syncNuxiDevPool } from './db';
import * as crypto from 'crypto';

// Configure request size limits
const MAX_REQUEST_SIZE = '50mb';

function decodeUTF8String(str: string | undefined): string {
  if (str === undefined) return '';
  try {
    return decodeURIComponent(escape(str));
  } catch (error) {
    console.error("Error decoding UTF-8 string:", error);
    return str; 
  }
}

function decodeXMLMessage(message: string): string {
  if (!message) return '';
  try {
    return decodeURIComponent(escape(message
      .replace(/&amp;apos;/g, "'")
      .replace(/&amp;quot;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\/n/g, '\n')
      .replace(/\\n/g, '\n')
      .trim()
    ));
  } catch (error) {
    console.error("Error decoding XML message:", error);
    return message;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure request size limits first
  app.use(express.json({ limit: MAX_REQUEST_SIZE }));
  app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_SIZE }));

  // Setup authentication next
  setupAuth(app);

  // Then mount database routes
  app.use('/api/database', databaseRoutes);
  
  // Mount Google Calendar routes
  app.use('/api/google-calendar', googleCalendarRoutes);

  // Mount sync data routes
  app.use('/api/sync-data', syncDataRoutes);

  // Ajouter une journalisation des requêtes
  app.use((req, res, next) => {
    console.log(`\n=== REQUÊTE ${req.method} ${req.path} ===`);
    console.log('- Headers:', req.headers);
    console.log('- Session:', req.session);
    console.log('- isAuthenticated:', req.isAuthenticated());
    next();
  });

  // Get server IP
  app.get("/api/server-ip", async (req, res) => {
    try {
      http.get('http://api.ipify.org', function(apiRes) {
        let data = '';
        apiRes.on('data', function(chunk) {
          data += chunk;
        });
        apiRes.on('end', function() {
          res.json({ ip: data });
        });
      }).on('error', function(err) {
        console.error('Erreur lors de la récupération de l\'IP du serveur:', err);
        res.status(500).json({ error: "Échec de la récupération de l'IP du serveur" });
      });
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'IP du serveur:', error);
      res.status(500).json({ error: "Échec de la récupération de l'IP du serveur" });
    }
  });

  // Get current user 
  app.get("/api/user", async (req, res) => {
    console.log('\n=== DÉBUT ROUTE /api/user ===');
    console.log('1. Vérification authentification');
    console.log('Session:', req.session);
    console.log('isAuthenticated:', req.isAuthenticated());
    console.log('user:', req.user);

    if (!req.isAuthenticated()) {
      console.log('⚠️ Utilisateur non authentifié');
      return res.sendStatus(401);
    }

    try {
      console.log('\n2. Utilisateur authentifié:', {
        ID: req.user.ID,
        IDSynchro: req.user.IDSynchro,
        IDClient: req.user.IDClient
      });

      // Étape 3: Récupération des comptages
      console.log('\n3. Début récupération des comptages');
      let planningCounts = { C: 0, R: 0, I: 0 };  // Valeur par défaut
      try {
        // Vérification préliminaire avec select count
        const [countCheck] = await syncPool().execute(
          'SELECT COUNT(*) as total FROM Synchro WHERE IDSynchro = ?',
          [req.user.IDSynchro]
        );
        console.log('Nombre total d\'enregistrements trouvés:', countCheck[0].total);

        // Récupération des comptages détaillés
        console.log('Appel getPlanningCounts pour IDSynchro:', req.user.IDSynchro);
        const detailedCounts = await getPlanningCounts(req.user.IDSynchro);
        console.log('Résultat détaillé getPlanningCounts:', detailedCounts);
        
        if (detailedCounts && typeof detailedCounts === 'object') {
          planningCounts = detailedCounts;
        }
      } catch (countError) {
        console.error('❌ Erreur lors du comptage:', countError);
        console.error('Stack trace:', countError instanceof Error ? countError.stack : 'No stack trace');
      }

      console.log('\n4. Préparation réponse');
      const userData = {
        ID: req.user.ID,
        IDSynchro: req.user.IDSynchro,
        IDClient: req.user.IDClient,
        ConfigConnecteur: req.user.ConfigConnecteur,
        Premium: req.user.Premium,
        Options: req.user.Options,
        Tablettes: req.user.Tablettes,
        planningCounts
      };

      console.log('5. Données à envoyer:', {
        ...userData,
        ConfigConnecteur: '[MASQUÉ]',
        planningCounts
      });

      console.log('=== FIN ROUTE /api/user ===\n');
      res.json(userData);
    } catch (error) {
      console.error('❌ Erreur critique route /api/user:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ error: "Failed to fetch planning counts" });
    }
  });

  // Get plannings
  app.get("/api/plannings", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('⚠️ Tentative d\'accès non authentifiée à /api/plannings');
      return res.sendStatus(401);
    }

    try {
      console.log('\n=== ROUTE /api/plannings ===');
      console.log('1. Informations utilisateur');
      console.log('User authentifié:', req.user.IDSynchro);
      console.log('Détails:', {
        ID: req.user.ID,
        IDClient: req.user.IDClient,
        Premium: req.user.Premium ? 'Oui' : 'Non'
      });

      // Vérification de la connexion à la base SYNC
      console.log('\n2. Vérification connexion base SYNC');
      try {
        const [testResult] = await syncPool().execute('SELECT 1 as test');
        console.log('✓ Connexion réussie:', testResult);

        // Vérification préliminaire des tables
        console.log('\n3. Vérification des tables');
        const [tableInfo] = await syncPool().execute('DESCRIBE Synchro');
        console.log('Structure table Synchro:', tableInfo);

        // Vérification des données existantes
        const [countCheck] = await syncPool().execute(
          'SELECT COUNT(*) as count FROM Synchro WHERE IDSynchro = ?',
          [req.user.IDSynchro]
        );
        console.log('Enregistrements trouvés:', countCheck[0].count);
      } catch (connErr) {
        console.error('❌ Erreur de connexion ou requête:', connErr);
        console.error('Stack trace:', connErr instanceof Error ? connErr.stack : 'No stack trace');
        throw connErr;
      }

      console.log('\n4. Récupération des planifications');
      console.log('Appel getUserPlannings pour IDSynchro:', req.user.IDSynchro);
      const plannings = await getUserPlannings(req.user.IDSynchro);

      console.log('\n5. Résultats');
      console.log('Nombre de planifications:', plannings.length);
      if (plannings.length === 0) {
        console.log('⚠️ Aucune planification trouvée');
      } else {
        console.log('Premières planifications:', plannings.slice(0, 2));
      }

      console.log('\n=== FIN ROUTE /api/plannings ===');
      res.json(plannings);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des planifications:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        error: "Failed to fetch plannings", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Update terminal configuration
  app.patch("/api/config/terminal", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { terminalIndex, terminal } = req.body;

      if (!req.user.ConfigConnecteur) {
        return res.status(400).json({ error: "No configuration found" });
      }

      console.log('Updating terminal configuration:', { terminalIndex, terminal });

      // Parse the existing XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(req.user.ConfigConnecteur, "text/xml");

      // Find or create necessary nodes
      const createNodeIfNotExists = (parentNode: Element, tagName: string): Element => {
        let node = parentNode.getElementsByTagName(tagName)[0];
        if (!node) {
          node = xmlDoc.createElement(tagName);
          parentNode.appendChild(node);
        }
        return node as Element;
      };

      // Find the terminal node to update
      const terminauxNode = createNodeIfNotExists(xmlDoc.documentElement, 'Terminaux');
      const terminalNodes = terminauxNode.getElementsByTagName('Terminal');

      if (terminalIndex >= terminalNodes.length) {
        return res.status(400).json({ error: "Terminal index out of range" });
      }

      const terminalNode = terminalNodes[terminalIndex];
      if (!terminalNode) {
        return res.status(400).json({ error: "Terminal node not found" });
      }

      // Update basic properties
      const updateTextContent = (parentNode: Element, tagName: string, value: string) => {
        const node = createNodeIfNotExists(parentNode, tagName);
        node.textContent = value;
      };

      updateTextContent(terminalNode, 'Nom', terminal.Nom);
      updateTextContent(terminalNode, 'ID_Tablette', terminal.ID_Tablette);
      updateTextContent(terminalNode, 'ID_Smartphone', terminal.ID_Smartphone);

      // Update filters
      const filtresNode = createNodeIfNotExists(terminalNode, 'Filtres');

      // Update Technicien
      const techniciensNode = createNodeIfNotExists(filtresNode, 'Techniciens');
      const technicienNode = createNodeIfNotExists(techniciensNode, 'Technicien');
      updateTextContent(technicienNode, 'IDInterne', terminal.Filtres.Techniciens.Technicien.IDInterne);

      // Update Depot
      const depotsNode = createNodeIfNotExists(filtresNode, 'Depots');
      const depotNode = createNodeIfNotExists(depotsNode, 'Depot');
      updateTextContent(depotNode, 'IDInterne', terminal.Filtres.Depots.Depot.IDInterne);

      // Update Commerciaux
      const commerciauxNode = createNodeIfNotExists(filtresNode, 'Commerciaux');
      // Remove existing commercials
      while (commerciauxNode.firstChild) {
        commerciauxNode.removeChild(commerciauxNode.firstChild);
      }
      // Add new commercials
      terminal.Filtres.Commerciaux.Commercial.forEach((commercial: any) => {
        const commercialElem = xmlDoc.createElement('Commercial');
        updateTextContent(commercialElem, 'IDInterne', commercial.IDInterne);
        updateTextContent(commercialElem, 'Libelle', commercial.Libelle);
        commerciauxNode.appendChild(commercialElem);
      });

      // Update authorizations
      const autorisationsNode = createNodeIfNotExists(terminalNode, 'Autorisations');
      terminal.Autorisations.Autorisation.forEach((auth: any) => {
        const authNode = Array.from(autorisationsNode.getElementsByTagName('Autorisation'))
          .find((node: any) => node.getElementsByTagName('ID')[0]?.textContent === auth.ID);

        if (authNode) {
          updateTextContent(authNode, 'Autorise', auth.Autorise.toString());
        } else {
          const newAuthNode = xmlDoc.createElement('Autorisation');
          updateTextContent(newAuthNode, 'ID', auth.ID);
          updateTextContent(newAuthNode, 'Autorise', auth.Autorise.toString());
          updateTextContent(newAuthNode, 'Libelle', auth.Libelle);
          autorisationsNode.appendChild(newAuthNode);
        }
      });

      // Serialize back to XML
      const serializer = new XMLSerializer();
      const updatedXml = serializer.serializeToString(xmlDoc);

      console.log('Updated XML structure:', updatedXml.substring(0, 200) + '...');

      // Update the user's configuration in the database
      await storage.updateUserConfig(req.user.ID, updatedXml);

      // Update the session
      req.user.ConfigConnecteur = updatedXml;

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating terminal configuration:', error);
      res.status(500).json({
        error: "Failed to update terminal configuration",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get sync history
  app.get("/api/sync-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const errorOnly = req.query.errorOnly === 'true';
      const dateFilter = req.query.date ? new Date(req.query.date as string) : undefined;
      const searchText = req.query.search as string;

      const result = await getSyncHistory({
        idSynchro: req.user.IDSynchro,
        page,
        pageSize,
        errorOnly,
        dateFilter,
        searchText
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching sync history:', error);
      res.status(500).json({ error: "Failed to fetch sync history" });
    }
  });

  // Get sync history XML data for editing
  app.get("/api/sync-history/:idInterne/xml", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { idInterne } = req.params;

      // Query HistoSync database to get XML data
      const query = `
        SELECT Enreg 
        FROM syncsav 
        WHERE IDInterne = ? AND IDSynchro = ? 
        LIMIT 1
      `;

      const [rows] = await histoSyncPool().query(query, [idInterne, req.user.IDSynchro]);

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Record not found" });
      }

      res.json({ enreg: rows[0].Enreg });
    } catch (error) {
      console.error('Error fetching XML data:', error);
      res.status(500).json({ error: "Failed to fetch XML data" });
    }
  });

  // Update sync history XML data
  app.put("/api/sync-history/:idInterne/xml", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { idInterne } = req.params;
      const { xml } = req.body;

      if (!xml) {
        return res.status(400).json({ error: "XML data is required" });
      }

      // Update XML data in HistoSync database
      const query = `
        UPDATE syncsav 
        SET Enreg = ? 
        WHERE IDInterne = ? AND IDSynchro = ? 
        LIMIT 1
      `;

      const [result] = await histoSyncPool().query(query, [xml, idInterne, req.user.IDSynchro]);

      if (!result.affectedRows) {
        return res.status(404).json({ error: "Record not found or no changes made" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating XML data:', error);
      res.status(500).json({ error: "Failed to update XML data" });
    }
  });

  // Get sync history log data
  app.get("/api/sync-history/:idInterne/log", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Accès non autorisé - utilisateur non authentifié');
      console.log('Session:', req.session);
      console.log('isAuthenticated:', req.isAuthenticated());
      console.log('user:', req.user);
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      console.log('Tentative de récupération du log pour:', { idInterne, userSyncId: req.user.IDSynchro });

      // Récupérer le log avec l'ID de synchro de l'utilisateur connecté
      const log = await getSyncLog(idInterne, req.user.IDSynchro);

      if (log === null) {
        console.log('Log non trouvé');
        return res.status(404).json({ error: "Log not found" });
      }

      console.log('Log trouvé et envoyé');
      res.json(log);
    } catch (error) {
      console.error('Error fetching log data:', error);
      res.status(500).json({ error: "Failed to fetch log data" });
    }
  });

  // Récupérer les exclusions de synchronisation
  app.get("/api/exclusions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== RÉCUPÉRATION DES EXCLUSIONS ===');
      console.log('IDSynchro:', req.user.IDSynchro);

      // Vérifier la connection à la base de données
      try {
        console.log('Vérification de la connexion à la base SYNC...');
        const [testResult] = await syncPool().execute('SELECT 1 as test');
        console.log('Connexion à la base SYNC réussie:', testResult);
      } catch (connErr) {
        console.error('❌ Erreur de connexion à la base SYNC:', connErr);
        return res.status(500).json({ error: "Erreur de connexion à la base de données" });
      }

      // Récupérer les exclusions depuis la table appropriée
      const [rows] = await syncPool().query(
        'SELECT * FROM Exclusions WHERE IDSynchro = ?',
        [req.user.IDSynchro]
      );

      console.log('Exclusions récupérées:', rows);
      res.json(rows);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des exclusions:', error);
      res.status(500).json({ error: "Erreur lors de la récupération des exclusions" });
    }
  });

  // Ajouter une exclusion
  app.post("/api/exclusions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { type, value, description } = req.body;

      if (!type || !value) {
        return res.status(400).json({ error: "Le type et la valeur sont requis" });
      }

      // Insérer l'exclusion
      await syncPool().query(
        'INSERT INTO Exclusions (IDSynchro, Type, Valeur, Description) VALUES (?, ?, ?, ?)',
        [req.user.IDSynchro, type, value, description || '']
      );

      res.status(201).json({ success: true });
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout d\'une exclusion:', error);
      res.status(500).json({ error: "Erreur lors de l'ajout de l'exclusion" });
    }
  });

  // Supprimer une exclusion
  app.delete("/api/exclusions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { id } = req.params;

      // Vérifier que l'exclusion appartient bien à cet utilisateur
      const [rows] = await syncPool().query(
        'SELECT ID FROM Exclusions WHERE ID = ? AND IDSynchro = ?',
        [id, req.user.IDSynchro]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Exclusion non trouvée" });
      }

      // Supprimer l'exclusion
      await syncPool().query(
        'DELETE FROM Exclusions WHERE ID = ? AND IDSynchro = ?',
        [id, req.user.IDSynchro]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erreur lors de la suppression d\'une exclusion:', error);
      res.status(500).json({ error: "Erreur lors de la suppression de l'exclusion" });
    }
  });

  // Get sync history file
  app.get("/api/sync-history/:idInterne/file", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Accès non autorisé - utilisateur non authentifié');
      console.log('Session:', req.session);
      console.log('isAuthenticated:', req.isAuthenticated());
      console.log('user:', req.user);
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      console.log('Tentative de récupération du fichier pour:', { idInterne, userSyncId: req.user.IDSynchro });

      // Récupérer l'URL du fichier depuis la base de données
      const [rows] = await histoSyncPool().query(
        'SELECT Import FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
        [idInterne, req.user.IDSynchro]
      );

      console.log('Résultat de la requête:', rows);
      console.log('Type de rows:', typeof rows);
      if (Array.isArray(rows)) {
        console.log('Nombre d\'enregistrements:', rows.length);
        if (rows.length > 0) {
          console.log('Premier enregistrement:', rows[0]);
          console.log('Valeur de Import:', rows[0].Import);
        }
      }

      if (!Array.isArray(rows) || rows.length === 0 || !rows[0].Import) {
        console.log('Aucun fichier trouvé');
        return res.status(404).json({ error: "Aucun fichier disponible pour cet enregistrement" });
      }

      const fileUrl = rows[0].Import;
      console.log('URL du fichier trouvée:', fileUrl);

      // Vérifier les informations d'authentification
      console.log('Informations d\'authentification:');
      console.log('- Username:', req.user.IDSynchro);
      console.log('- Password présent:', !!req.user.FTP1_Mdp);

      // Créer les options de requête avec l'authentification
      const options = new URL(fileUrl);
      options.username = req.user.IDSynchro;
      options.password = req.user.FTP1_Mdp;

      console.log('Options de requête (sans mot de passe):', {
        ...options,
        password: '[MASQUÉ]'
      });

      // Détecter le protocole (http ou https) et utiliser le module approprié
      const httpModule = fileUrl.startsWith('https:') ? https : http;


      // Faire la requête au serveur distant
      httpModule.get(options, (response) => {
        console.log('Réponse du serveur distant:');
        console.log('- Status:', response.statusCode);
        console.log('- Headers:', response.headers);

        // Vérifier le code de statut
        if (response.statusCode === 404) {
          return res.status(404).json({ error: "Fichier non trouvé sur le serveur" });
        }
        if (response.statusCode !== 200) {
          return res.status(response.statusCode || 500).json({ error: "Erreur lors du téléchargement du fichier" });
        }

        // Extraire le nom du fichier de l'URL ou utiliser un nom par défaut
        const fileName = fileUrl.split('/').pop() || 'download.xml';

        // Configurer les en-têtes de réponse
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        if (response.headers['content-type']) {
          res.setHeader('Content-Type', response.headers['content-type']);
        }

        // Transférer le fichier
        response.pipe(res);
      }).on('error', (error) => {
        console.error('Erreur lors du téléchargement:', error);
        res.status(500).json({ error: "Erreur lors du téléchargement du fichier" });
      });

    } catch (error) {
      console.error('Error fetching file:', error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  // Update sync history status
  app.patch("/api/sync-history/:idInterne/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      const { newStatus } = req.body;

      console.log('\n=== MISE À JOUR STATUT SYNCHRONISATION ===');
      console.log('Paramètres:', { idInterne, newStatus, userSyncId: req.user.IDSynchro });

      // Vérifier que le statut est valide
      if (![0, 1, -1].includes(newStatus)) {
        return res.status(400).json({ error: "Statut invalide" });
      }

      if (newStatus === 1 || newStatus === -1) {
        // Supprimer de syncnuxidev
        console.log('Suppression de l\'enregistrement dans syncnuxidev');
        await syncNuxiDevPool().query(
          'DELETE FROM syncnuxidev WHERE IDInterne = ? AND IDSynchro = ? LIMIT 1',
          [idInterne, req.user.IDSynchro]
        );
      } else if (newStatus === 0) {
        // Vérifier si l'enregistrement existe déjà dans syncnuxidev
        console.log('Vérification si l\'enregistrement existe déjà dans syncnuxidev');
        const [existingRows] = await syncNuxiDevPool().query(
          'SELECT COUNT(*) as count FROM syncnuxidev WHERE IDInterne = ? AND IDSynchro = ?',
          [idInterne, req.user.IDSynchro]
        ) as any[];

        console.log('Résultat vérification:', existingRows[0]);

        if (existingRows[0].count === 0) {
          // Copier l'enregistrement de syncsav vers syncnuxidev
          console.log('Enregistrement non trouvé, copie de syncsav vers syncnuxidev');

          try {
            const [rows] = await histoSyncPool().query(
              'SELECT * FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
              [idInterne, req.user.IDSynchro]
            ) as any[];

            console.log('Résultat de la requête SELECT syncsav:');
            console.log('Nombre d\'enregistrements:', rows.length);

            if (rows.length > 0) {
              const record = rows[0];
              console.log('Données récupérées de syncsav:', {
                IDSynchro: record.IDSynchro,
                TypeEnreg: record.TypeEnreg,
                IDiSaisie: record.IDiSaisie,
                NumLigne: record.NumLigne,
                DateHeure: record.DateHeure ? 'OK' : 'NULL',
                Enreg: record.Enreg ? 'OK (contenu XML)' : 'NULL',
                RefDoc: record.RefDoc,
                TypeElement: record.TypeElement,
                IDInterne: record.IDInterne
              });

              console.log('Exécution de l\'insertion dans syncnuxidev...');
              try {
                const result = await syncNuxiDevPool().query(
                  'INSERT INTO syncnuxidev (IDSynchro, TypeEnreg, IDiSaisie, NumLigne, DateHeure, Enreg, RefDoc, TypeElement, IDInterne) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [record.IDSynchro, record.TypeEnreg, record.IDiSaisie, record.NumLigne, record.DateHeure, record.Enreg, record.RefDoc, record.TypeElement, record.IDInterne]
                );
                console.log('Résultat de l\'insertion:', result);
              } catch (insertError) {
                console.error('ERREUR lors de l\'insertion dans syncnuxidev:', insertError);
              }
            } else {
              console.log('Aucun enregistrement trouvé dans syncsav');
            }
          } catch (selectError) {
            console.error('ERREUR lors de la récupération de l\'enregistrement syncsav:', selectError);
          }
        } else {
          console.log('L\'enregistrement existe déjà dans syncnuxidev, pas besoin de copier');
        }
      }

      // Mettre à jour le statut dans syncsav
      console.log('Mise à jour du statut dans syncsav');
      await histoSyncPool().query(
        'UPDATE syncsav SET Etat = ? WHERE IDInterne = ? AND IDSynchro = ? LIMIT 1',
        [newStatus, idInterne, req.user.IDSynchro]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      res.status(500).json({ error: "Impossible de mettre à jour le statut" });
    }
  });

  // Update getAutomate info and send sync request
  app.post("/api/sync-automate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== DEMANDE DE SYNCHRONISATION ===');
      console.log('Utilisateur:', req.user.IDSynchro);
      console.log('Type:', req.body.type);

      // Vérifier le type de synchronisation
      const syncType = req.body.type;
      if (!['C', 'R', 'I'].includes(syncType)) {
        return res.status(400).json({
          retSync: 0,
          retInfo: "Type de synchronisation invalide"
        });
      }

      // Vérifier la licence Premium
      console.log('\n--- VÉRIFICATION LICENCE ---');
      console.log('Premium:', req.user.Premium);
      if (!req.user.Premium) {
        console.log('⚠️ Licence non premium - accès refusé');
        return res.status(403).json({ 
          retSync: 0,
          retInfo: "Cette fonctionnalité nécessite une licence Premium"
        });
      }

      // Récupérer les informations de l'automate
      console.log('\n--- RÉCUPÉRATION INFOS AUTOMATE ---');
      const [rows] = await syncNuxiDevPool().query(
        'SELECT * FROM DynDNS WHERE IDSynchro = ? ORDER BY DateHeure DESC LIMIT 1',
        [req.user.IDSynchro]
      ) as any[];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log('⚠️ Aucun automate trouvé');
        return res.status(404).json({ 
          retSync: 0,
          retInfo: "Vous ne disposez pas actuellement de NuxiAutomate, veuillez vous rapprocher de Nuxilog pour procéder à son installation"
        });
      }

      const automate = rows[0];
      console.log('Infos automate:', {
        ip: automate.IP_NuxiAutomate,
        port: automate.Port,
        dernière_maj: automate.DateHeure
      });

      // Vérifier si l'automate est actif
      const lastUpdate = new Date(automate.DateHeure);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
      const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));

      console.log('Dernière mise à jour il y a:', diffHours, 'heures');

      const isInactive = diffHours > 24; //Added isInactive variable

      if (isInactive) {
        console.log('⚠️ Automate inactif depuis plus de 24h');
        //return res.status(503).json({ 
        //  retSync: 0,
        //  retInfo: "Votre service windows NuxiAutomate de votre serveur semble arrêté"
        //});
      }

      // Extraire les valeurs du ConfigConnecteur
      console.log('\n--- EXTRACTION CONFIG CONNECTEUR ---');
      let exeValue = "";
      let serialValue = "";
      if (req.user.ConfigConnecteur) {
        const configXml = new DOMParser().parseFromString(req.user.ConfigConnecteur, "text/xml");
        exeValue = configXml.getElementsByTagName("Exe")[0]?.textContent || "";
        serialValue = configXml.getElementsByTagName("Serial")[0]?.textContent || "";
        console.log('Valeurs extraites:', {
          exe: exeValue,
          serial: serialValue
        });
      }

      // Créer le document XML
      console.log('\n--- CONSTRUCTION XML ---');
      const doc = new DOMParser().parseFromString("<Automate></Automate>", "text/xml");

      // Fonction utilitaire pour créer des éléments
      const createElement = (name: string, value: string) => {
        const element = doc.createElement(name);
        element.textContent = value;
        return element;
      };

      // Créer la structure XML
      const automateElement = doc.documentElement;
      automateElement.appendChild(createElement("IDInterne_Demande", crypto.randomUUID()));
      automateElement.appendChild(createElement("Instruction", "SYNCHRO"));
      automateElement.appendChild(createElement("TimeStamp", new Date().toISOString()));

      const synchroElement = doc.createElement("SYNCHRO");
      synchroElement.appendChild(createElement("TypeSync", syncType));
      synchroElement.appendChild(createElement("Connecteur_Exe", exeValue));
      synchroElement.appendChild(createElement("Connecteur_Indice", serialValue));
      synchroElement.appendChild(createElement("LCommande3", ""));
      synchroElement.appendChild(createElement("IDSynchro", automate.IDSynchro));
      synchroElement.appendChild(createElement("IDDeviceDemandeur", "Connecteur"));
      automateElement.appendChild(synchroElement);

      // Convertir en chaîne XML
      const xmlString = new XMLSerializer().serializeToString(doc);
      console.log('XML généré:', xmlString);

      console.log('\n--- ENCODAGE BASE64 ---');
      // Encoder en base64 sans retour chariot
      const base64Xml = Buffer.from(xmlString).toString('base64').replace(/\r?\n/g, '');
      console.log('Longueur base64:', base64Xml.length);

      // Construire l'URL
      console.log('\n--- CONSTRUCTION URL ---');
      const url = `http://${automate.IP_NuxiAutomate}:${automate.Port}/${base64Xml}`;
      console.log('URL finale (tronquée):', url.substring(0, 100) + '...');

      // Faire la requête HTTP
      console.log('\n--- ENVOI REQUÊTE HTTP ---');
      try {
        const response = await fetch(url);
        console.log('Status code:', response.status);
        const responseText = await response.text();
        console.log('Réponse brute:', responseText);

        // Parser la réponse XML
        console.log('\n--- PARSING RÉPONSE XML ---');
        const responseXml = new DOMParser().parseFromString(responseText, "text/xml");
        const retSync = responseXml.getElementsByTagName("RetSync")[0]?.textContent || "0";
        const retInfo = responseXml.getElementsByTagName("RetInfo")[0]?.textContent || "";

        console.log('Valeurs extraites:', { retSync, retInfo });

        // Décoder et nettoyer le message RetInfo
        const cleanedRetInfo = decodeXMLMessage(retInfo);
        console.log('Message nettoyé:', cleanedRetInfo);

        // Si l'automate était inactif, on ajoute cette information au message de retour
        const finalRetInfo = isInactive 
          ? `[Automate inactif] ${cleanedRetInfo}` 
          : cleanedRetInfo;

        res.json({ 
          retSync: parseInt(retSync, 10),
          retInfo: finalRetInfo
        });

      } catch (error) {
        console.error('⚠️ Erreur lors de la requête HTTP:', error);
        res.status(500).json({ 
          retSync: 0,
          retInfo: "La communication avec votre serveur a échoué. Vérifiez que votre service NuxiAutomate est bien démarré et accessible."
        });
      }

    } catch (error) {
      console.error('⚠️ Erreur lors de la synchronisation:', error);
      res.status(500).json({ 
        retSync: 0,
        retInfo: "Erreur lors de la synchronisation"
      });
    }
  });

  // Get sync history
  app.get("/api/sync-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const errorOnly = req.query.errorOnly === 'true';
      const dateFilter = req.query.date ? new Date(req.query.date as string) : undefined;
      const searchText = req.query.search as string;

      const result = await getSyncHistory({
        idSynchro: req.user.IDSynchro,
        page,
        pageSize,
        errorOnly,
        dateFilter,
        searchText
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching sync history:', error);
      res.status(500).json({ error: "Failed to fetch sync history" });
    }
  });

  // Get sync history XML data for editing
  app.get("/api/sync-history/:idInterne/xml", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { idInterne } = req.params;

      // Query HistoSync database to get XML data
      const query = `
        SELECT Enreg 
        FROM syncsav 
        WHERE IDInterne = ? AND IDSynchro = ? 
        LIMIT 1
      `;

      const [rows] = await histoSyncPool().query(query, [idInterne, req.user.IDSynchro]);

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Record not found" });
      }

      res.json({ enreg: rows[0].Enreg });
    } catch (error) {
      console.error('Error fetching XML data:', error);
      res.status(500).json({ error: "Failed to fetch XML data" });
    }
  });

  // Update sync history XML data
  app.put("/api/sync-history/:idInterne/xml", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { idInterne } = req.params;
      const { xml } = req.body;

      if (!xml) {
        return res.status(400).json({ error: "XML data is required" });
      }

      // Update XML data in HistoSync database
      const query = `
        UPDATE syncsav 
        SET Enreg = ? 
        WHERE IDInterne = ? AND IDSynchro = ? 
        LIMIT 1
      `;

      const [result] = await histoSyncPool().query(query, [xml, idInterne, req.user.IDSynchro]);

      if (!result.affectedRows) {
        return res.status(404).json({ error: "Record not found or no changes made" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating XML data:', error);
      res.status(500).json({ error: "Failed to update XML data" });
    }
  });

  // Get sync history log data
  app.get("/api/sync-history/:idInterne/log", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Accès non autorisé - utilisateur non authentifié');
      console.log('Session:', req.session);
      console.log('isAuthenticated:', req.isAuthenticated());
      console.log('user:', req.user);
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      console.log('Tentative de récupération du log pour:', { idInterne, userSyncId: req.user.IDSynchro });

      // Récupérer le log avec l'ID de synchro de l'utilisateur connecté
      const log = await getSyncLog(idInterne, req.user.IDSynchro);

      if (log === null) {
        console.log('Log non trouvé');
        return res.status(404).json({ error: "Log not found" });
      }

      console.log('Log trouvé et envoyé');
      res.json(log);
    } catch (error) {
      console.error('Error fetching log data:', error);
      res.status(500).json({ error: "Failed to fetch log data" });
    }
  });

  // Récupérer les exclusions de synchronisation
  app.get("/api/exclusions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== RÉCUPÉRATION DES EXCLUSIONS ===');
      console.log('IDSynchro:', req.user.IDSynchro);

      // Vérifier la connection à la base de données
      try {
        console.log('Vérification de la connexion à la base SYNC...');
        const [testResult] = await syncPool().execute('SELECT 1 as test');
        console.log('Connexion à la base SYNC réussie:', testResult);
      } catch (connErr) {
        console.error('❌ Erreur de connexion à la base SYNC:', connErr);
        return res.status(500).json({ error: "Erreur de connexion à la base de données" });
      }

      // Récupérer les exclusions depuis la table appropriée
      const [rows] = await syncPool().query(
        'SELECT * FROM Exclusions WHERE IDSynchro = ?',
        [req.user.IDSynchro]
      );

      console.log('Exclusions récupérées:', rows);
      res.json(rows);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des exclusions:', error);
      res.status(500).json({ error: "Erreur lors de la récupération des exclusions" });
    }
  });

  // Ajouter une exclusion
  app.post("/api/exclusions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { type, value, description } = req.body;

      if (!type || !value) {
        return res.status(400).json({ error: "Le type et la valeur sont requis" });
      }

      // Insérer l'exclusion
      await syncPool().query(
        'INSERT INTO Exclusions (IDSynchro, Type, Valeur, Description) VALUES (?, ?, ?, ?)',
        [req.user.IDSynchro, type, value, description || '']
      );

      res.status(201).json({ success: true });
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout d\'une exclusion:', error);
      res.status(500).json({ error: "Erreur lors de l'ajout de l'exclusion" });
    }
  });

  // Supprimer une exclusion
  app.delete("/api/exclusions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { id } = req.params;

      // Vérifier que l'exclusion appartient bien à cet utilisateur
      const [rows] = await syncPool().query(
        'SELECT ID FROM Exclusions WHERE ID = ? AND IDSynchro = ?',
        [id, req.user.IDSynchro]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Exclusion non trouvée" });
      }

      // Supprimer l'exclusion
      await syncPool().query(
        'DELETE FROM Exclusions WHERE ID = ? AND IDSynchro = ?',
        [id, req.user.IDSynchro]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erreur lors de la suppression d\'une exclusion:', error);
      res.status(500).json({ error: "Erreur lors de la suppression de l'exclusion" });
    }
  });

  // Get sync history file
  app.get("/api/sync-history/:idInterne/file", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Accès non autorisé - utilisateur non authentifié');
      console.log('Session:', req.session);
      console.log('isAuthenticated:', req.isAuthenticated());
      console.log('user:', req.user);
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      console.log('Tentative de récupération du fichier pour:', { idInterne, userSyncId: req.user.IDSynchro });

      // Récupérer l'URL du fichier depuis la base de données
      const [rows] = await histoSyncPool().query(
        'SELECT Import FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
        [idInterne, req.user.IDSynchro]
      );

      console.log('Résultat de la requête:', rows);
      console.log('Type de rows:', typeof rows);
      if (Array.isArray(rows)) {
        console.log('Nombre d\'enregistrements:', rows.length);
        if (rows.length > 0) {
          console.log('Premier enregistrement:', rows[0]);
          console.log('Valeur de Import:', rows[0].Import);
        }
      }

      if (!Array.isArray(rows) || rows.length === 0 || !rows[0].Import) {
        console.log('Aucun fichier trouvé');
        return res.status(404).json({ error: "Aucun fichier disponible pour cet enregistrement" });
      }

      const fileUrl = rows[0].Import;
      console.log('URL du fichier trouvée:', fileUrl);

      // Vérifier les informations d'authentification
      console.log('Informations d\'authentification:');
      console.log('- Username:', req.user.IDSynchro);
      console.log('- Password présent:', !!req.user.FTP1_Mdp);

      // Créer les options de requête avec l'authentification
      const options = new URL(fileUrl);
      options.username = req.user.IDSynchro;
      options.password = req.user.FTP1_Mdp;

      console.log('Options de requête (sans mot de passe):', {
        ...options,
        password: '[MASQUÉ]'
      });

      // Détecter le protocole (http ou https) et utiliser le module approprié
      const httpModule = fileUrl.startsWith('https:') ? https : http;


      // Faire la requête au serveur distant
      httpModule.get(options, (response) => {
        console.log('Réponse du serveur distant:');
        console.log('- Status:', response.statusCode);
        console.log('- Headers:', response.headers);

        // Vérifier le code de statut
        if (response.statusCode === 404) {
          return res.status(404).json({ error: "Fichier non trouvé sur le serveur" });
        }
        if (response.statusCode !== 200) {
          return res.status(response.statusCode || 500).json({ error: "Erreur lors du téléchargement du fichier" });
        }

        // Extraire le nom du fichier de l'URL ou utiliser un nom par défaut
        const fileName = fileUrl.split('/').pop() || 'download.xml';

        // Configurer les en-têtes de réponse
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        if (response.headers['content-type']) {
          res.setHeader('Content-Type', response.headers['content-type']);
        }

        // Transférer le fichier
        response.pipe(res);
      }).on('error', (error) => {
        console.error('Erreur lors du téléchargement:', error);
        res.status(500).json({ error: "Erreur lors du téléchargement du fichier" });
      });

    } catch (error) {
      console.error('Error fetching file:', error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  // Update sync history status
  app.patch("/api/sync-history/:idInterne/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      const { newStatus } = req.body;

      console.log('\n=== MISE À JOUR STATUT SYNCHRONISATION ===');
      console.log('Paramètres:', { idInterne, newStatus, userSyncId: req.user.IDSynchro });

      // Vérifier que le statut est valide
      if (![0, 1, -1].includes(newStatus)) {
        return res.status(400).json({ error: "Statut invalide" });
      }

      if (newStatus === 1 || newStatus === -1) {
        // Supprimer de syncnuxidev
        console.log('Suppression de l\'enregistrement dans syncnuxidev');
        await syncNuxiDevPool().query(
          'DELETE FROM syncnuxidev WHERE IDInterne = ? AND IDSynchro = ? LIMIT 1',
          [idInterne, req.user.IDSynchro]
        );
      } else if (newStatus === 0) {
        // Vérifier si l'enregistrement existe déjà dans syncnuxidev
        console.log('Vérification si l\'enregistrement existe déjà dans syncnuxidev');
        const [existingRows] = await syncNuxiDevPool().query(
          'SELECT COUNT(*) as count FROM syncnuxidev WHERE IDInterne = ? AND IDSynchro = ?',
          [idInterne, req.user.IDSynchro]
        ) as any[];

        console.log('Résultat vérification:', existingRows[0]);

        if (existingRows[0].count === 0) {
          // Copier l'enregistrement de syncsav vers syncnuxidev
          console.log('Enregistrement non trouvé, copie de syncsav vers syncnuxidev');

          try {
            const [rows] = await histoSyncPool().query(
              'SELECT * FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
              [idInterne, req.user.IDSynchro]
            ) as any[];

            console.log('Résultat de la requête SELECT syncsav:');
            console.log('Nombre d\'enregistrements:', rows.length);

            if (rows.length > 0) {
              const record = rows[0];
              console.log('Données récupérées de syncsav:', {
                IDSynchro: record.IDSynchro,
                TypeEnreg: record.TypeEnreg,
                IDiSaisie: record.IDiSaisie,
                NumLigne: record.NumLigne,
                DateHeure: record.DateHeure ? 'OK' : 'NULL',
                Enreg: record.Enreg ? 'OK (contenu XML)' : 'NULL',
                RefDoc: record.RefDoc,
                TypeElement: record.TypeElement,
                IDInterne: record.IDInterne
              });

              console.log('Exécution de l\'insertion dans syncnuxidev...');
              try {
                const result = await syncNuxiDevPool().query(
                  'INSERT INTO syncnuxidev (IDSynchro, TypeEnreg, IDiSaisie, NumLigne, DateHeure, Enreg, RefDoc, TypeElement, IDInterne) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [record.IDSynchro, record.TypeEnreg, record.IDiSaisie, record.NumLigne, record.DateHeure, record.Enreg, record.RefDoc, record.TypeElement, record.IDInterne]
                );
                console.log('Résultat de l\'insertion:', result);
              } catch (insertError) {
                console.error('ERREUR lors de l\'insertion dans syncnuxidev:', insertError);
              }
            } else {
              console.log('Aucun enregistrement trouvé dans syncsav');
            }
          } catch (selectError) {
            console.error('ERREUR lors de la récupération de l\'enregistrement syncsav:', selectError);
          }
        } else {
          console.log('L\'enregistrement existe déjà dans syncnuxidev, pas besoin de copier');
        }
      }

      // Mettre à jour le statut dans syncsav
      console.log('Mise à jour du statut dans syncsav');
      await histoSyncPool().query(
        'UPDATE syncsav SET Etat = ? WHERE IDInterne = ? AND IDSynchro = ? LIMIT 1',
        [newStatus, idInterne, req.user.IDSynchro]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      res.status(500).json({ error: "Impossible de mettre à jour le statut" });
    }
  });

  // Update getAutomate info and send sync request
  app.post("/api/sync-automate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== DEMANDE DE SYNCHRONISATION ===');
      console.log('Utilisateur:', req.user.IDSynchro);
      console.log('Type:', req.body.type);

      // Vérifier le type de synchronisation
      const syncType = req.body.type;
      if (!['C', 'R', 'I'].includes(syncType)) {
        return res.status(400).json({
          retSync: 0,
          retInfo: "Type de synchronisation invalide"
        });
      }

      // Vérifier la licence Premium
      console.log('\n--- VÉRIFICATION LICENCE ---');
      console.log('Premium:', req.user.Premium);
      if (!req.user.Premium) {
        console.log('⚠️ Licence non premium - accès refusé');
        return res.status(403).json({ 
          retSync: 0,
          retInfo: "Cette fonctionnalité nécessite une licence Premium"
        });
      }

      // Récupérer les informations de l'automate
      console.log('\n--- RÉCUPÉRATION INFOS AUTOMATE ---');
      const [rows] = await syncNuxiDevPool().query(
        'SELECT * FROM DynDNS WHERE IDSynchro = ? ORDER BY DateHeure DESC LIMIT 1',
        [req.user.IDSynchro]
      ) as any[];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log('⚠️ Aucun automate trouvé');
        return res.status(404).json({ 
          retSync: 0,
          retInfo: "Vous ne disposez pas actuellement de NuxiAutomate, veuillez vous rapprocher de Nuxilog pour procéder à son installation"
        });
      }

      const automate = rows[0];
      console.log('Infos automate:', {
        ip: automate.IP_NuxiAutomate,
        port: automate.Port,
        dernière_maj: automate.DateHeure
      });

      // Vérifier si l'automate est actif
      const lastUpdate = new Date(automate.DateHeure);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
      const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));

      console.log('Dernière mise à jour il y a:', diffHours, 'heures');

      const isInactive = diffHours > 24; //Added isInactive variable

      if (isInactive) {
        console.log('⚠️ Automate inactif depuis plus de 24h');
        //return res.status(503).json({ 
        //  retSync: 0,
        //  retInfo: "Votre service windows NuxiAutomate de votre serveur semble arrêté"
        //});
      }

      // Extraire les valeurs du ConfigConnecteur
      console.log('\n--- EXTRACTION CONFIG CONNECTEUR ---');
      let exeValue = "";
      let serialValue = "";
      if (req.user.ConfigConnecteur) {
        const configXml = new DOMParser().parseFromString(req.user.ConfigConnecteur, "text/xml");
        exeValue = configXml.getElementsByTagName("Exe")[0]?.textContent || "";
        serialValue = configXml.getElementsByTagName("Serial")[0]?.textContent || "";
        console.log('Valeurs extraites:', {
          exe: exeValue,
          serial: serialValue
        });
      }

      // Créer le document XML
      console.log('\n--- CONSTRUCTION XML ---');
      const doc = new DOMParser().parseFromString("<Automate></Automate>", "text/xml");

      // Fonction utilitaire pour créer des éléments
      const createElement = (name: string, value: string) => {
        const element = doc.createElement(name);
        element.textContent = value;
        return element;
      };

      // Créer la structure XML
      const automateElement = doc.documentElement;
      automateElement.appendChild(createElement("IDInterne_Demande", crypto.randomUUID()));
      automateElement.appendChild(createElement("Instruction", "SYNCHRO"));
      automateElement.appendChild(createElement("TimeStamp", new Date().toISOString()));

      const synchroElement = doc.createElement("SYNCHRO");
      synchroElement.appendChild(createElement("TypeSync", syncType));
      synchroElement.appendChild(createElement("Connecteur_Exe", exeValue));
      synchroElement.appendChild(createElement("Connecteur_Indice", serialValue));
      synchroElement.appendChild(createElement("LCommande3", ""));
      synchroElement.appendChild(createElement("IDSynchro", automate.IDSynchro));
      synchroElement.appendChild(createElement("IDDeviceDemandeur", "Connecteur"));
      automateElement.appendChild(synchroElement);

      // Convertir en chaîne XML
      const xmlString = new XMLSerializer().serializeToString(doc);
      console.log('XML généré:', xmlString);

      console.log('\n--- ENCODAGE BASE64 ---');
      // Encoder en base64 sans retour chariot
      const base64Xml = Buffer.from(xmlString).toString('base64').replace(/\r?\n/g, '');
      console.log('Longueur base64:', base64Xml.length);

      // Construire l'URL
      console.log('\n--- CONSTRUCTION URL ---');
      const url = `http://${automate.IP_NuxiAutomate}:${automate.Port}/${base64Xml}`;
      console.log('URL finale (tronquée):', url.substring(0, 100) + '...');

      // Faire la requête HTTP
      console.log('\n--- ENVOI REQUÊTE HTTP ---');
      try {
        const response = await fetch(url);
        console.log('Status code:', response.status);
        const responseText = await response.text();
        console.log('Réponse brute:', responseText);

        // Parser la réponse XML
        console.log('\n--- PARSING RÉPONSE XML ---');
        const responseXml = new DOMParser().parseFromString(responseText, "text/xml");
        const retSync = responseXml.getElementsByTagName("RetSync")[0]?.textContent || "0";
        const retInfo = responseXml.getElementsByTagName("RetInfo")[0]?.textContent || "";

        console.log('Valeurs extraites:', { retSync, retInfo });

        // Décoder et nettoyer le message RetInfo
        const cleanedRetInfo = decodeXMLMessage(retInfo);
        console.log('Message nettoyé:', cleanedRetInfo);

        // Si l'automate était inactif, on ajoute cette information au message de retour
        const finalRetInfo = isInactive 
          ? `[Automate inactif] ${cleanedRetInfo}` 
          : cleanedRetInfo;

        res.json({ 
          retSync: parseInt(retSync, 10),
          retInfo: finalRetInfo
        });

      } catch (error) {
        console.error('⚠️ Erreur lors de la requête HTTP:', error);
        res.status(500).json({ 
          retSync: 0,
          retInfo: "La communication avec votre serveur a échoué. Vérifiez que votre service NuxiAutomate est bien démarré et accessible."
        });
      }

    } catch (error) {
      console.error('⚠️ Erreur lors de la synchronisation:', error);
      res.status(500).json({ 
        retSync: 0,
        retInfo: "Erreur lors de la synchronisation"
      });
    }
  });

  // Get sync history
  app.get("/api/sync-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const errorOnly = req.query.errorOnly === 'true';
      const dateFilter = req.query.date ? new Date(req.query.date as string) : undefined;
      const searchText = req.query.search as string;

      const result = await getSyncHistory({
        idSynchro: req.user.IDSynchro,
        page,
        pageSize,
        errorOnly,
        dateFilter,
        searchText
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching sync history:', error);
      res.status(500).json({ error: "Failed to fetch sync history" });
    }
  });

  // Get sync history XML data for editing
  app.get("/api/sync-history/:idInterne/xml", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { idInterne } = req.params;

      // Query HistoSync database to get XML data
      const query = `
        SELECT Enreg 
        FROM syncsav 
        WHERE IDInterne = ? AND IDSynchro = ? 
        LIMIT 1
      `;

      const [rows] = await histoSyncPool().query(query, [idInterne, req.user.IDSynchro]);

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Record not found" });
      }

      res.json({ enreg: rows[0].Enreg });
    } catch (error) {
      console.error('Error fetching XML data:', error);
      res.status(500).json({ error: "Failed to fetch XML data" });
    }
  });

  // Update sync history XML data
  app.put("/api/sync-history/:idInterne/xml", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { idInterne } = req.params;
      const { xml } = req.body;

      if (!xml) {
        return res.status(400).json({ error: "XML data is required" });
      }

      // Update XML data in HistoSync database
      const query = `
        UPDATE syncsav 
        SET Enreg = ? 
        WHERE IDInterne = ? AND IDSynchro = ? 
        LIMIT 1
      `;

      const [result] = await histoSyncPool().query(query, [xml, idInterne, req.user.IDSynchro]);

      if (!result.affectedRows) {
        return res.status(404).json({ error: "Record not found or no changes made" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating XML data:', error);
      res.status(500).json({ error: "Failed to update XML data" });
    }
  });

  // Get sync history log data
  app.get("/api/sync-history/:idInterne/log", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Accès non autorisé - utilisateur non authentifié');
      console.log('Session:', req.session);
      console.log('isAuthenticated:', req.isAuthenticated());
      console.log('user:', req.user);
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      console.log('Tentative de récupération du log pour:', { idInterne, userSyncId: req.user.IDSynchro });

      // Récupérer le log avec l'ID de synchro de l'utilisateur connecté
      const log = await getSyncLog(idInterne, req.user.IDSynchro);

      if (log === null) {
        console.log('Log non trouvé');
        return res.status(404).json({ error: "Log not found" });
      }

      console.log('Log trouvé et envoyé');
      res.json(log);
    } catch (error) {
      console.error('Error fetching log data:', error);
      res.status(500).json({ error: "Failed to fetch log data" });
    }
  });

  // Récupérer les exclusions de synchronisation
  app.get("/api/exclusions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== RÉCUPÉRATION DES EXCLUSIONS ===');
      console.log('IDSynchro:', req.user.IDSynchro);

      // Vérifier la connection à la base de données
      try {
        console.log('Vérification de la connexion à la base SYNC...');
        const [testResult] = await syncPool().execute('SELECT 1 as test');
        console.log('Connexion à la base SYNC réussie:', testResult);
      } catch (connErr) {
        console.error('❌ Erreur de connexion à la base SYNC:', connErr);
        return res.status(500).json({ error: "Erreur de connexion à la base de données" });
      }

      // Récupérer les exclusions depuis la table appropriée
      const [rows] = await syncPool().query(
        'SELECT * FROM Exclusions WHERE IDSynchro = ?',
        [req.user.IDSynchro]
      );

      console.log('Exclusions récupérées:', rows);
      res.json(rows);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des exclusions:', error);
      res.status(500).json({ error: "Erreur lors de la récupération des exclusions" });
    }
  });

  // Ajouter une exclusion
  app.post("/api/exclusions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { type, value, description } = req.body;

      if (!type || !value) {
        return res.status(400).json({ error: "Le type et la valeur sont requis" });
      }

      // Insérer l'exclusion
      await syncPool().query(
        'INSERT INTO Exclusions (IDSynchro, Type, Valeur, Description) VALUES (?, ?, ?, ?)',
        [req.user.IDSynchro, type, value, description || '']
      );

      res.status(201).json({ success: true });
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout d\'une exclusion:', error);
      res.status(500).json({ error: "Erreur lors de l'ajout de l'exclusion" });
    }
  });

  // Supprimer une exclusion
  app.delete("/api/exclusions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { id } = req.params;

      // Vérifier que l'exclusion appartient bien à cet utilisateur
      const [rows] = await syncPool().query(
        'SELECT ID FROM Exclusions WHERE ID = ? AND IDSynchro = ?',
        [id, req.user.IDSynchro]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Exclusion non trouvée" });
      }

      // Supprimer l'exclusion
      await syncPool().query(
        'DELETE FROM Exclusions WHERE ID = ? AND IDSynchro = ?',
        [id, req.user.IDSynchro]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erreur lors de la suppression d\'une exclusion:', error);
      res.status(500).json({ error: "Erreur lors de la suppression de l'exclusion" });
    }
  });

  // Get sync history file
  app.get("/api/sync-history/:idInterne/file", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Accès non autorisé - utilisateur non authentifié');
      console.log('Session:', req.session);
      console.log('isAuthenticated:', req.isAuthenticated());
      console.log('user:', req.user);
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      console.log('Tentative de récupération du fichier pour:', { idInterne, userSyncId: req.user.IDSynchro });

      // Récupérer l'URL du fichier depuis la base de données
      const [rows] = await histoSyncPool().query(
        'SELECT Import FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
        [idInterne, req.user.IDSynchro]
      );

      console.log('Résultat de la requête:', rows);
      console.log('Type de rows:', typeof rows);
      if (Array.isArray(rows)) {
        console.log('Nombre d\'enregistrements:', rows.length);
        if (rows.length > 0) {
          console.log('Premier enregistrement:', rows[0]);
          console.log('Valeur de Import:', rows[0].Import);
        }
      }

      if (!Array.isArray(rows) || rows.length === 0 || !rows[0].Import) {
        console.log('Aucun fichier trouvé');
        return res.status(404).json({ error: "Aucun fichier disponible pour cet enregistrement" });
      }

      const fileUrl = rows[0].Import;
      console.log('URL du fichier trouvée:', fileUrl);

      // Vérifier les informations d'authentification
      console.log('Informations d\'authentification:');
      console.log('- Username:', req.user.IDSynchro);
      console.log('- Password présent:', !!req.user.FTP1_Mdp);

      // Créer les options de requête avec l'authentification
      const options = new URL(fileUrl);
      options.username = req.user.IDSynchro;
      options.password = req.user.FTP1_Mdp;

      console.log('Options de requête (sans mot de passe):', {
        ...options,
        password: '[MASQUÉ]'
      });

      // Détecter le protocole (http ou https) et utiliser le module approprié
      const httpModule = fileUrl.startsWith('https:') ? https : http;


      // Faire la requête au serveur distant
      httpModule.get(options, (response) => {
        console.log('Réponse du serveur distant:');
        console.log('- Status:', response.statusCode);
        console.log('- Headers:', response.headers);

        // Vérifier le code de statut
        if (response.statusCode === 404) {
          return res.status(404).json({ error: "Fichier non trouvé sur le serveur" });
        }
        if (response.statusCode !== 200) {
          return res.status(response.statusCode || 500).json({ error: "Erreur lors du téléchargement du fichier" });
        }

        // Extraire le nom du fichier de l'URL ou utiliser un nom par défaut
        const fileName = fileUrl.split('/').pop() || 'download.xml';

        // Configurer les en-têtes de réponse
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        if (response.headers['content-type']) {
          res.setHeader('Content-Type', response.headers['content-type']);
        }

        // Transférer le fichier
        response.pipe(res);
      }).on('error', (error) => {
        console.error('Erreur lors du téléchargement:', error);
        res.status(500).json({ error: "Erreur lors du téléchargement du fichier" });
      });

    } catch (error) {
      console.error('Error fetching file:', error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  // Update sync history status
  app.patch("/api/sync-history/:idInterne/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      const { newStatus } = req.body;

      console.log('\n=== MISE À JOUR STATUT SYNCHRONISATION ===');
      console.log('Paramètres:', { idInterne, newStatus, userSyncId: req.user.IDSynchro });

      // Vérifier que le statut est valide
      if (![0, 1, -1].includes(newStatus)) {
        return res.status(400).json({ error: "Statut invalide" });
      }

      if (newStatus === 1 || newStatus === -1) {
        // Supprimer de syncnuxidev
        console.log('Suppression de l\'enregistrement dans syncnuxidev');
        await syncNuxiDevPool().query(
          'DELETE FROM syncnuxidev WHERE IDInterne = ? AND IDSynchro = ? LIMIT 1',
          [idInterne, req.user.IDSynchro]
        );
      } else if (newStatus === 0) {
        // Vérifier si l'enregistrement existe déjà dans syncnuxidev
        console.log('Vérification si l\'enregistrement existe déjà dans syncnuxidev');
        const [existingRows] = await syncNuxiDevPool().query(
          'SELECT COUNT(*) as count FROM syncnuxidev WHERE IDInterne = ? AND IDSynchro = ?',
          [idInterne, req.user.IDSynchro]
        ) as any[];

        console.log('Résultat vérification:', existingRows[0]);

        if (existingRows[0].count === 0) {
          // Copier l'enregistrement de syncsav vers syncnuxidev
          console.log('Enregistrement non trouvé, copie de syncsav vers syncnuxidev');

          try {
            const [rows] = await histoSyncPool().query(
              'SELECT * FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
              [idInterne, req.user.IDSynchro]
            ) as any[];

            console.log('Résultat de la requête SELECT syncsav:');
            console.log('Nombre d\'enregistrements:', rows.length);

            if (rows.length > 0) {
              const record = rows[0];
              console.log('Données récupérées de syncsav:', {
                IDSynchro: record.IDSynchro,
                TypeEnreg: record.TypeEnreg,
                IDiSaisie: record.IDiSaisie,
                NumLigne: record.NumLigne,
                DateHeure: record.DateHeure ? 'OK' : 'NULL',
                Enreg: record.Enreg ? 'OK (contenu XML)' : 'NULL',
                RefDoc: record.RefDoc,
                TypeElement: record.TypeElement,
                IDInterne: record.IDInterne
              });

              console.log('Exécution de l\'insertion dans syncnuxidev...');
              try {
                const result = await syncNuxiDevPool().query(
                  'INSERT INTO syncnuxidev (IDSynchro, TypeEnreg, IDiSaisie, NumLigne, DateHeure, Enreg, RefDoc, TypeElement, IDInterne) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [record.IDSynchro, record.TypeEnreg, record.IDiSaisie, record.NumLigne, record.DateHeure, record.Enreg, record.RefDoc, record.TypeElement, record.IDInterne]
                );
                console.log('Résultat de l\'insertion:', result);
              } catch (insertError) {
                console.error('ERREUR lors de l\'insertion dans syncnuxidev:', insertError);
              }
            } else {
              console.log('Aucun enregistrement trouvé dans syncsav');
            }
          } catch (selectError) {
            console.error('ERREUR lors de la récupération de l\'enregistrement syncsav:', selectError);
          }
        } else {
          console.log('L\'enregistrement existe déjà dans syncnuxidev, pas besoin de copier');
        }
      }

      // Mettre à jour le statut dans syncsav
      console.log('Mise à jour du statut dans syncsav');
      await histoSyncPool().query(
        'UPDATE syncsav SET Etat = ? WHERE IDInterne = ? AND IDSynchro = ? LIMIT 1',
        [newStatus, idInterne, req.user.IDSynchro]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      res.status(500).json({ error: "Impossible de mettre à jour le statut" });
    }
  });

  // Update getAutomate info and send sync request
  app.post("/api/sync-automate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== DEMANDE DE SYNCHRONISATION ===');
      console.log('Utilisateur:', req.user.IDSynchro);
      console.log('Type:', req.body.type);

      // Vérifier le type de synchronisation
      const syncType = req.body.type;
      if (!['C', 'R', 'I'].includes(syncType)) {
        return res.status(400).json({
          retSync: 0,
          retInfo: "Type de synchronisation invalide"
        });
      }

      // Vérifier la licence Premium
      console.log('\n--- VÉRIFICATION LICENCE ---');
      console.log('Premium:', req.user.Premium);
      if (!req.user.Premium) {
        console.log('⚠️ Licence non premium - accès refusé');
        return res.status(403).json({ 
          retSync: 0,
          retInfo: "Cette fonctionnalité nécessite une licence Premium"
        });
      }

      // Récupérer les informations de l'automate
      console.log('\n--- RÉCUPÉRATION INFOS AUTOMATE ---');
      const [rows] = await syncNuxiDevPool().query(
        'SELECT * FROM DynDNS WHERE IDSynchro = ? ORDER BY DateHeure DESC LIMIT 1',
        [req.user.IDSynchro]
      ) as any[];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log('⚠️ Aucun automate trouvé');
        return res.status(404).json({ 
          retSync: 0,
          retInfo: "Vous ne disposez pas actuellement de NuxiAutomate, veuillez vous rapprocher de Nuxilog pour procéder à son installation"
        });
      }

      const automate = rows[0];
      console.log('Infos automate:', {
        ip: automate.IP_NuxiAutomate,
        port: automate.Port,
        dernière_maj: automate.DateHeure
      });

      // Vérifier si l'automate est actif
      const lastUpdate = new Date(automate.DateHeure);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
      const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));

      console.log('Dernière mise à jour il y a:', diffHours, 'heures');

      const isInactive = diffHours > 24; //Added isInactive variable

      if (isInactive) {
        console.log('⚠️ Automate inactif depuis plus de 24h');
        //return res.status(503).json({ 
        //  retSync: 0,
        //  retInfo: "Votre service windows NuxiAutomate de votre serveur semble arrêté"
        //});
      }

      // Extraire les valeurs du ConfigConnecteur
      console.log('\n--- EXTRACTION CONFIG CONNECTEUR ---');
      let exeValue = "";
      let serialValue = "";
      if (req.user.ConfigConnecteur) {
        const configXml = new DOMParser().parseFromString(req.user.ConfigConnecteur, "text/xml");
        exeValue = configXml.getElementsByTagName("Exe")[0]?.textContent || "";
        serialValue = configXml.getElementsByTagName("Serial")[0]?.textContent || "";
        console.log('Valeurs extraites:', {
          exe: exeValue,
          serial: serialValue
        });
      }

      // Créer le document XML
      console.log('\n--- CONSTRUCTION XML ---');
      const doc = new DOMParser().parseFromString("<Automate></Automate>", "text/xml");

      // Fonction utilitaire pour créer des éléments
      const createElement = (name: string, value: string) => {
        const element = doc.createElement(name);
        element.textContent = value;
        return element;
      };

      // Créer la structure XML
      const automateElement = doc.documentElement;
      automateElement.appendChild(createElement("IDInterne_Demande", crypto.randomUUID()));
      automateElement.appendChild(createElement("Instruction", "SYNCHRO"));
      automateElement.appendChild(createElement("TimeStamp", new Date().toISOString()));

      const synchroElement = doc.createElement("SYNCHRO");
      synchroElement.appendChild(createElement("TypeSync", syncType));
      synchroElement.appendChild(createElement("Connecteur_Exe", exeValue));
      synchroElement.appendChild(createElement("Connecteur_Indice", serialValue));
      synchroElement.appendChild(createElement("LCommande3", ""));
      synchroElement.appendChild(createElement("IDSynchro", automate.IDSynchro));
      synchroElement.appendChild(createElement("IDDeviceDemandeur", "Connecteur"));
      automateElement.appendChild(synchroElement);

      // Convertir en chaîne XML
      const xmlString = new XMLSerializer().serializeToString(doc);
      console.log('XML généré:', xmlString);

      console.log('\n--- ENCODAGE BASE64 ---');
      // Encoder en base64 sans retour chariot
      const base64Xml = Buffer.from(xmlString).toString('base64').replace(/\r?\n/g, '');
      console.log('Longueur base64:', base64Xml.length);

      // Construire l'URL
      console.log('\n--- CONSTRUCTION URL ---');
      const url = `http://${automate.IP_NuxiAutomate}:${automate.Port}/${base64Xml}`;
      console.log('URL finale (tronquée):', url.substring(0, 100) + '...');

      // Faire la requête HTTP
      console.log('\n--- ENVOI REQUÊTE HTTP ---');
      try {
        const response = await fetch(url);
        console.log('Status code:', response.status);
        const responseText = await response.text();
        console.log('Réponse brute:', responseText);

        // Parser la réponse XML
        console.log('\n--- PARSING RÉPONSE XML ---');
        const responseXml = new DOMParser().parseFromString(responseText, "text/xml");
        const retSync = responseXml.getElementsByTagName("RetSync")[0]?.textContent || "0";
        const retInfo = responseXml.getElementsByTagName("RetInfo")[0]?.textContent || "";

        console.log('Valeurs extraites:', { retSync, retInfo });

        // Décoder et nettoyer le message RetInfo
        const cleanedRetInfo = decodeXMLMessage(retInfo);
        console.log('Message nettoyé:', cleanedRetInfo);

        // Si l'automate était inactif, on ajoute cette information au message de retour
        const finalRetInfo = isInactive 
          ? `[Automate inactif] ${cleanedRetInfo}` 
          : cleanedRetInfo;

        res.json({ 
          retSync: parseInt(retSync, 10),
          retInfo: finalRetInfo
        });

      } catch (error) {
        console.error('⚠️ Erreur lors de la requête HTTP:', error);
        res.status(500).json({ 
          retSync: 0,
          retInfo: "La communication avec votre serveur a échoué. Vérifiez que votre service NuxiAutomate est bien démarré et accessible."
        });
      }

    } catch (error) {
      console.error('⚠️ Erreur lors de la synchronisation:', error);
      res.status(500).json({ 
        retSync: 0,
        retInfo: "Erreur lors de la synchronisation"
      });
    }
  });

  // Get sync history
  app.get("/api/sync-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const errorOnly = req.query.errorOnly === 'true';
      const dateFilter = req.query.date ? new Date(req.query.date as string) : undefined;
      const searchText = req.query.search as string;

      const result = await getSyncHistory({
        idSynchro: req.user.IDSynchro,
        page,
        pageSize,
        errorOnly,
        dateFilter,
        searchText
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching sync history:', error);
      res.status(500).json({ error: "Failed to fetch sync history" });
    }
  });

  // Get sync history XML data for editing
  app.get("/api/sync-history/:idInterne/xml", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { idInterne } = req.params;

      // Query HistoSync database to get XML data
      const query = `
        SELECT Enreg 
        FROM syncsav 
        WHERE IDInterne = ? AND IDSynchro = ? 
        LIMIT 1
      `;

      const [rows] = await histoSyncPool().query(query, [idInterne, req.user.IDSynchro]);

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Record not found" });
      }

      res.json({ enreg: rows[0].Enreg });
    } catch (error) {
      console.error('Error fetching XML data:', error);
      res.status(500).json({ error: "Failed to fetch XML data" });
    }
  });

  // Update sync history XML data
  app.put("/api/sync-history/:idInterne/xml", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { idInterne } = req.params;
      const { xml } = req.body;

      if (!xml) {
        return res.status(400).json({ error: "XML data is required" });
      }

      // Update XML data in HistoSync database
      const query = `
        UPDATE syncsav 
        SET Enreg = ? 
        WHERE IDInterne = ? AND IDSynchro = ? 
        LIMIT 1
      `;

      const [result] = await histoSyncPool().query(query, [xml, idInterne, req.user.IDSynchro]);

      if (!result.affectedRows) {
        return res.status(404).json({ error: "Record not found or no changes made" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating XML data:', error);
      res.status(500).json({ error: "Failed to update XML data" });
    }
  });

  // Get sync history log data
  app.get("/api/sync-history/:idInterne/log", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Accès non autorisé - utilisateur non authentifié');
      console.log('Session:', req.session);
      console.log('isAuthenticated:', req.isAuthenticated());
      console.log('user:', req.user);
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      console.log('Tentative de récupération du log pour:', { idInterne, userSyncId: req.user.IDSynchro });

      // Récupérer le log avec l'ID de synchro de l'utilisateur connecté
      const log = await getSyncLog(idInterne, req.user.IDSynchro);

      if (log === null) {
        console.log('Log non trouvé');
        return res.status(404).json({ error: "Log not found" });
      }

      console.log('Log trouvé et envoyé');
      res.json(log);
    } catch (error) {
      console.error('Error fetching log data:', error);
      res.status(500).json({ error: "Failed to fetch log data" });
    }
  });

  // Récupérer les exclusions de synchronisation
  app.get("/api/exclusions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== RÉCUPÉRATION DES EXCLUSIONS ===');
      console.log('IDSynchro:', req.user.IDSynchro);

      // Vérifier la connection à la base de données
      try {
        console.log('Vérification de la connexion à la base SYNC...');
        const [testResult] = await syncPool().execute('SELECT 1 as test');
        console.log('Connexion à la base SYNC réussie:', testResult);
      } catch (connErr) {
        console.error('❌ Erreur de connexion à la base SYNC:', connErr);
        return res.status(500).json({ error: "Erreur de connexion à la base de données" });
      }

      // Récupérer les exclusions depuis la table appropriée
      const [rows] = await syncPool().query(
        'SELECT * FROM Exclusions WHERE IDSynchro = ?',
        [req.user.IDSynchro]
      );

      console.log('Exclusions récupérées:', rows);
      res.json(rows);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des exclusions:', error);
      res.status(500).json({ error: "Erreur lors de la récupération des exclusions" });
    }
  });

  // Ajouter une exclusion
  app.post("/api/exclusions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { type, value, description } = req.body;

      if (!type || !value) {
        return res.status(400).json({ error: "Le type et la valeur sont requis" });
      }

      // Insérer l'exclusion
      await syncPool().query(
        'INSERT INTO Exclusions (IDSynchro, Type, Valeur, Description) VALUES (?, ?, ?, ?)',
        [req.user.IDSynchro, type, value, description || '']
      );

      res.status(201).json({ success: true });
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout d\'une exclusion:', error);
      res.status(500).json({ error: "Erreur lors de l'ajout de l'exclusion" });
    }
  });

  // Supprimer une exclusion
  app.delete("/api/exclusions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { id } = req.params;

      // Vérifier que l'exclusion appartient bien à cet utilisateur
      const [rows] = await syncPool().query(
        'SELECT ID FROM Exclusions WHERE ID = ? AND IDSynchro = ?',
        [id, req.user.IDSynchro]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: "Exclusion non trouvée" });
      }

      // Supprimer l'exclusion
      await syncPool().query(
        'DELETE FROM Exclusions WHERE ID = ? AND IDSynchro = ?',
        [id, req.user.IDSynchro]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erreur lors de la suppression d\'une exclusion:', error);
      res.status(500).json({ error: "Erreur lors de la suppression de l'exclusion" });
    }
  });

  // Get sync history file
  app.get("/api/sync-history/:idInterne/file", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Accès non autorisé - utilisateur non authentifié');
      console.log('Session:', req.session);
      console.log('isAuthenticated:', req.isAuthenticated());
      console.log('user:', req.user);
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      console.log('Tentative de récupération du fichier pour:', { idInterne, userSyncId: req.user.IDSynchro });

      // Récupérer l'URL du fichier depuis la base de données
      const [rows] = await histoSyncPool().query(
        'SELECT Import FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
        [idInterne, req.user.IDSynchro]
      );

      console.log('Résultat de la requête:', rows);
      console.log('Type de rows:', typeof rows);
      if (Array.isArray(rows)) {
        console.log('Nombre d\'enregistrements:', rows.length);
        if (rows.length > 0) {
          console.log('Premier enregistrement:', rows[0]);
          console.log('Valeur de Import:', rows[0].Import);
        }
      }

      if (!Array.isArray(rows) || rows.length === 0 || !rows[0].Import) {
        console.log('Aucun fichier trouvé');
        return res.status(404).json({ error: "Aucun fichier disponible pour cet enregistrement" });
      }

      const fileUrl = rows[0].Import;
      console.log('URL du fichier trouvée:', fileUrl);

      // Vérifier les informations d'authentification
      console.log('Informations d\'authentification:');
      console.log('- Username:', req.user.IDSynchro);
      console.log('- Password présent:', !!req.user.FTP1_Mdp);

      // Créer les options de requête avec l'authentification
      const options = new URL(fileUrl);
      options.username = req.user.IDSynchro;
      options.password = req.user.FTP1_Mdp;

      console.log('Options de requête (sans mot de passe):', {
        ...options,
        password: '[MASQUÉ]'
      });

      // Détecter le protocole (http ou https) et utiliser le module approprié
      const httpModule = fileUrl.startsWith('https:') ? https : http;


      // Faire la requête au serveur distant
      httpModule.get(options, (response) => {
        console.log('Réponse du serveur distant:');
        console.log('- Status:', response.statusCode);
        console.log('- Headers:', response.headers);

        // Vérifier le code de statut
        if (response.statusCode === 404) {
          return res.status(404).json({ error: "Fichier non trouvé sur le serveur" });
        }
        if (response.statusCode !== 200) {
          return res.status(response.statusCode || 500).json({ error: "Erreur lors du téléchargement du fichier" });
        }

        // Extraire le nom du fichier de l'URL ou utiliser un nom par défaut
        const fileName = fileUrl.split('/').pop() || 'download.xml';

        // Configurer les en-têtes de réponse
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        if (response.headers['content-type']) {
          res.setHeader('Content-Type', response.headers['content-type']);
        }

        // Transférer le fichier
        response.pipe(res);
      }).on('error', (error) => {
        console.error('Erreur lors du téléchargement:', error);
        res.status(500).json({ error: "Erreur lors du téléchargement du fichier" });
      });

    } catch (error) {
      console.error('Error fetching file:', error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  // Update sync history status
  app.patch("/api/sync-history/:idInterne/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const { idInterne } = req.params;
      const { newStatus } = req.body;

      console.log('\n=== MISE À JOUR STATUT SYNCHRONISATION ===');
      console.log('Paramètres:', { idInterne, newStatus, userSyncId: req.user.IDSynchro });

      // Vérifier que le statut est valide
      if (![0, 1, -1].includes(newStatus)) {
        return res.status(400).json({ error: "Statut invalide" });
      }

      if (newStatus === 1 || newStatus === -1) {
        // Supprimer de syncnuxidev
        console.log('Suppression de l\'enregistrement dans syncnuxidev');
        await syncNuxiDevPool().query(
          'DELETE FROM syncnuxidev WHERE IDInterne = ? AND IDSynchro = ? LIMIT 1',
          [idInterne, req.user.IDSynchro]
        );
      } else if (newStatus === 0) {
        // Vérifier si l'enregistrement existe déjà dans syncnuxidev
        console.log('Vérification si l\'enregistrement existe déjà dans syncnuxidev');
        const [existingRows] = await syncNuxiDevPool().query(
          'SELECT COUNT(*) as count FROM syncnuxidev WHERE IDInterne = ? AND IDSynchro = ?',
          [idInterne, req.user.IDSynchro]
        ) as any[];

        console.log('Résultat vérification:', existingRows[0]);

        if (existingRows[0].count === 0) {
          // Copier l'enregistrement de syncsav vers syncnuxidev
          console.log('Enregistrement non trouvé, copie de syncsav vers syncnuxidev');

          try {
            const [rows] = await histoSyncPool().query(
              'SELECT * FROM syncsav WHERE IDInterne = ? AND IDSynchro = ?',
              [idInterne, req.user.IDSynchro]
            ) as any[];

            console.log('Résultat de la requête SELECT syncsav:');
            console.log('Nombre d\'enregistrements:', rows.length);

            if (rows.length > 0) {
              const record = rows[0];
              console.log('Données récupérées de syncsav:', {
                IDSynchro: record.IDSynchro,
                TypeEnreg: record.TypeEnreg,
                IDiSaisie: record.IDiSaisie,
                NumLigne: record.NumLigne,
                DateHeure: record.DateHeure ? 'OK' : 'NULL',
                Enreg: record.Enreg ? 'OK (contenu XML)' : 'NULL',
                RefDoc: record.RefDoc,
                TypeElement: record.TypeElement,
                IDInterne: record.IDInterne
              });

              console.log('Exécution de l\'insertion dans syncnuxidev...');
              try {
                const result = await syncNuxiDevPool().query(
                  'INSERT INTO syncnuxidev (IDSynchro, TypeEnreg, IDiSaisie, NumLigne, DateHeure, Enreg, RefDoc, TypeElement, IDInterne) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [record.IDSynchro, record.TypeEnreg, record.IDiSaisie, record.NumLigne, record.DateHeure, record.Enreg, record.RefDoc, record.TypeElement, record.IDInterne]
                );
                console.log('Résultat de l\'insertion:', result);
              } catch (insertError) {
                console.error('ERREUR lors de l\'insertion dans syncnuxidev:', insertError);
              }
            } else {
              console.log('Aucun enregistrement trouvé dans syncsav');
            }
          } catch (selectError) {
            console.error('ERREUR lors de la récupération de l\'enregistrement syncsav:', selectError);
          }
        } else {
          console.log('L\'enregistrement existe déjà dans syncnuxidev, pas besoin de copier');
        }
      }

      // Mettre à jour le statut dans syncsav
      console.log('Mise à jour du statut dans syncsav');
      await histoSyncPool().query(
        'UPDATE syncsav SET Etat = ? WHERE IDInterne = ? AND IDSynchro = ? LIMIT 1',
        [newStatus, idInterne, req.user.IDSynchro]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      res.status(500).json({ error: "Impossible de mettre à jour le statut" });
    }
  });

  // Update getAutomate info and send sync request
  app.post("/api/sync-automate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== DEMANDE DE SYNCHRONISATION ===');
      console.log('Utilisateur:', req.user.IDSynchro);
      console.log('Type:', req.body.type);

      // Vérifier le type de synchronisation
      const syncType = req.body.type;
      if (!['C', 'R', 'I'].includes(syncType)) {
        return res.status(400).json({
          retSync: 0,
          retInfo: "Type de synchronisation invalide"
        });
      }

      // Vérifier la licence Premium
      console.log('\n--- VÉRIFICATION LICENCE ---');
      console.log('Premium:', req.user.Premium);
      if (!req.user.Premium) {
        console.log('⚠️ Licence non premium - accès refusé');
        return res.status(403).json({ 
          retSync: 0,
          retInfo: "Cette fonctionnalité nécessite une licence Premium"
        });
      }

      // Récupérer les informations de l'automate
      console.log('\n--- RÉCUPÉRATION INFOS AUTOMATE ---');
      const [rows] = await syncNuxiDevPool().query(
        'SELECT * FROM DynDNS WHERE IDSynchro = ? ORDER BY DateHeure DESC LIMIT 1',
        [req.user.IDSynchro]
      ) as any[];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log('⚠️ Aucun automate trouvé');
        return res.status(404).json({ 
          retSync: 0,
          retInfo: "Vous ne disposez pas actuellement de NuxiAutomate, veuillez vous rapprocher de Nuxilog pour procéder à son installation"
        });
      }

      const automate = rows[0];
      console.log('Infos automate:', {
        ip: automate.IP_NuxiAutomate,
        port: automate.Port,
        dernière_maj: automate.DateHeure
      });

      // Vérifier si l'automate est actif
      const lastUpdate = new Date(automate.DateHeure);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
      const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));

      console.log('Dernière mise à jour il y a:', diffHours, 'heures');

      const isInactive = diffHours > 24; //Added isInactive variable

      if (isInactive) {
        console.log('⚠️ Automate inactif depuis plus de 24h');
        //return res.status(503).json({ 
        //  retSync: 0,
        //  retInfo: "Votre service windows NuxiAutomate de votre serveur semble arrêté"
        //});
      }

      // Extraire les valeurs du ConfigConnecteur
      console.log('\n--- EXTRACTION CONFIG CONNECTEUR ---');
      let exeValue = "";
      let serialValue = "";
      if (req.user.ConfigConnecteur) {
        const configXml = new DOMParser().parseFromString(req.user.ConfigConnecteur, "text/xml");
        exeValue = configXml.getElementsByTagName("Exe")[0]?.textContent || "";
        serialValue = configXml.getElementsByTagName("Serial")[0]?.textContent || "";
        console.log('Valeurs extraites:', {
          exe: exeValue,
          serial: serialValue
        });
      }

      // Créer le document XML
      console.log('\n--- CONSTRUCTION XML ---');
      const doc = new DOMParser().parseFromString("<Automate></Automate>", "text/xml");

      // Fonction utilitaire pour créer des éléments
      const createElement = (name: string, value: string) => {
        const element = doc.createElement(name);
        element.textContent = value;
        return element;
      };

      // Créer la structure XML
      const automateElement = doc.documentElement;
      automateElement.appendChild(createElement("IDInterne_Demande", crypto.randomUUID()));
      automateElement.appendChild(createElement("Instruction", "SYNCHRO"));
      automateElement.appendChild(createElement("TimeStamp", new Date().toISOString()));

      const synchroElement = doc.createElement("SYNCHRO");
      synchroElement.appendChild(createElement("TypeSync", syncType));
      synchroElement.appendChild(createElement("Connecteur_Exe", exeValue));
      synchroElement.appendChild(createElement("Connecteur_Indice", serialValue));
      synchroElement.appendChild(createElement("LCommande3", ""));
      synchroElement.appendChild(createElement("IDSynchro", automate.IDSynchro));
      synchroElement.appendChild(createElement("IDDeviceDemandeur", "Connecteur"));
      automateElement.appendChild(synchroElement);

      // Convertir en chaîne XML
      const xmlString = new XMLSerializer().serializeToString(doc);
      console.log('XML généré:', xmlString);

      console.log('\n--- ENCODAGE BASE64 ---');
      // Encoder en base64 sans retour chariot
      const base64Xml = Buffer.from(xmlString).toString('base64').replace(/\r?\n/g, '');
      console.log('Longueur base64:', base64Xml.length);

      // Construire l'URL
      console.log('\n--- CONSTRUCTION URL ---');
      const url = `http://${automate.IP_NuxiAutomate}:${automate.Port}/${base64Xml}`;
      console.log('URL finale (tronquée):', url.substring(0, 100) + '...');

      // Faire la requête HTTP
      console.log('\n--- ENVOI REQUÊTE HTTP ---');
      try {
        const response = await fetch(url);
        console.log('Status code:', response.status);
        const responseText = await response.text();
        console.log('Réponse brute:', responseText);

        // Parser la réponse XML
        console.log('\n--- PARSING RÉPONSE XML ---');
        const responseXml = new DOMParser().parseFromString(responseText, "text/xml");
        const retSync = responseXml.getElementsByTagName("RetSync")[0]?.textContent || "0";
        const retInfo = responseXml.getElementsByTagName("RetInfo")[0]?.textContent || "";

        console.log('Valeurs extraites:', { retSync, retInfo });

        // Décoder et nettoyer le message RetInfo
        const cleanedRetInfo = decodeXMLMessage(retInfo);
        console.log('Message nettoyé:', cleanedRetInfo);

        // Si l'automate était inactif, on ajoute cette information au message de retour
        const finalRetInfo = isInactive 
          ? `[Automate inactif] ${cleanedRetInfo}` 
          : cleanedRetInfo;

        res.json({ 
          retSync: parseInt(retSync, 10),
          retInfo: finalRetInfo
        });

      } catch (error) {
        console.error('⚠️ Erreur lors de la requête HTTP:', error);
        res.status(500).json({ 
          retSync: 0,
          retInfo: "La communication avec votre serveur a échoué. Vérifiez que votre service NuxiAutomate est bien démarré et accessible."
        });
      }

    } catch (error) {
      console.error('⚠️ Erreur lors de la synchronisation:', error);
      res.status(500).json({ 
        retSync: 0,
        retInfo: "Erreur lors de la synchronisation"
      });
    }
  });

  // Save sync data configuration
  app.post("/api/sync-data/save", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('\n=== SAUVEGARDE DONNÉES SYNCHRONISATION ===');
      const { syncData } = req.body;
      
      if (!Array.isArray(syncData)) {
        return res.status(400).json({ error: "Format de données invalide" });
      }

      console.log('Données reçues:', syncData.length, 'éléments');

      // Récupérer le XML actuel
      if (!req.user.ConfigConnecteur) {
        return res.status(400).json({ error: "Configuration XML non trouvée" });
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(req.user.ConfigConnecteur, "text/xml");

      // Vérifier que le document a été correctement parsé
      if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        console.error('Erreur parsing XML:', xmlDoc.getElementsByTagName("parsererror")[0].textContent);
        return res.status(500).json({ error: "Erreur lors du parsing du XML" });
      }

      // Récupérer ou créer la section Donnees_A_Synchroniser
      let connexionNode = xmlDoc.getElementsByTagName("Connexion")[0];
      if (!connexionNode) {
        connexionNode = xmlDoc.createElement("Connexion");
        xmlDoc.documentElement.appendChild(connexionNode);
      }

      let donneesNode = connexionNode.getElementsByTagName("Donnees_A_Synchroniser")[0];
      if (!donneesNode) {
        donneesNode = xmlDoc.createElement("Donnees_A_Synchroniser");
        connexionNode.appendChild(donneesNode);
      }

      // Supprimer les anciennes données
      while (donneesNode.firstChild) {
        donneesNode.removeChild(donneesNode.firstChild);
      }

      // Ajouter les nouvelles données
      syncData.forEach(data => {
        const donneeElement = xmlDoc.createElement("Donnee");
        
        const refElement = xmlDoc.createElement("Reference");
        refElement.textContent = data.Reference;
        donneeElement.appendChild(refElement);

        const completeElement = xmlDoc.createElement("Complete");
        completeElement.textContent = data.Complete;
        donneeElement.appendChild(completeElement);

        const libelleElement = xmlDoc.createElement("Libelle");
        libelleElement.textContent = data.Libelle;
        donneeElement.appendChild(libelleElement);

        const histoElement = xmlDoc.createElement("Histo");
        histoElement.textContent = data.Histo;
        donneeElement.appendChild(histoElement);

        donneesNode.appendChild(donneeElement);
      });

      // Sérialiser le XML mis à jour
      const serializer = new XMLSerializer();
      const updatedXml = serializer.serializeToString(xmlDoc);

      console.log('XML mis à jour généré');

      // Mettre à jour la configuration dans la base de données
      await storage.updateUserConfig(req.user.ID, updatedXml);

      // Mettre à jour la session
      req.user.ConfigConnecteur = updatedXml;

      console.log('Configuration mise à jour avec succès');
      res.json({ success: true });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      res.status(500).json({ 
        error: "Erreur lors de la sauvegarde de la configuration",
        details: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}