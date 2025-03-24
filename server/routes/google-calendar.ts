import { Router } from 'express';
import { google } from 'googleapis';
import { z } from 'zod';

const router = Router();

// Endpoint pour démarrer l'authentification
router.get('/auth', (req, res) => {
  console.log('\n=== DÉBUT AUTH GOOGLE CALENDAR ===');

  // Vérifier que les identifiants OAuth sont bien ceux du .env
  const expectedClientId = '64677772398-nkcph2hqntttkljuaeh6qub1mh8lb41u.apps.googleusercontent.com';
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  // Vérification stricte des identifiants
  if (clientId !== expectedClientId) {
    console.error('❌ Erreur: Le Client ID ne correspond pas à la valeur attendue');
    console.error('Reçu:', clientId);
    console.error('Attendu:', expectedClientId);
    return res.status(500).json({ error: 'Configuration OAuth invalide' });
  }

  if (!clientSecret) {
    console.error('❌ Erreur: Client Secret manquant');
    return res.status(500).json({ error: 'Configuration OAuth manquante' });
  }

  // Utiliser REPLIT_DOMAIN pour l'URL de callback si disponible
  const domain = process.env.REPLIT_DOMAIN || 'localhost:5000';
  const protocol = process.env.REPLIT_DOMAIN ? 'https' : 'http';
  const redirectUri = `${protocol}://${domain}/api/google-calendar/callback`;

  console.log('=== Configuration OAuth ===');
  console.log('Client ID:', clientId.substring(0, 20) + '...');
  console.log('Redirect URI:', redirectUri);
  console.log('Domain:', domain);
  console.log('Protocol:', protocol);
  console.log('REPLIT_DOMAIN:', process.env.REPLIT_DOMAIN || 'non défini');

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    include_granted_scopes: true,
    prompt: 'consent'
  });

  console.log('URL d\'authentification générée:', authUrl);
  res.json({ url: authUrl });
});

// Callback après l'authentification Google
router.get('/callback', async (req, res) => {
  console.log('\n=== CALLBACK GOOGLE CALENDAR ===');
  console.log('Query params reçus:', req.query);

  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    console.error('❌ Code d\'autorisation manquant ou invalide');
    return res.status(400).json({ error: 'Code d\'autorisation invalide' });
  }

  try {
    // Réinitialisation du client OAuth2 avec les variables d'environnement
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      `${process.env.REPLIT_DOMAIN ? 'https' : 'http'}://${process.env.REPLIT_DOMAIN || 'localhost:5000'}/api/google-calendar/callback`
    );

    console.log('Tentative d\'échange du code...');
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log('Tokens reçus:', {
      access_token: tokens.access_token ? 'Présent' : 'Absent',
      refresh_token: tokens.refresh_token ? 'Présent' : 'Absent',
      expiry_date: tokens.expiry_date
    });

    // Stocker les tokens dans la session
    if (!req.session) {
      console.error('❌ Session non disponible');
      return res.status(500).json({ error: 'Session non disponible' });
    }

    req.session.googleTokens = tokens;
    console.log('Tokens stockés dans la session');

    // Envoyer un message au frontend via postMessage
    res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script>
    `);
  } catch (error) {
    console.error('❌ [Sauvegarde] Erreur:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Réponse détaillée:', error.response?.data || 'Pas de données de réponse');

    res.status(500).json({ 
      error: "Erreur lors de l'authentification Google",
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

// Endpoint pour récupérer les agendas
router.get('/calendars', async (req, res) => {
  try {
    if (!req.session?.googleTokens) {
      return res.status(401).json({ error: 'Non authentifié avec Google' });
    }

    // Initialisation du client OAuth2 avec les variables d'environnement
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      `${process.env.REPLIT_DOMAIN ? 'https' : 'http'}://${process.env.REPLIT_DOMAIN || 'localhost:5000'}/api/google-calendar/callback`
    );

    oauth2Client.setCredentials(req.session.googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.calendarList.list();
    const calendars = response.data.items?.map(calendar => ({
      id: calendar.id,
      name: calendar.summary
    })) || [];

    res.json(calendars);
  } catch (error) {
    console.error('Erreur lors de la récupération des agendas:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des agendas' });
  }
});

export default router;