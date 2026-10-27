const mongoose = require('mongoose');

const capstoneGuideSchema = new mongoose.Schema({
  programCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  version: { type: String, default: '' },
  projectTypes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  structure: { type: [String], default: [] },
  criteria: { type: [mongoose.Schema.Types.Mixed], default: [] },
  deliverables: { type: mongoose.Schema.Types.Mixed, default: {} },
  plagiarismThreshold: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

module.exports = mongoose.model('CapstoneGuide', capstoneGuideSchema);
