import express from 'express';

const router = express.Router();

// GET /api/audit
router.get('/', async (req, res) => {
  try {
    return res.status(200).json([]);
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

export default router;
