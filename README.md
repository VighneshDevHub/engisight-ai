# Engineering Document AI — Phase 1 · Step 1: Scaffolding

AI-powered engineering document analysis platform. Phase 1 builds **Use Case 1: Drawing
Comparison & Deviation Detection**. This step sets up the full project skeleton —
no business logic yet — so every later feature is added to a proven, working foundation.

## Stack (locked for this project)

- **Backend:** FastAPI, SQLAlchemy (async), Celery, Alembic
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind
- **AI pipeline (added from Step 4 onward):** LangGraph, LangChain, PaddleOCR, OpenCV,
  YOLOv11, Groq (via `langchain-groq`), Sentence Transformers
- **Storage:** PostgreSQL, Qdrant (vectors), MinIO (files), Redis (queue/cache)

## What's in this step

```
engineering-doc-ai/
├── docker-compose.yml       # postgres, redis, minio, qdrant, backend, worker, frontend
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entrypoint
│   │   ├── core/config.py   # env-driven settings (single source of truth)
│   │   ├── core/celery_app.py
│   │   ├── api/v1/router.py
│   │   ├── api/v1/endpoints/health.py   # liveness + readiness probes
│   │   ├── db/session.py    # async SQLAlchemy engine/session
│   │   └── tests/test_health.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
└── frontend/
    ├── app/page.tsx          # calls backend /health/ready to prove full-stack wiring
    ├── app/layout.tsx
    ├── package.json
    └── Dockerfile
```

## How to run it

1. Copy env files (already done for you as `.env` / `.env.local` in this scaffold —
   in your own repo you'd run these manually):
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.local.example frontend/.env.local
   ```

2. Start everything:
   ```bash
   docker compose up --build
   ```

3. Verify each service:
   - Backend docs: http://localhost:8000/docs
   - Liveness: http://localhost:8000/api/v1/health → `{"status": "ok", ...}`
   - Readiness (checks Postgres + Redis): http://localhost:8000/api/v1/health/ready
   - Frontend: http://localhost:3000 → should show "Overall status: ok" pulled live
     from the backend, proving frontend → backend → DB/Redis all connect correctly.
   - MinIO console: http://localhost:9001 (login: `minio_admin` / `minio_password`)
   - Qdrant: http://localhost:6333/dashboard

## How to test it

```bash
cd backend
pip install -r requirements.txt
pytest -v
```

Expected: 3 passing tests (`test_root`, `test_health_liveness`, `test_health_readiness`).
`test_health_readiness` will fail if Postgres/Redis aren't reachable — that's intentional,
it's your proof the full stack is actually wired, not just that FastAPI boots.

## Definition of done for Step 1

- [ ] `docker compose up --build` starts all 7 services without errors
- [ ] `/api/v1/health/ready` returns `"status": "ok"` with both `database` and `redis` as `"ok"`
- [ ] Frontend homepage renders live status pulled from the backend (not hardcoded)
- [ ] `pytest -v` passes all 3 tests
- [ ] MinIO and Qdrant dashboards are reachable

---

# Step 2: Auth

Adds user registration, JWT login, and a protected `/me` endpoint + a protected
frontend dashboard. This is the auth pattern every future feature (drawing upload,
comparisons, reviews) will build on via `Depends(get_current_user)` / `Depends(require_role(...))`.

## New files

```
backend/
├── alembic.ini, alembic/env.py, alembic/script.py.mako
├── alembic/versions/0001_create_users_table.py
├── app/models/user.py
├── app/schemas/user.py, app/schemas/token.py
├── app/core/security.py           # password hashing, JWT create/verify
├── app/api/v1/deps.py             # get_current_user, require_role(...)
├── app/api/v1/endpoints/auth.py   # /register /login /me
└── app/tests/test_auth.py

frontend/
├── lib/api-client.ts              # axios instance + JWT interceptor
├── lib/auth.ts                    # registerUser/loginUser/fetchCurrentUser/logoutUser
├── app/login/page.tsx
├── app/register/page.tsx
└── app/dashboard/page.tsx         # protected page, redirects to /login if not authed
```

## How to run the migration

```bash
docker compose up -d postgres
cd backend
alembic upgrade head
```

This creates the `users` table. Re-running `docker compose up --build` after this
will pick it up automatically (mount is live).

## How to test it

**Backend (automated):**
```bash
cd backend
pytest -v
```
Expected: all tests from Step 1 still pass, plus `test_register_and_login_flow`
(register → duplicate rejected → login → wrong password rejected → `/me` works with
token → `/me` rejected with no/garbage token).

**Backend (manual, via Swagger UI):**
1. Open http://localhost:8000/docs
2. `POST /api/v1/auth/register` with a test email/password
3. `POST /api/v1/auth/login` → copy the `access_token`
4. Click **Authorize** (top right), paste the token
5. `GET /api/v1/auth/me` → should return your user

**Frontend (manual):**
1. http://localhost:3000/register → create an account → should redirect to `/dashboard`
2. Dashboard shows your name/email/role, pulled from `/api/v1/auth/me`
3. Log out → redirected to `/login`
4. Try visiting `/dashboard` directly while logged out → should redirect to `/login`
   (proves the route is actually protected, not just hiding a logout button)

## Definition of done for Step 2

- [ ] `alembic upgrade head` creates the `users` table with no errors
- [ ] All backend tests pass (`pytest -v`), including `test_auth.py`
- [ ] Can register + login via Swagger and retrieve `/me` with the token
- [ ] Frontend register → dashboard → logout → login flow works end-to-end
- [ ] Visiting `/dashboard` while logged out redirects to `/login`

Once verified, tell me and we move to **Step 3: Drawing upload & storage**
(baseline + revision upload to MinIO, DB metadata, ownership tied to the user).

---

# Step 3: Drawing Upload & Storage

Adds baseline/revision drawing upload to MinIO, with metadata (project code, drawing
number, type, uploader) tracked in Postgres. This is the raw material Step 4's AI
pipeline will process.

## New files

```
backend/
├── app/services/storage_service.py     # MinIO/S3 wrapper (upload, presigned URL, delete)
├── app/models/drawing.py               # Drawing ORM model
├── app/schemas/drawing.py              # DrawingRead, DrawingDownloadURL
├── app/api/v1/endpoints/drawings.py    # POST /upload, GET /, GET /{id}, GET /{id}/download-url
├── alembic/versions/0002_create_drawings_table.py
└── app/tests/test_drawings.py

frontend/
├── lib/drawings.ts                     # uploadDrawing/listDrawings/getDownloadUrl
└── app/drawings/page.tsx               # upload form + list table, protected route
```

`app/main.py` now runs a startup `lifespan` hook that calls `storage_service.ensure_bucket()`
— idempotent, so it's safe on every restart.

## How to run the migration

```bash
docker compose up -d postgres
cd backend
alembic upgrade head
```

## How to test it

**Backend (automated):**
```bash
cd backend
pytest -v
```
Expected: all Step 1 + Step 2 tests still pass, plus `test_upload_list_get_and_download_flow`
(upload baseline → reject bad file type → reject bad drawing_type → list filtered by
project → get by id → 404 on unknown id → presigned download URL → 401 unauthenticated).

**Backend (manual, via Swagger UI):**
1. http://localhost:8000/docs → authorize with a token from `/auth/login`
2. `POST /api/v1/drawings/upload` — form fields `project_code`, `drawing_number`,
   `drawing_type` (`baseline`/`revision`), and a file
3. `GET /api/v1/drawings` → confirm it appears
4. `GET /api/v1/drawings/{id}/download-url` → open the URL, confirm the file downloads
5. Check http://localhost:9001 (MinIO console) → bucket `drawings` → your file is there

**Frontend (manual):**
1. Log in → Dashboard → "Go to Drawings"
2. Fill the form (e.g. project `PROJ-001`, drawing `DWG-100-A`, type `baseline`),
   upload a PDF/PNG
3. Row appears in the table with status `uploaded`
4. Click the filename → file opens/downloads in a new tab (proves the presigned URL works)
5. Upload a `revision` under the same project code → both rows appear

## Definition of done for Step 3

- [ ] `alembic upgrade head` creates the `drawings` table with no errors
- [ ] All backend tests pass (`pytest -v`), including `test_drawings.py`
- [ ] MinIO console shows uploaded files under the `drawings` bucket
- [ ] Frontend upload → list → download flow works end-to-end for both baseline and revision
- [ ] Uploading an unsupported file type is rejected with a clear error (both backend test and manually in the UI)

Once verified, tell me and we move to **Step 4: AI extraction pipeline**
(LangGraph pipeline: OpenCV preprocessing → PaddleOCR + YOLOv11 detection →
Groq/LangChain structuring into normalized parameter JSON).

---

# PHASE 2 — P&ID Intelligence & Automated BoM Generation

## Config change carried over from Phase 1

Groq deprecated `llama-3.3-70b-versatile` (2026-06-17). Update your `backend/.env`:
```
GROQ_MODEL=openai/gpt-oss-120b
GROQ_VISION_MODEL=qwen/qwen3.6-27b
```
Note: `qwen/qwen3.6-27b` is currently a **preview-tier** model on Groq (not production-SLA'd).
This is a known, accepted risk — if P&ID recognition suddenly breaks, check Groq's model
status page first.

## Step 1: Data model + P&ID upload reuse

Proves that Phase 1's upload/storage layer extends cleanly to a new document type
(P&ID drawings) without duplicating any code — only the `drawing_type` enum grows.

### New files
```
backend/
├── app/models/bom_item.py            # recognized component + traceability
├── app/models/connectivity_edge.py   # traced line between two components
├── app/schemas/bom.py
├── alembic/versions/0005_create_bom_and_connectivity_tables.py
└── app/tests/test_pid_upload.py
```

### Changed files
- `app/api/v1/endpoints/drawings.py` — `ALLOWED_DRAWING_TYPES` now includes `"pid"`

### How to run the migration
```bash
docker compose up -d postgres   # or your native postgres
cd backend
alembic upgrade head
```

### How to test it
```bash
cd backend
pytest -v
```
Expected: all Phase 1 tests still pass (regression check), plus
`test_upload_pid_drawing_type_accepted` — uploads a `pid`-typed drawing, confirms
`baseline`/`revision` still work unchanged, confirms invalid types still rejected.

**Manual:** upload a real P&ID PDF via Swagger or the `/drawings` page with
`drawing_type=pid` — confirm it appears in the list and downloads correctly,
exactly like Phase 1 drawings.

### Definition of done for Step 1
- [ ] `alembic upgrade head` creates `bom_items` and `connectivity_edges` tables
- [ ] `pytest -v` passes all tests, old and new
- [ ] A real P&ID PDF uploads successfully with `drawing_type=pid`

Once verified, tell me and we move to **Step 2: Region proposal + vision-LLM
component recognition → BoM generation** — the core Phase 2 AI feature.

---

## Known issues (found during manual Windows setup, already fixed in this repo)

These were discovered running the project outside Docker on Windows and are
already patched in `requirements.txt`/`Dockerfile`/`.env` — documented here so
they're understood, not re-discovered:

1. **`passlib` + `bcrypt` incompatibility** — `passlib==1.7.4` breaks with
   `bcrypt>=4.1` (`AttributeError: module 'bcrypt' has no attribute '__about__'`,
   plus a spurious `password cannot be longer than 72 bytes` error). Fixed by
   pinning `bcrypt==4.0.1`.

2. **`grpcio-tools` has no Python 3.12 wheel below v1.62** — pip tries to build
   older versions from source and fails (`ModuleNotFoundError: No module named
   'pkg_resources'`) because of an isolated-build-environment quirk. Fixed by
   pinning `grpcio==1.82.1` / `grpcio-tools==1.82.1` explicitly so pip's resolver
   never backtracks into the broken range.

3. **`paddlepaddle` vs `qdrant-client` protobuf conflict** — `paddlepaddle==2.6.2`
   (Windows) requires `protobuf<=3.20.2`; `qdrant-client`'s `grpcio-tools` needs
   `protobuf>=7.35.1`. Both cannot be satisfied simultaneously. Fixed by removing
   `paddlepaddle` from the requirements files and installing it separately with
   `--no-deps`, then installing its real (non-conflicting) dependencies by hand:
   ```
   pip install paddlepaddle==2.6.2 --no-deps
   pip install decorator astor opt-einsum
   ```

4. **`Descriptors cannot be created directly` at runtime** — paddlepaddle's
   bundled protobuf-generated files are incompatible with the newer protobuf
   package installed for qdrant-client. Fixed by setting, in every terminal
   session before running `uvicorn` or `celery`:
   ```
   # PowerShell
   $env:PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION="python"
   # cmd.exe
   set PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python
   ```
   (Baked into the Dockerfile as an `ENV` line, so Docker users never hit this.)

5. **Celery worker `NoReferencedTableError` on `drawings.uploaded_by`** — the
   Celery worker process imports `tasks.py` standalone, which never imported
   the `User` model, so SQLAlchemy didn't know the `users` table existed when
   resolving `Drawing.uploaded_by`'s foreign key. Fixed by adding
   `from app.models.user import User  # noqa: F401` to `app/workers/tasks.py`.

6. **Windows path length limit (260 chars)** — PyTorch ships deeply nested
   license files that can exceed Windows' default path length limit, causing
   `WinError 206`. Fixed by enabling long path support
   (`HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled=1`,
   requires reboot) and/or using a shorter project path.

7. **Groq model deprecation** — `llama-3.3-70b-versatile` was deprecated by
   Groq on 2026-06-17. Migrated to `openai/gpt-oss-120b` (still served via Groq).

---

# Step 4: AI Extraction Pipeline

This is where the actual AI/CV pipeline enters the project. A drawing is downloaded
from MinIO, run through a **LangGraph** state graph, and structured parameters are
persisted with full traceability (source page, bounding box, verbatim OCR snippet).

## Pipeline architecture

```
Celery task (extract_drawing_parameters)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ LangGraph: build_extraction_graph()                        │
│                                                              │
│  preprocess ──▶ ocr ──[low confidence? retry≤1]──▶ preprocess│
│                  │                                          │
│                  └─[confidence ok]──▶ detect ──▶ structure  │
└───────────────────────────────────────────────────────────┘
        │                    │                    │
   OpenCV deskew/       PaddleOCR text +      YOLOv11 region    Groq (via LangChain)
   normalize            confidence per        proposals          structures OCR text
                         page                 (generic weights,   into normalized
                                               fine-tuned in       {name, value, unit,
                                               Phase 2)            confidence, source_text}
                                                                        │
                                                                        ▼
                                                          Traceability linking: match
                                                          source_text back to its OCR
                                                          block's page + bbox
```

## New files

```
backend/
├── app/services/preprocessing_service.py   # OpenCV: PDF/image → deskewed page images
├── app/services/ocr_service.py             # PaddleOCR wrapper
├── app/services/detection_service.py       # YOLOv11 wrapper (pretrained weights for now)
├── app/services/llm_service.py             # Groq/LangChain structuring, Pydantic output schema
├── app/pipelines/extraction_graph.py       # LangGraph graph: preprocess→ocr→detect→structure
├── app/workers/tasks.py                    # Celery task: download → run graph → persist
├── app/models/extracted_parameter.py       # ExtractedParameter model
├── app/schemas/extraction.py
├── alembic/versions/0003_create_extracted_parameters_table.py
└── app/tests/test_extraction.py            # mocks the Celery task — see note below

frontend/
├── lib/extraction.ts                       # triggerExtraction, listExtractedParameters
└── app/drawings/[id]/page.tsx              # trigger button, polls status, shows results table
```

`drawings.py` gained two endpoints: `POST /drawings/{id}/extract` (enqueues the job,
202 response) and `GET /drawings/{id}/parameters` (reads results).

## ⚠️ Prerequisites — this step needs real infrastructure to fully test

Unlike Steps 1–3, this step **cannot be fully verified with mocks alone**:

1. **A real `GROQ_API_KEY`** in `backend/.env` — get one free at https://console.groq.com
2. **Internet access inside your Docker containers** — PaddleOCR and YOLOv11 (`yolo11n.pt`)
   auto-download their model weights on first use. This happens once and is cached in
   the container's filesystem afterward, but the *first* extraction run will be slow
   (a few minutes) while these download.
3. **A real drawing file** (PDF or image) with actual text/dimensions on it — the
   automated tests use fake PDF bytes, which is enough to test the API contract but
   will produce zero OCR results if you run real extraction on them.

## Why the automated tests mock the Celery task

`test_extraction.py` verifies the **API contract** (trigger → 202 → status flips to
`processing` → 404 on missing drawing → empty parameter list before extraction) by
mocking `celery_app.send_task`. It deliberately does NOT run the real pipeline,
because that requires a live Groq key, multi-minute model downloads, and a real
drawing — none of which belong in a fast, repeatable unit test suite. **You must
verify the real pipeline manually** — see below.

## How to run the migration

```bash
docker compose up -d postgres
cd backend
alembic upgrade head
```

## How to test it

**Backend (automated, fast, no real AI calls):**
```bash
cd backend
pytest -v
```
Expected: all Step 1–3 tests still pass, plus the 3 new `test_extraction.py` tests.

**Backend (manual, real end-to-end run) — do this to actually verify Step 4:**
1. Put a real `GROQ_API_KEY` in `backend/.env`, then `docker compose up --build`
2. Upload a real engineering drawing PDF via `/drawings` (or Swagger)
3. `POST /api/v1/drawings/{id}/extract` via Swagger
4. Watch worker logs: `docker compose logs -f worker` — you'll see PaddleOCR/YOLO
   downloading weights on the first run, then processing pages
5. `GET /api/v1/drawings/{id}` — status should go `processing` → `processed`
   (or `failed` — check worker logs for the exception if so)
6. `GET /api/v1/drawings/{id}/parameters` — inspect the structured output:
   does `parameter_name`/`value`/`unit` look right? Does `source_text` actually
   appear in the drawing? Is `source_page`/`source_bbox` populated (traceability
   working) or null (fuzzy-match missed it — expected to happen sometimes, this
   is the "best-effort" linking noted in `extraction_graph.py`)?

**Frontend (manual):**
1. Drawings list → "View / Extract" on an uploaded drawing
2. Click "Run extraction" → status badge shows `processing`, page auto-polls
3. Once `processed`, the parameters table populates with name/value/unit/confidence/
   source snippet/page

## Definition of done for Step 4

- [ ] `alembic upgrade head` creates the `extracted_parameters` table
- [ ] `pytest -v` passes all tests (mocked — fast, no external calls)
- [ ] A real drawing, run through `/extract` end-to-end, reaches status `processed`
      (not `failed` — check worker logs if it fails, likely a missing/invalid `GROQ_API_KEY`)
- [ ] The extracted parameters are qualitatively reasonable for your test drawing
      (real dimensions/ratings/materials, not garbage)
- [ ] Frontend trigger → poll → results flow works end-to-end

**Report back what you see** — especially extraction quality on a real drawing.
If parameter quality is poor, the fix is almost always prompt tuning in
`llm_service.py`'s `STRUCTURING_PROMPT`, not a pipeline redesign. Once this is
verified, we move to **Step 5: the diff engine** (Qdrant-based fuzzy matching of
baseline vs. revision parameters, classification into modified/missing/added/matching).

---

# Step 5: Diff Engine (Phase 1 complete after this)

The final feature of Phase 1: compare a baseline drawing's extracted parameters
against a revision's, classify every finding, and present it as a traceable diff
report. This closes the loop on Use Case 1's full requirement list: modified
parameters, missing components, newly added components, matching parameters,
and complete traceability back to source.

## How the matching works

```
Comparison created (baseline_drawing_id, revision_drawing_id)
        │  (both drawings must already have status="processed" — Step 4 output)
        ▼
Celery task: run_comparison
        │
        ▼
diff_engine.run_diff():
  1. Embed every revision parameter (Sentence Transformers, local, no API cost)
     -> upsert into a short-lived Qdrant collection scoped to this comparison
  2. For each baseline parameter: embed it, search Qdrant for its nearest
     revision-side neighbor
       - no match above threshold (0.70 cosine)         -> "missing"
       - match found, values equal                       -> "matching"
       - match found, values differ                       -> "modified"
  3. Any revision parameter never claimed as a match      -> "added"
  4. Delete the temporary Qdrant collection (cleanup)
```

This is *why* Qdrant is in the architecture: exact-text diffing would treat
baseline's "Line pressure rating: 150 psi" and revision's "Max operating
pressure: 150 psi" as two unrelated fields (a false "missing" + false "added"
pair) instead of correctly recognizing them as the same field, unchanged.

## New files

```
backend/
├── app/models/comparison.py, app/models/diff_item.py
├── app/schemas/comparison.py
├── app/services/embedding_service.py      # Sentence Transformers wrapper
├── app/services/qdrant_service.py         # per-comparison Qdrant collection management
├── app/services/diff_engine.py            # the matching + classification logic itself
├── app/api/v1/endpoints/comparisons.py    # POST /comparisons, GET /comparisons/{id}, GET /comparisons
├── alembic/versions/0004_create_comparisons_and_diff_items.py
├── app/tests/test_comparisons.py          # API contract tests (mocked Celery)
└── app/tests/test_diff_engine.py          # real integration test of the matching logic

frontend/
├── lib/comparisons.ts
├── app/comparisons/page.tsx               # create comparison (pick baseline + revision), history list
└── app/comparisons/[id]/page.tsx          # DiffViewer + TraceabilityPanel — the Phase 1 deliverable UI
```

## Prerequisites

Same as Step 4 (Qdrant + sentence-transformers need to actually run for the real
matching logic), plus: **both drawings passed to `/comparisons` must already have
`status="processed"`** — i.e. you must have run Step 4's extraction on each one
first. The API returns `409 Conflict` if not.

## How to run the migration

```bash
docker compose up -d postgres
cd backend
alembic upgrade head
```

## How to test it

**Backend (automated):**
```bash
cd backend
pytest -v
```
Expected: all Step 1–4 tests pass, plus:
- `test_comparisons.py` — API contract (rejects unprocessed drawings, rejects
  wrong drawing_type, creates + retrieves a comparison with mocked Celery)
- `test_diff_engine.py` — **real** integration test against Qdrant + real
  embeddings, verifying a renamed-but-equal field is classified `matching`,
  a changed value is `modified`, an unmatched baseline field is `missing`,
  and a new revision field is `added`. Requires Qdrant running; downloads the
  MiniLM embedding model on first run.

**Backend (manual, full real pipeline end-to-end):**
1. Upload a baseline PDF and a revision PDF (same project code) with some
   parameters deliberately changed/renamed/removed/added between them
2. Run `/drawings/{id}/extract` on both, wait for `status=processed`
3. `POST /api/v1/comparisons` with both IDs
4. `GET /api/v1/comparisons/{id}` — inspect `diff_items`: do the classifications
   match what you'd expect from the two drawings? Check `explanation` text and
   `match_confidence` for anything suspicious (e.g. a `modified` that should
   have been `added` because the fuzzy match was wrong — tune `MATCH_THRESHOLD`
   in `diff_engine.py` if so)

**Frontend (manual):**
1. `/comparisons` → select a processed baseline + processed revision → "Compare"
2. Redirects to the report page, auto-polls while `processing`
3. Once `completed`: 4 classification count cards (Modified/Missing/Added/Matching) —
   click one to filter the table below it
4. Click any row in the diff table → the Traceability panel on the right shows
   the full explanation, match confidence, and linked parameter IDs

## Definition of done for Step 5

- [ ] `alembic upgrade head` creates `comparisons` and `diff_items` tables
- [ ] `pytest -v` passes all tests, including the real `test_diff_engine.py` integration test
- [ ] A real baseline/revision pair, compared end-to-end, produces qualitatively
      correct classifications (spot-check a few by hand against the actual drawings)
- [ ] Frontend: create comparison → poll → report renders → filter by category →
      click a row → traceability panel shows explanation

---

## Phase 1 — complete

At this point, **Use Case 1 (Engineering Drawing Comparison & Validation)** is fully
implemented end-to-end: upload baseline/revision → AI extraction with traceability →
fuzzy-matched diff classification → reviewable report UI. Every requirement from the
original brief is covered: modified parameters, missing components, newly added
components, matching parameters, and complete traceability to source.

Before starting **Phase 2 (P&ID Intelligence & BoM Generation)**, do a full clean-slate
run-through of all 5 steps end-to-end (fresh `docker compose up --build`, fresh
`alembic upgrade head`, register a new user, upload real drawings, run extraction,
run a comparison) to confirm nothing regressed. Report back the results before we
scope Phase 2's architecture and directory structure.
