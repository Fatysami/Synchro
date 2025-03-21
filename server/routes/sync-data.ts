import { Router } from "express";
import { storage } from "../storage";
import { DOMParser, XMLSerializer } from 'xmldom';

const router = Router();

// Save sync data configuration
router.post("/save", async (req, res) => {
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

export default router;
