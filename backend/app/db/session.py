from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG, future=True)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Celery tasks run outside FastAPI's event loop and can't use an async session
# cleanly — a plain sync SQLAlchemy session (via psycopg2) is the standard
# pattern for Celery workers, kept separate from the async engine above.
_sync_database_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
sync_engine = create_engine(_sync_database_url, echo=settings.DEBUG, future=True)
SyncSessionLocal = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Base class every ORM model inherits from."""
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a DB session per request, closes it after."""
    async with AsyncSessionLocal() as session:
        yield session
