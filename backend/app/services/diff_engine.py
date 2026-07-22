import uuid

from app.services.embedding_service import embed_parameter
from app.services.qdrant_service import (
    create_comparison_collection,
    delete_comparison_collection,
    search_best_match,
    upsert_revision_parameters,
)

# Below this similarity score, we don't trust the match at all — treat the
# baseline parameter as having no revision counterpart (missing).
MATCH_THRESHOLD = 0.70

# Above this, values are compared for equality to decide matching vs modified.
def _values_equal(a: str, b: str) -> bool:
    return a.strip().lower() == b.strip().lower()


def run_diff(
    comparison_id: uuid.UUID,
    baseline_parameters: list[dict],
    revision_parameters: list[dict],
) -> list[dict]:
    """
    baseline_parameters / revision_parameters: list of dicts with keys
    {id, parameter_name, parameter_value, unit}, i.e. rows from ExtractedParameter.

    Returns a list of diff item dicts ready to persist as DiffItem rows:
    {classification, parameter_name, baseline_parameter_id, revision_parameter_id,
     baseline_value, revision_value, match_confidence, explanation}
    """
    collection_name = create_comparison_collection(comparison_id)

    try:
        if revision_parameters:
            revision_points = [
                {
                    "id": str(rp["id"]),
                    "vector": embed_parameter(rp["parameter_name"], rp["parameter_value"], rp.get("unit")),
                    "payload": {
                        "parameter_name": rp["parameter_name"],
                        "parameter_value": rp["parameter_value"],
                        "unit": rp.get("unit"),
                    },
                }
                for rp in revision_parameters
            ]
            upsert_revision_parameters(collection_name, revision_points)

        matched_revision_ids: set[str] = set()
        diff_items: list[dict] = []

        for bp in baseline_parameters:
            query_vector = embed_parameter(bp["parameter_name"], bp["parameter_value"], bp.get("unit"))
            matches = search_best_match(collection_name, query_vector, top_k=1) if revision_parameters else []

            if not matches or matches[0]["score"] < MATCH_THRESHOLD:
                diff_items.append(
                    {
                        "classification": "missing",
                        "parameter_name": bp["parameter_name"],
                        "baseline_parameter_id": bp["id"],
                        "revision_parameter_id": None,
                        "baseline_value": bp["parameter_value"],
                        "revision_value": None,
                        "match_confidence": matches[0]["score"] if matches else 0.0,
                        "explanation": (
                            f"'{bp['parameter_name']}' ({bp['parameter_value']}) appears in the "
                            "baseline but no sufficiently similar parameter was found in the "
                            "revision — likely removed or renamed beyond recognition."
                        ),
                    }
                )
                continue

            best = matches[0]
            matched_revision_ids.add(best["id"])
            revision_value = best["payload"]["parameter_value"]
            revision_name = best["payload"]["parameter_name"]

            if _values_equal(bp["parameter_value"], revision_value):
                classification = "matching"
                explanation = (
                    f"'{bp['parameter_name']}' is unchanged ({bp['parameter_value']}) "
                    f"between baseline and revision."
                )
            else:
                classification = "modified"
                explanation = (
                    f"'{bp['parameter_name']}' changed from '{bp['parameter_value']}' (baseline) "
                    f"to '{revision_value}' (revision, field matched as '{revision_name}')."
                )

            diff_items.append(
                {
                    "classification": classification,
                    "parameter_name": bp["parameter_name"],
                    "baseline_parameter_id": bp["id"],
                    "revision_parameter_id": uuid.UUID(best["id"]),
                    "baseline_value": bp["parameter_value"],
                    "revision_value": revision_value,
                    "match_confidence": best["score"],
                    "explanation": explanation,
                }
            )

        # Any revision parameter never claimed as a match is newly added.
        for rp in revision_parameters:
            if str(rp["id"]) not in matched_revision_ids:
                diff_items.append(
                    {
                        "classification": "added",
                        "parameter_name": rp["parameter_name"],
                        "baseline_parameter_id": None,
                        "revision_parameter_id": rp["id"],
                        "baseline_value": None,
                        "revision_value": rp["parameter_value"],
                        "match_confidence": 1.0,
                        "explanation": (
                            f"'{rp['parameter_name']}' ({rp['parameter_value']}) appears in the "
                            "revision but has no counterpart in the baseline — newly added."
                        ),
                    }
                )

        return diff_items

    finally:
        delete_comparison_collection(comparison_id)
