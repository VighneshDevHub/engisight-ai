import uuid

import pytest

from app.services.diff_engine import run_diff


@pytest.mark.asyncio
async def test_diff_engine_classifies_matching_modified_missing_added():
    """
    Requires Qdrant to be running (via docker-compose) and downloads the
    sentence-transformers model on first run — this is an integration test
    of the real matching logic, not a mock, because the whole point of this
    component is whether the fuzzy matching actually works correctly.
    """
    comparison_id = uuid.uuid4()

    baseline_params = [
        {"id": uuid.uuid4(), "parameter_name": "Line pressure rating", "parameter_value": "150", "unit": "psi"},
        {"id": uuid.uuid4(), "parameter_name": "Pipe diameter", "parameter_value": "6", "unit": "inch"},
        {"id": uuid.uuid4(), "parameter_name": "Material grade", "parameter_value": "ASTM A106 Gr. B", "unit": None},
    ]

    revision_params = [
        # Renamed but semantically the same field, same value -> should be "matching"
        {"id": uuid.uuid4(), "parameter_name": "Max operating pressure", "parameter_value": "150", "unit": "psi"},
        # Same field, changed value -> should be "modified"
        {"id": uuid.uuid4(), "parameter_name": "Pipe diameter", "parameter_value": "8", "unit": "inch"},
        # Brand new field -> should be "added"
        {"id": uuid.uuid4(), "parameter_name": "Insulation thickness", "parameter_value": "50", "unit": "mm"},
        # Note: "Material grade" has no revision counterpart -> should be "missing"
    ]

    diff_items = run_diff(comparison_id, baseline_params, revision_params)
    by_classification = {}
    for item in diff_items:
        by_classification.setdefault(item["classification"], []).append(item)

    assert len(by_classification.get("matching", [])) == 1
    assert by_classification["matching"][0]["parameter_name"] == "Line pressure rating"

    assert len(by_classification.get("modified", [])) == 1
    assert by_classification["modified"][0]["parameter_name"] == "Pipe diameter"
    assert by_classification["modified"][0]["baseline_value"] == "6"
    assert by_classification["modified"][0]["revision_value"] == "8"

    assert len(by_classification.get("missing", [])) == 1
    assert by_classification["missing"][0]["parameter_name"] == "Material grade"

    assert len(by_classification.get("added", [])) == 1
    assert by_classification["added"][0]["parameter_name"] == "Insulation thickness"
