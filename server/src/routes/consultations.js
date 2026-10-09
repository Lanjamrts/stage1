import express from 'express';

const router = express.Router();

// GET /api/consultation
router.get('/', async (req, res) => {
  try {
    // Consulter seulement les rapports exportee et archivee ; pour une démo, retourner une liste vide
    return res.status(200).json([]);
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

export default router;
