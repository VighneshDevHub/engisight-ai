"""
Fast / no-dependency unit tests for app.core.security.

All tests are fully offline — no Postgres, no Redis, no LLM calls. They exercise
the password hashing/verification, password-complexity policy, and JWT creation/
decoding code paths *without* any external service. This makes the suite useful
in CI on a clean checkout, not just when docker-compose is up.

The integration tests that DO require a real database live in test_auth.py —
those are optional to run locally (they still exist, they just get skipped when
Postgres isn't reachable).
"""

import pytest

from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    create_access_token,
    decode_access_token,
    hash_password,
    validate_password_complexity,
    verify_password,
)


# ──────────────────────────────────────────────────────────────────────────────
# Password hashing + verification
# ──────────────────────────────────────────────────────────────────────────────

def test_hash_password_is_deterministic_verifiable():
    pw = "HelloEngiSight1!"
    h = hash_password(pw)
    # bcrypt hashes always start with $2b$ (or $2a$) and are ~60 chars
    assert h.startswith("$2")
    assert len(h) > 50
    # Same plaintext + same hash → verify passes
    assert verify_password(pw, h) is True


def test_hash_is_salted_different_each_time():
    pw = "SamePassword123!"
    # Two hashes of the SAME plaintext must differ (salt is random every call)
    assert hash_password(pw) != hash_password(pw)
    # But both still verify the plaintext
    assert verify_password(pw, hash_password(pw)) is True


def test_verify_password_wrong_plaintext_returns_false():
    h = hash_password("CorrectHorseBattery1")
    assert verify_password("anything-else", h) is False


def test_verify_password_empty_plaintext():
    h = hash_password("has-a-real-password")
    assert verify_password("", h) is False


# ──────────────────────────────────────────────────────────────────────────────
# Password complexity policy — 3 of 4 classes required
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "pw,expected_ok,missing_count",
    [
        # Strong — all 4 classes present
        ("StrongPW!2026", True, 0),
        # Still OK — exactly 3 classes (no symbol)
        ("Alllowercase1X", True, 1),
        # Only 2 classes — fails (lower + digit)
        ("onlylowercase123", False, 2),
        # Only 1 class — fails
        ("ALLUPPERCASE", False, 3),
        # Too short but classes ok (length check is schema's job, not
        # complexity's — so this is considered 'complexity-ok' by itself,
        # which is correct layering).
        ("Aa1!", True, 0),
        # Unicode letters treated as 'other' — shouldn't crash; explicit
        # [A-Z]/[a-z] classifiers count only ASCII, so uppercase C +
        # lowercase a/f + digits 1/2/3 = 3 classes present → missing=0
        ("Café123", True, 0),
    ],
)
def test_password_complexity_policy(pw: str, expected_ok: bool, missing_count: int):
    ok, missing = validate_password_complexity(pw)
    assert ok is expected_ok
    assert len(missing) == missing_count
    # If we say something is missing, it must come from the canonical label list
    allowed_labels = {"uppercase letter", "lowercase letter", "digit", "symbol"}
    for m in missing:
        assert m in allowed_labels


# ──────────────────────────────────────────────────────────────────────────────
# JWT creation + decoding
# ──────────────────────────────────────────────────────────────────────────────

def test_create_and_decode_roundtrip():
    sub = "user-123"
    token = create_access_token(subject=sub)
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == sub
    # Standard claims are present (these are new in Phase 1 Step 2)
    assert "iat" in payload, "token must include issued-at claim"
    assert "exp" in payload, "token must include expiration claim"
    assert payload["iss"] == settings.APP_NAME, "issuer must match APP_NAME"
    assert payload["exp"] > payload["iat"]


def test_decode_access_token_rejects_garbage():
    assert decode_access_token("not.a.jwt") is None
    assert decode_access_token("") is None


def test_decode_access_token_wrong_signing_key(tmp_path):
    """
    A token signed with a different key must decode to None (not throw).
    We verify this by temporarily overriding SECRET_KEY to mint a "foreign"
    token, then decode with the real settings key already in memory.
    """
    import jose.jwt as _jose_jwt

    foreign_signed = _jose_jwt.encode(
        {"sub": "attacker", "iat": 1, "exp": 9999999999, "iss": settings.APP_NAME},
        key="a-completely-different-secret-key",
        algorithm=ALGORITHM,
    )
    assert decode_access_token(foreign_signed) is None


def test_decode_access_token_wrong_issuer_is_rejected():
    """Token minted by a different 'iss' claim must be rejected."""
    import jose.jwt as _jose_jwt

    wrong_iss = _jose_jwt.encode(
        {"sub": "user-1", "iat": 1, "exp": 9999999999, "iss": "SomeOtherApp"},
        key=settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )
    assert decode_access_token(wrong_iss) is None


def test_create_access_token_custom_expiry():
    """Passing expires_minutes shrinks/grows the exp window predictably."""
    short = create_access_token(subject="x", expires_minutes=1)
    long = create_access_token(subject="x", expires_minutes=1440)
    p_short = decode_access_token(short)
    p_long = decode_access_token(long)
    assert p_short is not None and p_long is not None
    window_short = p_short["exp"] - p_short["iat"]
    window_long = p_long["exp"] - p_long["iat"]
    # Actual values aren't exact (time passes between calls) — use ranges
    assert 0 <= window_short <= 120, "1-min token should expire in ~60s"
    assert window_long >= 86000, "1440-min token should expire in ~24h"


def test_decode_access_token_missing_sub_returns_none():
    """
    If someone mints a perfectly-signed token but forgets the `sub` claim,
    we reject it (gateway code treats the token as useless).
    """
    import jose.jwt as _jose_jwt

    payload = {"iat": 1, "exp": 9999999999, "iss": settings.APP_NAME}
    no_sub = _jose_jwt.encode(payload, key=settings.SECRET_KEY, algorithm=ALGORITHM)
    assert decode_access_token(no_sub) is None
