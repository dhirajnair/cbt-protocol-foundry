"""Database setup and session management."""
from sqlmodel import SQLModel, Session, create_engine
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool
from psycopg import AsyncConnection
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from app.config import settings


# SQLModel engine for session storage (using psycopg3/psycopg driver)
# postgresql+psycopg:// uses the new psycopg 3 driver
engine = create_engine(
    settings.database_url.replace("postgresql://", "postgresql+psycopg://"),
    echo=False,
)


def init_db():
    """Initialize the database tables."""
    SQLModel.metadata.create_all(engine)
    print("✅ Database tables created")


def get_session():
    """Get a database session."""
    with Session(engine) as session:
        yield session


# Global checkpointer instance (will be initialized on startup)
_checkpointer: AsyncPostgresSaver | None = None
_pool: AsyncConnectionPool | None = None


async def init_checkpointer():
    """Initialize the LangGraph PostgreSQL checkpointer."""
    global _checkpointer, _pool
    
    if _checkpointer is None:
        # First, run setup in autocommit mode to create tables/indexes
        async with await AsyncConnection.connect(
            settings.database_url,
            autocommit=True,
        ) as setup_conn:
            # Create a temporary checkpointer just for setup
            setup_checkpointer = AsyncPostgresSaver(setup_conn)
            await setup_checkpointer.setup()
        
        # Now create the pool for normal operations
        _pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            open=False,
        )
        await _pool.open()
        
        # Create the actual checkpointer with the pool
        _checkpointer = AsyncPostgresSaver(_pool)
        print("✅ LangGraph checkpointer initialized")
    
    return _checkpointer


async def get_checkpointer() -> AsyncPostgresSaver:
    """Get the LangGraph checkpointer."""
    global _checkpointer
    if _checkpointer is None:
        return await init_checkpointer()
    return _checkpointer


async def close_checkpointer():
    """Close the checkpointer connection pool."""
    global _checkpointer, _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        _checkpointer = None
        print("✅ Checkpointer connection closed")


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[Session, None]:
    """Async context manager for database sessions."""
    with Session(engine) as session:
        yield session
