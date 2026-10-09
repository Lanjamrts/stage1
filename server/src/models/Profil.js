import mongoose from 'mongoose';

const profilSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    label: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Profil', profilSchema);
