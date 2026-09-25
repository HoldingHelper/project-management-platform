from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.base_model import AuditableMixin, TimestampMixin, UUIDPKMixin

SCHEMA = "strategy"


class Vision(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "visions"
    __table_args__ = (UniqueConstraint("node_id", name="uq_strategy_vision_node"), {"schema": SCHEMA})
    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    horizon: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    narrative_page_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)


class Objective(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "objectives"
    __table_args__ = {"schema": SCHEMA}
    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    parent_objective_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.objectives.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    period: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="draft", nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(5, 2), default=0.5, nullable=False)
    weight: Mapped[float] = mapped_column(Numeric(5, 2), default=1, nullable=False)
    key_results: Mapped[list["KeyResult"]] = relationship(back_populates="objective", cascade="all, delete-orphan")


class KeyResult(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "key_results"
    __table_args__ = {"schema": SCHEMA}
    objective_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.objectives.id", ondelete="CASCADE"), nullable=False, index=True)
    metric: Mapped[str] = mapped_column(String(240), nullable=False)
    baseline: Mapped[float] = mapped_column(Numeric(16, 4), nullable=False)
    target: Mapped[float] = mapped_column(Numeric(16, 4), nullable=False)
    current: Mapped[float] = mapped_column(Numeric(16, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    update_cadence: Mapped[str] = mapped_column(String(24), default="weekly", nullable=False)
    objective: Mapped[Objective] = relationship(back_populates="key_results")
    checkins: Mapped[list["CheckIn"]] = relationship(back_populates="key_result", cascade="all, delete-orphan")


class CheckIn(Base, UUIDPKMixin, AuditableMixin):
    __tablename__ = "checkins"
    __table_args__ = {"schema": SCHEMA}
    key_result_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.key_results.id", ondelete="CASCADE"), nullable=False, index=True)
    value: Mapped[float] = mapped_column(Numeric(16, 4), nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    key_result: Mapped[KeyResult] = relationship(back_populates="checkins")


class InitiativeLink(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "initiative_links"
    __table_args__ = (UniqueConstraint("objective_id", "target_type", "target_id", name="uq_strategy_initiative_link"), {"schema": SCHEMA})
    objective_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.objectives.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(24), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)


class Decision(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "decisions"
    __table_args__ = {"schema": SCHEMA}
    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    context: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    consequences: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decider_user_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    decided_at: Mapped[date] = mapped_column(Date, nullable=False)
    page_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class Risk(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "risks"
    __table_args__ = {"schema": SCHEMA}
    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    likelihood: Mapped[int] = mapped_column(nullable=False)
    impact: Mapped[int] = mapped_column(nullable=False)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    mitigation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="open", nullable=False)
