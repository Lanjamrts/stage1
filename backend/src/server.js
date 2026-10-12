import dotenv from 'dotenv';
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

dotenv.config();
const config = loadConfig();

// Ne pas faire planter le serveur sur une promesse rejetée non gérée
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const app = express();
const PORT = config.PORT;

// Middlewares de base
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(mongoSanitize());

// Rate limiting pour toutes les routes (désactivé en environnement de test)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.NODE_ENV === 'test' ? 100000 : 100,
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
});
app.use('/api/', generalLimiter);

// Routes d'authentification (login sans auth, sous-routes gérées en interne)
app.use('/api/auth', authRoutes);

// Tout le reste sous /api est protégé (sauf login géré ci-dessus)
app.use('/api', requireAuth());

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
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Erreur interne du serveur' });
});

// Démarrer le serveur (sauté en environnement de test : supertest importe
// l'app et Mongo est connecté par le setup des tests)
async function startServer() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ MongoDB connecté');

    if (config.TRUST_PROXY) {
      app.set('trust proxy', true);
    }

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
