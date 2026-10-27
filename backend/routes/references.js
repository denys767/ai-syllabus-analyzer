const express = require('express');
const { auth } = require('../middleware/auth');

// Довідники v5 за programCode (docs/api-v5.md §6 «Довідники»). Реалізація — хвиля W1-B.
const router = express.Router();
router.use(auth);

module.exports = router;
