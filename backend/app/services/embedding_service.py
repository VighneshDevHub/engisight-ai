from typing import TYPE_CHECKING, Any

from app.core.config import settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

_embedding_model: Any | None = None


def get_embedding_model() -> Any:
    """
    Lazily-loaded singleton. Runs locally (CPU is fine for MiniLM-L6-v2) —
    deliberately not an API call, since embedding every parameter name/value
    pair for every comparison would be a lot of round trips otherwise.
    Auto-downloads the model from HuggingFace on first use.
    """
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer

        _embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)
    return _embedding_model


def embed_text(text: str) -> list[float]:
    return get_embedding_model().encode(text, normalize_embeddings=True).tolist()


def embed_parameter(parameter_name: str, parameter_value: str, unit: str | None) -> list[float]:
    """
    Embeds a combined representation of an engineering parameter so that
    semantically-equivalent-but-differently-worded fields (e.g. baseline's
    "Line pressure rating: 150 psi" vs revision's "Max operating pressure: 150 psi")
    land close together in vector space.
    """
    unit_part = f" {unit}" if unit else ""
    combined = f"{parameter_name}: {parameter_value}{unit_part}"
    return embed_text(combined)
