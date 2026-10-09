import mongoose from 'mongoose';

const referentielSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ['directions', 'services', 'grades', 'epn', 'std'] },
    value: { type: String, required: true },
  },
  { timestamps: true }
);

referentielSchema.index({ type: 1, value: 1 }, { unique: true });

export default mongoose.model('Referentiel', referentielSchema);
