"""GraphQL context containing database session and authenticated user."""

from __future__ import annotations

from typing import Optional
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import BaseContext

from app.core.current_user import CurrentUser
from app.core.database import AsyncSessionLocal


class GraphQLContext(BaseContext):
    def __init__(self, request: Request, current_user: Optional[CurrentUser] = None) -> None:
        super().__init__()
        self.request = request
        self.current_user = current_user
        self._db: Optional[AsyncSession] = None

    @property
    def db(self) -> AsyncSession:
        if self._db is None:
            self._db = AsyncSessionLocal()
        return self._db

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()


async def get_graphql_context(request: Request) -> GraphQLContext:
    """Build GraphQL context from request Authorization header."""
    from app.core.deps import get_optional_current_user
    user = await get_optional_current_user(request)
    return GraphQLContext(request=request, current_user=user)
