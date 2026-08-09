import numpy as np
import cv2

from app.services.region_proposal_service import crop_region, propose_component_regions


def _make_synthetic_pid_page_separated_shapes() -> np.ndarray:
    """
    Builds a synthetic 600x800 white page with 3 drawn shapes (representing
    component symbols) that do NOT touch each other or any connecting line —
    a deterministic input so this test doesn't depend on any real drawing
    file or external service, just the OpenCV logic itself.
    """
    page = np.full((600, 800, 3), 255, dtype=np.uint8)

    # Shape 1: a filled rectangle (e.g. a vessel/tank symbol)
    cv2.rectangle(page, (50, 50), (150, 150), (0, 0, 0), thickness=-1)

    # Shape 2: a filled circle (e.g. a valve symbol) — far enough from shape 1
    # that dilation cannot bridge the gap between them.
    cv2.circle(page, (400, 100), 40, (0, 0, 0), thickness=-1)

    # Shape 3: a filled triangle-ish polygon (e.g. an instrument bubble)
    pts = np.array([[600, 300], [650, 380], [550, 380]], dtype=np.int32)
    cv2.fillPoly(page, [pts], (0, 0, 0))

    # A short isolated line segment far from all three shapes — represents
    # pipe/noise that should NOT be mistaken for merging with a real shape.
    cv2.line(page, (700, 500), (750, 550), (0, 0, 0), thickness=2)

    return page


def _make_synthetic_pid_page_touching_shapes() -> np.ndarray:
    """
    Same two shapes as above, but connected by a line that touches both —
    reproducing the known under-segmentation limitation documented in
    region_proposal_service.py: a real P&ID's pipe lines connect directly
    to component symbols, which can merge them into a single contour.
    """
    page = np.full((600, 800, 3), 255, dtype=np.uint8)
    cv2.rectangle(page, (50, 50), (150, 150), (0, 0, 0), thickness=-1)
    cv2.circle(page, (400, 100), 40, (0, 0, 0), thickness=-1)
    # Line drawn from the rectangle's right edge to the circle's center,
    # touching both shapes directly.
    cv2.line(page, (150, 100), (400, 100), (0, 0, 0), thickness=2)
    return page


def _bbox_contains_point(bbox: list[int], point: tuple[int, int]) -> bool:
    x1, y1, x2, y2 = bbox
    px, py = point
    return x1 <= px <= x2 and y1 <= py <= y2


def test_propose_component_regions_finds_separated_shapes():
    page = _make_synthetic_pid_page_separated_shapes()
    regions = propose_component_regions(page)

    assert len(regions) >= 3, (
        f"Expected at least 3 regions for the 3 separated shapes, got {len(regions)}: {regions}"
    )

    # Every returned bbox must be valid (within page bounds, non-zero area)
    h, w = page.shape[:2]
    for region in regions:
        x1, y1, x2, y2 = region["bbox"]
        assert 0 <= x1 < x2 <= w
        assert 0 <= y1 < y2 <= h

    # Each of the 3 known shape centers must fall inside at least one
    # returned region — a stronger check than just counting regions.
    shape_centers = [(100, 100), (400, 100), (600, 350)]
    for center in shape_centers:
        assert any(_bbox_contains_point(r["bbox"], center) for r in regions), (
            f"No region found covering expected shape center {center}"
        )


def test_propose_component_regions_merges_touching_shapes_known_limitation():
    """
    Documents the known under-segmentation limitation: when a connecting
    line touches two symbols directly, they merge into one region instead
    of two. This test exists so a future improvement to the algorithm has
    a clear, concrete regression check to update.
    """
    page = _make_synthetic_pid_page_touching_shapes()
    regions = propose_component_regions(page)

    # Both shape centers should fall within the SAME merged region (not two
    # separate ones) — this is the documented limitation, verified concretely.
    rectangle_center = (100, 100)
    circle_center = (400, 100)

    merged_region = next(
        (r for r in regions if _bbox_contains_point(r["bbox"], rectangle_center)), None
    )
    assert merged_region is not None
    assert _bbox_contains_point(merged_region["bbox"], circle_center), (
        "Expected the touching rectangle and circle to merge into one region "
        "(documented limitation) — if this now fails, the algorithm may have "
        "improved and this test's expectation should be updated."
    )


def test_crop_region_returns_correct_slice():
    page = _make_synthetic_pid_page_separated_shapes()
    bbox = [40, 40, 160, 160]  # covers the rectangle shape with some padding

    crop = crop_region(page, bbox)

    assert crop.shape[0] == bbox[3] - bbox[1]
    assert crop.shape[1] == bbox[2] - bbox[0]
    # The crop should contain some black pixels (the drawn rectangle) —
    # confirms we cropped the right region, not an empty/wrong area.
    assert np.any(crop < 128)
