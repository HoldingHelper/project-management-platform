"""Persistent holding graph, memberships, allocations, and venture walls."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import UserDefinedType

from app.core.database import Base
from app.shared.base_model import AuditableMixin, TimestampMixin, UUIDPKMixin

SCHEMA = "org"


class Ltree(UserDefinedType):
    """Small SQLAlchemy adapter for PostgreSQL's native ``ltree`` type."""

    cache_ok = True

    def get_col_spec(self, **kw: Any) -> str:
        return "LTREE"


NODE_TYPES = (
    "holding", "function", "venture", "venture_function", "program",
    "project", "shared_initiative", "milestone", "workstream", "sprint",
    "task", "team", "doc_space",
)
CONFIDENTIALITY_TIERS = ("standard", "restricted", "board")


class OrgNode(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "nodes"
    __table_args__ = (
        CheckConstraint(f"type IN {NODE_TYPES}", name="ck_org_nodes_type"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_org_nodes_status"),
        CheckConstraint(
            f"confidentiality IN {CONFIDENTIALITY_TIERS}",
            name="ck_org_nodes_confidentiality",
        ),
        UniqueConstraint("parent_id", "slug", name="uq_org_nodes_parent_slug"),
        UniqueConstraint("source_type", "source_id", name="uq_org_nodes_source"),
        {"schema": SCHEMA},
    )

    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.nodes.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    path: Mapped[str] = mapped_column(Ltree(), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    confidentiality: Mapped[str] = mapped_column(String(16), default="standard", nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    acl_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    source_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    source_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    parent: Mapped[Optional["OrgNode"]] = relationship(remote_side="OrgNode.id", back_populates="children")
    children: Mapped[list["OrgNode"]] = relationship(back_populates="parent")


class Membership(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("person_id", "node_id", "role", name="uq_org_membership_role"),
        {"schema": SCHEMA},
    )

    person_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    since: Mapped[date] = mapped_column(Date, nullable=False)
    until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    granted_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)


class Allocation(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "allocations"
    __table_args__ = (
        CheckConstraint("percent > 0 AND percent <= 100", name="ck_org_allocations_percent"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_org_allocations_dates"),
        {"schema": SCHEMA},
    )

    person_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class VentureWall(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "venture_walls"
    __table_args__ = (
        CheckConstraint("venture_a_id <> venture_b_id", name="ck_org_venture_wall_distinct"),
        UniqueConstraint("person_id", "venture_a_id", "venture_b_id", name="uq_org_venture_wall"),
        {"schema": SCHEMA},
    )

    person_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    venture_a_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    venture_b_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
