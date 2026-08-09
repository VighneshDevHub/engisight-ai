from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.security import (
    create_access_token,
    hash_password,
    validate_password_complexity,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserLogin, UserRead

router = APIRouter()


async def _parse_login_payload(request: Request) -> UserLogin:
    """
    Accepts login via both JSON body (frontend SPA) and standard OAuth2
    application/x-www-form-urlencoded (Swagger's "Authorize" button, curl,
    third-party clients). Keeps the endpoint spec-compliant *and* SPA-friendly
    without duplicating the whole handler.
    """
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        # OAuth2 convention: field is `username`, but our auth uses email.
        # Accept both so Swagger's built-in form works out of the box.
        email = form.get("username") or form.get("email")
        password = form.get("password")
        return UserLogin(email=email or "", password=password or "")

    body = await request.json()
    return UserLogin(**body)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    ok, missing = validate_password_complexity(payload.password)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Password does not meet complexity requirements. "
                f"Need 3 of: uppercase letter, lowercase letter, digit, symbol. "
                f"Missing: {', '.join(missing)}."
            ),
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        payload = await _parse_login_payload(request)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid login payload. Send JSON {email, password} or OAuth2 form (username=email, password=...).",
        )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    access_token = create_access_token(subject=str(user.id))
    return Token(access_token=access_token)


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
