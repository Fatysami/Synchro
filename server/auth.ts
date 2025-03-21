import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { validateUser, authPool } from "./db";
import { type User } from "@shared/schema";

declare global {
  namespace Express {
    interface User {
      ID: number;
      IDSynchro: string;
      IDClient: string;
      ConfigConnecteur: string;
      Premium: number;
      Options: string;
      Tablettes: string;
      FTP1_Mdp: string; // Ajout du mot de passe FTP
    }
  }
}

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    }),
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      path: '/'
    },
    name: 'sessionId'
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      console.log('Passport Strategy - Tentative authentification:', { username, password });
      try {
        const user = await validateUser(username, password);
        console.log('Résultat authentification:', user);
        if (!user) {
          return done(null, false, { message: "Identifiants incorrects" });
        }
        return done(null, user);
      } catch (error) {
        console.error('Erreur authentification:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user: Express.User, done) => {
    console.log('Serialisation utilisateur:', user);
    // Ne stocker que les identifiants dans la session
    const sessionUser = {
      ID: user.ID,
      IDSynchro: user.IDSynchro,
      IDClient: user.IDClient
    };
    done(null, sessionUser);
  });

  passport.deserializeUser(async (sessionUser: any, done) => {
    try {
      console.log('\n=== DÉSÉRIALISATION UTILISATEUR ===');
      console.log('Session utilisateur reçue:', sessionUser);

      const query = 'SELECT ID, IDSynchro, IDClient, ConfigConnecteur, Premium, Options, Tablettes, FTP1_Mdp FROM licences2 WHERE ID = ?';
      console.log('Requête SQL:', query);
      console.log('ID utilisé:', sessionUser.ID);

      const [rows] = await authPool().execute(query, [sessionUser.ID]);
      const users = rows as any[];
      const user = users[0] || null;

      if (!user) {
        console.error('⚠️ ERREUR: Aucun utilisateur trouvé avec ID:', sessionUser.ID);
      } else {
        console.log('Utilisateur désérialisé avec succès');
      }

      console.log('=== FIN DÉSÉRIALISATION UTILISATEUR ===\n');
      done(null, user);
    } catch (error: any) {
      console.error('Erreur désérialisation:', error);
      console.error('Stack trace:', error.stack);
      done(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error('Erreur authentification:', err);
        return res.status(500).json({ message: "Erreur d'authentification" });
      }
      if (!user) {
        return res.status(401).json({ message: info.message || "Identifiants incorrects" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error('Erreur session:', err);
          return res.status(500).json({ message: "Erreur de session" });
        }
        return res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    console.log('GET /api/user - isAuthenticated:', req.isAuthenticated());
    console.log('GET /api/user - session:', req.session);
    console.log('GET /api/user - user:', req.user);

    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}