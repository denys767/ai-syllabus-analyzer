const mongoose = require('mongoose');

// Нормативний (core) курс програми; усе, чого тут немає, для цієї програми — elective
const programCourseSchema = new mongoose.Schema({
  programCode: { type: String, required: true, uppercase: true, trim: true },
  code: { type: String, required: true },
  uk: { type: String, required: true },
  en: { type: String, default: '' },
  ects: { type: Number, default: null },
}, { timestamps: true });

programCourseSchema.index({ programCode: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('ProgramCourse', programCourseSchema);
