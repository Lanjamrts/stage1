import express from 'express';

const router = express.Router();

// POST /api/remarques
router.post('/', async (req, res) => {
  try {
    const { context, text } = req.body;
    if (!context || !text) {
      return res.status(400).json({ message: 'Contexte et texte requis' });
    }
    return res.status(201).json({ message: 'Remarque envoyée', id: 'remarque-id' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// GET /api/remarques/mes
router.get('/mes', async (req, res) => {
  try {
    return res.status(200).json([]);
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// GET /api/remarques (développeur)
router.get('/', async (req, res) => {
  try {
    return res.status(200).json([]);
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// PATCH /api/remarques/:id/etat
router.patch('/:id/etat', async (req, res) => {
  try {
    const { etat } = req.body;
    if (!etat) {
      return res.status(400).json({ message: 'État requis' });
    }
    return res.status(200).json({ message: 'État mis à jour', id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

export default router;
