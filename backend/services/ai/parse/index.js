// Трек 2: розбір вхідного файлу по слотах (blocks → Syllabus.state). Заготовка W2 — реалізує агент G.
const { httpError } = require('../../../utils/httpError');

/**
 * @param {{ blocks: Block[], meta?, programCode, refs, course?: { title, code } }} input
 * @returns {Promise<{ state, policyMatches: Array<{ key, candidateOptionKey, match }>, warnings: string[] }>}
 *   state валідний за syllabusState/schema.validateState, source 'parsed', evidenceBlockIds заповнені
 */
async function parseToState() { throw httpError(501, 'Parser is not implemented yet', { code: 'NOT_IMPLEMENTED' }); }

module.exports = { parseToState };
