import { Router } from 'express';
import { z } from 'zod';
import { DOMParser, XMLSerializer } from 'xmldom';
import { storage } from '../storage';
import { encodeXMLValue } from '../xml-utils';

// Define user type for TypeScript
interface AuthUser {
  ID: number;
  IDSynchro: string;
  ConfigConnecteur?: string;
}

const SourceSchema = z.object({
  Provider: z.string(),
  Serveur: z.string(),
  Nom_BDD: z.string(),
  Lecture_Seule: z.string(),
  Utilisateur: z.string(),
  MDP: z.string(),
});

const SaveSourcesSchema = z.object({
  sources: z.array(SourceSchema),
});

const ComplementSchema = z.object({
  googleApiKey: z.string(),
  driveType: z.string(),
  mailRapport: z.object({
    envoyerRapport: z.boolean(),
    mailDestinataire: z.string(),
    notifErr: z.boolean(),
    notifInf: z.boolean(),
    notifImp: z.boolean(),
    globaliserEnregImport: z.boolean()
  }),
  scriptComplementaire: z.string()
});

// Add schema for exclusions
const ExclusionSchema = z.object({
  id: z.string(),
  type: z.string()
});

const SaveExclusionsSchema = z.object({
  exclusions: z.array(ExclusionSchema)
});

const router = Router();

router.post('/sources', async (req, res) => {
  try {
    console.log('\n=== DÉBUT SAUVEGARDE SOURCES ===');
    console.log('📄 [1] Informations initiales:');
    console.log('- URL appelée:', req.originalUrl);
    console.log('- Méthode:', req.method);
    console.log('- Headers:', req.headers);
    console.log("📥 [2] Corps de la requête:", {
      sources: req.body.sources?.map((s: any) => ({ ...s, MDP: '***' }))
    });

    // Vérification de l'authentification
    console.log('\n🔐 [3] Vérification authentification');
    console.log('Session:', req.session);
    console.log('isAuthenticated:', req.isAuthenticated());
    console.log('user:', req.user);

    if (!req.isAuthenticated()) {
      console.error('⚠️ Utilisateur non authentifié');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Type assertion and validation
    const user = req.user as AuthUser;
    if (!user || !user.ID || !user.IDSynchro) {
      console.error('❌ [API] Données utilisateur invalides');
      return res.status(401).json({ error: 'Session invalide' });
    }

    // Validation du body avec Zod
    const { sources } = SaveSourcesSchema.parse(req.body);
    console.log("✅ [4] Validation Zod OK");

    // Vérification de l'utilisateur et sa configuration
    console.log('\n👤 [5] Vérification utilisateur et config');
    console.log('- ID:', user.ID);
    console.log('- IDSynchro:', user.IDSynchro);
    console.log('- ConfigConnecteur présent:', !!user.ConfigConnecteur);
    console.log('- Taille ConfigConnecteur:', user.ConfigConnecteur?.length);
    console.log('- Début ConfigConnecteur:', user.ConfigConnecteur?.substring(0, 100));

    if (!user.ConfigConnecteur) {
      console.error("❌ [API] Pas de ConfigConnecteur trouvé");
      return res.status(400).json({ error: 'Configuration XML non trouvée' });
    }

    // Parsing XML
    console.log("🔍 [6] Début parsing XML");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(user.ConfigConnecteur, 'text/xml');

    // Vérification des erreurs de parsing
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      console.error("❌ [XML] Erreur parsing:", parseError[0].textContent);
      return res.status(400).json({ error: 'Erreur parsing XML' });
    }

    // Recherche et validation de la structure XML
    console.log("🔍 [7] Recherche élément Connexion");
    const connexionElements = xmlDoc.getElementsByTagName('Connexion');
    if (!connexionElements.length) {
      console.error("❌ [XML] Élément Connexion non trouvé");
      return res.status(400).json({ error: 'Structure XML invalide: élément Connexion non trouvé' });
    }

    const connexionElement = connexionElements[0];
    let sourcesElement = connexionElement.getElementsByTagName('Sources')[0];

    // Création de l'élément Sources si nécessaire
    if (!sourcesElement) {
      console.log("🔨 [8] Création élément Sources");
      sourcesElement = xmlDoc.createElement('Sources');
      connexionElement.appendChild(sourcesElement);
    }

    // Suppression des anciennes sources
    console.log("🗑️ [9] Suppression anciennes sources");
    while (sourcesElement.firstChild) {
      sourcesElement.removeChild(sourcesElement.firstChild);
    }

    // Ajout des nouvelles sources avec encodage XML
    console.log("➕ [10] Ajout nouvelles sources");
    sources.forEach((source, index) => {
      console.log(`Source ${index + 1}:`, { ...source, MDP: '***' });
      const sourceElement = xmlDoc.createElement('Source');

      // Ajouter les champs de base avec encodage XML
      Object.entries(source).forEach(([key, value]) => {
        const element = xmlDoc.createElement(key);
        element.textContent = encodeXMLValue(value);
        sourceElement.appendChild(element);
      });

      // Ajouter les éléments obligatoires
      ['IP_Public', 'Port_Public'].forEach(elem => {
        const element = xmlDoc.createElement(elem);
        sourceElement.appendChild(element);
      });

      sourcesElement.appendChild(sourceElement);
    });

    // Sérialisation XML
    console.log("💾 [11] Sérialisation XML");
    const serializer = new XMLSerializer();
    const updatedXML = serializer.serializeToString(xmlDoc);
    console.log("📝 [12] Longueur XML final:", updatedXML.length);

    try {
      console.log("💾 [13] Début mise à jour base de données");
      await storage.updateUserConfig(user.ID, updatedXML);

      // Vérification post-update
      console.log("🔍 [14] Vérification post-update");
      const updatedUser = await storage.getUser(user.ID);

      if (!updatedUser?.ConfigConnecteur) {
        throw new Error("La configuration n'a pas été sauvegardée correctement");
      }

      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: 'Sauvegarde réussie',
        xmlLength: updatedXML.length
      });

    } catch (dbError: any) {
      console.error("❌ [DB] Erreur lors de l'update:", dbError);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error: `Erreur base de données: ${dbError.message}`,
        stack: dbError.stack,
        details: "Vérifiez les logs du serveur pour plus de détails."
      });
    }
  } catch (error: any) {
    console.error("❌ [API] Erreur:", error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: `Erreur technique lors de la sauvegarde : ${error.message}`,
      stack: error.stack,
      type: error.constructor.name
    });
  }
});

// Ajouter ce nouvel endpoint pour les liaisons externes
router.post('/external-links', async (req, res) => {
  try {
    console.log('\n=== DÉBUT SAUVEGARDE LIAISONS EXTERNES ===');
    console.log('📄 [1] Informations initiales:');
    console.log('- URL appelée:', req.originalUrl);
    console.log('- Méthode:', req.method);
    console.log('- Headers:', req.headers);
    console.log("📥 [2] Corps de la requête:", {
      ...req.body,
      Liaisons: req.body.Liaisons?.map((l: any) => ({ ...l, MDP: '***' }))
    });

    // Vérification de l'authentification
    console.log('\n🔐 [3] Vérification authentification');
    console.log('Session:', req.session);
    console.log('isAuthenticated:', req.isAuthenticated());
    console.log('user:', req.user);

    if (!req.isAuthenticated()) {
      console.error('⚠️ Utilisateur non authentifié');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Type assertion and validation
    const user = req.user as AuthUser;
    if (!user || !user.ID || !user.IDSynchro) {
      console.error('❌ [API] Données utilisateur invalides');
      return res.status(401).json({ error: 'Session invalide' });
    }

    // Vérification de l'utilisateur et sa configuration
    console.log('\n👤 [4] Vérification utilisateur et config');
    console.log('- ID:', user.ID);
    console.log('- IDSynchro:', user.IDSynchro);
    console.log('- ConfigConnecteur présent:', !!user.ConfigConnecteur);
    console.log('- Taille ConfigConnecteur:', user.ConfigConnecteur?.length);

    if (!user.ConfigConnecteur) {
      console.error("❌ [API] Pas de ConfigConnecteur trouvé");
      return res.status(400).json({ error: 'Configuration XML non trouvée' });
    }

    // Parsing XML
    console.log("🔍 [5] Début parsing XML");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(user.ConfigConnecteur, 'text/xml');

    // Vérification des erreurs de parsing
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      console.error("❌ [XML] Erreur parsing:", parseError[0].textContent);
      return res.status(400).json({ error: 'Erreur parsing XML' });
    }

    // Mise à jour des liaisons externes
    console.log("🔄 [6] Mise à jour des liaisons externes");
    const connexionElement = xmlDoc.getElementsByTagName('Connexion')[0];
    let liaisonsExternesElement = connexionElement.getElementsByTagName('Liaisons_Externes')[0];

    if (!liaisonsExternesElement) {
      console.log("➕ [7] Création élément Liaisons_Externes");
      liaisonsExternesElement = xmlDoc.createElement('Liaisons_Externes');
      connexionElement.appendChild(liaisonsExternesElement);
    }

    // Mise à jour des dossiers avec encodage XML
    console.log("📁 [8] Mise à jour des dossiers");
    const updateOrCreateElement = (parent: Element, name: string, value: string) => {
      let element = parent.getElementsByTagName(name)[0];
      if (!element) {
        element = xmlDoc.createElement(name);
        parent.appendChild(element);
      }
      element.textContent = encodeXMLValue(value);
    };

    updateOrCreateElement(liaisonsExternesElement, 'Dossier_Import', req.body.Dossier_Import);
    updateOrCreateElement(liaisonsExternesElement, 'Dossier_Export', req.body.Dossier_Export);

    // Mise à jour des liaisons avec encodage XML
    console.log("🔄 [9] Mise à jour des liaisons");
    let liaisonsElement = liaisonsExternesElement.getElementsByTagName('Liaisons')[0];
    if (!liaisonsElement) {
      liaisonsElement = xmlDoc.createElement('Liaisons');
      liaisonsExternesElement.appendChild(liaisonsElement);
    }

    // Supprimer les anciennes liaisons
    while (liaisonsElement.firstChild) {
      liaisonsElement.removeChild(liaisonsElement.firstChild);
    }

    // Ajouter les nouvelles liaisons avec encodage XML
    req.body.Liaisons.forEach((liaison: any) => {
      const liaisonElement = xmlDoc.createElement('Liaison');
      Object.entries(liaison).forEach(([key, value]) => {
        const element = xmlDoc.createElement(key);
        element.textContent = encodeXMLValue(value as string);
        liaisonElement.appendChild(element);
      });
      liaisonsElement.appendChild(liaisonElement);
    });

    // Sérialisation XML
    console.log("💾 [10] Sérialisation XML");
    const serializer = new XMLSerializer();
    const updatedXML = serializer.serializeToString(xmlDoc);
    console.log("📝 [11] Longueur XML final:", updatedXML.length);

    try {
      console.log("💾 [12] Début mise à jour base de données");
      await storage.updateUserConfig(user.ID, updatedXML);

      // Vérification post-update
      console.log("🔍 [13] Vérification post-update");
      const updatedUser = await storage.getUser(user.ID);

      if (!updatedUser?.ConfigConnecteur) {
        throw new Error("La configuration n'a pas été sauvegardée correctement");
      }

      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: 'Sauvegarde réussie',
        xmlLength: updatedXML.length
      });

    } catch (dbError: any) {
      console.error("❌ [DB] Erreur lors de l'update:", dbError);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error: `Erreur base de données: ${dbError.message}`,
        stack: dbError.stack,
        details: "Vérifiez les logs du serveur pour plus de détails."
      });
    }
  } catch (error: any) {
    console.error("❌ [API] Erreur:", error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: `Erreur technique lors de la sauvegarde : ${error.message}`,
      stack: error.stack,
      type: error.constructor.name
    });
  }
});

// Ajouter ce nouvel endpoint pour les agendas externes
router.post('/external-calendars', async (req, res) => {
  try {
    console.log('\n=== DÉBUT SAUVEGARDE AGENDAS EXTERNES ===');
    console.log('📄 [1] Informations initiales:');
    console.log('- URL appelée:', req.originalUrl);
    console.log('- Méthode:', req.method);
    console.log('- Headers:', req.headers);
    console.log("📥 [2] Corps de la requête:", req.body);

    // Vérification de l'authentification
    console.log('\n🔐 [3] Vérification authentification');
    console.log('Session:', req.session);
    console.log('isAuthenticated:', req.isAuthenticated());
    console.log('user:', req.user);

    if (!req.isAuthenticated()) {
      console.error('⚠️ Utilisateur non authentifié');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Type assertion and validation
    const user = req.user as AuthUser;
    if (!user || !user.ID || !user.IDSynchro) {
      console.error('❌ [API] Données utilisateur invalides');
      return res.status(401).json({ error: 'Session invalide' });
    }

    // Vérification de l'utilisateur et sa configuration
    console.log('\n👤 [4] Vérification utilisateur et config');
    console.log('- ID:', user.ID);
    console.log('- IDSynchro:', user.IDSynchro);
    console.log('- ConfigConnecteur présent:', !!user.ConfigConnecteur);
    console.log('- Taille ConfigConnecteur:', user.ConfigConnecteur?.length);
    console.log('- Début ConfigConnecteur:', user.ConfigConnecteur?.substring(0, 100));

    if (!user.ConfigConnecteur) {
      console.error("❌ [API] Pas de ConfigConnecteur trouvé");
      return res.status(400).json({ error: 'Configuration XML non trouvée' });
    }

    // Parsing XML
    console.log("🔍 [5] Début parsing XML");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(user.ConfigConnecteur, 'text/xml');

    // Vérification des erreurs de parsing
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      console.error("❌ [XML] Erreur parsing:", parseError[0].textContent);
      return res.status(400).json({ error: 'Erreur parsing XML' });
    }

    // Mise à jour de la section Agenda
    console.log("🔄 [6] Mise à jour de la section Agenda");
    const connexionElement = xmlDoc.getElementsByTagName('Connexion')[0];
    let liaisonsExternesElement = connexionElement.getElementsByTagName('Liaisons_Externes')[0];

    if (!liaisonsExternesElement) {
      console.log("➕ [7] Création élément Liaisons_Externes");
      liaisonsExternesElement = xmlDoc.createElement('Liaisons_Externes');
      connexionElement.appendChild(liaisonsExternesElement);
    }

    let agendaElement = liaisonsExternesElement.getElementsByTagName('Agenda')[0];
    if (!agendaElement) {
      agendaElement = xmlDoc.createElement('Agenda');
      liaisonsExternesElement.appendChild(agendaElement);
    }

    // Mise à jour du type d'agenda avec encodage XML
    console.log("🔄 [8] Mise à jour du type d'agenda");
    let typeAgendaElement = agendaElement.getElementsByTagName('Type_Agenda')[0];
    if (!typeAgendaElement) {
      typeAgendaElement = xmlDoc.createElement('Type_Agenda');
      agendaElement.appendChild(typeAgendaElement);
    }
    typeAgendaElement.textContent = encodeXMLValue(req.body.agendaType);

    // Mise à jour des correspondances avec encodage XML
    console.log("🔄 [9] Mise à jour des correspondances");
    let correspondancesElement = agendaElement.getElementsByTagName('Correspondances')[0];
    if (!correspondancesElement) {
      correspondancesElement = xmlDoc.createElement('Correspondances');
      agendaElement.appendChild(correspondancesElement);
    }

    // Supprimer les anciennes correspondances
    while (correspondancesElement.firstChild) {
      correspondancesElement.removeChild(correspondancesElement.firstChild);
    }

    // Ajouter les nouvelles correspondances avec encodage XML
    req.body.mappings.forEach((mapping: any) => {
      const correspondanceElement = xmlDoc.createElement('Correspondance');

      const idSalarieElement = xmlDoc.createElement('ID_Salarie');
      idSalarieElement.textContent = encodeXMLValue(mapping.ID_Salarie);
      correspondanceElement.appendChild(idSalarieElement);

      const idAgendaElement = xmlDoc.createElement('ID_Agenda');
      idAgendaElement.textContent = encodeXMLValue(mapping.ID_Agenda);
      correspondanceElement.appendChild(idAgendaElement);

      correspondancesElement.appendChild(correspondanceElement);
    });

    // Sérialisation XML
    console.log("💾 [10] Sérialisation XML");
    const serializer = new XMLSerializer();
    const updatedXML = serializer.serializeToString(xmlDoc);
    console.log("📝 [11] Longueur XML final:", updatedXML.length);

    try {
      console.log("💾 [12] Début mise à jour base de données");
      await storage.updateUserConfig(user.ID, updatedXML);

      // Vérification post-update
      console.log("🔍 [13] Vérification post-update");
      const updatedUser = await storage.getUser(user.ID);

      if (!updatedUser?.ConfigConnecteur) {
        throw new Error("La configuration n'a pas été sauvegardée correctement");
      }

      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: 'Sauvegarde réussie',
        xmlLength: updatedXML.length
      });

    } catch (dbError: any) {
      console.error("❌ [DB] Erreur lors de l'update:", dbError);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error: `Erreur base de données: ${dbError.message}`,
        stack: dbError.stack,
        details: "Vérifiez les logs du serveur pour plus de détails."
      });
    }
  } catch (error: any) {
    console.error("❌ [API] Erreur:", error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: `Erreur technique lors de la sauvegarde : ${error.message}`,
      stack: error.stack,
      type: error.constructor.name
    });
  }
});

// Ajouter ce nouvel endpoint pour les compléments
router.post('/complement', async (req, res) => {
  try {
    console.log('\n=== DÉBUT SAUVEGARDE COMPLÉMENTS ===');
    console.log('📄 [1] Informations initiales:');
    console.log('- URL appelée:', req.originalUrl);
    console.log('- Méthode:', req.method);
    console.log('- Headers:', req.headers);
    console.log("📥 [2] Corps de la requête:", req.body);

    // Vérification de l'authentification
    console.log('\n🔐 [3] Vérification authentification');
    console.log('Session:', req.session);
    console.log('isAuthenticated:', req.isAuthenticated());
    console.log('user:', req.user);

    if (!req.isAuthenticated()) {
      console.error('⚠️ Utilisateur non authentifié');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Type assertion and validation
    const user = req.user as AuthUser;
    if (!user || !user.ID || !user.IDSynchro) {
      console.error('❌ [API] Données utilisateur invalides');
      return res.status(401).json({ error: 'Session invalide' });
    }

    // Validation du body avec Zod
    const complementData = ComplementSchema.parse(req.body);
    console.log("✅ [4] Validation Zod OK");

    // Vérification de l'utilisateur et sa configuration
    console.log('\n👤 [5] Vérification utilisateur et config');
    if (!user.ConfigConnecteur) {
      console.error("❌ [API] Pas de ConfigConnecteur trouvé");
      return res.status(400).json({ error: 'Configuration XML non trouvée' });
    }

    // Parsing XML
    console.log("🔍 [6] Début parsing XML");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(user.ConfigConnecteur, 'text/xml');

    // Vérification des erreurs de parsing
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      console.error("❌ [XML] Erreur parsing:", parseError[0].textContent);
      return res.status(400).json({ error: 'Erreur parsing XML' });
    }

    // Mise à jour de la section Complement
    console.log("🔄 [7] Mise à jour de la section Complement");
    const connexionElement = xmlDoc.getElementsByTagName('Connexion')[0];
    let complementElement = connexionElement.getElementsByTagName('Complement')[0];

    if (!complementElement) {
      console.log("➕ [8] Création élément Complement");
      complementElement = xmlDoc.createElement('Complement');
      connexionElement.appendChild(complementElement);
    }

    // Fonction utilitaire pour mettre à jour un élément
    const updateOrCreateElement = (parent: Element, name: string, value: string | number | boolean) => {
      let element = parent.getElementsByTagName(name)[0];
      if (!element) {
        element = xmlDoc.createElement(name);
        parent.appendChild(element);
      }
      element.textContent = encodeXMLValue(value.toString());
    };

    // Mise à jour des éléments
    updateOrCreateElement(complementElement, 'APIKey_Google', complementData.googleApiKey);

    // Mise à jour de la section Drive
    let driveElement = complementElement.getElementsByTagName('Drive')[0];
    if (!driveElement) {
      driveElement = xmlDoc.createElement('Drive');
      complementElement.appendChild(driveElement);
    }
    updateOrCreateElement(driveElement, 'Type_Drive', complementData.driveType);

    // Mise à jour de la section Mail_Rapport
    let mailRapportElement = complementElement.getElementsByTagName('Mail_Rapport')[0];
    if (!mailRapportElement) {
      mailRapportElement = xmlDoc.createElement('Mail_Rapport');
      complementElement.appendChild(mailRapportElement);
    }

    updateOrCreateElement(mailRapportElement, 'Envoyer_Rapport', complementData.mailRapport.envoyerRapport ? "1" : "0");
    updateOrCreateElement(mailRapportElement, 'MailDestinataire', complementData.mailRapport.mailDestinataire);
    updateOrCreateElement(mailRapportElement, 'NotifErr', complementData.mailRapport.notifErr ? "1" : "0");
    updateOrCreateElement(mailRapportElement, 'NotifInf', complementData.mailRapport.notifInf ? "1" : "0");
    updateOrCreateElement(mailRapportElement, 'NotifImp', complementData.mailRapport.notifImp ? "1" : "0");
    updateOrCreateElement(mailRapportElement, 'Globaliser_Enreg_Import', complementData.mailRapport.globaliserEnregImport ? "1" : "0");

    // Mise à jour du script complémentaire
    updateOrCreateElement(complementElement, 'ScriptComplementaire', complementData.scriptComplementaire);

    // Sérialisation XML
    console.log("💾 [9] Sérialisation XML");
    const serializer = new XMLSerializer();
    const updatedXML = serializer.serializeToString(xmlDoc);
    console.log("📝 [10] Longueur XML final:", updatedXML.length);

    try {
      console.log("💾 [11] Début mise à jour base de données");
      await storage.updateUserConfig(user.ID, updatedXML);

      // Vérification post-update
      console.log("🔍 [12] Vérification post-update");
      const updatedUser = await storage.getUser(user.ID);

      if (!updatedUser?.ConfigConnecteur) {
        throw new Error("La configuration n'a pas été sauvegardée correctement");
      }

      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: 'Sauvegarde réussie',
        xmlLength: updatedXML.length
      });

    } catch (dbError: any) {
      console.error("❌ [DB] Erreur lors de l'update:", dbError);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error: `Erreur base de données: ${dbError.message}`,
        stack: dbError.stack,
        details: "Vérifiez les logs du serveur pour plus de détails."
      });
    }
  } catch (error: any) {
    console.error("❌ [API] Erreur:", error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: `Erreur technique lors de la sauvegarde : ${error.message}`,
      stack: error.stack,
      type: error.constructor.name
    });
  }
});

// Add exclusions endpoint
router.post('/exclusions', async (req, res) => {
  try {
    console.log('\n=== DÉBUT SAUVEGARDE EXCLUSIONS ===');
    console.log('📄 [1] Informations initiales:');
    console.log('- URL appelée:', req.originalUrl);
    console.log('- Méthode:', req.method);
    console.log('- Headers:', req.headers);
    console.log("📥 [2] Corps de la requête:", req.body);

    // Vérification de l'authentification
    console.log('\n🔐 [3] Vérification authentification');
    console.log('Session:', req.session);
    console.log('isAuthenticated:', req.isAuthenticated());
    console.log('user:', req.user);

    if (!req.isAuthenticated()) {
      console.error('⚠️ Utilisateur non authentifié');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Type assertion and validation
    const user = req.user as AuthUser;
    if (!user || !user.ID || !user.IDSynchro) {
      console.error('❌ [API] Données utilisateur invalides');
      return res.status(401).json({ error: 'Session invalide' });
    }

    // Validation du body avec Zod
    const { exclusions } = SaveExclusionsSchema.parse(req.body);
    console.log("✅ [4] Validation Zod OK");

    // Vérification de l'utilisateur et sa configuration
    console.log('\n👤 [5] Vérification utilisateur et config');
    if (!user.ConfigConnecteur) {
      console.error("❌ [API] Pas de ConfigConnecteur trouvé");
      return res.status(400).json({ error: 'Configuration XML non trouvée' });
    }

    // Parsing XML
    console.log("🔍 [6] Début parsing XML");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(user.ConfigConnecteur, 'text/xml');

    // Vérification des erreurs de parsing
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      console.error("❌ [XML] Erreur parsing:", parseError[0].textContent);
      return res.status(400).json({ error: 'Erreur parsing XML' });
    }

    // Mise à jour de la section Exclusions
    console.log("🔄 [7] Mise à jour de la section Exclusions");
    const connexionElement = xmlDoc.getElementsByTagName('Connexion')[0];
    let exclusionsElement = connexionElement.getElementsByTagName('Exclusions')[0];

    if (!exclusionsElement) {
      console.log("➕ [8] Création élément Exclusions");
      exclusionsElement = xmlDoc.createElement('Exclusions');
      connexionElement.appendChild(exclusionsElement);
    }

    // Nettoyer les anciennes exclusions
    while (exclusionsElement.firstChild) {
      exclusionsElement.removeChild(exclusionsElement.firstChild);
    }

    // Grouper les exclusions par type
    const exclusionsByType = exclusions.reduce((acc, exclusion) => {
      if (!acc[exclusion.type]) {
        acc[exclusion.type] = [];
      }
      acc[exclusion.type].push(exclusion.id);
      return acc;
    }, {} as Record<string, string[]>);

    // Ajouter les nouvelles exclusions
    Object.entries(exclusionsByType).forEach(([type, ids]) => {
      const exclusionElement = xmlDoc.createElement('Exclusion');

      const typeElement = xmlDoc.createElement('Type');
      typeElement.textContent = encodeXMLValue(type);
      exclusionElement.appendChild(typeElement);

      const valeursElement = xmlDoc.createElement('Valeurs');
      ids.forEach(id => {
        const valeurElement = xmlDoc.createElement('Valeur');
        const idInterneElement = xmlDoc.createElement('IDInterne');
        idInterneElement.textContent = encodeXMLValue(id);
        valeurElement.appendChild(idInterneElement);
        valeursElement.appendChild(valeurElement);
      });
      exclusionElement.appendChild(valeursElement);

      exclusionsElement.appendChild(exclusionElement);
    });

    // Sérialisation XML
    console.log("💾 [9] Sérialisation XML");
    const serializer = new XMLSerializer();
    const updatedXML = serializer.serializeToString(xmlDoc);
    console.log("📝 [10] Longueur XML final:", updatedXML.length);

    try {
      console.log("💾 [11] Début mise à jour base de données");
      await storage.updateUserConfig(user.ID, updatedXML);

      // Vérification post-update
      console.log("🔍 [12] Vérification post-update");
      const updatedUser = await storage.getUser(user.ID);

      if (!updatedUser?.ConfigConnecteur) {
        throw new Error("La configuration n'a pas été sauvegardée correctement");
      }

      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: 'Sauvegarde réussie',
        xmlLength: updatedXML.length
      });

    } catch (dbError: any) {
      console.error("❌ [DB] Erreur lors de l'update:", dbError);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error: `Erreur base de données: ${dbError.message}`,
        stack: dbError.stack,
        details: "Vérifiez les logs du serveur pour plus de détails."
      });
    }
  } catch (error: any) {
    console.error("❌ [API] Erreur:", error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: `Erreur technique lors de la sauvegarde : ${error.message}`,
      stack: error.stack,
      type: error.constructor.name
    });  }
});

// Ajouter ce nouvel endpoint pour les agendas externes
router.post('/external-calendars', async (req, res) => {
  try {
    console.log('\n=== DÉBUT SAUVEGARDE AGENDAS EXTERNES ===');
    console.log('📄 [1] Informations initiales:');
    console.log('- URL appelée:', req.originalUrl);
    console.log('- Méthode:', req.method);
    console.log('- Headers:', req.headers);
    console.log("📥 [2] Corps de la requête:", req.body);

    // Vérification de l'authentification
    console.log('\n🔐 [3] Vérification authentification');
    console.log('Session:', req.session);
    console.log('isAuthenticated:', req.isAuthenticated());
    console.log('user:', req.user);

    if (!req.isAuthenticated()) {
      console.error('⚠️ Utilisateur non authentifié');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Type assertion and validation
    const user = req.user as AuthUser;
    if (!user || !user.ID || !user.IDSynchro) {
      console.error('❌ [API] Données utilisateur invalides');
      return res.status(401).json({ error: 'Session invalide' });
    }

    // Vérification de l'utilisateur et sa configuration
    console.log('\n👤 [4] Vérification utilisateur et config');
    console.log('- ID:', user.ID);
    console.log('- IDSynchro:', user.IDSynchro);
    console.log('- ConfigConnecteur présent:', !!user.ConfigConnecteur);
    console.log('- Taille ConfigConnecteur:', user.ConfigConnecteur?.length);
    console.log('- Début ConfigConnecteur:', user.ConfigConnecteur?.substring(0, 100));

    if (!user.ConfigConnecteur) {
      console.error("❌ [API] Pas de ConfigConnecteur trouvé");
      return res.status(400).json({ error: 'Configuration XML non trouvée' });
    }

    // Parsing XML
    console.log("🔍 [5] Début parsing XML");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(user.ConfigConnecteur, 'text/xml');

    // Vérification des erreurs de parsing
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      console.error("❌ [XML] Erreur parsing:", parseError[0].textContent);
      return res.status(400).json({ error: 'Erreur parsing XML' });
    }

    // Mise à jour de la section Agenda
    console.log("🔄 [6] Mise à jour de la section Agenda");
    const connexionElement = xmlDoc.getElementsByTagName('Connexion')[0];
    let liaisonsExternesElement = connexionElement.getElementsByTagName('Liaisons_Externes')[0];

    if (!liaisonsExternesElement) {
      console.log("➕ [7] Création élément Liaisons_Externes");
      liaisonsExternesElement = xmlDoc.createElement('Liaisons_Externes');
      connexionElement.appendChild(liaisonsExternesElement);
    }

    let agendaElement = liaisonsExternesElement.getElementsByTagName('Agenda')[0];
    if (!agendaElement) {
      agendaElement = xmlDoc.createElement('Agenda');
      liaisonsExternesElement.appendChild(agendaElement);
    }

    // Mise à jour du type d'agenda avec encodage XML
    console.log("🔄 [8] Mise à jour du type d'agenda");
    let typeAgendaElement = agendaElement.getElementsByTagName('Type_Agenda')[0];
    if (!typeAgendaElement) {
      typeAgendaElement = xmlDoc.createElement('Type_Agenda');
      agendaElement.appendChild(typeAgendaElement);
    }
    typeAgendaElement.textContent = encodeXMLValue(req.body.agendaType);

    // Mise à jour des correspondances avec encodage XML
    console.log("🔄 [9] Mise à jour des correspondances");
    let correspondancesElement = agendaElement.getElementsByTagName('Correspondances')[0];
    if (!correspondancesElement) {
      correspondancesElement = xmlDoc.createElement('Correspondances');
      agendaElement.appendChild(correspondancesElement);
    }

    // Supprimer les anciennes correspondances
    while (correspondancesElement.firstChild) {
      correspondancesElement.removeChild(correspondancesElement.firstChild);
    }

    // Ajouter les nouvelles correspondances avec encodage XML
    req.body.mappings.forEach((mapping: any) => {
      const correspondanceElement = xmlDoc.createElement('Correspondance');

      const idSalarieElement = xmlDoc.createElement('ID_Salarie');
      idSalarieElement.textContent = encodeXMLValue(mapping.ID_Salarie);
      correspondanceElement.appendChild(idSalarieElement);

      const idAgendaElement = xmlDoc.createElement('ID_Agenda');
      idAgendaElement.textContent = encodeXMLValue(mapping.ID_Agenda);
      correspondanceElement.appendChild(idAgendaElement);

      correspondancesElement.appendChild(correspondanceElement);
    });

    // Sérialisation XML
    console.log("💾 [10] Sérialisation XML");
    const serializer = new XMLSerializer();
    const updatedXML = serializer.serializeToString(xmlDoc);
    console.log("📝 [11] Longueur XML final:", updatedXML.length);

    try {
      console.log("💾 [12] Début mise à jour base de données");
      await storage.updateUserConfig(user.ID, updatedXML);

      // Vérification post-update
      console.log("🔍 [13] Vérification post-update");
      const updatedUser = await storage.getUser(user.ID);

      if (!updatedUser?.ConfigConnecteur) {
        throw new Error("La configuration n'a pas été sauvegardée correctement");
      }

      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: 'Sauvegarde réussie',
        xmlLength: updatedXML.length
      });

    } catch (dbError: any) {
      console.error("❌ [DB] Erreur lors de l'update:", dbError);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error: `Erreur base de données: ${dbError.message}`,
        stack: dbError.stack,
        details: "Vérifiez les logs du serveur pour plus de détails."
      });
    }
  } catch (error: any) {
    console.error("❌ [API] Erreur:", error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: `Erreur technique lors de la sauvegarde : ${error.message}`,
      stack: error.stack,
      type: error.constructor.name
    });
  }
});

// Ajouter ce nouvel endpoint pour les compléments
router.post('/complement', async (req, res) => {
  try {
    console.log('\n=== DÉBUT SAUVEGARDE COMPLÉMENTS ===');
    console.log('📄 [1] Informations initiales:');
    console.log('- URL appelée:', req.originalUrl);
    console.log('- Méthode:', req.method);
    console.log('- Headers:', req.headers);
    console.log("📥 [2] Corps de la requête:", req.body);

    // Vérification de l'authentification
    console.log('\n🔐 [3] Vérification authentification');
    console.log('Session:', req.session);
    console.log('isAuthenticated:', req.isAuthenticated());
    console.log('user:', req.user);

    if (!req.isAuthenticated()) {
      console.error('⚠️ Utilisateur non authentifié');
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Type assertion and validation
    const user = req.user as AuthUser;
    if (!user || !user.ID || !user.IDSynchro) {
      console.error('❌ [API] Données utilisateur invalides');
      return res.status(401).json({ error: 'Session invalide' });
    }

    // Validation du body avec Zod
    const complementData = ComplementSchema.parse(req.body);
    console.log("✅ [4] Validation Zod OK");

    // Vérification de l'utilisateur et sa configuration
    console.log('\n👤 [5] Vérification utilisateur et config');
    if (!user.ConfigConnecteur) {
      console.error("❌ [API] Pas de ConfigConnecteur trouvé");
      return res.status(400).json({ error: 'Configuration XML non trouvée' });
    }

    // Parsing XML
    console.log("🔍 [6] Début parsing XML");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(user.ConfigConnecteur, 'text/xml');

    // Vérification des erreurs de parsing
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      console.error("❌ [XML] Erreur parsing:", parseError[0].textContent);
      return res.status(400).json({ error: 'Erreur parsing XML' });
    }

    // Mise à jour de la section Complement
    console.log("🔄 [7] Mise à jour de la section Complement");
    const connexionElement = xmlDoc.getElementsByTagName('Connexion')[0];
    let complementElement = connexionElement.getElementsByTagName('Complement')[0];

    if (!complementElement) {
      console.log("➕ [8] Création élément Complement");
      complementElement = xmlDoc.createElement('Complement');
      connexionElement.appendChild(complementElement);
    }

    // Fonction utilitaire pour mettre à jour un élément
    const updateOrCreateElement = (parent: Element, name: string, value: string | number | boolean) => {
      let element = parent.getElementsByTagName(name)[0];
      if (!element) {
        element = xmlDoc.createElement(name);
        parent.appendChild(element);
      }
      element.textContent = encodeXMLValue(value.toString());
    };

    // Mise à jour des éléments
    updateOrCreateElement(complementElement, 'APIKey_Google', complementData.googleApiKey);

    // Mise à jour de la section Drive
    let driveElement = complementElement.getElementsByTagName('Drive')[0];
    if (!driveElement) {
      driveElement = xmlDoc.createElement('Drive');
      complementElement.appendChild(driveElement);
    }
    updateOrCreateElement(driveElement, 'Type_Drive', complementData.driveType);

    // Mise à jour de la section Mail_Rapport
    let mailRapportElement = complementElement.getElementsByTagName('Mail_Rapport')[0];
    if (!mailRapportElement) {
      mailRapportElement = xmlDoc.createElement('Mail_Rapport');
      complementElement.appendChild(mailRapportElement);
    }

    updateOrCreateElement(mailRapportElement, 'Envoyer_Rapport', complementData.mailRapport.envoyerRapport ? "1" : "0");
    updateOrCreateElement(mailRapportElement, 'MailDestinataire', complementData.mailRapport.mailDestinataire);
    updateOrCreateElement(mailRapportElement, 'NotifErr', complementData.mailRapport.notifErr ? "1" : "0");
    updateOrCreateElement(mailRapportElement, 'NotifInf', complementData.mailRapport.notifInf ? "1" : "0");
    updateOrCreateElement(mailRapportElement, 'NotifImp', complementData.mailRapport.notifImp ? "1" : "0");
    updateOrCreateElement(mailRapportElement, 'Globaliser_Enreg_Import', complementData.mailRapport.globaliserEnregImport ? "1" : "0");

    // Mise à jour du script complémentaire
    updateOrCreateElement(complementElement, 'ScriptComplementaire', complementData.scriptComplementaire);

    // Sérialisation XML
    console.log("💾 [9] Sérialisation XML");
    const serializer = new XMLSerializer();
    const updatedXML = serializer.serializeToString(xmlDoc);
    console.log("📝 [10] Longueur XML final:", updatedXML.length);

    try {
      console.log("💾 [11] Début mise à jour base de données");
      await storage.updateUserConfig(user.ID, updatedXML);

      // Vérification post-update
      console.log("🔍 [12] Vérification post-update");
      const updatedUser = await storage.getUser(user.ID);

      if (!updatedUser?.ConfigConnecteur) {
        throw new Error("La configuration n'a pas été sauvegardée correctement");
      }

      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: 'Sauvegarde réussie',
        xmlLength: updatedXML.length
      });

    } catch (dbError: any) {
      console.error("❌ [DB] Erreur lors de l'update:", dbError);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        error: `Erreur base de données: ${dbError.message}`,
        stack: dbError.stack,
        details: "Vérifiez les logs du serveur pour plus de détails."
      });
    }
  } catch (error: any) {
    console.error("❌ [API] Erreur:", error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: `Erreur technique lors de la sauvegarde : ${error.message}`,
      stack: error.stack,
      type: error.constructor.name
    });
  }
});

export default router;