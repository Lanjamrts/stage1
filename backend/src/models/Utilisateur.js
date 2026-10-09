import mongoose from 'mongoose';

const utilisateurSchema = new mongoose.Schema(
  {
    im: { type: String, required: true, unique: true },
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    direction: { type: String, required: true },
    service: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true }, // sera : client, admin2, admin1, developpeur, consultant
    structureId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure', required: true },
    status: { type: String, enum: ['actif', 'desactive'], default: 'actif' },
    mustChangePassword: { type: Boolean, default: false },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Utilisateur', utilisateurSchema);
