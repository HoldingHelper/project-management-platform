"""Generic pagination helpers used by every module's list endpoints."""

from __future__ import annotations

from typing import Generic, List, Sequence, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=500)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page(BaseModel, Generic[T]):
    items: List[T]
    page: int
    page_size: int
    total_count: int

    @property
    def total_pages(self) -> int:
        if self.page_size == 0:
            return 0
        return (self.total_count + self.page_size - 1) // self.page_size

    @classmethod
    def create(
        cls, items: Sequence[T], total_count: int, params: PageParams
    ) -> "Page[T]":
        return cls(
            items=list(items),
            page=params.page,
            page_size=params.page_size,
            total_count=total_count,
        )
