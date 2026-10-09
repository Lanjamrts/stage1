import mongoose from 'mongoose';

const moduleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    periodicity: { type: String, enum: ['monthly', 'quarterly'], required: true },
    kind: { type: String, enum: ['periodic', 'event'], required: true },
    structureTypes: [{ type: String, enum: ['SRB', 'SRSP', 'SRPE', 'CIRBF', 'DRBF', 'SSEBF', 'DGBF', 'CELLULE_INFO'] }],
    version: { type: Number, required: true, default: 1 },
    active: { type: Boolean, default: true },
    fields: { type: mongoose.Schema.Types.Mixed, required: true }, // champ DSL du moteur de gabarit
  },
  { timestamps: true }
);

export default mongoose.model('Module', moduleSchema);
