# Architecture — Phase 1: Drawing Comparison & Deviation Detection

## Purpose
Onboard approved engineering drawings as baselines, compare new revisions against them,
and produce a fully traceable diff report: modified parameters, missing components,
newly added components, and matching parameters — each linked back to its source location
in the original drawing.

## Why this stack

| Decision | Reasoning |
|---|---|
| FastAPI over Flask/Django | Native async, automatic OpenAPI docs, Pydantic validation matches our need for strict structured AI outputs |
| Celery + Redis for the pipeline | Drawing processing (OCR, detection, LLM calls) takes seconds-to-minutes — must never block an HTTP request |
| PostgreSQL | Relational integrity between drawings, revisions, comparisons, and audit trail entries |
| Qdrant | Exact-text diffing fails when a revision renames/rewords a parameter. Embedding-based similarity search lets us match "Line pressure rating" (baseline) to "Max operating pressure" (revision) as the same field |
| MinIO | S3-compatible locally; swaps to real AWS S3 in production with zero code changes |
| LangGraph | The extraction → comparison → classification pipeline has conditional logic (e.g., re-run extraction on low OCR confidence) — a state graph makes this explicit, inspectable, and testable, versus a linear function chain |
| Groq (via LangChain) | Fast, low-cost inference for the reasoning/classification step, which operates on already-OCR'd structured text, not raw images |

## Request flow (Step 1 scope)

```
Browser → Next.js (page.tsx) → GET /api/v1/health/ready
                                      ↓
                              FastAPI (health.py)
                                 ↓         ↓
                            Postgres     Redis
```

## Planned request flow (by Step 6, full Phase 1)

```
Upload baseline + revision (PDF/image)
        ↓
FastAPI receives → stores raw files in MinIO → creates DB records → enqueues Celery job
        ↓
Celery worker runs LangGraph pipeline:
  1. Preprocess (OpenCV: deskew, normalize)
  2. Extract text (PaddleOCR) + detect components (YOLOv11)
  3. Structure extracted data (Groq via LangChain, structured JSON output)
  4. Embed parameters (Sentence Transformers) → store/query in Qdrant for fuzzy matching
  5. Diff engine: classify each item as modified / missing / added / matching
  6. Persist diff results + bounding-box + confidence in Postgres
        ↓
Frontend polls/fetches comparison result → renders DiffViewer + TraceabilityPanel
```

## Data model (introduced progressively)

- `users` — Step 2
- `drawings` (baseline/revision metadata, MinIO object key) — Step 3
- `extracted_parameters` (per-drawing structured data + bbox + confidence) — Step 4
- `comparisons` (baseline_id, revision_id, status) — Step 5
- `diff_items` (comparison_id, classification, source_ref for traceability) — Step 5/6

## References

- FastAPI async SQLAlchemy pattern: https://fastapi.tiangolo.com/advanced/async-sql-databases/
- Celery + FastAPI integration: https://docs.celeryq.dev/en/stable/
- LangGraph concepts: https://langchain-ai.github.io/langgraph/
- Qdrant similarity search: https://qdrant.tech/documentation/
- PaddleOCR: https://github.com/PaddlePaddle/PaddleOCR
- Ultralytics YOLOv11: https://docs.ultralytics.com/models/yolo11/
- Groq API + LangChain integration: https://python.langchain.com/docs/integrations/chat/groq/
