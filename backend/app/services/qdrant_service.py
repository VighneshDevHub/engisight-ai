import uuid

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.core.config import settings

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 output size

_client: QdrantClient | None = None


def get_qdrant_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    return _client


def collection_name_for_comparison(comparison_id: uuid.UUID) -> str:
    return f"comparison_{comparison_id}"


def create_comparison_collection(comparison_id: uuid.UUID) -> str:
    """
    Creates a short-lived Qdrant collection scoped to one comparison job, holding
    the revision drawing's parameter embeddings. The baseline side is queried
    against it (see diff_engine.match_baseline_to_revision) to find the closest
    semantic match for each baseline parameter — this is what lets us correctly
    match a renamed/reworded field across revisions instead of relying on exact
    text equality, which is the whole reason Qdrant is in this architecture.
    """
    client = get_qdrant_client()
    name = collection_name_for_comparison(comparison_id)
    client.recreate_collection(
        collection_name=name,
        vectors_config=qmodels.VectorParams(size=EMBEDDING_DIM, distance=qmodels.Distance.COSINE),
    )
    return name


def upsert_revision_parameters(collection_name: str, points: list[dict]) -> None:
    """
    `points`: list of {id: str (extracted_parameter uuid as str), vector: list[float],
    payload: {parameter_name, parameter_value, unit}}
    """
    client = get_qdrant_client()
    client.upsert(
        collection_name=collection_name,
        points=[
            qmodels.PointStruct(id=p["id"], vector=p["vector"], payload=p["payload"])
            for p in points
        ],
    )


def search_best_match(collection_name: str, query_vector: list[float], top_k: int = 1) -> list[dict]:
    client = get_qdrant_client()
    results = client.search(
        collection_name=collection_name, query_vector=query_vector, limit=top_k
    )
    return [{"id": r.id, "score": r.score, "payload": r.payload} for r in results]


def delete_comparison_collection(comparison_id: uuid.UUID) -> None:
    """Cleanup — the collection is only needed for the duration of one comparison job."""
    client = get_qdrant_client()
    name = collection_name_for_comparison(comparison_id)
    try:
        client.delete_collection(collection_name=name)
    except Exception:
        pass  # already gone / never created — not worth failing the job over
