import express from 'express';

const router = express.Router();

// GET /api/users
router.get('/', async (req, res) => {
  try {
    return res.status(200).json([]);
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { im, nom, prenom, direction, service, role, structureId } = req.body;
    if (!im || !nom || !prenom || !direction || !service || !role || !structureId) {
      return res.status(400).json({ message: 'Champs requis manquants' });
    }
    return res.status(201).json({ message: 'Utilisateur créé', id: 'new-id' });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// PATCH /api/users/:id/profil
router.patch('/:id/profil', async (req, res) => {
  try {
    return res.status(200).json({ message: 'Profil mis à jour', id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// POST /api/users/:id/desactiver
router.post('/:id/desactiver', async (req, res) => {
  try {
    return res.status(200).json({ message: 'Utilisateur désactivé', id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// POST /api/users/:id/reinitialiser-mdp
router.post('/:id/reinitialiser-mdp', async (req, res) => {
  try {
    return res.status(200).json({ message: 'Mot de passe provisoire envoyé', id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur de serveur' });
  }
});

export default router;
