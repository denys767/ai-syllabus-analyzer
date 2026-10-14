const mongoose = require('mongoose');
const validator = require('validator');

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
    validate: [(v) => !v || validator.isEmail(v), 'Вкажіть коректний email'],
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
