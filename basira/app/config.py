"""Basira configuration.

Loads settings from environment variables (via .env file) using pydantic-settings.
Paths are resolved relative to the project root so the app works regardless of
the directory it's launched from.
"""
from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root: the directory containing pyproject.toml. We compute it once here
# by walking up from this file's location, so absolute paths always resolve
# correctly no matter where uvicorn is launched from.
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _resolve(p: str | Path) -> Path:
    """Resolve a possibly-relative path against the project root."""
    path = Path(p)
    return path if path.is_absolute() else PROJECT_ROOT / path


class Settings(BaseSettings):
    """All app settings. Prefixed with BASIRA_ in the environment."""

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- Server ----
    host: str = Field(default="127.0.0.1", alias="BASIRA_HOST")
    port: int = Field(default=8000, alias="BASIRA_PORT")
    log_level: str = Field(default="INFO", alias="BASIRA_LOG_LEVEL")

    # ---- Storage paths (strings in env, Paths after resolution) ----
    db_path_raw: str = Field(default="data/basira.db", alias="BASIRA_DB_PATH")
    data_dir_raw: str = Field(default="data", alias="BASIRA_DATA_DIR")
    documents_dir_raw: str = Field(default="data/documents", alias="BASIRA_DOCUMENTS_DIR")

    # ---- Source registry ----
    sources_csv_raw: str = Field(
        default="data/context_engine_sources_master.csv", alias="BASIRA_SOURCES_CSV"
    )
    sources_overrides_raw: str = Field(
        default="data/sources_overrides.yaml", alias="BASIRA_SOURCES_OVERRIDES"
    )

    # ---- AI keys ----
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    voyage_api_key: str = Field(default="", alias="VOYAGE_API_KEY")
    claude_model: str = Field(default="claude-sonnet-4-5-20250929", alias="BASIRA_CLAUDE_MODEL")
    voyage_model: str = Field(default="voyage-3", alias="BASIRA_VOYAGE_MODEL")
    max_body_tokens: int = Field(default=30000, alias="BASIRA_MAX_BODY_TOKENS")

    # ---- Analysis policy ----
    # Comma-separated list of tiers to analyze (e.g., "Tier 1,Tier 2").
    analyze_tiers_raw: str = Field(default="Tier 1,Tier 2", alias="BASIRA_ANALYZE_TIERS")

    # ---- Admin ----
    admin_token: str = Field(default="changeme", alias="BASIRA_ADMIN_TOKEN")

    # ---- CORS ----
    cors_origins_raw: str = Field(default="*", alias="BASIRA_CORS_ORIGINS")

    # ---- Scheduler ----
    scheduler_enabled: bool = Field(default=True, alias="BASIRA_SCHEDULER_ENABLED")

    # ---- Derived / resolved properties ----
    @property
    def db_path(self) -> Path:
        return _resolve(self.db_path_raw)

    @property
    def data_dir(self) -> Path:
        return _resolve(self.data_dir_raw)

    @property
    def documents_dir(self) -> Path:
        return _resolve(self.documents_dir_raw)

    @property
    def sources_csv(self) -> Path:
        return _resolve(self.sources_csv_raw)

    @property
    def sources_overrides(self) -> Path:
        return _resolve(self.sources_overrides_raw)

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path}"

    @property
    def analyze_tiers(self) -> list[str]:
        return [t.strip() for t in self.analyze_tiers_raw.split(",") if t.strip()]

    @property
    def cors_origins(self) -> list[str]:
        raw = self.cors_origins_raw.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    def ensure_dirs(self) -> None:
        """Create any missing data directories at startup."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.documents_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)


# Single shared instance. Import from here everywhere.
settings = Settings()
