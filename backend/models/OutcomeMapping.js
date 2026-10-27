const mongoose = require('mongoose');

// Відповідність ПРН між редакціями програми (напр. MBA27 → MBA28)
const outcomeMappingSchema = new mongoose.Schema({
  from: { type: String, required: true, uppercase: true, trim: true },
  to: { type: String, required: true, uppercase: true, trim: true },
  pairs: [{
    _id: false,
    from: { type: String, default: null },
    to: { type: String, default: null },
    change: { type: String, default: '' },
  }],
}, { timestamps: true });

outcomeMappingSchema.index({ from: 1, to: 1 }, { unique: true });

module.exports = mongoose.model('OutcomeMapping', outcomeMappingSchema);
