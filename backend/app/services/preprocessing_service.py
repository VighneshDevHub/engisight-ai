import io

import cv2
import numpy as np
from pdf2image import convert_from_bytes
from PIL import Image


def bytes_to_page_images(file_bytes: bytes, content_type: str) -> list[np.ndarray]:
    """
    Converts uploaded drawing bytes into a list of OpenCV BGR images, one per page.
    PDFs are rasterized at 300 DPI — high enough to keep small dimension text legible
    for OCR, without producing unreasonably large images.
    """
    if content_type == "application/pdf":
        pil_pages = convert_from_bytes(file_bytes, dpi=300)
        return [cv2.cvtColor(np.array(page), cv2.COLOR_RGB2BGR) for page in pil_pages]

    pil_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    return [cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)]


def preprocess_image(image: np.ndarray, denoise: bool = False) -> np.ndarray:
    """
    Deskew + contrast-normalize a page image before OCR/detection. This measurably
    improves PaddleOCR accuracy on scanned drawings with slight rotation or faded lines.

    `denoise` is applied only on retry passes (see extraction_graph's conditional
    retry edge) — it's slower, so we don't pay that cost on every page by default.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)

    if denoise:
        gray = cv2.fastNlMeansDenoising(gray, h=10)

    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))

    angle = 0.0
    if len(coords) > 0:
        rect_angle = cv2.minAreaRect(coords)[-1]
        angle = -(90 + rect_angle) if rect_angle < -45 else -rect_angle

    (h, w) = gray.shape
    center = (w // 2, h // 2)
    rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    deskewed = cv2.warpAffine(
        gray, rotation_matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return cv2.cvtColor(deskewed, cv2.COLOR_GRAY2BGR)
