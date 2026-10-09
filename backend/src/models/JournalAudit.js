import mongoose from 'mongoose';

// userId est stocké en String (ObjectId casté en string, ou "im"/"unknown"
// pour les échecs de connexion où l'utilisateur est inconnu).
const journalAuditSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    action: { type: String, required: true },
    object: { type: String, required: true },
    ip: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model('JournalAudit', journalAuditSchema);
