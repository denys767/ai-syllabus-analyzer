const express = require('express');
const { auth } = require('../middleware/auth');
const Program = require('../models/Program');
const references = require('../services/references');
const { sendError } = require('../utils/httpError');

// Довідники v5 за programCode (docs/api-v5.md §6 «Довідники»)
const router = express.Router();
router.use(auth);

router.get('/programs', async (req, res) => {
  try {
    const programs = await Program.find().sort({ name: 1 }).lean();
    res.json(programs.map((p) => ({ id: p._id, code: p.code, name: p.name, editions: p.editions || [] })));
  } catch (err) {
    sendError(res, err);
  }
});

const LOADERS = {
  template: references.getTemplate,
  outcomes: references.getOutcomes,
  courses: references.getCourses,
  capstone: references.getCapstone,
};

router.get('/:programCode/:kind(template|outcomes|courses|capstone)', async (req, res) => {
  try {
    const code = await references.assertKnownProgramCode(req.params.programCode);
    const data = await LOADERS[req.params.kind](code);
    if (data == null) return sendError(res, Object.assign(new Error(`No ${req.params.kind} for ${code}`), { statusCode: 404, code: 'UNKNOWN_PROGRAM_CODE' }));
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
