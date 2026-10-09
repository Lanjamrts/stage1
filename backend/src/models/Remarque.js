import mongoose from 'mongoose';

const remarqueSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur', required: true },
    context: { type: String, required: true }, // module, moduleId, etc.
    text: { type: String, required: true },
    state: { type: String, enum: ['nouvelle', 'en_cours', 'traitee'], default: 'nouvelle' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('Remarque', remarqueSchema);
