"""Alembic environment — wired to Basira's models and settings."""
import sys
from logging.config import fileConfig
from pathlib import Path

# Make the project importable (alembic may be invoked from the project root).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from alembic import context  # noqa: E402
from sqlalchemy import pool  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app import models  # noqa: E402,F401  — register all models with Base.metadata

# Alembic Config object, which provides access to the values within the .ini file in use.
config = context.config

# Override the sqlalchemy.url from our settings (so alembic uses the same DB as the app).
config.set_main_option("sqlalchemy.url", settings.database_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite needs batch mode for ALTER TABLE
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — reuses Basira's engine so sqlite-vec is loaded."""
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
