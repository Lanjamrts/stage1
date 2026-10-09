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
        decision: { type: String, enum: ['validee', 'rejetee'] },
        motif: { type: String }, // seulement rejetee, requis 1-500
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur' },
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
// Une saisie unique par (structureId, moduleId, periodeId)
// MAIS les modules d'événements (type événement) n'ont pas de période ; ils n'ont pas d'index
// Pour simplifier, nous allons ajouter un index unique conditionnel plus tard via le seed ou la base de données.
// Pour le moment, nous ajoutons un index simple.
saisieSchema.index({ structureId: 1, moduleId: 1, periodeId: 1 }, { unique: true, partialFilterExpression: { periodeId: { $exists: true } } });

export default mongoose.model('Saisie', saisieSchema);
