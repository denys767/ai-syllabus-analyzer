# v5 frontend

The workspace has three independent zones: syllabus structure, conversation, and a live document. On narrow screens the structure and document open in drawers. Readiness counts approved required sections; it never gates downloads.

## Run against mock data

```sh
cd frontend
REACT_APP_USE_MOCKS=1 npm start
```

Open `/dev/cards` in development (no login or backend required). Switch between Risk Management, the scratch interview, and the v4 rebuild example. The page uses the same workspace hook and components as the application. Reset mock data to restart a scenario; use the theme toggle and resize the browser to check the drawers.

With a normal authenticated session, the mock switch also applies to `/workspace`: both entry paths use the mock client. Without the switch the API client is used. Production builds omit the development gallery.

Check Confirm with the named proposed values, inline Change the value, Reword, Cancel, explicit policy selection, Keep my text, Write my own, Skip, approval/unapproval, Approve all, Diff, and Download .docx. Mock downloads are valid minimal DOCX files with current mock content; production downloads use the backend template. The mock interview demonstrates the flow and deliberately leaves schedule/assessment authoring to the live assistant.

## Verify

```sh
cd frontend
CI=true npm test -- --runInBand
./node_modules/.bin/eslint src --max-warnings=0
GENERATE_SOURCEMAP=false npm run build
```

Icon imports use individual module paths to reduce CRA compilation memory. Keep source maps disabled on the shared 8 GB machine and avoid running multiple compilers together.

## H1 integration notes

The client follows the refined contract from `refactor/plan-from-limewire-spec`, including `keepText`, explicit `expectedRevision` when available, server fallback when it is absent, and the sole public output name `syllabus.docx`. Cache filenames such as `syllabus.r<revision>.docx` are internal to the backend. Downloads honor `Content-Disposition`, including UTF-8 filenames and JSON errors returned as blobs.

No additional mandatory View fields are required. The UI reads `conversation.currentSlotKey` and `conversation.skippedSlots`, described in the refined contract prose. It tolerates optional `syllabus.legacy`, `SuggestionView.requiresReason` (fallback: critical/high severity), and `options[].after` (fallback: option value/library text). These optional fields are not all enumerated in the formal View shape. `before`/`after` are covered by the refined SuggestionView description.

One contract mismatch remains in H1: the upload table names multipart `file`, but `backend/routes/syllabus.js` still uses `upload.single('syllabus')` and `courseName`. This frontend sends `syllabus` and `courseName` to match the running implementation. Agree on the canonical field name before changing either side.

The View exposes `canMutate: false` for both non-owners and syllabi requiring rebuild/analysis. It cannot distinguish permission to rebuild or retry analysis. Those buttons call the owner-protected endpoint; a future optional `canAnalyze` flag would allow hiding them for non-owners.

Cabinet responses are expected to provide `downloads`, metric `ready100`, structural readiness counts, and `outputs: ['syllabus.docx']`. Those cabinet response shapes are outside the formal v5 View contract. Missing metrics render as a dash.

The branded DOCX template, final layout reference and complete interviewer behavior remain backend/product integration work. Content and error text returned by the server should be English; the frontend translates its own labels, not instructor content or server-authored policy text.
