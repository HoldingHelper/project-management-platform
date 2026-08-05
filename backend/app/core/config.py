"""Application configuration, loaded from environment variables / .env file."""

from functools import lru_cache
from typing import List, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "CHANGE_ME_dev_only_secret_key_please_override_in_env"
_DEFAULT_DB_PASSWORD = "pmp_dev_password"
_DEFAULT_S3_ACCESS_KEY = "pmp_minio_admin"
_DEFAULT_S3_SECRET_KEY = "pmp_minio_password"
_DEFAULT_SEED_ADMIN_PASSWORD = "ChangeMe123!"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # General
    app_name: str = "Project Management Platform API"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # Database
    database_url: str = (
        "postgresql+asyncpg://pmp_app:pmp_dev_password@localhost:5432/projectplatform"
    )
    database_echo: bool = False

    # JWT / Auth
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Realtime: publish websocket broadcasts through Redis Pub/Sub so multiple
    # API replicas stay in sync. Safe to leave on for single-process deploys
    # (publishing is best-effort); disable only for Redis-less local runs/tests.
    realtime_backplane_enabled: bool = True

    # Google Drive integration (music channels). Empty = feature disabled;
    # the /music/drive endpoints return a clear error until configured.
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:3000/drive/callback"
    # Fernet key for encrypting stored Google refresh tokens at rest.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    music_token_encryption_key: str = ""
    # Signed stream-URL lifetime. Browsers re-request audio via Range as the
    # buffer drains, so this must outlive a full listening session — a short
    # TTL kills playback mid-track on long songs / pause+resume.
    music_stream_token_ttl_seconds: int = 21600
    # Server-side byte cache for Drive tracks (MinIO). One Drive fetch per
    # track for the whole room instead of one per listener.
    music_cache_enabled: bool = True
    music_cache_bucket: str = "music-cache"
    music_cache_max_bytes: int = 5 * 1024 * 1024 * 1024

    # S3 / MinIO
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "pmp_minio_admin"
    s3_secret_key: str = "pmp_minio_password"
    s3_bucket: str = "pmp-platform"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False

    # CORS
    cors_allowed_origins: List[str] = ["http://localhost:3000"]

    # Frontend base URL used in emailed links (invitations, password reset).
    frontend_base_url: str = "http://localhost:3000"

    # Rate limiting (login brute-force mitigation)
    auth_rate_limit_per_minute: int = 10

    # Optional local/demo administrator created by scripts/seed_db.py.
    seed_admin_email: str = "admin@example.com"
    seed_admin_username: str = "admin"
    seed_admin_password: str = _DEFAULT_SEED_ADMIN_PASSWORD
    seed_admin_first_name: str = "Project"
    seed_admin_last_name: str = "Admin"

    # AI project generation (LangGraph + OpenAI)
    openai_api_key: str = ""
    project_ai_model: str = "gpt-5.5"
    project_ai_temperature: float = 0.2
    project_ai_max_tokens: int = 12000
    project_ai_timeout_seconds: int = 90
    project_ai_max_schema_retries: int = 2
    project_ai_max_api_retries: int = 3
    project_ai_worker_poll_seconds: float = 2.0
    project_ai_worker_batch_size: int = 1
    langchain_tracing_v2: bool = False
    langchain_endpoint: str = "https://api.smith.langchain.com"
    langsmith_api_key: str = ""
    langchain_project: str = "pmp-project-generator"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @model_validator(mode="after")
    def validate_production_secrets(self) -> Self:
        if not self.is_production:
            return self

        errors: list[str] = []
        if self.debug:
            errors.append("DEBUG must be false in production.")
        if (
            self.jwt_secret == _DEFAULT_JWT_SECRET
            or len(self.jwt_secret.strip()) < 32
        ):
            errors.append(
                "JWT_SECRET must be overridden with at least 32 characters."
            )
        if _DEFAULT_DB_PASSWORD in self.database_url:
            errors.append("DATABASE_URL must not use the development password.")
        if self.s3_access_key == _DEFAULT_S3_ACCESS_KEY:
            errors.append("S3_ACCESS_KEY must not use the development default.")
        if self.s3_secret_key == _DEFAULT_S3_SECRET_KEY:
            errors.append("S3_SECRET_KEY must not use the development default.")
        if self.seed_admin_password == _DEFAULT_SEED_ADMIN_PASSWORD:
            errors.append("SEED_ADMIN_PASSWORD must not use the development default.")
        if self.google_oauth_client_id and not self.music_token_encryption_key:
            errors.append(
                "MUSIC_TOKEN_ENCRYPTION_KEY is required when Google Drive "
                "integration is enabled."
            )
        if errors:
            raise ValueError("Unsafe production configuration: " + " ".join(errors))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
