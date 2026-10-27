const mongoose = require('mongoose');
const validator = require('validator');

const DEFAULT_PROGRAMS = [
  {
    code: 'MBA',
    name: 'MBA',
    editions: [
      { code: 'MBA27', label: 'MBA27 (2025-26 intake)' },
      { code: 'MBA28', label: 'MBA28 (2026-27 intake)' },
    ],
  },
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
  // Редакції програми (набори): з них береться Syllabus.programCode
  editions: {
    type: [new mongoose.Schema({
      code: { type: String, required: true, uppercase: true, trim: true },
      label: { type: String, default: '' },
    }, { _id: false })],
    default: [],
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

programSchema.statics.seedDefaults = async function () {
  for (const { editions = [], ...p } of DEFAULT_PROGRAMS) {
    await this.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
    // Редакції додаються по одній, наявні (і їхні підписи) не затираються
    for (const ed of editions) {
      await this.updateOne(
        { code: p.code, 'editions.code': { $ne: ed.code } },
        { $push: { editions: ed } }
      );
    }
  }
};

module.exports = mongoose.model('Program', programSchema);
module.exports.DEFAULT_PROGRAMS = DEFAULT_PROGRAMS;
