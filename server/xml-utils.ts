import { createHash, createDecipheriv } from 'crypto';
import { DOMParser } from 'xmldom';
import { XMLSerializer } from 'xmldom';

/**
 * Encode une valeur pour une utilisation sûre dans un document XML
 * - Encode les caractères spéciaux XML
 * - Assure l'encodage UTF-8
 */
export function encodeXMLValue(value: string): string {
  if (!value) return '';

  try {
    // Encoder d'abord en UTF-8
    const utf8Value = encodeURIComponent(value);

    // Puis encoder les caractères spéciaux XML
    return unescape(utf8Value)
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&apos;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r?\n/g, '&#xA;');
  } catch (error) {
    console.error('Erreur lors de l\'encodage XML:', error);
    return value; // Retourner la valeur originale en cas d'erreur
  }
}

/**
 * Decode une valeur XML en texte normal
 */
export function decodeXMLValue(value: string): string {
  if (!value) return '';

  try {
    return decodeURIComponent(escape(
      value
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#xA;/g, '\n')
    ));
  } catch (error) {
    console.error('Erreur lors du décodage XML:', error);
    return value;
  }
}

/**
 * Décrypte les données NuxiDev selon l'algorithme utilisé en WinDev
 * Utilise AES-128-CBC avec un IV (16 premiers octets du fichier)
 */
export function decrypterXML(bufCrypte: Buffer): string {
  console.log('=== DEBUG DECRYPTAGE XML ===');
  console.log('1. Taille des données cryptées:', bufCrypte.length, 'octets');
  console.log('2. Premiers octets (hex):', bufCrypte.slice(0, 20).toString('hex'));
  
  try {
    // Générer la clé MD5
    const bufCle = createHash('md5').update('Moutiers_44760').digest();
    console.log('3. Clé MD5 générée (hex):', bufCle.toString('hex'));
    
    // Extraire l'IV (16 premiers octets) et les données chiffrées
    const iv = bufCrypte.slice(0, 16);
    const encryptedContent = bufCrypte.slice(16);
    console.log('4. IV extrait (hex):', iv.toString('hex'));
    console.log('5. Taille des données sans IV:', encryptedContent.length, 'octets');
    
    // Déchiffrement AES-128-CBC
    const decipher = createDecipheriv('aes-128-cbc', bufCle, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
    console.log('6. Déchiffrement réussi, taille:', decrypted.length, 'octets');
    
    // Convertir en string
    const result = decrypted.toString('utf-8');
    console.log('7. Résultat UTF8 (début):', result.substring(0, 100) + '...');
    console.log('8. Est un XML valide:', result.trim().startsWith('<?xml'));
    
    return result;
  } catch (error) {
    console.error('ERREUR LORS DU DÉCRYPTAGE:', error);
    throw error;
  }
}

/**
 * Décrypte et parse un fichier XML NuxiDev
 * @param encryptedData Données cryptées
 * @returns Document XML parsé ou null en cas d'erreur
 */
export function decrypterEtParserXML(encryptedData: Buffer): Document | null {
  try {
    console.log('=== PROCESS COMPLET DECRYPTAGE ET PARSING XML ===');
    
    // Vérifier les données d'entrée
    if (!encryptedData || encryptedData.length === 0) {
      console.error('Données cryptées vides ou invalides');
      return null;
    }
    
    console.log('1. Données cryptées reçues, taille:', encryptedData.length);
    
    // Décrypter les données
    const decryptedText = decrypterXML(encryptedData);
    
    if (!decryptedText || decryptedText.length === 0) {
      console.error('Décryptage a échoué - texte vide');
      return null;
    }
    
    console.log('2. Texte décrypté obtenu, taille:', decryptedText.length);
    
    // Parser le XML
    const parser = new DOMParser({
      errorHandler: {
        warning: (msg) => { console.warn('XML Warning:', msg); },
        error: (msg) => { console.error('XML Error:', msg); },
        fatalError: (msg) => { console.error('XML Fatal Error:', msg); },
      },
    });
    
    console.log('3. Parser XML créé');
    
    // Parser le XML
    const xmlDoc = parser.parseFromString(decryptedText, 'text/xml');
    console.log('4. Document XML parsé');
    
    // Vérifier si le document est valide
    if (!xmlDoc.documentElement) {
      console.error('5. Document invalide: pas d\'élément racine');
      throw new Error('Invalid XML - no root element');
    }
    
    console.log('5. Document valide, élément racine:', xmlDoc.documentElement.tagName);
    console.log('6. Contenu principal:', xmlDoc.documentElement.childNodes.length, 'nœuds enfants');
    
    // Recherche la balise DateMAJ pour debug
    try {
      const dateNodes = xmlDoc.getElementsByTagName('DateMAJ');
      if (dateNodes.length > 0) {
        console.log('7. Balise DateMAJ trouvée avec valeur:', dateNodes[0].textContent);
      } else {
        console.log('7. Balise DateMAJ non trouvée dans le document');
      }
    } catch (e) {
      console.error('Erreur lors de la recherche de DateMAJ:', e);
    }
    
    return xmlDoc;
  } catch (error) {
    console.error('Error decrypting or parsing XML:', error);
    return null;
  }
}