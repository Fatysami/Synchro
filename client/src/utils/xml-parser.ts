import { TriStateCheckboxState } from "@/components/ui/tri-state-checkbox";
import { decodeXMLValue } from "@/lib/xml-utils";

export interface Terminal {
  Nom: string;
  ID_Tablette: string;
  ID_Smartphone: string;
  xmlIndex: number;
  technicienId?: string;
  depotId?: string;
  commerciaux: Array<{
    IDInterne: string;
    Libelle: string;
  }>;
  authorizations: Authorization[];
}

export interface Authorization {
  ID: string;
  Autorise: TriStateCheckboxState;
  Libelle: string;
}


export function parseTerminalsFromXML(xmlStr: string): Terminal[] {
  if (!xmlStr) return [];

  console.log('=== Debug NuxiDev XML ===');
  console.log('1. Réponse API mobile-config:');
  console.log('   XML à parser:', xmlStr.substring(0, 500) + '...');

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "text/xml");

  console.log('2. Document XML parsé:');
  console.log('   Root element:', xmlDoc.documentElement?.tagName);

  const terminals: Terminal[] = [];

  try {
    const terminalNodes = xmlDoc.evaluate(
      '//Connexion/Terminaux/Terminal',
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    console.log('3. Recherche des terminaux:');
    console.log('   Nombre de terminaux trouvés:', terminalNodes.snapshotLength);

    for (let i = 0; i < terminalNodes.snapshotLength; i++) {
      const terminal = terminalNodes.snapshotItem(i) as Element;
      console.log(`4. Traitement du terminal ${i}:`);

      // Extraire les autorisations
      const authorizations: Authorization[] = [];
      const authNodes = terminal.getElementsByTagName('Autorisation');

      console.log('   - Nombre d\'autorisations:', authNodes.length);

      for (let j = 0; j < authNodes.length; j++) {
        const auth = authNodes[j];
        authorizations.push({
          ID: decodeXMLValue(auth.querySelector('ID')?.textContent || ''),
          Autorise: Number(auth.querySelector('Autorise')?.textContent || '0') as TriStateCheckboxState,
          Libelle: decodeXMLValue(auth.querySelector('Libelle')?.textContent || '')
        });
      }

      // Extraire les commerciaux
      const commerciaux: Array<{ IDInterne: string; Libelle: string }> = [];
      const commercialNodes = xmlDoc.evaluate(
        `.//Filtres/Commerciaux/Commercial`,
        terminal,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      console.log('   - Nombre de commerciaux:', commercialNodes.snapshotLength);

      for (let j = 0; j < commercialNodes.snapshotLength; j++) {
        const commercial = commercialNodes.snapshotItem(j) as Element;
        commerciaux.push({
          IDInterne: decodeXMLValue(commercial.querySelector('IDInterne')?.textContent || ''),
          Libelle: decodeXMLValue(commercial.querySelector('Libelle')?.textContent || '')
        });
      }

      // Extraire les ID de technicien et dépôt
      const technicienNode = xmlDoc.evaluate(
        `.//Filtres/Techniciens/Technicien/IDInterne`,
        terminal,
        null,
        XPathResult.STRING_TYPE,
        null
      );

      const depotNode = xmlDoc.evaluate(
        `.//Filtres/Depots/Depot/IDInterne`,
        terminal,
        null,
        XPathResult.STRING_TYPE,
        null
      );

      console.log('   - Valeurs extraites:');
      console.log('     Nom:', terminal.querySelector('Nom')?.textContent);
      console.log('     ID_Tablette:', terminal.querySelector('ID_Tablette')?.textContent);
      console.log('     ID_Smartphone:', terminal.querySelector('ID_Smartphone')?.textContent);
      console.log('     Technicien:', technicienNode.stringValue);
      console.log('     Depot:', depotNode.stringValue);

      const terminalData = {
        xmlIndex: i,
        Nom: decodeXMLValue(terminal.querySelector('Nom')?.textContent || ''),
        ID_Tablette: decodeXMLValue(terminal.querySelector('ID_Tablette')?.textContent || ''),
        ID_Smartphone: decodeXMLValue(terminal.querySelector('ID_Smartphone')?.textContent || ''),
        technicienId: decodeXMLValue(technicienNode.stringValue || ''),
        depotId: decodeXMLValue(depotNode.stringValue || ''),
        commerciaux,
        authorizations
      };

      console.log('   - Terminal extrait:', terminalData);
      terminals.push(terminalData);
    }
  } catch (e) {
    console.error('Erreur extraction terminaux:', e);
  }

  console.log('5. Terminaux extraits:', terminals);
  return terminals;
}

export function parseTechniciansFromXML(xmlStr: string): Array<{ IDInterne: string; Nom: string; Prenom: string }> {
  if (!xmlStr) return [];

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
  const techniciens: Array<{ IDInterne: string; Nom: string; Prenom: string }> = [];

  try {
    const techNodes = xmlDoc.evaluate(
      '//Connexion/Data/CMB_TECHNICIENS/TECHNICIENS',
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < techNodes.snapshotLength; i++) {
      const tech = techNodes.snapshotItem(i) as Element;
      techniciens.push({
        IDInterne: decodeXMLValue(tech.querySelector('IDInterne')?.textContent || ''),
        Nom: decodeXMLValue(tech.querySelector('Nom')?.textContent || ''),
        Prenom: decodeXMLValue(tech.querySelector('Prenom')?.textContent || '')
      });
    }
  } catch (e) {
    console.error('Erreur extraction techniciens:', e);
  }

  return techniciens;
}

export function parseDepotsFromXML(xmlStr: string): Array<{ IDInterne: string; Code: string; Libelle: string }> {
  if (!xmlStr) return [];

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
  const depots: Array<{ IDInterne: string; Code: string; Libelle: string }> = [];

  try {
    const depotNodes = xmlDoc.evaluate(
      '//Connexion/Data/CMB_STOCK_DEPOT/DEPOT',
      xmlDoc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < depotNodes.snapshotLength; i++) {
      const depot = depotNodes.snapshotItem(i) as Element;
      depots.push({
        IDInterne: decodeXMLValue(depot.querySelector('IDInterne')?.textContent || ''),
        Code: decodeXMLValue(depot.querySelector('Code')?.textContent || ''),
        Libelle: decodeXMLValue(depot.querySelector('Libelle')?.textContent || '')
      });
    }
  } catch (e) {
    console.error('Erreur extraction dépôts:', e);
  }

  return depots;
}