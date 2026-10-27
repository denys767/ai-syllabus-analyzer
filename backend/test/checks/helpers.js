// Хелпери тестів перевірок: еталонний стан Risk Management з точковими змінами і довідники з фікстур.
const { riskManagementState } = require('../fixtures/state/riskManagement');
const { loadFixtureRefs } = require('../../services/references/fixtureRefs');

/** Стан RM після зміни fn(state); programCode — редакція програми. */
function rm(fn = () => {}, { programCode = 'MBA28' } = {}) {
  const state = riskManagementState({ programCode });
  fn(state);
  return state;
}

const refs = (programCode = 'MBA28') => loadFixtureRefs(programCode);
const ids = (checks) => checks.map((c) => c.id);
const byRule = (checks, rule) => checks.filter((c) => c.details.rule === rule);
const policy = (state, key) => state.policies.find((p) => p.key === key);
const libraryText = (key, optionKey) => refs().policyLibrary.blocks.find((b) => b.key === key).options.find((o) => o.key === optionKey).text;

module.exports = { rm, refs, ids, byRule, policy, libraryText };
