const mongoose = require('mongoose');

const DEFAULT_PROGRAMS = [
  { code: 'MBA', name: 'MBA' },
  { code: 'EMBA', name: 'Executive MBA' },
  { code: 'CORPORATE', name: 'Corporate Programs' },
  { code: 'INTENSIVE', name: 'Intensive Programs' },
];

const programSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  academicDirectorEmail: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email'],
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

programSchema.statics.seedDefaults = async function () {
  for (const p of DEFAULT_PROGRAMS) {
    await this.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
  }
};

module.exports = mongoose.model('Program', programSchema);
module.exports.DEFAULT_PROGRAMS = DEFAULT_PROGRAMS;
