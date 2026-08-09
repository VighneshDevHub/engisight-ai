import pytest_asyncio

from app.db.session import engine


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine_after_each_test():
    """
    The async engine in app/db/session.py is created once at import time and
    shared across the whole test session, but pytest-asyncio gives each test
    function its own event loop. Without this fixture, a connection opened
    (and pooled) during test A's event loop gets reused during test B's
    *different* event loop — which asyncpg/Windows' ProactorEventLoop cannot
    handle, surfacing as "cannot perform operation: another operation is in
    progress" or "Event loop is closed" on the second and every subsequent
    test. Disposing the pool after each test forces the next test to open a
    fresh connection bound to its own (current) event loop.
    """
    yield
    await engine.dispose()
