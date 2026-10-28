// Трек 2: інструктор із файлу і профіль викладача (етап 6 ТЗ). LLM замокано, як у pipeline.test.js.
process.env.ANALYSIS_LEASE_MS = '3000';
jest.mock('../../services/ai/client', () => ({ createResponse: jest.fn(), llmModel: 'gpt-test' }));
const { createResponse } = require('../../services/ai/client');
const helpers = require('../helpers');
const User = require('../../models/User');
const Syllabus = require('../../models/Syllabus');
const Suggestion = require('../../models/Suggestion');
const references = require('../../services/references');
const runner = require('../../services/analysisRunner');
const { DOCX, refs, slots, classifications, reply } = require('./fixtures');

let owner;
beforeAll(async () => {
  await helpers.connectDb();
  jest.spyOn(references, 'getRefs').mockResolvedValue(refs());
  jest.spyOn(references, 'courseKind').mockResolvedValue({ kind: 'elective', matchedBy: null, course: null });
});
afterAll(async () => { jest.restoreAllMocks(); await helpers.disconnectDb(); });

const profile = {
  name: 'Jane Doe', position: 'Associate professor of management', email: 'jane.doe@example.org', officeHours: 'Tue 14:00-16:00', assistants: '',
  expertise: ['Negotiation', 'Leadership', 'Strategy'], education: ['PhD'], experience: ['Consulting'],
};

async function analyse(parsedInstructors, lecturerProfile = profile) {
  owner = await helpers.createUser();
  await User.updateOne({ _id: owner._id }, { $set: { lecturerProfile } });
  createResponse.mockReset().mockImplementation(async (request) => {
    switch (request.text.format.name) {
      case 'parse_extract_slots': return reply(slots({ instructors: parsedInstructors }));
      case 'parse_policy_match': return reply(classifications());
      case 'checks_component_schedule': return reply({ matches: [] });
      case 'review_state': return reply({ suggestions: [] });
      default: throw new Error(`Unexpected LLM schema: ${request.text.format.name}`);
    }
  });
  const s = await helpers.createSyllabus(owner, {
    status: 'analyzing', analysisStage: 'extract', programCode: 'MBA28', sourceFormat: 'docx', needsRebuild: true,
    originalFile: { path: DOCX, originalName: 'parse-syllabus.docx' },
  });
  expect(await runner.runAnalysis(s._id)).toBe(true);
  const saved = await Syllabus.findById(s._id).lean();
  const cards = await Suggestion.find({ syllabusId: s._id, 'target.path': 'instructors[]' }).lean();
  return { saved, cards };
}

test('порожній інструктор у файлі → заповнюється з профілю, картка «Is it up to date?»', async () => {
  const { saved, cards } = await analyse([]);
  expect(saved.status).toBe('in_progress');
  expect(saved.state.instructors).toHaveLength(1);
  expect(saved.state.instructors[0]).toMatchObject({ ...profile, source: 'instructor_directed' });
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ origin: 'interviewer', kind: 'choice', section: 'instructor', title: 'Here is your profile. Is it up to date?' });
  expect(cards[0].options.map((o) => o.label)).toEqual(["Yes, it's up to date", 'Update']);
});

test('інший інструктор у файлі → лишається розпізнаний, інформаційна картка пропонує профіль', async () => {
  const { saved, cards } = await analyse([{
    name: 'John Smith', position: 'Lecturer', email: null, officeHours: null, expertise: [], education: [], experience: [], blockIds: ['b0012'],
  }]);
  expect(saved.state.instructors).toHaveLength(1);
  expect(saved.state.instructors[0]).toMatchObject({ name: 'John Smith', source: 'parsed' });
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ severity: 'info', kind: 'choice', title: 'Your instructor details differ from your profile' });
  expect(cards[0].options.map((o) => o.id)).toEqual(['use_profile', 'keep', 'update']);
  const use = cards[0].options.find((o) => o.id === 'use_profile');
  expect(use.value[0]).toMatchObject({ name: 'Jane Doe' });
});

test('інструктор у файлі збігається з профілем → звичайна картка підтвердження, дані файлу без змін', async () => {
  const { saved, cards } = await analyse([{
    name: profile.name, position: profile.position, email: profile.email, officeHours: profile.officeHours,
    expertise: profile.expertise, education: profile.education, experience: profile.experience, blockIds: ['b0012'],
  }]);
  expect(saved.state.instructors[0].source).toBe('parsed');
  expect(cards).toHaveLength(1);
  expect(cards[0].title).toBe('Here is your profile. Is it up to date?');
});
