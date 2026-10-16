# E — Code audit: KSE AI Syllabus Analyzer (backend routes/models/middleware + frontend)

Read-only audit, `main` @ 01e8e15. Every item below was checked by reading or grepping the code; items marked **needs check** were not verified at runtime.
Out of scope (other reviewer): `backend/services/ai/*`, `workspaceService.js` (only call sites traced).

## 0. Top findings (read these first)

| # | Sev | Finding |
|---|-----|---------|
| 1 | HIGH | `sendVerificationEmail` is imported in `routes/auth.js:9` but **not exported** by `emailService.js:170-176`, so it is `undefined`. `POST /auth/create-user` (auth.js:71) and `PUT /auth/profile` email change (auth.js:238) throw a TypeError that is swallowed by try/catch. The user is saved with `isVerified:false` and no email is sent. Login blocks unverified users (auth.js:128) and `forgot-password` silently skips them (auth.js:313). **Users created via `/auth/create-user` can never log in; users who change email via `PUT /auth/profile` are locked out at next login.** The frontend uses `/cabinet/users` and `/users/email-change/*`, so the broken endpoints are not hit by the UI today. |
| 2 | HIGH | Rate-limit bypass. The global limiter skips any request with an `Authorization` header (server.js:68), and `authLimiter` keys on an **unverified** `jwt.decode(token).userId` (server.js:84-88). `POST /api/auth/login` with `Authorization: x` and a rotating fake token is therefore effectively unlimited, so there is no brute-force protection on login. |
| 3 | MED | Role is read from the JWT, not the DB. `auth` sets `req.user = decoded` (middleware/auth.js:21), so a demoted or role-changed user keeps the old role for up to 7 days (`JWT_EXPIRES_IN` default). Only `isActive` and existence are re-checked. |
| 4 | MED | Stuck `analyzing`: analysis runs in `setImmediate` with no job tracking (syllabus.js:173, 351). A server restart or crash mid-analysis leaves `status:'analyzing'` forever. The UI polls every 5 s indefinitely (ProfessorTutorWorkspace.js:221-226) and there is no re-analyze button in the UI (`api.syllabus.reanalyze` is never called). No startup sweep. |
| 5 | MED | `/api/syllabus/:id/analyze` has no guard: it can be called while already `analyzing` (parallel LLM runs overwrite each other's `recommendations`) and on a `submitted` syllabus (resets it to `analyzing`; orchestrator.js:14 replaces recommendations but does not reset Conversation, `editedText`, `revisionMarkup` or messages). |
| 6 | MED | The frontend never handles `STALE_DOC_VERSION` (grep: zero hits in `frontend/src`). CLAUDE.md says the user "is offered re-analyze", but the UI has no such action, so a stale doc is a dead end. |
| 7 | MED | Multer errors are not handled. `upload.single` runs as middleware, so file-type / size errors go to the global handler (server.js:215-221), which always returns 500 "Something went wrong!". The `LIMIT_FILE_SIZE` branch at syllabus.js:195 is **unreachable** (verified by the middleware order). Same for malformed JSON (500 instead of 400) and the policies upload (policies.js:93-97). |
| 8 | MED | Policy `version` never increments: policies.js:198 assigns `policy.content = content`, then line 221 checks `content !== policy.content`, which is always false. Re-acknowledgement is also impossible, because `isAcknowledgedBy` (models/Policy.js:80) ignores version and `/acknowledge` rejects with 400 (policies.js:273). Policies are not consumed by the AI pipeline either (no `models/Policy` require outside routes/policies.js). |
| 9 | MED | Deleting a syllabus or user leaves orphans. `DELETE /syllabus/:id` (syllabus.js:278-295) removes only the Syllabus and its files; `Conversation` and `Message` documents are never deleted (grep: no `Conversation.delete*`). `DELETE /users/account` (users.js:157) does `Syllabus.deleteMany` **without file cleanup or Conversation/Message cleanup**, and an admin can delete the last admin account (no guard). |
| 10 | MED | Whole UI is English, but CLAUDE.md §6 requires Ukrainian UI text. Sidebar (`Chat`/`Cabinet`/`Documents`), Cabinet, Login, Register, PolicyReader, ChatInput ("Type a message..."), IssuesPanel, ProtectedRoute ("Loading..."), AuthContext errors are all English. Backend messages are mixed: Ukrainian in `users.js`/`policies.js`/parts of `auth.js`, English elsewhere (`chat.js`, `syllabus.js`, `cabinet.js`). |
| 11 | MED | `frontend/build/` is **tracked in git** (`git ls-files frontend/build` lists files) despite `.gitignore: build`. This contradicts CLAUDE.md §6 and produces hash noise. |
| 12 | MED | About 11 backend deps and 14 frontend deps are unused (§1.4). 24 backend dependency entries use `"latest"` (the frontend uses caret ranges), so builds are not reproducible without the lockfile. |

## 1. Dead code

### 1.1 Unmounted / unreachable
- `backend/routes/googleForms.js` (145 lines): **not mounted** in server.js:12-17,189-194. It calls `AIService.processSurveyResponse` (line 23), which does not exist in `services/ai/index.js` exports, so it would crash if mounted. Delete. Related env vars `GF_WEBHOOK_SECRET` and `BACKEND_URL` in `example.env:55-56` are used only here (CLAUDE.md §7 also lists `GF_WEBHOOK_SECRET`).
- `backend/services/pdfService.js`: empty (0 lines); `grep` finds no require. Delete.
- `backend/services/aiService.js`: one-line shim `module.exports = require('./ai')`. Used by `routes/syllabus.js:17`, `routes/cabinet.js:137`, `workspaceService.js:6`. It can be deleted by switching the three requires to `./ai` (the `routes/googleForms.js` import goes away with the file).
- `frontend/src/components/Auth/Register.js` (332 lines): not imported anywhere and no route. `AuthContext.register` (AuthContext.js:128) is a stub that always returns "Public registration is disabled". `api.auth.register` (api.js:146) posts to `/auth/register`, which **does not exist** in the backend.
- `frontend/src/theme.js` (202 lines): not imported (grep for `from '.*theme'` returns nothing; ThemeContext has its own theme). **needs check** whether ThemeContext inlines its own palette; the import search was negative.
- `POST /auth/resend-verification` (auth.js:353-362): returns a static message and does nothing ("legacy compatibility"). Only `VerifyEmail.js:35` calls it.
- `previewIssueChange` (workspaceService.js:~530-544, exported at :685) and `aiService.renderIssuePreviewPdf` (ai/index.js:40): no route calls them (chat.js uses `previewIssueChangeText`). Dead PDF path; it also writes `preview_<ts>.pdf` files that are never cleaned.
- `aiService` exports that nothing outside `services/ai/` uses: `analyzeAgainstStandards`, `generateEditsForRecs`, `getEditableSyllabusText`, `buildAcceptedState`, `buildSingleRecPreviewMarkup`, `serializeIssueContext`, `getCategoryLabel`, `renderRevisionPdfFromMarkup` (grep in routes/ and workspaceService.js: 0 hits). Hand to the ai/* reviewer.
- `middleware/auth.js`: `requireVerification` (line 77) is never used (grep: only defined and exported). `authorize` is used only in `policies.js` (`authorize('admin')`) while every other route uses `admin` from `roles.js`/`auth.js`; two ways to say the same thing.
- `User.openSyllabusIds` (models/User.js:33): never read or written (grep: 0 hits).

### 1.2 Models never queried or written
- `models/Survey.js` (108 lines), `models/StudentCluster.js` (123 lines): not required anywhere (only a commented-out import in users.js:6). Deferred ТЗ features (CLAUDE.md §8). Delete or park.
- `models/PracticalIdea.js` (65 lines): only used in `users.js:160` for `PracticalIdea.deleteMany` on account deletion. Nothing ever creates one.

### 1.3 Unused schema fields
- `Syllabus.vectorEmbedding` (Syllabus.js:314): never written; only excluded in a `.select` (syllabus.js:218).
- `Syllabus.modifiedFile`, `Syllabus.editedPdf` (Syllabus.js:156-171): never written. Referenced only in `cleanupFiles` / the cleanup-uploads route.
- `Syllabus.editingError` (line 320): never read or written. `editingStatus` is only ever set to `'ready'` (workspaceService.js:347, 481); the `idle/processing/error` states and the `default:'idle'` are effectively dead.
- `Syllabus.version` (line 328): no reader (the document version is the sha1 in lineDoc). Policy `version` is a different field and is live.
- `Syllabus.analysis.studentClusterAnalysis` (215-228), `analysis.templateCompliance.recommendations`, `analysis.learningObjectivesAlignment.recommendations`: never written. All of `analysis.*` and `structure.*` are **write-only** (orchestrator.js:17-34); no backend or frontend code reads them except `analysis.error`, which is not even in the schema (it is written as `'analysis.error'` at syllabus.js:180, 358 and read at :270; with strict mode it is silently dropped). **needs check at runtime**, but the schema has no `analysis.error` path.
- Orchestrator also writes `plagiarismCheck.overallSimilarity/skipped/reason` (orchestrator.js:30-32), which are not in the schema (schema has only `similarSyllabi` and `riskLevel`), so they are stripped.
- `User.lastLogin`: written (auth.js:135) and exposed, but never displayed in the frontend (grep). `avatarUrl` is live (Profile.js, Header.js), but it is a free URL with no validation (auth.js:196-198), so the profile can point to any external image.
- `Syllabus.recommendations[].decidedVia` enum `admin-override` is never set (only `chat`/null: workspaceService.js:228, 342, 351, 417).
- `User.settings.language` (`uk`/`en`): written by `PUT /users/settings`, but the frontend never sends or reads it (only `theme`: Settings.js:17, ThemeContext.js:38-47).

### 1.4 Unused npm dependencies (grep for `require`/`import`)
**backend/package.json** (zero hits in `backend/**/*.js`, excluding node_modules):
`adm-zip`, `csv-parser`, `csv-writer`, `exceljs`, `moment`, `natural`, `pdfkit`, `mongodb-memory-server`, `docx` (optionalDependency), `jest`, `supertest` (no tests exist), `nodemon` is used only through the `dev` script (keep).
Used: bcryptjs, cors, diff-match-patch, dotenv, express, express-rate-limit, express-validator, helmet, jsonwebtoken, mammoth, markdown-it, mongoose, multer, nodemailer, openai, pdf-parse, puppeteer.
Scripts `update`, `check-updates`, `clean` are noise; `keywords` mention `gpt-4`.

**frontend/package.json** (zero imports in `frontend/src`):
`@mui/x-charts`, `@mui/x-data-grid`, `@tanstack/react-query-devtools`, `@testing-library/*` (3 packages, no tests), `date-fns`, `formik`, `lodash`, `@types/lodash`, `react-helmet-async`, `recharts`, `web-vitals`, `yup`, `prettier` (dev; keep if wanted).
`@tanstack/react-query`: imported only in `index.js` for `QueryClientProvider`; **no** `useQuery`/`useMutation` anywhere, so it is effectively dead as well.
`react-dropzone` (1 file, EmptyState), `react-toastify` (only `<ToastContainer>` in index.js; **no `toast()` call anywhere**, so it is dead). Keep: axios, react-markdown, remark-gfm, MUI core/icons, emotion, react-router-dom.

### 1.5 Unused frontend API methods (`services/api.js`)
Never called: `auth.register`, `auth.resendVerification` (only via dead flow), `user.getStats` (and its backend `GET /users/stats`), `syllabus.getMySyllabi` (and backend `GET /syllabus/my-syllabi`), `syllabus.getSyllabusStatus` (and `GET /syllabus/:id/status`), `syllabus.update` (and `PUT /syllabus/:id`), `syllabus.reanalyze`, `policies.getPolicy`, `policies.getStatus` / `GET /policies/:id/status`, `policies.update` (**needs check**: `PolicyReader.js` has create/delete only), `cabinet.deleteSyllabus` (Cabinet uses `api.syllabus.deleteSyllabus`), generic `get/post/put/delete` (only `api.put('/users/settings')` at Settings.js:17, which duplicates `api.user.updateSettings`; ThemeContext uses the latter, so it is duplicated).
Comments "Phase 2/Phase 6 will populate…" (api.js:185, 203) are stale.

### 1.6 Manager role leftovers
Code is clean: `grep -ri manager` over backend/frontend/README/instructions.txt finds only `CLAUDE.md` and `scripts/migrate-v2.js` (intentional demotion). No remaining `managedProgramIds`.

### 1.7 `example.env`
- Unused: `GF_WEBHOOK_SECRET`, `BACKEND_URL` (googleForms only), `ADMIN_FIRST_NAME`/`ADMIN_LAST_NAME` are used (server.js:176-177). `KEEP_ALIVE_TIMEOUT_MS` and `TRUST_PROXY` are used. `EMAIL_FROM` is used. `MAX_FILE_SIZE` is used for syllabi only (policies hard-code 10 MB, policies.js:31).
- Missing from example.env but read in code: `PUPPETEER_EXECUTABLE_PATH` is present; `JWT_EXPIRES_IN` present. OK.
- `JWT_SECRET=change_me_strong_password` and `ADMIN_PASSWORD=ChangeMe123!` are weak sample defaults, and nothing in code refuses to start with them.

### 1.8 Misc
- `scripts/migrate-v2.js:17` loads `.env` from `path.join(__dirname,'..','backend','.env')`: fine. Idempotent per its header. Keep until all DBs have migrated, then delete.
- `stop-ports.js` + root `package.json`: dev utility, 119 lines with Windows branches. Keep or replace with `npx kill-port`. Low value.
- `instructions.txt` (ТЗ) and `README.md` fine. `.claude/settings.local.json` is tracked (contains local permissions; **needs check** whether it should be ignored).

## 2. Roles & access control

Roles: only `instructor`, `admin` (`User.role` enum, models/User.js:30). Default route: admin → `/cabinet`, others → `/workspace` (App.js:39).

| Place | Check |
|---|---|
| `middleware/auth.js` `auth` | JWT verify + user exists + `isActive`; role comes from the **token** (finding 3) |
| `admin` (roles.js:1) | `req.user.role !== 'admin'`; used in cabinet.js, auth.js:12, syllabus.js:395 |
| `authorize('admin')` | policies.js:95,164,241 only; logs the full `req.user` on every call (auth.js:57-62, noisy) |
| `requireVerification` | **never used** |
| syllabus.js `isOwnerOrAdmin` | `/:id` GET, `/:id/status`, DELETE, PUT, `/:id/analyze`, `/:id/download` all check it. **The CLAUDE.md §8 gap is closed**: `/status` and `/download` do check ownership (syllabus.js:267, 377). `/my-syllabi` filters by instructor. |
| chat.js `gateRead`/`gateMutate` | owner-or-admin read; owner-only mutation. Correct and consistent. `isOwner` here and `getOwnerId` in syllabus.js are duplicated helpers (a third copy in `Cabinet.js:126`). |
| cabinet.js | `/programs` GET open to any authenticated user (needed by the upload form); metrics/syllabi branch on `role === 'instructor'` (cabinet.js:291, 313); anything that is not exactly `instructor` sees **all** syllabi. Safe today with 2 roles but fragile. Use `role !== 'admin'`. |

### Inconsistencies
1. **Admin can edit/analyze/delete another user's syllabus** (`isOwnerOrAdmin` for PUT/analyze/delete) while chat is owner-only for mutations. Admin re-analyze wipes the instructor's decisions (finding 5). Consider restricting `analyze` to owner, or at least blocking it when `submitted`.
2. **Two user-creation endpoints**: `POST /auth/create-user` (admin sets a password, verification email broken, finding 1) vs `POST /cabinet/users` (random password + 24 h invitation token via `sendInvitationEmail`; the UI uses this one). Delete `/auth/create-user`.
3. **Two email-change flows**: `PUT /auth/profile` with `email` (immediate change, `isVerified=false`, no re-auth, broken mail) vs `POST /users/email-change/request|confirm` (correct, token to the new address). The profile form should drop `email` from the PUT, and the backend should ignore/reject it.
4. **Overlapping "me" endpoints**: `GET /users/stats` ≈ `GET /cabinet/metrics` (the latter is used); `/auth/profile` vs `/users/settings` vs `/users/change-password` are split across two routers (`auth.js` and `users.js`) with no clear rule. `users.js` is "self-service account", `cabinet.js` is "admin"; the name is misleading. Rename or merge into `account.js`.
5. **Duplicate list endpoints**: `GET /syllabus/my-syllabi` (unused) vs `GET /cabinet/syllabi` (used by both roles, role-filtered). Delete `my-syllabi`.
6. `reset-password` handler (auth.js:365-408) defines validators but **never calls `validationResult`**, so the min-length check relies on the Mongoose schema and surfaces as a 500. The same applies to `verify-email` and `forgot-password`.
7. Cabinet `GET /users` projection (cabinet.js:411) excludes `emailChangeExpires`, which does not exist (the field is `emailChangeTokenExpires`), and does **not** exclude `verificationToken`; it is returned to the admin client. Low impact (admin only) but sloppy.
8. `POST /cabinet/users` (cabinet.js:423-456): `role` is not validated (invalid → Mongoose enum error → 500 with `err.message`), email is not format-validated, there is no length check and no `express-validator`.
9. `/cabinet/users` and `/cabinet/syllabi` accept `limit` without an upper bound (`Number(limit)`), so `limit=1000000` is possible; `new ObjectId(program)` on a bad id throws → 500.
10. `/api/auth/logout` is a no-op (fine for stateless JWT); there is no token revocation on password change/reset/deactivation beyond `isActive`.

### Do we need self-registration / email verification?
- **Self-registration: no.** It is already disabled (no backend route, stub in AuthContext). Delete `Register.js`, `AuthContext.register`, `api.auth.register`, README mentions (**needs check** of README wording).
- **Email verification: effectively no.** The only account source is admin invitation (`/cabinet/users`), and `/auth/reset-password` already sets `isVerified=true` on first password set (auth.js:387-395). The verification-token flow (`verificationToken`, `/verify-email`, `/resend-verification`, `VerifyEmail.js`, `requireVerification`, `isVerified` gate in login/forgot/change-password) is dead or harmful (it is what locks users out in finding 1). Recommended: drop `isVerified`/`verificationToken` entirely, treat "has set a password" as active (`isActive`), and let admin re-send an invitation. Minimal step: remove only `verify-email`, `resend-verification`, and the `isVerified` checks.
- Keep: invitation + forgot/reset-password, email-change confirmation, admin-created users, `isActive` (but there is no admin UI/endpoint to deactivate a user; **only** password reset or DB edits. Consider adding `PATCH /cabinet/users/:id` for `isActive`/role).

## 3. Logic bugs & architecture

| Sev | Issue | Evidence | Fix |
|---|---|---|---|
| HIGH | Broken `sendVerificationEmail` (see #1) | auth.js:9,71,238; emailService.js:170 | Remove the endpoints/flow, or export the function |
| HIGH | Rate-limit bypass (see #2) | server.js:63-91 | Skip the global limiter only after verifying the token, or key on IP for `/api/auth/*` with its own strict limiter (e.g. 10/15 min on login/forgot/reset) |
| MED | No JWT secret guard: `JWT_SECRET` undefined → `jwt.sign/verify` throw → every auth route returns 500; there is no fail-fast at boot. (Not an insecure fallback: good, no default secret exists.) | server.js (no check), auth.js:139-147 | At startup `if (!process.env.JWT_SECRET \|\| ...) process.exit(1)`; also check `OPENAI_API_KEY`, `MONGODB_URI` in production |
| MED | `dotenv.config()` runs after `require('./models/User')` (server.js:8-9). Harmless today (models read no env at load) but fragile. | server.js:8-9 | Move to line 1 |
| MED | `uncaughtException` handler swallows the error and keeps running; the `process.exit` is commented out | server.js:30-36 | Log and exit in production (let the process manager restart) |
| MED | Request body limit **50 MB** for JSON and urlencoded | server.js:94-95 | 1 MB is enough (uploads use multer) |
| MED | CORS: `origin` callback returns `callback(null, allowedOrigins.includes(origin))` and allows requests with no Origin. Hard-coded localhost origins are always allowed, even in production. Credentials are enabled but auth is via the Bearer header, not cookies, so low real risk. | server.js:46-58 | Drop `localhost`/`127.0.0.1` when `NODE_ENV=production`; `credentials:false` |
| MED | Global error handler always answers 500 and ignores `err.status`/`err.statusCode` (multer, body-parser, JSON syntax errors). It also leaks `err.message` in development only (fine). | server.js:215-221 | `res.status(err.statusCode \|\| err.status \|\| 500)`; map `LIMIT_FILE_SIZE` → 413, multer fileFilter errors → 400 |
| MED | File filter checks the extension only, but text extraction branches on the **client-supplied mimetype** (syllabus.js:86, 104). A `.docx` sent as `application/octet-stream` passes the filter then fails with a generic 500. `.doc` (legacy binary) is accepted but **mammoth cannot read legacy .doc**, so it always fails (**needs check** with a sample, mammoth documents DOCX only). | syllabus.js:62-70, 83-115 | Decide the format by extension (or magic bytes); drop `.doc` or convert; return 400/415 on unsupported |
| MED | Upload file is saved before validation; on `extractTextFromFile` throwing (syllabus.js:143) the outer catch does `unlink` (ok). On success, files are kept forever in `uploads/syllabi`: after analysis the original is only needed for `/download` and re-analysis. | syllabus.js:143-171 | Keep, but add retention or delete on syllabus delete (already done) |
| MED | `uploads/pdfs` is never cleaned: per-issue `preview_<ts>.pdf` (finalRender.js:81), `syllabus_<id>_<ts>.pdf` (finalRender.js:49, used for final preview), and re-rendered submissions. The cleanup route only scans `uploads/syllabi` (syllabus.js:397) while `previewPdf`/`submittedPdfPath` live in `uploads/pdfs`. | finalRender.js:47-81; syllabus.js:394-422 | Cron/sweeper on `uploads/pdfs` older than N days that are not `submittedPdfPath`/`previewPdf` |
| MED | Cleanup route race: it deletes any file in `uploads/syllabi` not referenced by a Syllabus; a file uploaded a moment ago (saved by multer, Syllabus not yet saved) is deleted. | syllabus.js:411-416 | Skip files younger than e.g. 10 min |
| MED | Timeouts: default 20 s (`REQUEST_TIMEOUT_MS`) applies to everything outside `/api/chat`. `POST /cabinet/syllabi/:id/resend-submission` renders a PDF with Puppeteer (cold launch, no timeout) and sends mail; it can hit the 20 s 504 (**needs check** under load). After `res.setTimeout` fires and sends 504, the handler keeps running and later `res.json` throws "headers already sent". Also only `/api/chat` is in `LONG_RUNNING_PATHS` (server.js:24). | server.js:107-113; cabinet.js:352-399 | Add `/api/cabinet/syllabi` to long-running paths, or move PDF/email to the background with status |
| MED | Frontend axios timeout is 30 s globally (api.js:92) but `chat.start`/`confirm`/`cancel`/`message` can call the LLM (server allows 130 s) and have no override; only `preview` and `issuePreview` get 60 s. The client may time out while the server keeps working and then double-submit. | api.js:92, 186-201; chat.js | Per-call `timeout: 130000` for `start/confirm/cancel/reopen/message/submit` |
| MED | Puppeteer launched per render with `--no-sandbox`, no concurrency limit and no timeout | finalRender.js:129-133 (other reviewer, but affects routes) | Reuse a browser or a semaphore + timeouts |
| LOW | Policies: `isActive` from `req.query` is a string; any user can pass `?isActive=false` to list inactive policies | policies.js:46-47 | Admin-only for inactive |
| LOW | Policy file upload type check is extension-only, and the attached file is served with `res.download`; fine, no path traversal (paths come from the DB, set server-side). | policies.js:32-41 | — |
| LOW | Path traversal: **none found.** Download/delete use `originalFile.path` stored by multer; the cleanup route uses `path.basename`. `path.extname(file.originalname)` in the stored name is limited by the allow-list filter. | syllabus.js:51-54, 381-387 | — |
| LOW | `PUT /users/settings` has no validation (`language` enum / `theme` enum → Mongoose error → 500) | users.js:48-76 | express-validator `isIn` |
| LOW | `PUT /auth/profile` `avatarUrl` unvalidated (any string/URL) and `email` is not normalised | auth.js:196-202 | `isURL`, or drop the field |
| LOW | Email/User regex `(\.\w{2,3})+` rejects valid TLDs longer than 3 chars (`.academy`, `.info`, `.digital`) in `User.email`, `pendingEmail` and `Program.academicDirectorEmail` | User.js:11, 51; Program.js:21 | Use `validator.isEmail` |
| LOW | Reset/verification/email-change tokens are stored in plaintext (`resetPasswordToken` etc.) and looked up directly | auth.js:269, 376; users.js:236 | Store a SHA-256 of the token |
| LOW | `forgot-password` logs the e-mail and error details at several levels; auth middleware logs every request, `authorize` prints the whole `req.user` | auth.js:301-338; middleware/auth.js:57-62 | Remove or use a logger with levels |
| LOW | `Program` delete does not check for syllabi referencing it (dangling `programId`, `populate` returns null; Cabinet shows '—'); `PUT /programs/:id` cannot change `code` (OK) and errors surface as 500 with `err.message` | cabinet.js:276-284 | 409 when referenced |
| LOW | `cabinet.js` uses inline `require` inside the handler (`fs`, `path`, `emailService`, `aiService`) and sync fs (`readFileSync`/`mkdirSync`) | cabinet.js:137-156 | Move to the top, use `fs.promises` |
| LOW | `POST /cabinet/.../resend-submission` never sets `submissionEmailStatus:'failed'` on error (500 only) and does not update `submittedAt`; `submittedPdfPath` may exist but contain a stale PDF | cabinet.js:352-399 | Mirror `submitSyllabus` behaviour |
| LOW | `Syllabus.year` validator allows only 2020–2030 (syllabus.js:123, 304) | | Make dynamic |
| LOW | `userRoutes /email-change/confirm` leaves `isVerified` unchanged and `pendingEmail` uniqueness is racy (no unique index on `pendingEmail`); two users can request the same new address. Final check at confirm time (users.js:246) mitigates it. | users.js | — |

### Status enums (backend vs frontend)
- Backend `Syllabus.status`: `analyzing | in_progress | submitted | error` (Syllabus.js:324-326). Frontend `Cabinet.js:62-63` covers the same four, but **labels `analyzing` as "Draft"**, which is misleading (the syllabus is being analysed). `editingStatus` is never read by the frontend (**needs check**: grep shows no usage in `frontend/src`).
- `Conversation.status` includes `abandoned`, which is never set (grep; **needs check** in workspaceService). The legacy statuses (`processing`, `analyzed`, `reviewed`, `approved`) exist only in `migrate-v2.js`.
- `/syllabus/my-syllabi?status=` and cabinet `status` filters are passed straight into the query without enum validation (low).

### Mongo indexes
- Present: `User.role`, `Syllabus {instructor,createdAt}`, `{course.code,course.year}`, `{status}`, `{programId,status}`, `Message {conversationId,createdAt}`, `Conversation.syllabusId` (unique), Program.code (unique), Policy indexes.
- Redundant/unused: `Syllabus {status}` is covered by `{programId,status}` only partially (keep). `{course.code, course.year}` is not used by any query (grep) → drop. `Conversation.syllabusId` is declared both `unique:true` and `index:true` (Conversation.js:15-16); duplicate index warning in Mongoose, drop `index:true`.
- Missing: Cabinet sorts by `updatedAt` for admin (`/cabinet/syllabi`, cabinet.js:323) but there is no `updatedAt` index (admin sees all docs → collection scan + sort). Add `{updatedAt:-1}` or `{programId:1, updatedAt:-1}`. `Syllabus.submittedAt` not indexed (not queried).
- `autoIndex` is off in production (server.js:131): good, but there is no migration step that builds indexes; first prod deploy has none (**needs check** how prod is deployed).
- Payload size: `/cabinet/syllabi` returns **full documents** (`extractedText`, `editedText`, `revisionMarkup`, all recommendations with `beforeAfter` payloads) ×20 per page (cabinet.js:322-329, `toObject`). `/syllabus/my-syllabi` excludes only `extractedText`/`vectorEmbedding`. Add a `.select()` projection (keep only meta + counts); `getIssueCounts(plain)` needs only `recommendations.decision/priority/…`. `GET /syllabus/:id` returns the full document too (needed by the workspace, but it includes `extractedText` + `editedText` + `revisionMarkup`; the workspace refetches it after every confirm/cancel/reopen/submit: ProfessorTutorWorkspace.js:256, 273, 300, 355).

### Dependencies
- Backend: 24 `"latest"` ranges (`bcryptjs`, `cors`, `dotenv`, `express-validator`, `helmet`, `jsonwebtoken`, `mammoth`, `moment`, `mongoose`, `multer`, `natural`, `nodemailer`, `openai`, `pdf-parse`, `puppeteer`, jest, nodemon, supertest, etc.). The lockfile `backend/package-lock.json` exists, so `npm ci` is reproducible; but `npm run clean` (package.json) deletes the lockfile and `update` runs `npm update`. `pdf-parse@latest` changed API (hence the dual `PdfParseClass` fallback in syllabus.js:5-11), a symptom. Pin majors (`^x`) for everything that is kept.
- Frontend uses caret ranges (0 `latest`), `react-scripts@5.0.1` (CRA is deprecated/unmaintained; low urgency).
- Express 4 with `app.options('*')` / `app.use('*')` is fine on v4 (would break on v5).

## 4. Frontend

- **Large components** (lines): `MessageBubble.js` 614, `ProfessorTutorWorkspace.js` 519, `Cabinet.js` 510 (3 tab components + metrics in one file), `PolicyReader.js` 490 (list + upload dialog + delete dialog + reader), `Register.js` 332 (dead). Suggested splits: Cabinet → `SyllabiTab`, `UsersTab`, `ProgramsTab` files; MessageBubble → one file per `kind` (before-after, choice, case-cards, submission-cta); workspace → a `useWorkspace(syllabusId)` hook for the ~12 handlers.
- **Duplicate API calls**: after each of confirm/cancel/reopen/submit the workspace issues a second request, `getSyllabus` (full document), to refresh the side panel (ProfessorTutorWorkspace.js:252-256, 270-273, 297-300, 352-355). Return the needed fields from the chat view endpoints (they already call `getConversationView`) or fetch only issue counts.
- **React Query unused**: `QueryClientProvider` is mounted but nothing uses it; all fetching is hand-rolled `useEffect` + axios. Either adopt it (removes most of the loading/error state) or remove the dependency.
- **State/behaviour bugs**
  - Polling `analyzing` forever with no cap/timeout; a restart-orphaned syllabus spins indefinitely (finding 4).
  - `ProtectedRoute requiredRoles={['admin','instructor']}` on `/cabinet` (App.js:67) is a no-op (all roles).
  - 401 handler (api.js:115-118) removes the token and fires `auth_logout`, but a 401 on `/auth/profile` during init is also handled in AuthContext (both paths); harmless.
  - `Content-Type: application/json` default plus explicit `multipart/form-data` without boundary on policies (api.js:222, 226) and syllabus upload (api.js:174): axios fixes the boundary for FormData in browsers, so OK, but the explicit header is unneeded.
  - `Login.js:50-62` `console.log`s attempts and error details (the password is masked); remove.
  - Token in `localStorage` (XSS-exposed; acceptable for this internal tool, noted).
  - Routes `/verify-email` and the whole verification UI are unnecessary (§2).
  - `api.setAuthToken` plus the request interceptor both set the header; redundant.
- **i18n**: the UI is English (finding 10). Examples: Sidebar.js:58-78 (`Chat`, `Cabinet`, `Documents`, `Admin`, `Instructor`), Header.js:162-163, Login.js:131-183, Cabinet.js:63, 176-236, PolicyReader.js (many), ChatInput.js:28, IssuesPanel.js:38, 97, EmptyState.js:56-182, ResetPassword.js:78-94, ProtectedRoute.js:24. No i18n layer exists; the quickest way to comply with CLAUDE.md is a single `uk.js` strings file, or a direct translation of the ~200 literals. `User.settings.language` (`uk|en`) is unused (§1.3).
- **Unused routes/pages**: `Register` (not routed), `/verify-email` (dead flow). `ConfirmEmailChange` and `/reset-password` are live. `PoliciesPage` is a 15-line wrapper around `PolicyReader`.
- **Error handling**: most catch blocks show a generic English message; the 429 retry in api.js retries up to 3× with a max 5 s backoff, including **POST** submit/confirm (non-idempotent endpoints; server-side `Already submitted` 409 protects submit, but a retried free-chat message duplicates the user message). Restrict retries to GET/idempotent calls.

## 5. Delete list (safe to remove)

**Files**
- `backend/routes/googleForms.js` (+ `GF_WEBHOOK_SECRET`, `BACKEND_URL` from `example.env`/CLAUDE.md §7)
- `backend/services/pdfService.js` (empty)
- `backend/services/aiService.js` (after pointing 3 requires to `./ai`)
- `backend/models/Survey.js`, `backend/models/StudentCluster.js` (or move to an `archive/` branch)
- `backend/models/PracticalIdea.js` (+ the `deleteMany` in users.js:7-8, 159-160)
- `frontend/src/components/Auth/Register.js`
- `frontend/src/theme.js` (**verify** first, §1.1)
- `frontend/src/components/Auth/VerifyEmail.js` and its route, if verification is dropped
- `frontend/build/**` from git (`git rm -r --cached frontend/build`)

**Endpoints/functions**
- `POST /auth/create-user`, `POST /auth/resend-verification`, `POST /auth/verify-email` (if dropping verification), email field handling in `PUT /auth/profile`
- `GET /syllabus/my-syllabi`, `GET /syllabus/:id/status` (frontend never calls it; but note it is the only cheap polling endpoint, so if you want server-side polling, use it instead of `GET /:id`), `GET /users/stats`, `GET /policies/:id/status` (**needs check** with PolicyReader)
- `middleware/auth.js`: `requireVerification`; consolidate `authorize` vs `admin`
- `workspaceService.previewIssueChange` + `aiService.renderIssuePreviewPdf` (dead PDF path)
- `AuthContext.register`, `api.auth.register`, unused `api.*` methods (§1.5), stale "Phase N" comments

**Dependencies**
- backend: `adm-zip`, `csv-parser`, `csv-writer`, `exceljs`, `moment`, `natural`, `pdfkit`, `docx`, `mongodb-memory-server`, `jest`, `supertest` (re-add when tests are written)
- frontend: `@mui/x-charts`, `@mui/x-data-grid`, `@tanstack/react-query-devtools`, `@testing-library/*`, `date-fns`, `formik`, `lodash`, `@types/lodash`, `react-helmet-async`, `recharts`, `web-vitals`, `yup`; also `react-toastify` and `@tanstack/react-query` unless adopted
- Schema fields: `Syllabus.vectorEmbedding`, `modifiedFile`, `editedPdf`, `editingError`, `version`, `analysis.studentClusterAnalysis`, `User.openSyllabusIds`, `User.settings.language` (+ keep a migration `$unset` in `migrate-v2.js` or a new script)

## 6. Keep but fix

1. **Rate limiting** (server.js:63-91): per-IP strict limiter on `/api/auth/login|forgot-password|reset-password`; never trust `jwt.decode` for keys.
2. **Role from DB** in `auth` (`req.user = { userId, role: user.role, email }`) so demotion/deactivation is immediate.
3. **Analysis lifecycle**: guard `/analyze` (409 if `analyzing`/`submitted`), persist `analysisStartedAt`, run a startup sweep that sets stale `analyzing` (> `AI_REQUEST_TIMEOUT_MS`×N) to `error` with a message, add a "Повторити аналіз" button in the UI, and handle `STALE_DOC_VERSION` there. On re-analyze reset the Conversation/Messages/`editedText`/`revisionMarkup`.
4. **Cascade deletes**: on syllabus delete remove Conversation + Messages; on account delete also unlink files, remove conversations, and refuse to delete the last active admin.
5. **Error handler**: respect `err.statusCode`, map multer errors, return Ukrainian messages for the user-facing ones.
6. **Policies**: fix version bump (compare before assignment), allow re-acknowledgement when `ack.version < policy.version`, and decide whether acknowledgements matter (they gate nothing today).
7. **Cabinet projections and indexes** (§3), and the Cabinet `role !== 'admin'` filter.
8. **Frontend i18n → Ukrainian**, per-call timeouts for LLM chat endpoints, retry only idempotent calls, split big components, drop the second `getSyllabus` fetch.
9. **Startup validation** of `JWT_SECRET`, `MONGODB_URI`, `OPENAI_API_KEY`, and a warning if `ADMIN_PASSWORD` is the sample value; `dotenv` first in server.js.
10. **Dependency pinning** (`latest` → caret majors) after pruning.
11. **Uploads hygiene**: a periodic sweeper for `uploads/pdfs`, a grace period in the cleanup route.
12. CLAUDE.md §8 should be updated: the `/status` and `/download` owner-check gap is resolved (verified); add the findings about `build/` being tracked and the dead flows above.

## 7. Claims not verified (needs check)
- Whether mammoth handles legacy `.doc` (believed unsupported).
- Whether `frontend/src/theme.js` is truly unused (no import found).
- `policies.update` / `getStatus` UI usage inside `PolicyReader.js` (only create/delete/acknowledge/download/getAll seen in grep).
- Mongoose behaviour of `User.findOne({email: undefined})` in `initializeAdmin` when `ADMIN_EMAIL` is unset (server.js:160).
- Real-world 504 on `resend-submission` under cold Puppeteer.
- Whether `Conversation.status='abandoned'` is set anywhere in `workspaceService.js` (other reviewer's file).
- Whether `.claude/settings.local.json` should be tracked.
