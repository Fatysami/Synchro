import dotenv from "dotenv";
import { join } from "path";
import { existsSync } from "fs";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeDatabases } from "./db";

const envPath = join(process.cwd(), '.env');
console.log('\n=== VÉRIFICATION DES VARIABLES D\'ENVIRONNEMENT ===');
console.log('Chemin du fichier .env:', envPath);

if (!existsSync(envPath)) {
  console.error('⚠️ ERREUR: Le fichier .env n\'existe pas à:', envPath);
  process.exit(1);
}

// Charger les variables d'environnement
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  console.error('⚠️ ERREUR: Variables d\'environnement manquantes:', result.error);
  process.exit(1);
}

// Vérifier que l'ID client Google est correctement chargé
const expectedGoogleClientId = '64677772398-nkcph2hqntttkljuaeh6qub1mh8lb41u.apps.googleusercontent.com';
if (process.env.GOOGLE_OAUTH_CLIENT_ID !== expectedGoogleClientId) {
  console.error('⚠️ ERREUR: GOOGLE_OAUTH_CLIENT_ID incorrect');
  console.error('Valeur actuelle:', process.env.GOOGLE_OAUTH_CLIENT_ID);
  console.error('Valeur attendue:', expectedGoogleClientId);
  process.exit(1);
}

const app = express();

// Configuration de la taille maximale des requêtes (100MB)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Configuration de la session - APRÈS la configuration des limites
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Middleware de logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const path = req.path;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

(async () => {
  try {
    console.log('\n=== DÉMARRAGE DE L\'APPLICATION ===');
    console.log('Variables d\'environnement chargées avec succès');

    await initializeDatabases();
    console.log('Connexions aux bases de données initialisées');

    console.log('\n=== CONFIGURATION DES ROUTES ===');
    app.use((req, _res, next) => {
      console.log(`📡 [${req.method}] ${req.path}`);
      next();
    });

    const server = await registerRoutes(app);
    console.log('✅ Routes configurées avec succès');

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      throw err;
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
    });
  } catch (error) {
    console.error('❌ Erreur fatale lors du démarrage du serveur:', error);
    process.exit(1);
  }
})();