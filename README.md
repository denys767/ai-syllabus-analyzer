# KSE AI Syllabus Analyzer

AI-powered MBA syllabus review platform for Kyiv School of Economics. Instructors upload syllabi, the backend analyzes them against the KSE MBA template and MBA-27 learning outcomes with OpenAI, and the workspace walks the instructor through recommendations one issue at a time.

## Current Capabilities

- Upload PDF, DOC, or DOCX syllabi and extract syllabus text.
- Generate categorized recommendations for template compliance, learning outcomes, content quality, cases, policies, and other issues.
- Create line-anchored syllabus edits with OpenAI Responses API so recommendations can be previewed and applied deterministically.
- Review recommendations in a chat workflow with `Confirm`, `Cancel`, `Preview`, and `Reopen`.
- Require an audit reason when cancelling high or critical issues.
- Reopen a resolved issue and rewind visible chat back to that issue card; later resolved issue cards are reset so they are offered again.
- Select one or more business case cards; selected case edits are coalesced before validation.
- Render final clean and red/green revision PDFs with Puppeteer.
- Submit final syllabi to the Academic Director by email.
- Manage users, programs, syllabi, and resending failed submission emails through the cabinet.

## Tech Stack

- Backend: Node.js, Express, MongoDB/Mongoose, OpenAI Responses API, Nodemailer, Mammoth, pdf-parse, Puppeteer.
- Frontend: React 18, React Router v6, MUI 5, Axios, react-markdown with GFM tables.

## Prerequisites

- Node.js 18+
- npm 8+
- MongoDB, local or Atlas
- OpenAI API key
- Gmail App Password or SMTP credentials if email delivery is needed

## Setup

Install dependencies separately for backend and frontend:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Create `backend/.env` from `backend/example.env` and fill in secrets:

```bash
cd backend
copy example.env .env
# macOS/Linux: cp example.env .env
```

Important backend env vars:

```env
MONGODB_URI=mongodb://localhost:27017/ai-syllabus-analyzer
JWT_SECRET=change_me_strong_password
OPENAI_API_KEY=sk-your-key
LLM_MODEL=gpt-5.4-mini
LLM_REASONING_EFFORT=medium
LLM_MAX_OUTPUT_TOKENS=12000
FRONTEND_URL=http://localhost:3000
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ChangeMe123!
```

Email can use either Gmail:

```env
GMAIL_USER=your@gmail.com
GMAIL_PASS=your_app_password
```

or generic SMTP:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=user
SMTP_PASS=password
EMAIL_FROM=KSE AI Analyzer <no-reply@example.com>
```

For PDF rendering on servers without bundled Chromium, set:

```env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

## Running Locally

Backend runs on port `5000`:

```bash
cd backend
npm run dev
```

Frontend runs on port `3000` and proxies `/api/*` to `localhost:5000`:

```bash
cd frontend
npm start
```

Stop both common dev ports from the repo root:

```bash
npm run stop-ports
```

## Main Workflow

1. Start MongoDB, backend, and frontend.
2. Log in as the bootstrap admin or create an instructor account.
3. Create or confirm a program with an Academic Director email.
4. Upload a syllabus from the workspace.
5. Wait for analysis to finish.
6. Review each chat issue card:
   - `Confirm` applies the generated line edits.
   - `Preview` shows the issue-specific clean and revision preview.
   - `Cancel` rejects the issue; high/critical issues require a reason.
   - `Reopen` rewinds the chat to a resolved issue and resets later resolved cards.
7. Preview the final syllabus PDF.
8. Submit the final PDF and review summary to the Academic Director by email.

## AI Pipeline

The AI layer lives in `backend/services/ai/`.

- `client.js`: OpenAI client wrapper, model selection, reasoning effort, output token cap, JSON parsing helpers.
- `analyzer.js`: Creates normalized recommendations from syllabus text.
- `editGenerator.js`: Generates line-numbered structured edits for each recommendation; case-card generation can use `web_search_preview`.
- `applyEdits.js`: Resolves selections, validates edits, coalesces multi-case edits, recomputes accepted syllabus state, and builds per-issue previews.
- `finalRender.js`: Renders final and revision PDFs and generates the submission report.
- `workspaceService.js`: Owns chat workflow decisions, reopen rollback, final gating, previews, and submission.

The default model is `gpt-5.4-mini` with `reasoning.effort=medium`. Override with `LLM_MODEL`, `LLM_REASONING_EFFORT`, and `LLM_MAX_OUTPUT_TOKENS`.

## Key API Endpoints

All endpoints are under `/api`.

Auth:

- `POST /auth/login`
- `GET /auth/profile`
- `PUT /auth/profile`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/logout`

Syllabus:

- `POST /syllabus/upload`
- `GET /syllabus/my-syllabi`
- `GET /syllabus/:id`
- `PUT /syllabus/:id`
- `DELETE /syllabus/:id`
- `POST /syllabus/:id/analyze`
- `GET /syllabus/:id/download`

Chat review:

- `GET /chat/:syllabusId`
- `POST /chat/:syllabusId/start`
- `POST /chat/:syllabusId/confirm`
- `POST /chat/:syllabusId/cancel` with optional `{ issueId, reason }`
- `POST /chat/:syllabusId/issues/:issueId/reopen` with optional `{ anchorMessageId }`
- `POST /chat/:syllabusId/issues/:issueId/preview`
- `POST /chat/:syllabusId/preview`
- `POST /chat/:syllabusId/submit`
- `POST /chat/:syllabusId/message`

Cabinet:

- `GET /cabinet/syllabi`
- `GET /cabinet/metrics`
- `POST /cabinet/syllabi/:id/resend-submission`
- user and program management endpoints for admin flows

Policies:

- `GET /policies`
- `POST /policies`
- `PUT /policies/:id`
- `DELETE /policies/:id`
- `POST /policies/:id/acknowledge`

## Roles

- `instructor`: uploads and reviews their own syllabi.
- `manager`: reads program/cabinet data for assigned programs.
- `admin`: manages users/programs and can view cabinet data.

Chat mutation is owner-only; admins are read-only for chat conversations.

## Development Checks

There is no full test script wired into this project. Use these checks before closing a task:

```bash
node -c backend/services/workspaceService.js
node -c backend/routes/chat.js
node -c backend/services/ai/client.js

cd frontend
npm run build
```

The React build may update tracked `frontend/build` files with hashed bundle names. If you only needed the build as verification, avoid committing unrelated generated hash churn.

## Troubleshooting

- `Syllabus not found` after deleting a syllabus: the workspace should now clear stale local storage and return to the upload greeting. If it persists, clear browser local storage keys beginning with `pt.`.
- Long-running AI routes time out at `AI_REQUEST_TIMEOUT_MS`, default `130000`.
- General request timeout is `REQUEST_TIMEOUT_MS`, default `20000`.
- CORS errors usually mean `FRONTEND_URL` does not match the browser origin.
- Email submission is skipped if neither Gmail nor SMTP is configured.
- Puppeteer errors on Linux usually mean Chromium is missing or `PUPPETEER_EXECUTABLE_PATH` is wrong.
- Markdown tables in chat require pipe-table syntax with a divider row, for example:

```markdown
| Week | Topic |
| --- | --- |
| 1 | Strategy |
```

## Security Notes

- Never commit real `.env` files or secrets.
- Use a strong `JWT_SECRET`.
- Use HTTPS in production.
- Restrict MongoDB and SMTP credentials by environment.

## License

MIT
