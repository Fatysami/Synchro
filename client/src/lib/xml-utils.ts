/**
 * Decode une valeur XML en texte normal
 * - Décode les caractères spéciaux XML
 * - Assure le décodage UTF-8
 */
export function decodeXMLValue(value: string): string {
  if (!value) return '';

  try {
    // Décodage des caractères spéciaux XML
    const decodedValue = value
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#xA;/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // Ne pas essayer de décoder en UTF-8 si la chaîne ne contient que des caractères ASCII
    if (!/[^\x00-\x7F]/g.test(decodedValue)) {
      return decodedValue;
    }

    try {
      // Tentative de décodage UTF-8
      return decodeURIComponent(escape(decodedValue));
    } catch (e) {
      // Si le décodage UTF-8 échoue, retourner la valeur décodée XML
      return decodedValue;
    }
  } catch (error) {
    // En cas d'erreur générale, retourner la valeur d'origine
    return value;
  }
}