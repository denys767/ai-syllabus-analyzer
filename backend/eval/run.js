const fs = require('fs');
const path = require('path');
const { validateSchema } = require('../services/ai/review/schemas');
const { criteria, getCriterion } = require('../services/ai/rubric');
const { ABSENCE_CRITERIA } = require('../services/ai/review/common');
const { measureDocument, aggregate } = require('./metrics');
const goldenSchema = require('./golden/annotation.schema.json');

function resolveInput(value) {
  const direct = path.resolve(value);
  if (fs.existsSync(direct)) return direct;
  const fromRoot = path.resolve(__dirname, '../..', value);
  return fs.existsSync(fromRoot) ? fromRoot : direct;
}
function parseArgs(args) {
  const config = { golden: path.join(__dirname, 'golden'), docs: path.join(__dirname, 'docs'), mock: false,
    output: path.join('/tmp', `kse-review-eval-${Date.now()}.json`) };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--mock') config.mock = true;
    else if (['--golden', '--docs', '--output'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) config[arg.slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  config.golden = resolveInput(config.golden); config.docs = resolveInput(config.docs); config.output = path.resolve(config.output);
  return config;
}
function documentName(annotation) {
  if (typeof annotation.file !== 'string' || !annotation.file.trim() || /[\\/\u0000-\u001f]/.test(annotation.file) || annotation.file === '.' || annotation.file === '..') throw new Error('Invalid annotation file name');
  return path.parse(annotation.file).name;
}
function validateAnnotation(annotation, blocks) {
  const errors = validateSchema(goldenSchema, annotation);
  if (errors.length) throw new Error(`Invalid annotation: ${errors.join('; ')}`);
  const document = documentName(annotation);
  const seen = new Set(); const ids = new Set(blocks.map((b) => b.id));
  const normalized = annotation.criteria.map((c) => {
    if (!getCriterion(c.criterionId) || seen.has(c.criterionId)) throw new Error(`Unknown or duplicate criterion: ${c.criterionId}`);
    seen.add(c.criterionId);
    if (c.verdict !== 'issue') return { criterionId: c.criterionId, verdict: c.verdict, issues: [] };
    if (!c.evidence?.length) throw new Error(`Missing annotation evidence: ${c.criterionId}`);
    const missingSection = c.evidence.includes('document-level');
    let evidenceBlockIds = c.evidenceBlockIds;
    if (!evidenceBlockIds?.length) {
      if (missingSection) evidenceBlockIds = ['document'];
      else {
        const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();
        // Для старих анотацій підтримуємо дослівні заголовки й короткі цитати.
        evidenceBlockIds = blocks.filter((b) => c.evidence.some((e) => normalize(b.text).includes(normalize(e)))).map((b) => b.id);
      }
    }
    if (!evidenceBlockIds.length || evidenceBlockIds.some((id) => !ids.has(id) && !(id === 'document' && missingSection && ABSENCE_CRITERIA.has(c.criterionId)))) throw new Error(`Invalid annotation evidence: ${c.criterionId}; supply evidenceBlockIds`);
    return { criterionId: c.criterionId, verdict: c.verdict, issues: [{ evidenceBlockIds, missingSection }] };
  });
  if (seen.size !== criteria.length) throw new Error('Annotation must cover every rubric criterion');
  return { document, criteria: normalized };
}
async function main(args = process.argv.slice(2)) {
  const config = parseArgs(args);
  if (config.mock) require('./mock').installMock();
  else require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
  const { runReview, PROMPT_VERSION } = require('../services/ai/review');
  const files = fs.readdirSync(config.golden).filter((name) => name.endsWith('.annotation.json')).sort();
  if (!files.length) throw new Error('No *.annotation.json files found');
  const documents = []; const skipped = []; const seen = new Set();
  for (const filename of files) {
    const annotation = JSON.parse(fs.readFileSync(path.join(config.golden, filename), 'utf8'));
    const name = documentName(annotation);
    const docPath = path.join(config.docs, `${name}.blocks.json`);
    if (!fs.existsSync(docPath)) { skipped.push({ annotation: filename, reason: 'No matching blocks JSON' }); continue; }
    if (seen.has(name)) throw new Error(`Duplicate document: ${name}`);
    seen.add(name);
    const input = JSON.parse(fs.readFileSync(docPath, 'utf8'));
    const blocks = Array.isArray(input) ? input : input.blocks;
    if (!Array.isArray(blocks)) throw new Error(`Missing blocks: ${name}`);
    const normalized = validateAnnotation(annotation, blocks);
    const review = await runReview({ blocks, meta: input.meta || {} });
    documents.push({ ...measureDocument(review.findings, normalized, blocks), findings: review.findings, stats: review.stats });
  }
  if (!documents.length) throw new Error('No matching annotated documents found');
  const summary = aggregate(documents);
  console.table(Object.entries(summary.byCriterion).map(([criterionId, c]) => ({ criterionId, ...c })));
  console.table([{ documents: summary.documents, findings: summary.findingsCount, meanFindings: summary.meanFindings,
    duplicateRate: summary.duplicateRate, evidenceValidityRate: summary.evidenceValidityRate }]);
  if (skipped.length) console.log(`Skipped ${skipped.length} annotations without matching documents.`);
  const result = { promptVersion: PROMPT_VERSION, mock: config.mock, createdAt: new Date().toISOString(), summary, documents, skipped };
  fs.writeFileSync(config.output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Results: ${config.output}`);
  return result;
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main, parseArgs, validateAnnotation, documentName };
