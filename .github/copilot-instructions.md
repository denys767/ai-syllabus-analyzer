# AI agent guide for this repo

Purpose: End-to-end platform to analyze MBA syllabi with OpenAI, store results in MongoDB, and surface them in a React app. Agents should keep behavior consistent with current APIs, data shapes, and logging.

## Architecture map
- Backend (Node/Express/Mongoose) in `backend/`
  - Entry: `server.js` wires middleware (helmet, CORS, rate limits, JSON size), DB, and routes under `/api/*`.
  - Routes: `routes/{auth,users,syllabus,ai,reports,admin,googleForms,clusters,policies}.js`.
  - Middleware: `middleware/auth.js` (JWT auth, role helpers), `middleware/roles.js` (admin/manager guards).
  - Services: `services/aiService.js` (OpenAI Responses API, JSON mode + web_search_preview), `emailService.js` (Gmail/SMTP).
  - Models: in `models/` (User, Syllabus, Survey/SurveyResponse, StudentCluster, PracticalIdea, Policy).
  - Uploads: stored in `backend/uploads/syllabi` with multer; large text fields omitted from some GETs.
- Frontend (React CRA) in `frontend/`
  - API wrapper: `src/services/api.js` sets `Authorization: Bearer <token>` and retries 429s.
  - Auth/Theme contexts and pages live under `src/contexts` and `src/pages`.
  - Build served separately; dev uses CRA proxy to `http://localhost:5000`.

## Data flow and key behaviors
- Upload flow: POST `/api/syllabus/upload` (multipart) -> store file -> extract text (pdf-parse/mammoth) -> create Syllabus(status=processing) -> background `aiService.analyzeSyllabus()` then `startPracticalChallenge()`.
- Analysis output (normalized in `aiService.normalizeAnalysisForModel`):
  - `structure: {hasObjectives, hasAssessment, hasSchedule, hasResources, missingParts}`
  - `analysis: { templateCompliance, learningObjectivesAlignment, studentClusterAnalysis, plagiarismCheck, surveyInsights? }`
  - `recommendations: [{ id|_id, category (structure|content|objectives|assessment|cases|methods), title, description, priority, status? }]`
- AI conventions:
  - Uses OpenAI Responses API; JSON mode for analysis/interactive ideas; web_search_preview cannot use JSON mode, so JSON is extracted manually.
  - No numeric scoring/percentages are used in analysis (recent spec); logging is verbose and should be preserved.
- Permissions: `auth` middleware decodes JWT and attaches `req.user { userId, role }`. Most syllabus routes require owner or manager/admin. Some manager/admin reports are gated by `roles.manager` or `admin`.

## Important endpoints (prefix `/api`)
- Auth: `POST /auth/login`, `GET/PUT /auth/profile`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/verify-email`, `POST /auth/logout`.
- Users: `GET /users/stats`, `PUT /users/settings`, `PUT /users/change-password`, `DELETE /users/account`.
- Syllabus: `POST /syllabus/upload`, `GET /syllabus/my-syllabi`, `GET /syllabus/:id`, `GET /syllabus/:id/status`, `PUT /syllabus/:id`, `PUT /syllabus/:id/recommendations/:recommendationId`, `DELETE /syllabus/:id`, `POST /syllabus/:id/analyze`, downloads `/:id/download` and `/:id/download-modified`.
- AI: `POST /ai/challenge/respond`, `POST /ai/recommendations/interactive`.
- Reports: `GET /reports/syllabus/:id`, `GET /reports/manager-summary`, `GET /reports/catalog`.

## Project conventions and patterns
- Logging: Console logs are part of developer workflow; keep start/end banners and metrics when adding AI or report logic.
- Rate limits/CORS: Respect `FRONTEND_URL` and let OPTIONS pass. Authenticated traffic skips the global limiter; a per-user limiter applies under `/api`.
- File handling: Always clean up uploaded files on validation errors; store metadata under `syllabus.originalFile`.
- Recommendation IDs: Mongoose subdocs may be addressed via `_id` or custom `id`; routes handle both. Preserve this dual lookup when editing.
- Categories: Only use the set `structure|content|objectives|assessment|cases|methods`; unknowns are coerced to `content`.
- Student data: Student clusters come from DB via `StudentCluster.getCurrentClusters()`; survey insights are derived from `Survey` + `SurveyResponse` with specific question texts.
- Plagiarism: Simple cosine similarity over TF-IDF vectors; threshold 0.6; do not introduce external embedding calls without discussion.

## Dev workflows
- Backend
  - Env: copy `backend/example.env` to `backend/.env` and set `MONGODB_URI`, `JWT_SECRET`, `OPENAI_API_KEY`, `FRONTEND_URL`, Gmail/SMTP.
  - Install: task "Install Backend Dependencies" or `npm install` in `backend/`.
  - Run: `npm run dev` (nodemon) or `npm start` in `backend/` (defaults port 5000).
  - Health: `GET /health` returns `{ status, dbConnected }` without auth.
- Frontend
  - Env optional: `REACT_APP_API_URL=http://localhost:5000/api` (otherwise CRA proxy is used).
  - Run: `npm start` in `frontend/` (port 3000). Auth token kept in localStorage as `token`.

## When adding/changing features
- Extend APIs in `routes/*` and keep owner/role checks consistent with helpers in `routes/syllabus.js` or `middleware/roles.js`.
- Update `src/services/api.js` to mirror new endpoints and handle 401/429 behavior.
- Keep AI JSON outputs compatible with `normalizeAnalysisForModel` and `formatRecommendations`.
- Avoid reintroducing numeric scoring; the README and code have moved to qualitative sections.
- For long tasks, prefer background `setImmediate` and persist status (`processing/error/analyzed`).

## Examples from code
- Updating recommendation state: `PUT /syllabus/:id/recommendations/:recommendationId` accepts `{ status: accepted|rejected|commented, comment? }` and may trigger AI comment replies in background.
- AI Challenger response: `POST /ai/challenge/respond` with `{ syllabusId, response }` appends to `syllabus.practicalChallenge.discussion` and returns AI text.
- Modified syllabus download: `GET /syllabus/:id/download-modified` produces a `.txt` with inline angle-bracket comments from accepted recommendations.

## Gotchas
- `aiService.searchUkrainianCases` uses web_search_preview; don’t set JSON mode there.
- Large fields: some GETs exclude `extractedText`/`vectorEmbedding` for performance.
- Email flows: verification is often completed through reset-password pathway; resend-verification responds generically on purpose.
