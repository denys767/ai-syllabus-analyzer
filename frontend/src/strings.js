// Ключові тексти UI (англійською, CLAUDE.md §0). Рядки окремих сторінок, які ніде не повторюються, лишаються поруч із розміткою.

export const SEVERITY = {
  critical: { label: 'Critical', color: 'error', rank: 5 },
  high: { label: 'High', color: 'warning', rank: 4 },
  medium: { label: 'Medium', color: 'primary', rank: 3 },
  warning: { label: 'Warning', color: 'warning', rank: 2 },
  low: { label: 'Low', color: 'default', rank: 1 },
  info: { label: 'Info', color: 'default', rank: 0 },
};

export const SECTION_STATUS = {
  empty: 'Empty',
  draft: 'Draft',
  approved: 'Approved',
};

export const REJECT_TAGS = [
  { value: 'already_present', label: 'Already in the text' },
  { value: 'too_generic', label: 'Too generic' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'not_relevant', label: 'Not relevant to the course' },
  { value: 'other', label: 'Other' },
];

export const REFINE_HINTS = ['Shorter', 'More specific', 'Plainer language', 'Add a Ukrainian case'];

export const ANALYSIS_STAGES = [
  { key: 'extract', label: 'Reading the file' },
  { key: 'parse', label: 'Mapping to the template' },
  { key: 'checks', label: 'Checking requirements' },
  { key: 'review', label: 'Preparing suggestions' },
  { key: 'done', label: 'Done' },
];

// «Confirm · including 48 hours» — називаємо непідтверджені значення вголос
export function confirmLabel(values = []) {
  if (!values.length) return 'Confirm';
  const shown = values.slice(0, 2).map((v) => v.value).join(', ');
  const rest = values.length - 2;
  return `Confirm · including ${shown}${rest > 0 ? ` and ${rest} more` : ''}`;
}

export const sectionsApproved = (approved, required) => `${approved} of ${required} sections approved`;

export const S = {
  appName: 'KSE Syllabus Assistant',
  // Робоче місце
  structure: 'Structure',
  chat: 'Chat',
  document: 'Document',
  downloadDocx: 'Download .docx',
  downloading: 'Preparing…',
  showChanges: 'Show changes',
  documentHint: 'Download any time. Readiness never blocks the file.',
  documentEmpty: 'The document is empty so far. Answer the questions in the chat and it will fill in here.',
  documentLoadError: 'Could not load the document.',
  readiness: 'Readiness',
  approve: 'Approve',
  unapprove: 'Unapprove',
  approveAll: 'Approve all',
  approved: 'Approved',
  skipped: 'Skipped',
  skip: 'Skip',
  whyWeAsk: 'Why I ask',
  gaps: 'Still missing',
  openIssues: 'Open checks',
  pendingDrafts: (n) => `${n} draft${n === 1 ? '' : 's'} to review`,
  loadingConversation: 'Loading the conversation…',
  thinking: 'Thinking…',
  chatPlaceholder: 'Answer the question, or tell me what to change…',
  send: 'Send',
  noMessages: 'No messages yet.',
  newSyllabus: 'New syllabus',
  untitled: 'Untitled',
  syllabus: 'Syllabus',
  // Картки
  before: 'Before',
  after: 'After',
  proposed: 'Proposed',
  changeValue: 'Change the value',
  reword: 'Reword',
  cancel: 'Cancel',
  back: 'Back',
  save: 'Save',
  gotIt: 'Got it',
  undo: 'Undo',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  sendAnswer: 'Send answer',
  yourAnswer: 'Your answer',
  writeOwn: 'Write my own',
  closestMatch: 'Closest to your current text',
  yourCurrentText: 'Your current text',
  customText: 'Your own text',
  chooseOption: 'Choose an option. There is no default.',
  chosenOption: 'Chosen',
  advisory: 'Advice, no change to the document',
  staleDraft: 'This draft was written for an older version of the section. Reword it to get a fresh one.',
  valuesHint: 'Highlighted values were suggested by AI. Check them before confirming.',
  pickValue: 'Which value do you want to change?',
  noOptions: 'No options.',
  noChangesTitle: (n) => `${n} section${n === 1 ? '' : 's'} need no changes`,
  noChangesHint: 'Approve them all at once, or open each one to check it first.',
  approveAllSkipped: 'Not approved yet:',
  question: 'Question',
  // Діалоги
  rewordTitle: 'Reword the draft',
  rewordHint: 'Tell me what to change and I will write a new version. The previous one stays in the history.',
  rewordPlaceholder: 'For example: shorter, no dates, add a Ukrainian case',
  comment: 'Comment',
  rewording: 'Rewording…',
  updateDraft: 'Update the draft',
  cancelTitle: 'Cancel this suggestion',
  cancelReasonRequired: 'Critical and high-priority suggestions can only be cancelled with a reason. It is kept in the change log.',
  cancelReasonOptional: 'A reason is optional, but it helps improve the next suggestions.',
  reason: 'Reason',
  reasonRequired: 'Reason (required)',
  // Банери
  rebuildBanner: 'This syllabus was created in the previous version. Rebuild it in the new format to keep working on it.',
  rebuild: 'Rebuild in the new format',
  readOnlyBanner: 'View only: only the owner of this syllabus can make changes.',
  legacyBanner: 'This syllabus comes from an old version of the system and is read-only. Upload the file again to work on it.',
  uploadAgain: 'Upload again',
  mocksBanner: 'Mock data (REACT_APP_USE_MOCKS=1): nothing is sent to the server.',
  // Аналіз
  analyzingTitle: 'Reading your syllabus…',
  analyzingHint: 'This can take a few minutes. You can keep the page open.',
  analysisFailed: 'Something went wrong while reading the syllabus.',
  analysisTimedOut: 'This is taking too long. Please try again.',
  retryAnalysis: 'Try again',
  analysisProgress: 'Analysis progress',
  // Вхід
  welcomeTitle: 'Let’s prepare a syllabus that meets the KSE Graduate Business School standard.',
  welcomeHint: 'Start from scratch and I will ask one question at a time, or bring a draft and I will map it to the template.',
  fromScratch: 'Start from scratch',
  fromScratchHint: 'Answer one question at a time. The document fills in as you go.',
  haveDraft: 'I have a draft',
  haveDraftHint: 'Upload your file. I map it to the KSE template and show what is missing.',
  courseTitle: 'Course title',
  courseCode: 'Course code (optional)',
  program: 'Programme',
  edition: 'Programme edition',
  selectProgram: 'Select a programme',
  noPrograms: 'No programmes available',
  loadingPrograms: 'Loading programmes',
  create: 'Create syllabus',
  creating: 'Creating…',
  uploadAndAnalyze: 'Upload and analyse',
  uploading: 'Uploading…',
  dropHere: 'Drop the syllabus here',
  dropOrClick: 'Drop your syllabus here or click to choose a file',
  fileFormats: 'DOCX, DOC, PDF · up to 10 MB',
  fileHint: 'DOCX gives the best result. The output is always a new .docx built from the KSE template.',
  // Помилки валідації форми
  errCourseTitle: 'Enter the course title.',
  errProgram: 'Select a programme.',
  errEdition: 'Select the programme edition.',
  errProgramsLoading: 'Programmes are still loading. Please wait a moment.',
  errNoPrograms: 'At least one programme is needed to create a syllabus.',
  errLoadPrograms: 'Could not load programmes.',
  errCreate: 'Could not create the syllabus.',
  errUpload: 'Could not upload the file.',
  errLoad: 'Could not load the syllabus.',
  errAction: 'Something went wrong. Please try again.',
  errDownload: 'Could not download the file.',
  errRebuild: 'Could not start the rebuild.',
  errTimeout: 'The server did not respond in time. Please try again.',
};

// Зрозумілі повідомлення для кодів 409/400 з api-v5 (повідомлення сервера — запасний варіант)
export const ERROR_MESSAGES = {
  STATE_CONFLICT: 'The syllabus changed in the meantime (another tab or action). I loaded the latest version, please try again.',
  STALE_DRAFT: 'This draft was written for an older version of the section. Reword it to get a fresh draft.',
  UNCONFIRMED_VALUES: 'Confirm or change the highlighted values first.',
  SECTION_INCOMPLETE: 'This section is not complete yet.',
  ANALYSIS_IN_PROGRESS: 'Your syllabus is still being analysed. Please wait for the analysis to finish.',
  ANSWER_REQUIRED: 'Answer the question before confirming this suggestion.',
  LOCKED: 'This part comes from the KSE template and cannot be changed.',
  NEEDS_REBUILD: 'This syllabus was created in the previous version. Rebuild it in the new format to continue.',
  REOPEN_CONFLICT: 'This change cannot be undone: the section was edited after it.',
  REASON_REQUIRED: 'Please give a reason to cancel a critical or high-priority suggestion.',
  NOT_PENDING: 'This suggestion has already been decided.',
  INVALID_PROGRAM_CODE: 'Select a valid programme edition.',
  UNSUPPORTED_FORMAT: 'This file type is not supported. Upload a .docx, .doc or .pdf file.',
  LEGACY_SYLLABUS: 'This syllabus is read-only. Upload the file again to work on it.',
  NOT_IMPLEMENTED: 'This feature is not available yet.',
};
