const express = require('express');

const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.all('*', (req, res) => {
  return res.status(410).json({
    message: "Legacy AI Challenger endpoints were removed from the Professor's Tutor MVP.",
  });
});

module.exports = router;
