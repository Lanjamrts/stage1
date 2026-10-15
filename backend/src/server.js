import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import { loadConfig } from './config.js';

import authRoutes from './routes/auth.js';
import moduleRoutes from './routes/modules.js';
import referentielRoutes from './routes/referentiels.js';
import periodeRoutes from './routes/periodes.js';
import saisieRoutes from './routes/saisies.js';
import collecteRoutes from './routes/collectes.js';
import consultationRoutes from './routes/consultations.js';
import dashboardRoutes from './routes/dashboards.js';
import userRoutes from './routes/users.js';
import remarqueRoutes from './routes/remarques.js';
import auditRoutes from './routes/audits.js';
import configRoutes from './routes/config.js';
import { requireAuth } from './middleware/auth.js';

const config = loadConfig();

// Ne pas faire planter le serveur sur une promesse rejetée non gérée
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const app = express();
const PORT = config.PORT;

if (config.TRUST_PROXY) {
  app.set('trust proxy', 1); // exactly one reverse proxy in front of the API
}

// Middlewares de base
app.use(helmet());
app.use(express.json({ limit: `${config.JSON_BODY_LIMIT_KB}kb` }));
app.use(cookieParser());
app.use(mongoSanitize());

const rateLimitHandler = (message) => (req, res) =>
  res.status(429).json({ code: 'RATE_LIMITED', message });

// Routes d'authentification (login sans auth, sous-routes gérées en interne)
app.use('/api/auth', authRoutes);

// Tout le reste sous /api est protégé (sauf login géré ci-dessus)
app.use('/api', requireAuth());

const userLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: config.NODE_ENV === 'test' ? 100000 : config.RATE_LIMIT_USER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id ?? 'anonymous'),
  handler: rateLimitHandler('Trop de requêtes. Patientez quelques instants puis réessayez.'),
});

app.use('/api', userLimiter);

app.use('/api/modules', moduleRoutes);
app.use('/api/referentiels', referentielRoutes);
app.use('/api/periodes', periodeRoutes);
app.use('/api/saisies', saisieRoutes);
app.use('/api/collecte', collecteRoutes);
app.use('/api/consultation', consultationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/remarques', remarqueRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/config/modules', configRoutes);

// Middleware pour les routes non trouvées
app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Les données envoyées sont trop volumineuses.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'INVALID_JSON', message: 'Requête invalide.' });
  }
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) {
    console.error(err?.stack || err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue. Veuillez réessayer.' });
  }
  return res.status(status).json({ message: err.message || 'Requête invalide.' });
});

// Démarrer le serveur (sauté en environnement de test : supertest importe
// l'app et Mongo est connecté par le setup des tests)
async function startServer() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ MongoDB connecté');

    app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Erreur de connexion à MongoDB:', error);
    process.exit(1);
  }
}

if (config.NODE_ENV !== 'test') {
  startServer();
}

export default app;