const mongoose = require('mongoose');

const ANALYSIS_STAGES = ['extract', 'structure', 'diagnose', 'verify', 'rewrite', 'done'];

// Кешований фінальний файл: валідний, поки docVersion і acceptedHash збігаються з поточними
const outputSchema = new mongoose.Schema({
  path: String,
  generatedAt: Date,
  docVersion: String,
  acceptedHash: String,
}, { _id: false });

const syllabusSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  course: {
    code: String,
    name: String,
    credits: Number,
    semester: String,
    year: Number
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program'
  },
  // Редакція програми (MBA27/MBA28…): за нею вибираються довідники і тип курсу
  programCode: { type: String, uppercase: true, trim: true },
  track: { type: String, enum: ['scratch', 'upload'], default: 'upload' },
  // Формат, який завантажив викладач
  sourceFormat: {
    type: String,
    enum: ['docx', 'doc', 'pdf', 'pptx'],
  },
  // Оригінальний файл викладача, незмінний
  originalFile: {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  // Робочий .docx, з яким працюють writer-и (для docx — той самий файл, що й оригінал)
  workingFile: {
    path: String,
    size: Number,
  },
  // Результат services/document.loadDocument
  document: {
    docVersion: String,
    format: String,
    meta: mongoose.Schema.Types.Mixed,
    pdfBlockMap: mongoose.Schema.Types.Mixed,
    sourceBlocks: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    sourceDocVersion: String,
    convertedFrom: { type: String, enum: ['doc', 'pdf', null], default: null },
    blocks: { type: [mongoose.Schema.Types.Mixed], default: undefined },
  },
  // Похідний плоский текст (blocks.map(text).join('\n')) для пошуку і звітів
  extractedText: String,
  outputs: {
    clean: outputSchema,
    tracked: outputSchema,
    trackedPdf: outputSchema,
    edited: outputSchema,
    previewPdf: outputSchema,
    annotated: outputSchema,
  },
  rubricSummary: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['analyzing', 'in_progress', 'submitted', 'error'],
    default: 'analyzing'
  },
  analysisStage: { type: String, enum: [...ANALYSIS_STAGES, null], default: null },
  // Коли розпочато поточний аналіз (для відновлення завислих) і текст останньої помилки
  analysisStartedAt: Date,
  analysisLeaseUntil: Date,
  analysisLeaseToken: { type: String, select: false },
  analysisAttempts: { type: Number, default: 0 },
  analysisError: String,
  submittedAt: Date,
  submissionEmailStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  // Прапорець атомарного захоплення під час submit (захист від подвійної відправки)
  submitting: {
    type: Boolean,
    default: false
  },
  // Силабуси до v4 (без document): чат лише читається, мутації → 409 LEGACY_SYLLABUS
  legacy: {
    type: Boolean,
    default: false
  },
  // Лише для legacy: фінальний PDF старого пайплайну (для resend-submission)
  submittedPdfPath: String,
}, {
  timestamps: true
});

syllabusSchema.index({ instructor: 1, createdAt: -1 });
syllabusSchema.index({ status: 1 });
syllabusSchema.index({ programId: 1, status: 1 });
syllabusSchema.index({ programId: 1, updatedAt: -1 });

syllabusSchema.statics.ANALYSIS_STAGES = ANALYSIS_STAGES;

/** Усі шляхи до файлів силабусу (оригінал, робочий .docx, outputs, legacy PDF). */
syllabusSchema.statics.filePaths = function(doc) {
  const outputs = doc?.outputs || {};
  return [
    doc?.originalFile?.path,
    doc?.workingFile?.path,
    outputs.clean?.path,
    outputs.tracked?.path,
    outputs.trackedPdf?.path,
    outputs.edited?.path,
    outputs.previewPdf?.path,
    outputs.annotated?.path,
    doc?.submittedPdfPath,
  ].filter(Boolean);
};

syllabusSchema.statics.FILE_FIELDS = 'originalFile.path workingFile.path outputs.clean.path outputs.tracked.path outputs.trackedPdf.path outputs.edited.path outputs.previewPdf.path outputs.annotated.path submittedPdfPath';

syllabusSchema.methods.cleanupFiles = async function(fsPromises) {
  const fs = fsPromises || require('fs').promises;
  for (const p of new Set(this.constructor.filePaths(this))) {
    try { await fs.unlink(p); } catch { /* best-effort */ }
  }
};

syllabusSchema.statics.cleanupFilesByFilter = async function(filter = {}) {
  const fs = require('fs').promises;
  const docs = await this.find(filter).select(this.FILE_FIELDS);
  for (const doc of docs) {
    await doc.cleanupFiles(fs);
  }
};

module.exports = mongoose.model('Syllabus', syllabusSchema);
