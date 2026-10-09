import mongoose from 'mongoose';

const saisieSchema = new mongoose.Schema(
  {
    structureId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure', required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
    moduleVersion: { type: Number, required: true },
    periodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Periode', required: false },
    eventDate: { type: Date, required: false },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur', required: true },
    status: {
      type: String,
      enum: ['brouillon', 'soumise', 'rejetee', 'validee', 'exportee', 'archivee'],
      default: 'brouillon',
      required: true,
    },
    values: { type: mongoose.Schema.Types.Mixed, default: {} }, // JSON de la saisie
    validations: [
      {
        // Une entrée par transition : soumise, validee, rejetee, exportee (SPEC §2)
        decision: { type: String, enum: ['soumise', 'validee', 'rejetee', 'exportee'], required: true },
        motif: { type: String }, // requis 1-500 seulement pour rejetee
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur' },
        actorLabel: { type: String },
        date: { type: Date, default: Date.now },
      },
    ],
    dates: {
      created: { type: Date, default: Date.now },
      submitted: { type: Date, default: null },
      exported: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Index unique pour les modules périodiques :
// Une saisie unique par (structureId, moduleId, periodeId).
// Les modules d'événements n'ont pas de periodeId : ils ne sont pas concernés
// (partialFilterExpression ne s'applique qu'aux documents qui ont un periodeId).
saisieSchema.index({ structureId: 1, moduleId: 1, periodeId: 1 }, { unique: true, partialFilterExpression: { periodeId: { $exists: true } } });

export default mongoose.model('Saisie', saisieSchema);
