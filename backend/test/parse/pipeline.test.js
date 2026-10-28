// Наскрізний аналіз синтетичного DOCX: справжні extract, parse, store, checks і картки; лише LLM замокано.
process.env.ANALYSIS_LEASE_MS = '3000';
jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../services/ai/client');
const helpers = require('../helpers');
const Syllabus = require('../../models/Syllabus');
const Suggestion = require('../../models/Suggestion');
const SlotChange = require('../../models/SlotChange');
const references = require('../../services/references');
const runner = require('../../services/analysisRunner');
const { validateState } = require('../../services/syllabusState/schema');
const { DOCX, refs, slots, classifications, reply } = require('./fixtures');

let owner;
let stages;
let updateSpy;
beforeAll(async () => {
  await helpers.connectDb();
  owner = await helpers.createUser();
  jest.spyOn(references, 'getRefs').mockResolvedValue(refs());
  jest.spyOn(references, 'courseKind').mockResolvedValue({ kind: 'elective', matchedBy: null, course: null });
});
afterAll(async () => { jest.restoreAllMocks(); await helpers.disconnectDb(); });
beforeEach(() => {
  stages = [];
  const update = Syllabus.updateOne.bind(Syllabus);
  updateSpy = jest.spyOn(Syllabus, 'updateOne').mockImplementation((filter, change, ...args) => {
    if (change.$set?.analysisStage) stages.push(change.$set.analysisStage);
    return update(filter, change, ...args);
  });
  createResponse.mockReset().mockImplementation(async (request) => {
    switch (request.text.format.name) {
      case 'parse_extract_slots': return reply(slots());
      case 'parse_policy_match': return reply(classifications());
      case 'checks_component_schedule': return reply({ matches: [] });
      case 'review_state': return reply({ suggestions: [{ ref: 'r2', issue: 'The objective is vague.', severity: 'medium', after: 'Apply a preparation framework to negotiate a workable agreement.', proposedValues: [] }] });
      default: throw new Error(`Unexpected LLM schema: ${request.text.format.name}`);
    }
  });
});
afterEach(() => updateSpy.mockRestore());
const analyzing = (extra = {}) => helpers.createSyllabus(owner, {
  status: 'analyzing', analysisStage: 'extract', programCode: 'MBA28', sourceFormat: 'docx', needsRebuild: true,
  originalFile: { path: DOCX, originalName: 'parse-syllabus.docx' }, ...extra,
});

test('extract → parse → checks → review → done: стан, baseline, картки й needsRebuild', async () => {
  const s = await analyzing();
  await SlotChange.create({ syllabusId: s._id, revision: 1, path: 'header.courseTitle', after: 'Old title' });
  const other = await analyzing();
  await SlotChange.create({ syllabusId: other._id, revision: 1, path: 'header.courseTitle' });
  expect(await runner.runAnalysis(s._id)).toBe(true);
  const saved = await Syllabus.findById(s._id).lean();
  expect(saved).toMatchObject({ status: 'in_progress', analysisStage: 'done', needsRebuild: false, stateRevision: 1, track: 'upload' });
  expect(validateState(saved.state)).toEqual([]);
  expect(saved.baselineState).toEqual(saved.state);
  expect(saved.state.header.courseTitle).toBe('Negotiation and Influence');
  expect(saved.state.header.computed.assessmentTotal).toBe(100);
  expect(stages).toEqual(['extract', 'parse', 'checks', 'review', 'done']);
  expect(await SlotChange.countDocuments({ syllabusId: s._id })).toBe(0);
  expect(await SlotChange.countDocuments({ syllabusId: other._id })).toBe(1);
  const cards = await Suggestion.find({ syllabusId: s._id }).lean();
  expect(cards).toEqual(expect.arrayContaining([
    expect.objectContaining({ origin: 'check', kind: 'question', checkId: expect.any(String) }),
    expect.objectContaining({ kind: 'choice', target: expect.objectContaining({ path: 'policies{policy.attendance}' }) }),
    expect.objectContaining({ origin: 'reviewer', draft: expect.objectContaining({ value: expect.any(String), basisHash: expect.any(String) }) }),
  ]));
  expect(saved.analysisLeaseToken).toBeUndefined();
  expect(createResponse.mock.calls.some(([r]) => /diagnose|verify|rewrite/.test(r.text.format.name))).toBe(false);
});

test('втрата lease під час parse не змінює стан, baseline, старі картки чи журнал', async () => {
  const s = await analyzing();
  const old = await helpers.createSuggestion(s);
  await SlotChange.create({ syllabusId: s._id, revision: 1, path: 'header.courseTitle' });
  const respond = createResponse.getMockImplementation();
  createResponse.mockImplementation(async (request) => {
    if (request.text.format.name === 'parse_extract_slots') await Syllabus.updateOne({ _id: s._id }, { $set: { analysisLeaseToken: 'other', analysisLeaseUntil: new Date(Date.now() + 60000) } });
    return respond(request);
  });
  await runner.runAnalysis(s._id);
  const saved = await Syllabus.findById(s._id).select('+analysisLeaseToken').lean();
  expect(saved).toMatchObject({ status: 'analyzing', analysisLeaseToken: 'other', needsRebuild: true });
  expect(saved.state).toBeUndefined();
  expect(saved.baselineState).toBeUndefined();
  expect(await Suggestion.exists({ _id: old._id })).toBeTruthy();
  expect(await SlotChange.countDocuments({ syllabusId: s._id })).toBe(1);
});

test('помилка LLM → error з англійським analysisError; новий стан не пишеться', async () => {
  const s = await analyzing();
  createResponse.mockRejectedValue(new Error('Помилка моделі'));
  await runner.runAnalysis(s._id);
  const saved = await Syllabus.findById(s._id).lean();
  expect(saved.status).toBe('error');
  expect(saved.analysisError).toBe('The syllabus could not be analysed. Please try again.');
  expect(saved.state).toBeUndefined();
});

test('пошкоджений docx і pptx навіть з кешованим document → англійська помилка', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kse-g-invalid-'));
  try {
    const file = path.join(dir, 'invalid.docx'); fs.writeFileSync(file, 'broken');
    const s = await analyzing({ originalFile: { path: file, originalName: 'invalid.docx' } });
    await runner.runAnalysis(s._id);
    expect((await Syllabus.findById(s._id)).analysisError).toMatch(/valid DOCX/);
    // pptx вже не входить в enum моделі: старий документ з БД обходить валідацію
    const pptx = await analyzing({ document: { docVersion: 'v1', blocks: [{ id: 'b1', text: 'cached', kind: 'paragraph' }] } });
    await Syllabus.collection.updateOne({ _id: pptx._id }, { $set: { sourceFormat: 'pptx' } });
    await runner.runAnalysis(pptx._id);
    expect((await Syllabus.findById(pptx._id)).analysisError).toMatch(/not supported/);
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('initState перевіряє lease атомарно, навіть коли його втрачено після assertLease', async () => {
  const store = require('../../services/syllabusState/store');
  const init = store.initState;
  const s = await analyzing();
  const spy = jest.spyOn(store, 'initState').mockImplementationOnce(async (id, state, options) => {
    expect(options.setBaseline).toBe(true);
    expect(options.filter.analysisLeaseToken).toBeTruthy();
    await Syllabus.updateOne({ _id: id }, { $set: { analysisLeaseToken: 'replacement', analysisLeaseUntil: new Date(Date.now() + 60000) } });
    return init(id, state, options);
  });
  try { await runner.runAnalysis(s._id); } finally { spy.mockRestore(); }
  const saved = await Syllabus.findById(s._id).select('+analysisLeaseToken').lean();
  expect(saved).toMatchObject({ status: 'analyzing', analysisLeaseToken: 'replacement', needsRebuild: true });
  expect(saved.state).toBeUndefined();
  expect(saved.stateRevision).toBe(0);
  expect(await Suggestion.countDocuments({ syllabusId: s._id })).toBe(0);
});

test('m5: lease втрачено між перевіркою і вставкою карток → свої картки прибрано, дублікатів немає', async () => {
  const s = await analyzing();
  const insert = Suggestion.insertMany.bind(Suggestion);
  const spy = jest.spyOn(Suggestion, 'insertMany').mockImplementationOnce(async (docs, ...args) => {
    // Новий власник lease уже видалив старі картки й вставив свою
    await Syllabus.updateOne({ _id: s._id }, { $set: { analysisLeaseToken: 'replacement', analysisLeaseUntil: new Date(Date.now() + 60000) } });
    await insert([{ syllabusId: s._id, origin: 'reviewer', kind: 'edit', title: 'From the new owner', target: { path: 'summary.shortDescription' } }]);
    return insert(docs, ...args);
  });
  try { await runner.runAnalysis(s._id); } finally { spy.mockRestore(); }
  const saved = await Syllabus.findById(s._id).select('+analysisLeaseToken').lean();
  expect(saved).toMatchObject({ status: 'analyzing', analysisLeaseToken: 'replacement' });
  const left = await Suggestion.find({ syllabusId: s._id }).lean();
  expect(left.map((x) => x.title)).toEqual(['From the new owner']);
});
