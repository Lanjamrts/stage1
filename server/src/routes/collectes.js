import express from 'express';

const router = express.Router();

// GET /api/collecte
router.get('/', async (req, res) => {
  try {
    // Retourner une liste vide pour une démo
    return res.status(200).json({ items: [], total: 0 });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// GET /api/collecte/export?format=xlsx|pdf
router.get('/export', async (req, res) => {
  try {
    const format = req.query.format;
    if (!format || !['xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({ message: 'Format requis : xlsx ou pdf' });
    }
    // Simulation d'un téléchargement
    res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=data.${format}`);
    return res.status(200).send('PDF/Excel de démonstration');
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

export default router;
