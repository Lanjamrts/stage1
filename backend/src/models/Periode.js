import mongoose from 'mongoose';

const periodeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    deadline: { type: Date, required: true },
    periodicity: { type: String, enum: ['monthly', 'quarterly'], required: true },
  },
  { timestamps: true }
);

periodeSchema.index({ periodicity: 1, start: 1 }, { unique: true });

export default mongoose.model('Periode', periodeSchema);
