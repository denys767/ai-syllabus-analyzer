// Спільні налаштування тестів: env до завантаження server.js, пам'ять Mongo, фабрики.
process.env.MONGOMS_SYSTEM_BINARY = process.env.MONGOMS_SYSTEM_BINARY || '/usr/bin/mongod';
process.env.MONGOMS_VERSION_CHECK_OFF = '1';
process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.OPENAI_API_KEY = 'sk-test';
process.env.LOGIN_RATE_LIMIT_MAX = '3';
process.env.MAX_FILE_SIZE = '2048';
process.env.TRUST_PROXY = '1';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

async function connectDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function disconnectDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function createUser({ role = 'instructor', isActive = true, email } = {}) {
  const User = require('../models/User');
  const n = Math.random().toString(36).slice(2, 8);
  return User.create({
    email: email || `u${n}@example.com`,
    password: 'secret123',
    firstName: 'Test',
    lastName: 'User',
    role,
    isActive,
  });
}

function tokenFor(user) {
  return jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function createSyllabus(owner, extra = {}) {
  const Syllabus = require('../models/Syllabus');
  return Syllabus.create({
    title: 'Test syllabus',
    instructor: owner._id,
    extractedText: 'Line one\nLine two',
    status: 'in_progress',
    ...extra,
  });
}

module.exports = { connectDb, disconnectDb, createUser, tokenFor, createSyllabus };

// ---------- v4: силабус з document і пропозиції ----------

const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXTURE_DOCX = path.join(__dirname, 'fixtures', 'docx', 'syllabus.docx');
let cachedDoc;

async function fixtureDoc() {
  if (!cachedDoc) {
    const { extractDocx } = require('../services/document');
    cachedDoc = await extractDocx(fs.readFileSync(FIXTURE_DOCX));
  }
  return cachedDoc;
}

/** Силабус після аналізу: копія fixtures/docx/syllabus.docx у tmp як оригінал, блоки у document. */
async function createDocSyllabus(owner, extra = {}) {
  const Syllabus = require('../models/Syllabus');
  const doc = await fixtureDoc();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kse-syl-'));
  const filePath = path.join(dir, 'syllabus.docx');
  fs.copyFileSync(FIXTURE_DOCX, filePath);
  return Syllabus.create({
    title: 'Стратегічний менеджмент',
    course: { name: 'Стратегічний менеджмент' },
    instructor: owner._id,
    sourceFormat: 'docx',
    originalFile: { filename: 'syllabus.docx', originalName: 'syllabus.docx', path: filePath, size: 1 },
    document: { docVersion: doc.docVersion, convertedFrom: null, blocks: doc.blocks },
    status: 'in_progress',
    analysisStage: 'done',
    ...extra,
  });
}

let order = 0;
async function createSuggestion(syllabus, fields = {}) {
  const Suggestion = require('../models/Suggestion');
  return Suggestion.create({
    syllabusId: syllabus._id,
    criterionId: 'T-1',
    severity: 'medium',
    kind: 'edit',
    title: `Пропозиція ${order + 1}`,
    description: 'Опис',
    rationale: 'Пояснення',
    order: order++,
    ...fields,
  });
}

function replaceOp(blockId, newText) {
  return { op: 'replaceBlock', blockId, newText };
}

module.exports.fixtureDoc = fixtureDoc;
module.exports.createDocSyllabus = createDocSyllabus;
module.exports.createSuggestion = createSuggestion;
module.exports.replaceOp = replaceOp;
module.exports.FIXTURE_DOCX = FIXTURE_DOCX;
