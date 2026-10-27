// Тести генератора .docx за шаблоном: розбір word/document.xml без мережі і БД.
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderSyllabusDocx } = require('../../services/document/writers/templateDocx');
const { loadFixtureRefs } = require('../../services/references/fixtureRefs');
const { riskManagementState } = require('../fixtures/state/riskManagement');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const refs = loadFixtureRefs('MBA28');

const textOf = (node) => Array.from(node.getElementsByTagNameNS(W, 't')).map((t) => t.textContent).join('');
async function parse(state, opts) {
  const buf = await renderSyllabusDocx(state, refs, opts);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  const rels = zip.file('word/_rels/document.xml.rels') ? await zip.file('word/_rels/document.xml.rels').async('string') : '';
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const paragraphs = Array.from(doc.getElementsByTagNameNS(W, 'p'));
  const styleOf = (p) => p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val');
  const tables = Array.from(body.childNodes).filter((n) => n.localName === 'tbl').map((t) => ({
    node: t,
    rows: Array.from(t.childNodes).filter((n) => n.localName === 'tr').map((tr) =>
      Array.from(tr.childNodes).filter((n) => n.localName === 'tc').map(textOf)),
  }));
  return {
    buf, xml, rels, tables, text: textOf(doc),
    h1: paragraphs.filter((p) => styleOf(p) === 'Heading1').map(textOf),
    h2: paragraphs.filter((p) => styleOf(p) === 'Heading2').map(textOf),
    hyperlinks: doc.getElementsByTagNameNS(W, 'hyperlink').length,
    highlights: doc.getElementsByTagNameNS(W, 'highlight').length,
  };
}
const findTable = (r, firstCell) => r.tables.find((t) => t.rows[0][0].startsWith(firstCell));

describe('renderSyllabusDocx', () => {
  let r;
  beforeAll(async () => { r = await parse(riskManagementState(), { programLabel: 'MBA 28' }); });

  test('заголовки розділів пронумеровані 1..6 за порядком', () => {
    expect(r.h1).toEqual([
      '1. Summary', '2. Instructor', '3. Course Structure & Schedule',
      '4. Assessment and Grading', '5. Course Materials', '6. Course Policies',
    ]);
    expect(r.text).toContain('COURSE SYLLABUS · Risk Management');
  });

  test('є таблиці At a Glance, Matrix, Schedule, Assessment', () => {
    const glance = findTable(r, 'Program');
    expect(glance.rows.find((x) => x[0] === 'Program')[1]).toBe('MBA 28');
    expect(findTable(r, 'Course learning outcome')).toBeTruthy();
    expect(findTable(r, 'Session').rows[0]).toEqual(['Session', 'Topic', 'Type', 'Format', 'Guest speaker', 'Additional information']);
    expect(findTable(r, 'Component')).toBeTruthy();
  });

  test('At a Glance: contact 20, self-study 14; Total ваг 100', () => {
    const glance = findTable(r, 'Program');
    expect(glance.rows.find((x) => x[0] === 'Contact hours')[1]).toContain('20');
    expect(glance.rows.find((x) => x[0] === 'Self-study hours')[1]).toContain('14');
    expect(glance.rows.find((x) => x[0] === 'Assessment')[1]).toBe('3 components · 100%');
    const total = findTable(r, 'Component').rows.find((x) => x[0] === 'Total');
    expect(total[1]).toBe('100');
  });

  test('розклад: дата/час і тривалість у колонці Session', () => {
    const row = findTable(r, 'Session').rows[1];
    expect(row[0]).toContain('2026-04-25');
    expect(row[0]).toContain('(4 ac. hours)');
  });

  test('library-політики без вибору → плейсхолдер, locked passing → текст довідника', () => {
    expect(r.text).toContain('[Choose an option: Participation Credit]');
    expect(r.text).toContain('[Choose an option: Grading Detail]');
    expect(r.text).toContain('60 out of 100');
    expect(r.h2).toContain('Passing Threshold');
    expect(r.highlights).toBeGreaterThan(0);
  });

  test('обраний варіант довідника і власний текст', async () => {
    const state = riskManagementState();
    state.policies.find((p) => p.key === 'policy.attendance').optionKey = 'attendance_std';
    const late = state.policies.find((p) => p.key === 'policy.late');
    late.optionKey = null;
    const res = await parse(state);
    expect(res.text).toContain('Attendance is mandatory');
    expect(res.text).not.toContain('[Choose an option: Attendance]');
    expect(res.text).toContain('Assignments submitted after the deadline'); // власний текст
    expect(res.text).not.toContain('[Choose an option: Late Submission]');
  });

  test('неперевірений URL не стає гіперпосиланням, перевірений — стає', async () => {
    const state = riskManagementState();
    state.materials.required = [
      { id: 'a', citation: 'Unverified', url: 'https://example.com/a', verified: false, source: 'parsed', evidenceBlockIds: [] },
      { id: 'b', citation: 'Verified', url: 'https://example.com/b', verified: true, source: 'parsed', evidenceBlockIds: [] },
    ];
    const res = await parse(state);
    expect(res.text).toContain('https://example.com/a');
    expect(res.hyperlinks).toBe(1);
    expect(res.rels).toContain('https://example.com/b');
    expect(res.rels).not.toContain('https://example.com/a');
  });

  test('PLO у матриці беруться з refs, partial позначається', async () => {
    const state = riskManagementState();
    const code = refs.outcomes[0].code;
    state.outcomes[0].plo = [{ code, coverage: 'partial', confirmed: true }];
    const res = await parse(state);
    const row = findTable(res, 'Course learning outcome').rows[1];
    expect(row[1]).toContain(code);
    expect(row[1]).toContain(refs.outcomes[0].text);
    expect(row[1]).toContain('(partial)');
  });

  test('повністю порожній мінімальний стан не падає і дає плейсхолдери', async () => {
    const empty = {
      schemaVersion: 1, programCode: null, track: 'scratch', language: null,
      header: { term: {}, computed: {} },
      summary: { prerequisites: {}, shortDescription: {}, objectives: [], capstone: { criteriaKeys: [] } },
      outcomes: [], instructors: [], sessions: [], individualWork: [], assessments: [],
      compensation: { items: [] }, materials: { required: [], recommended: [] }, policies: [], sections: {},
    };
    const res = await parse(empty);
    expect(res.h1).toHaveLength(6);
    expect(res.text).toContain('[To be completed: Short Course Description]');
    expect(res.text).toContain('[Choose an option: Late Submission]');
    expect(res.highlights).toBeGreaterThan(5);
    // і без refs
    await expect(renderSyllabusDocx(empty, undefined)).resolves.toBeInstanceOf(Buffer);
  });
});

const hasSoffice = spawnSync('soffice', ['--version'], { stdio: 'ignore' }).status === 0;
(hasSoffice ? describe : describe.skip)('templateDocx smoke (LibreOffice)', () => {
  test('файл конвертується в PDF', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-docx-'));
    try {
      const file = path.join(dir, 's.docx');
      fs.writeFileSync(file, await renderSyllabusDocx(riskManagementState(), refs));
      execFileSync('soffice', [`-env:UserInstallation=file://${dir}/profile`, '--headless', '--convert-to', 'pdf', '--outdir', dir, file], { timeout: 110000, stdio: 'ignore' });
      expect(fs.readFileSync(path.join(dir, 's.pdf')).slice(0, 4).toString()).toBe('%PDF');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 120000);
});
