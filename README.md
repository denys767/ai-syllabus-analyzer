# KSE AI Syllabus Analyzer

End-to-end platform to analyze MBA course syllabi using AI, generate grouped recommendations, run an AI Challenger discussion, and export reports (CSV/Excel/PDF). Includes secure auth with email verification, password reset, profile editing, and theme settings (system/light/dark).

## Features
- Upload PDF/DOC/DOCX syllabi and run a comprehensive AI analysis
- Grouped recommendations: survey-based, clusters & UA cases, plagiarism, ILO alignment, template compliance, AI Challenger
- AI Challenger: 1:1 instructor–AI discussion with concise final suggestions
- Exports: per-syllabus and aggregate reports to CSV/Excel/PDF
- Admin/Manager analytics and drill-downs
- Auth with email verification, password reset, and account deletion notifications (Gmail/SMTP)
- Profile editing (name, email, department, avatar URL) and theme mode (system/light/dark)
- Hardened backend (CORS, rate limits, request timeouts, robust error handling)

## Tech Stack
- Backend: Node.js, Express, MongoDB/Mongoose, Nodemailer, OpenAI Responses API, PDFKit, ExcelJS
- Frontend: React (CRA), React Router v6, MUI, Axios

## Prerequisites
- Node.js v18+
- npm v8+
- MongoDB running locally or a connection string (MongoDB Atlas)
- OpenAI API key
- Gmail App Password (recommended) or generic SMTP credentials

## Setup

### 1) Backend
1. Create a `.env` file in `backend/` based on `backend/example.env`.
2. Install dependencies. `npm install`
3. Start the server in development mode, or run in production. (`npm start`/`npm dev`)

Environment variables (most important):
- MONGODB_URI: Mongo connection string
- JWT_SECRET: any strong random string
- OPENAI_API_KEY: your OpenAI key
- LLM_MODEL: OpenAI model id (e.g., gpt-4o-mini)
- FRONTEND_URL: URL of the frontend (e.g., http://localhost:3000)
- Gmail-based email (preferred): GMAIL_USER, GMAIL_PASS (App Password)
- or SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
- ADMIN_EMAIL/ADMIN_PASSWORD to auto-create an admin at startup

The server defaults to port 5000.

### 2) Frontend
1. Create a `.env` file in `frontend/` (optional). By default, development requests proxy to `http://localhost:5000`.
2. Install dependencies. `npm install`
3. Start the dev server (default on http://localhost:3000 - `npm start`). 

`REACT_APP_API_URL` is optional; if set, it should be `http://localhost:5000/api`.

## First Run Walkthrough
1. Ensure MongoDB is running.
2. Start the backend, then the frontend.
3. Register a user, check your mailbox, and verify your email via the link.
4. Log in and upload a syllabus (PDF/DOC/DOCX; up to 10MB by default).
5. The system runs AI analysis in the background; the status will switch to analyzed.
6. Explore:
   - Analysis Overview with template compliance, ILO alignment, plagiarism, clusters & UA cases, survey insights
   - Grouped Recommendations (by categories above)
   - AI Challenger: respond to the initial question, iterate, and finalize to persist concise suggestions
   - Exports: per-syllabus detailed PDF/Excel/CSV; aggregate analytics (manager/admin)

## Roles & Permissions
- instructor: owns their syllabi; can upload, analyze, discuss, export their own
- manager: management analytics and exports
- admin: user management; created automatically if ADMIN_EMAIL/PASSWORD provided

## Key Backend Endpoints (prefix /api)
- Auth: 
  - POST /auth/login
  - GET /auth/profile, PUT /auth/profile
  - POST /auth/forgot-password, POST /auth/reset-password
  - POST /auth/verify-email, POST /auth/resend-verification
  - POST /auth/logout
- Syllabus:
  - POST /syllabus/upload (multipart form-data)
  - GET /syllabus/my-syllabi, GET /syllabus/:id, DELETE /syllabus/:id
  - PUT /syllabus/:id (metadata)
  - PUT /syllabus/:id/recommendations/:recommendationId (status/comment)
  - POST /syllabus/:id/analyze
  - POST /syllabus/:id/challenge/finalize
- AI:
  - POST /ai/challenge/respond
  - POST /ai/recommendations/interactive
- Reports:
  - GET /reports/syllabus/:id (JSON summary)
  - GET /reports/syllabus/:id/export/:type (type: csv|excel|pdf)
  - GET /reports/export/:type (aggregate; manager/admin)
  - GET /reports/analytics (manager/admin)

## Email Setup (Gmail App Password)
- In Google Account → Security → 2‑Step Verification → App passwords
- Create an app password for “Mail” and “Other/Custom” (e.g., KSE Analyzer)
- Use your Gmail address as GMAIL_USER and the 16‑char app password as GMAIL_PASS
- Alternatively configure SMTP_* variables; EMAIL_FROM is optional

## OpenAI Setup
- Set OPENAI_API_KEY
- Optionally set LLM_MODEL; recommended small, fast models like `gpt-4o-mini`
- Ukrainian case search uses Responses API with web_search_preview tool (no JSON mode for that call)

## Exports
- Per-syllabus: PDF includes overview, ILO alignment, practicality, grouped recs, AI Challenger summary, and appendix with discussion and recommendations
- Aggregate: CSV/Excel/PDF with core metrics and counts

## Theming and Profile
- Profile: edit first/last name, email (re-verification required), department, avatar URL, change password
- Settings: theme selection (system/light/dark); theme respects system preference when set to system

## Troubleshooting
- 403 at login: account not verified; use “resend verification”
- 503 responses: database temporarily unavailable
- 504 timeouts: long-running requests are cut to avoid hangs; retry or check logs
- CORS: set FRONTEND_URL to your actual frontend origin
- Rate limits: defaults can be tuned via RATE_LIMIT_* env vars

## Security Notes
- JWT secret must be strong and kept private
- Use HTTPS in production
- Do not commit real .env files or secrets

## License
MIT
