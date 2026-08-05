import asyncio

# Ensure `app` package is importable when Alembic is invoked from backend/.
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import get_settings  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.modules.analytics import models as analytics_models  # noqa: F401,E402
from app.modules.blockers import models as blockers_models  # noqa: F401,E402
from app.modules.chat import models as chat_models  # noqa: F401,E402
from app.modules.collaboration import models as collaboration_models  # noqa: F401,E402

# Import every module's models so their tables are registered on Base.metadata
# for autogenerate. Modules are intentionally imported here only -- nowhere
# else should one module import another module's models package.
from app.modules.identity import models as identity_models  # noqa: F401,E402
from app.modules.music import models as music_models  # noqa: F401,E402
from app.modules.organization import models as organization_models  # noqa: F401,E402
from app.modules.projects import models as projects_models  # noqa: F401,E402

config = context.config
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

MODULE_SCHEMAS = [
    "identity",
    "organization",
    "projects",
    "collaboration",
    "blockers",
    "analytics",
    "chat",
    "music",
]


def include_object(object, name, type_, reflected, compare_to):
    return True


def run_migrations_offline() -> None:
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema="public",
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _create_schemas(connection: Connection) -> None:
    for schema in MODULE_SCHEMAS:
        connection.exec_driver_sql(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')


def do_run_migrations(connection: Connection) -> None:
    _create_schemas(connection)
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema="public",
        include_schemas=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
        # `_create_schemas` issues raw DDL before Alembic's own
        # `begin_transaction()`, so Alembic doesn't own the outer transaction
        # and won't commit it. Commit explicitly or every migration silently
        # rolls back on connection close.
        await connection.commit()

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
