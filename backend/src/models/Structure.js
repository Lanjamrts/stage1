import mongoose from 'mongoose';

const structureSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['SRB', 'SRSP', 'SRPE', 'CIRBF', 'DRBF', 'SSEBF', 'DGBF', 'CELLULE_INFO'], required: true },
    regionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Region', required: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Structure', structureSchema);
