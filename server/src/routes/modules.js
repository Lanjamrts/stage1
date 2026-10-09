import express from 'express';

const router = express.Router();

// GET /api/modules
router.get('/', async (req, res) => {
  try {
    // Pour une démo, retourner deux modules (RA et RH)
    const modules = [
      { id: '1', code: 'RA', label: 'Rapport d\'activités', periodicity: 'monthly', kind: 'periodic', active: true },
      { id: '2', code: 'RH', label: 'Ressources humaines', periodicity: 'quarterly', kind: 'periodic', active: true },
    ];
    return res.status(200).json(modules);
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// GET /api/modules/:id
router.get('/:id', async (req, res) => {
  try {
    const module = { id: req.params.id, code: 'RA', label: 'Rapport d\'activités', active: true };
    return res.status(200).json(module);
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

export default router;
