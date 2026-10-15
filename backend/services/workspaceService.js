// Фасад сервісів чату (services/chat/*), outputs і submit — для маршрутів і тестів.

const view = require('./chat/view');
const flow = require('./chat/flow');
const decisions = require('./chat/decisions');
const { freeChatMessage } = require('./chat/freeChat');
const { computeReadiness } = require('./chat/readiness');
const { getOutputFile, ensureOutputs } = require('./outputs');
const { submitSyllabus, generateSubmissionReport } = require('./submission');

module.exports = {
  getConversationView: view.getConversationView,
  previewSuggestion: view.previewSuggestion,
  documentPreview: view.documentPreview,
  suggestionSlides: require('./chat/slides').suggestionSlides,
  getOrCreateConversation: flow.getOrCreateConversation,
  startConversation: flow.startConversation,
  postNextCard: flow.postNextCard,
  acceptSuggestion: decisions.acceptSuggestion,
  rejectSuggestion: decisions.rejectSuggestion,
  reopenSuggestion: decisions.reopenSuggestion,
  refineSuggestion: decisions.refineSuggestion,
  answerSuggestion: decisions.answerSuggestion,
  freeChatMessage,
  computeReadiness,
  getOutputFile,
  ensureOutputs,
  submitSyllabus,
  generateSubmissionReport,
};
