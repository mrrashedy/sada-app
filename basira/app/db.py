"""Database engine and session factory.

SQLite + sqlite-vec. The vector extension is loaded on every new connection
via a sqlalchemy event listener — SQLite won't remember it between connections
otherwise.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import sqlite_vec
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy models."""


def _make_engine() -> Engine:
    settings.ensure_dirs()
    engine = create_engine(
        settings.database_url,
        future=True,
        # SQLite needs this for thread safety when used from FastAPI workers
        connect_args={"check_same_thread": False},
        echo=False,
    )

    @event.listens_for(engine, "connect")
    def _load_sqlite_vec(dbapi_conn, _connection_record) -> None:
        """Load the sqlite-vec extension on every new connection.

        Also enables WAL mode so readers and the ingest/analyze workers can
        coexist without blocking.
        """
        dbapi_conn.enable_load_extension(True)
        sqlite_vec.load(dbapi_conn)
        dbapi_conn.enable_load_extension(False)
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    return engine


engine: Engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context-managed session that commits on success and rolls back on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Iterator[Session]:
    """FastAPI dependency — one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_vector_table() -> None:
    """Create the sqlite-vec virtual table for document embeddings.

    Alembic doesn't know about virtual tables, so we manage this one manually.
    Idempotent — safe to call on every startup.
    """
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings
            USING vec0(
                document_id INTEGER PRIMARY KEY,
                embedding FLOAT[1024]
            )
            """
        )
