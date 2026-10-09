import express from 'express';

const router = express.Router();

// GET /api/dashboard?module=&periode=
router.get('/', async (req, res) => {
  try {
    const { module: module, periode } = req.query;
    // Retourner des métriques de démonstration
    return res.status(200).json({
      tauxDeSoumission: 72,
      soumissionsRecues: 86,
      enRetard: 18,
      tauxDeRejet: 10,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

export default router;
