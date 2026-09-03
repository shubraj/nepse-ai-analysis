"""SQLAlchemy DB (PostgreSQL)."""

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

from config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_database_exists() -> None:
    """Create the configured database if the PostgreSQL volume does not have it yet."""
    url = make_url(DATABASE_URL)
    database_name = url.database
    if not database_name:
        return

    admin_db = "postgres"
    if database_name == admin_db:
        return

    connection = psycopg2.connect(
        host=url.host,
        port=url.port or 5432,
        user=url.username,
        password=url.password,
        dbname=admin_db,
    )
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (database_name,))
            exists = cursor.fetchone() is not None
            if not exists:
                cursor.execute(f'CREATE DATABASE "{database_name}"')
    finally:
        connection.close()


def init_db():
    _ensure_database_exists()
    Base.metadata.create_all(bind=engine)
    _migrate()


def _migrate() -> None:
    """Apply additive schema changes that create_all won't add to existing tables."""
    from sqlalchemy import text
    stmts = [
        "ALTER TABLE companies ADD COLUMN IF NOT EXISTS analysis_hash VARCHAR(16)",
    ]
    with engine.connect() as conn:
        for stmt in stmts:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()
