const fs = require('fs');
const path = require('path');
const api = require('../../services/document');
const { fixture } = require('./helpers');

test('apply/conflicts/preview однакові для DOCX, PPTX і PDF DocModel', async () => {
  const sources = await Promise.all([
    api.extractDocx(fixture('syllabus.docx')),
    api.extractPptx(fs.readFileSync(path.join(__dirname, '../fixtures/pptx/syllabus.pptx'))),
    api.extractPdf(fs.readFileSync(path.join(__dirname, '../fixtures/pdf/syllabus.pdf'))),
  ]);
  const accepted = [
    { id: 'a', ops: [{ op: 'replaceBlock', blockId: 'b0001', newText: 'Курс триває 12 тижнів і має іспит.' }] },
    { id: 'b', ops: [{ op: 'replaceBlock', blockId: 'b0001', newText: 'Курс триває 10 тижнів і має проєкт.' }] },
    { id: 'i', ops: [{ op: 'insertAfter', blockId: 'b0002', newBlocks: [{ kind: 'paragraph', text: 'Нові матеріали' }] }] },
    { id: 'd', ops: [{ op: 'deleteBlock', blockId: 'b0003' }] },
  ];
  const conflict = { id: 'c', ops: [{ op: 'replaceBlock', blockId: 'b0001', newText: 'Курс триває 14 тижнів і має іспит.' }] };
  const results = sources.map((source) => {
    // Однаковий зміст, але справжні kind/locator кожного формату.
    const doc = { ...source, blocks: source.blocks.slice(0, 3).map((b, i) => ({ ...b, id: `b000${i + 1}`, readOnly: false,
      text: ['Курс триває 10 тижнів і має іспит.', 'Матеріали', 'Зайвий пункт'][i] })) };
    const snapshot = JSON.stringify(doc);
    expect(api.validateOps(doc, accepted[0].ops)).toEqual([]);
    const applied = api.applyAccepted(doc, accepted);
    expect(applied.conflicts).toEqual([]);
    expect(applied.blocks[0].text).toBe('Курс триває 12 тижнів і має проєкт.');
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(api.applyAccepted(doc, accepted)).toEqual(applied);
    return { changes: applied.changes, preview: api.previewChanges(doc, accepted), conflicts: api.findConflicts(doc, accepted, conflict) };
  });
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
  expect(results[0].conflicts.length).toBeGreaterThan(0);
});

test('buildOutputsFor docx делегує старий контракт; невідомий формат → 415', async () => {
  const original = fixture('syllabus.docx');
  const doc = await api.extractDocx(original);
  expect(await api.buildOutputsFor('docx', original, doc, [])).toEqual(await api.buildOutputs(original, doc, []));
  await expect(api.buildOutputsFor('rtf', original, doc, [])).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
});
