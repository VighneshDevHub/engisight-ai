import re
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"

# Password complexity — engineering/audit requirements: at least 8 chars
# (already enforced by schema), plus must contain 3 of 4 classes
# (upper, lower, digit, symbol). Matches typical enterprise password policy.
_PASSWORD_CLASSES = [
    (re.compile(r"[A-Z]"), "uppercase letter"),
    (re.compile(r"[a-z]"), "lowercase letter"),
    (re.compile(r"\d"), "digit"),
    (re.compile(r"[^A-Za-z0-9]"), "symbol"),
]
_PASSWORD_MIN_CLASSES = 3


def validate_password_complexity(password: str) -> tuple[bool, list[str]]:
    """
    Lightweight password policy check. Returns (ok, list_of_missing_classes).
    Called by the register endpoint BEFORE hashing — never store the plaintext,
    never log it. 3/4-class policy balances strength with real-user usability
    (engineering teams notoriously hate password friction in internal tools).
    """
    missing = [label for rx, label in _PASSWORD_CLASSES if not rx.search(password)]
    ok = len(missing) <= len(_PASSWORD_CLASSES) - _PASSWORD_MIN_CLASSES
    return ok, missing


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    """
    Creates a signed JWT. `subject` is the user's id (as string) — kept minimal
    on purpose; anything else needed about the user is fetched from the DB
    on each request via get_current_user, not trusted from the token payload.

    Standard claims included:
      - sub: user id (uuid str)
      - exp: expiration (UTC)
      - iat: issued-at (UTC) — useful for token revocation detection later
      - iss: issuer constant so a future microservice can reject tokens
             minted by a different authority
    """
    now = datetime.now(timezone.utc)
    expire_delta = timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": subject,
        "exp": now + expire_delta,
        "iat": now,
        "iss": settings.APP_NAME,
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
            # Optional issuer check — if a token was minted by a different app
            # sharing the same SECRET_KEY (mistake), this rejects it.
            issuer=settings.APP_NAME,
        )
        if "sub" not in payload:
            return None
        return payload
    except JWTError:
        return None
