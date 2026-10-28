// Затвердження розділів: окремо, гуртово і зняття. Пише лише syllabusState/store (approveSection/unapproveSection/approveAll).

const store = require('../syllabusState/store');
const { invalidateOutputs } = require('../outputs');
const { sectionGaps } = require('../syllabusState/slots');
const { runChecks } = require('../checks');
const { BLOCKING_SEVERITIES, loadContext, pendingCountsBySection, refreshConversationReadiness } = require('./state');

/**
 * Блокери гуртового затвердження: відкриті картки розділу або непройдені перевірки severity ≥ warning.
 * @returns {Promise<(key: string) => string|null>} причина (англійською) або null
 */
async function blockersBuilder(ctx) {
  const checks = runChecks(ctx.state, ctx.refs).filter((c) => c.passed === false && BLOCKING_SEVERITIES.includes(c.severity));
  const pending = await pendingCountsBySection(ctx.syllabus._id);
  return (key) => {
    const open = pending.bySection.get(key);
    if (open) return `${open} open suggestion${open > 1 ? 's' : ''}`;
    const failed = checks.filter((c) => c.section === key);
    if (failed.length) return `Open checks: ${failed.map((c) => c.id).join(', ')}`;
    return null;
  };
}

/** Розділи, які можна затвердити одним натисканням: пороги пройдені, відкритих карток і перевірок немає. */
async function approvableSections(ctx) {
  const blockerOf = await blockersBuilder(ctx);
  return (ctx.refs.template || [])
    .filter((t) => !ctx.state.sections?.[t.key]?.approved && !sectionGaps(t.key, ctx.state).length && !blockerOf(t.key))
    .map((t) => t.key);
}

async function approveSection(syllabusId, key, { userId, expectedRevision } = {}) {
  await loadContext(syllabusId);
  await store.approveSection(syllabusId, key, { by: userId, expectedRevision });
  invalidateOutputs(syllabusId);
  await refreshConversationReadiness(syllabusId);
}

async function unapproveSection(syllabusId, key, { userId, expectedRevision } = {}) {
  await loadContext(syllabusId);
  await store.unapproveSection(syllabusId, key, { by: userId, expectedRevision });
  invalidateOutputs(syllabusId);
  await refreshConversationReadiness(syllabusId);
}

/** @returns {Promise<{ approved: string[], skipped: { key, reason }[] }>} */
async function approveAll(syllabusId, { userId, expectedRevision } = {}) {
  const ctx = await loadContext(syllabusId);
  const blockersFor = await blockersBuilder(ctx);
  const { approved, skipped } = await store.approveAll(syllabusId, { blockersFor, by: userId, expectedRevision });
  invalidateOutputs(syllabusId);
  await refreshConversationReadiness(syllabusId);
  return { approved, skipped };
}

module.exports = { blockersBuilder, approvableSections, approveSection, unapproveSection, approveAll };
