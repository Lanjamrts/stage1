import mongoose from 'mongoose';

const referentielSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ['directions', 'services', 'grades', 'epn', 'std', 'ministeres'] },
    value: { type: String, required: true },
    ministere: { type: String, default: '' },
    regime: { type: String, default: '' },
    acronyme: { type: String, default: '' },
  },
  { timestamps: true }
);

referentielSchema.index({ type: 1, value: 1 }, { unique: true });

export default mongoose.model('Referentiel', referentielSchema);
