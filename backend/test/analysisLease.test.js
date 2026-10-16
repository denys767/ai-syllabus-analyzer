// Відновлюваний аналіз: lease, продовження, захоплення без подвійного запуску, sweeper після рестарту.
process.env.ANALYSIS_LEASE_MS = '3000';
jest.mock('../services/ai/review', () => ({ runReview: jest.fn(), generateSuggestion: jest.fn() }));
const helpers = require('./helpers');
const Syllabus = require('../models/Syllabus');
const Suggestion = require('../models/Suggestion');
const review = require('../services/ai/review');
const runner = require('../services/analysisRunner');
const { sweepStuckAnalyses } = require('../services/syllabusCleanup');
const { MAX_ATTEMPTS, RECOVERY_ERROR } = require('../services/analysisLease');

let owner;
const finding = {
  id: 'f_1', criterionId: 'PR-4', group: 'practice', severity: 'medium', confidence: 0.9,
  claim: 'Немає інтерактивних методів', rationale: 'r', evidenceBlockIds: [], fixType: 'insertAfter',
};

beforeAll(async () => {
  await helpers.connectDb();
  owner = await helpers.createUser();
});
afterAll(helpers.disconnectDb);
beforeEach(() => {
  review.runReview.mockReset();
  review.generateSuggestion.mockReset();
  review.generateSuggestion.mockResolvedValue({ kind: 'edit', title: 't', description: 'd', rationale: 'r', ops: [], applicable: false });
});

const analyzing = (extra = {}) => helpers.createDocSyllabus(owner, { status: 'analyzing', analysisStage: 'extract', ...extra });
const withLease = (id) => Syllabus.findById(id).select('+analysisLeaseToken').lean();
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

test('claim: другий паралельний запуск не стартує, після завершення lease знято', async () => {
  const s = await analyzing();
  const gate = deferred();
  review.runReview.mockImplementation(async () => { await gate.promise; return { findings: [finding], rubricSummary: {}, stats: {} }; });

  const first = runner.runAnalysis(s._id);
  await new Promise((r) => setTimeout(r, 100));
  const during = await withLease(s._id);
  expect(during.analysisLeaseToken).toBeTruthy();
  expect(during.analysisLeaseUntil.getTime()).toBeGreaterThan(Date.now());
  expect(during.analysisAttempts).toBe(1);

  expect(await runner.runAnalysis(s._id)).toBe(false);
  gate.resolve();
  expect(await first).toBe(true);

  const after = await withLease(s._id);
  expect(after.status).toBe('in_progress');
  expect(after.analysisLeaseToken).toBeUndefined();
  expect(after.analysisLeaseUntil).toBeUndefined();
  expect(review.runReview).toHaveBeenCalledTimes(1);
  expect(await Suggestion.countDocuments({ syllabusId: s._id })).toBe(1);
});

test('lease продовжується, поки аналіз триває', async () => {
  const s = await analyzing();
  const gate = deferred();
  review.runReview.mockImplementation(async () => { await gate.promise; return { findings: [], rubricSummary: {}, stats: {} }; });
  const run = runner.runAnalysis(s._id);
  await new Promise((r) => setTimeout(r, 100));
  const initial = (await withLease(s._id)).analysisLeaseUntil.getTime();
  await new Promise((r) => setTimeout(r, 1500)); // інтервал продовження = LEASE_MS / 3 = 1 с
  const renewed = (await withLease(s._id)).analysisLeaseUntil.getTime();
  expect(renewed).toBeGreaterThan(initial);
  gate.resolve();
  await run;
  expect((await Syllabus.findById(s._id)).status).toBe('in_progress');
});

test('втрачений lease: запуск зупиняється без запису результатів і без error', async () => {
  const s = await analyzing();
  review.runReview.mockImplementation(async () => {
    // Інший процес перехопив job
    await Syllabus.updateOne({ _id: s._id }, { $set: { analysisLeaseToken: 'other', analysisLeaseUntil: new Date(Date.now() + 60000) } });
    return { findings: [finding], rubricSummary: {}, stats: {} };
  });
  await runner.runAnalysis(s._id);
  const after = await withLease(s._id);
  expect(after.status).toBe('analyzing');
  expect(after.analysisError).toBeUndefined();
  expect(after.analysisLeaseToken).toBe('other');
  expect(await Suggestion.countDocuments({ syllabusId: s._id })).toBe(0);
});

test('помилка аналізу → error з українським повідомленням, lease знято', async () => {
  const s = await analyzing();
  review.runReview.mockRejectedValue(new Error('boom'));
  await runner.runAnalysis(s._id);
  const after = await withLease(s._id);
  expect(after.status).toBe('error');
  expect(after.analysisError).toMatch(/Не вдалося проаналізувати/);
  expect(after.analysisLeaseToken).toBeUndefined();
});

describe('sweepStuckAnalyses', () => {
  test('прострочений lease з першою спробою → перезапуск і завершення', async () => {
    const s = await analyzing({ analysisAttempts: 1, analysisLeaseUntil: new Date(Date.now() - 1000) });
    await Syllabus.updateOne({ _id: s._id }, { $set: { analysisLeaseToken: 'dead-process' } });
    review.runReview.mockResolvedValue({ findings: [], rubricSummary: {}, stats: {} });
    const spy = jest.spyOn(runner, 'runAnalysisInBackground').mockImplementation(() => {});
    try {
      const result = await sweepStuckAnalyses();
      expect(result.requeued).toBeGreaterThanOrEqual(1);
      expect(spy).toHaveBeenCalledWith(s._id);
    } finally {
      spy.mockRestore();
    }
    expect(await runner.runAnalysis(s._id)).toBe(true);
    const after = await withLease(s._id);
    expect(after.status).toBe('in_progress');
    expect(after.analysisAttempts).toBe(2);
  });

  test('спроби вичерпано → error з поясненням', async () => {
    const s = await analyzing({ analysisAttempts: MAX_ATTEMPTS, analysisLeaseUntil: new Date(Date.now() - 1000) });
    const spy = jest.spyOn(runner, 'runAnalysisInBackground').mockImplementation(() => {});
    try {
      await sweepStuckAnalyses();
      expect(spy).not.toHaveBeenCalledWith(s._id);
    } finally {
      spy.mockRestore();
    }
    const after = await Syllabus.findById(s._id);
    expect(after.status).toBe('error');
    expect(after.analysisError).toBe(RECOVERY_ERROR);
    // runner теж не захопить job з вичерпаними спробами
    await Syllabus.updateOne({ _id: s._id }, { $set: { status: 'analyzing' } });
    expect(await runner.runAnalysis(s._id)).toBe(false);
  });

  test('активний lease не чіпається', async () => {
    const s = await analyzing({ analysisAttempts: 1, analysisLeaseUntil: new Date(Date.now() + 60000) });
    const spy = jest.spyOn(runner, 'runAnalysisInBackground').mockImplementation(() => {});
    try {
      await sweepStuckAnalyses();
      expect(spy).not.toHaveBeenCalledWith(s._id);
    } finally {
      spy.mockRestore();
    }
    expect((await Syllabus.findById(s._id)).status).toBe('analyzing');
  });
});
