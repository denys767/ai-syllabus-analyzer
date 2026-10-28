const User = require('../../models/User');
const validator = require('validator');
const crm = require('./crm');
const { httpError } = require('../../utils/httpError');
const { deepEqual } = require('../syllabusState/paths');

const TEXT_FIELDS = ['name', 'position', 'email', 'officeHours', 'assistants'];
const LIST_FIELDS = ['expertise', 'education', 'experience'];
const PROFILE_FIELDS = [...TEXT_FIELDS, ...LIST_FIELDS];

function profileValues(profile = {}) {
  return Object.fromEntries(PROFILE_FIELDS.map((key) => [key, profile[key] ?? (LIST_FIELDS.includes(key) ? [] : '')]));
}

function warningsFor(profile) {
  const count = profile.expertise.length;
  return count < 3 || count > 6 ? ['Areas of Expertise should ideally contain 3–6 items.'] : [];
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'A lecturer profile object is required', { code: 'VALIDATION_ERROR' });
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (!PROFILE_FIELDS.includes(key)) throw httpError(400, `Unknown or read-only profile field: ${key}`, { code: 'VALIDATION_ERROR' });
    if (LIST_FIELDS.includes(key)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw httpError(400, `${key} must be an array of strings`, { code: 'VALIDATION_ERROR' });
      patch[key] = value.map((item) => item.trim()).filter(Boolean);
    } else {
      if (typeof value !== 'string') throw httpError(400, `${key} must be a string`, { code: 'VALIDATION_ERROR' });
      patch[key] = value.trim();
    }
  }
  if (patch.email && !validator.isEmail(patch.email)) throw httpError(400, 'Enter a valid lecturer email address', { code: 'VALIDATION_ERROR' });
  return patch;
}

async function resolveProfile(userId) {
  const user = await User.findById(userId).select('email firstName lastName lecturerProfile').lean();
  if (!user) throw httpError(404, 'User not found', { code: 'NOT_FOUND' });
  const remote = await crm.getProfile({ userId: String(user._id), email: user.email });
  const local = user.lecturerProfile || { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email };
  const profile = {
    ...profileValues(remote || local),
    updatedAt: (remote || local).updatedAt || null,
    crmId: (remote || local).crmId || null,
  };
  return { profile, source: remote ? 'crm' : 'instructor_directed', warnings: warningsFor(profile) };
}

async function saveProfile(userId, values, { crmId = null } = {}) {
  const profile = { ...profileValues(values), crmId, updatedAt: new Date() };
  const user = await User.findByIdAndUpdate(userId, { $set: { lecturerProfile: profile } }, { new: true, runValidators: true });
  if (!user) throw httpError(404, 'User not found', { code: 'NOT_FOUND' });
  const crmWriteBack = await crm.writeBack(profile);
  return { profile: user.lecturerProfile.toObject(), source: 'instructor_directed', warnings: warningsFor(profile), crmWriteBack };
}

async function updateProfile(userId, input) {
  const patch = validateInput(input);
  const { profile } = await resolveProfile(userId);
  return saveProfile(userId, { ...profile, ...patch }, { crmId: profile.crmId });
}

function toInstructor({ profile, source }, id = 'instructor1') {
  return { id, ...profileValues(profile), crmId: profile.crmId, source, evidenceBlockIds: [] };
}

const hasInstructor = (instructor) => PROFILE_FIELDS.some((key) => Array.isArray(instructor?.[key])
  ? instructor[key].some((v) => v.trim()) : Boolean(instructor?.[key]?.trim()));

// Порівнюємо факти, а не id сутності, провенанс чи CRM-ідентифікатор, якого у файлі може не бути.
const sameProfile = (a, b) => deepEqual(profileValues(a), profileValues(b));

async function writeBackAccepted(userId, before, after) {
  if (sameProfile(before, after)) return null;
  const user = await User.findById(userId).select('lecturerProfile').lean();
  return saveProfile(userId, profileValues(after), { crmId: user?.lecturerProfile?.crmId || after?.crmId || before?.crmId || null });
}

module.exports = { resolveProfile, updateProfile, toInstructor, hasInstructor, sameProfile, writeBackAccepted };
