"""Documentation models shared by public publishing, private knowledge, and connected workspace."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.base_model import AuditableMixin, TimestampMixin, UUIDPKMixin

SCHEMA = "docs"


class DocSpace(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "spaces"
    __table_args__ = (UniqueConstraint("slug", name="uq_doc_spaces_slug"), {"schema": SCHEMA})

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(1000))
    icon: Mapped[Optional[str]] = mapped_column(String(64))
    category: Mapped[str] = mapped_column(String(50), default="Platform", nullable=False, index=True)
    responsible_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    visibility: Mapped[str] = mapped_column(String(24), default="workspace", nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    pages: Mapped[list["DocPage"]] = relationship(back_populates="space", cascade="all, delete-orphan")
    sources: Mapped[list["DocSource"]] = relationship(back_populates="space")


class DocPage(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "pages"
    __table_args__ = (UniqueConstraint("space_id", "slug", name="uq_doc_pages_space_slug"), {"schema": SCHEMA})

    space_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.spaces.id", ondelete="CASCADE"), index=True)
    parent_page_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    slug: Mapped[str] = mapped_column(String(260), nullable=False, index=True)
    excerpt: Mapped[Optional[str]] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    content_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="draft", nullable=False, index=True)
    visibility: Mapped[str] = mapped_column(String(24), default="inherit", nullable=False, index=True)
    responsible_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    youtube_url: Mapped[Optional[str]] = mapped_column(String(500))
    seo_title: Mapped[Optional[str]] = mapped_column(String(240))
    seo_description: Mapped[Optional[str]] = mapped_column(String(500))
    doc_type: Mapped[str] = mapped_column(String(32), default="document", nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    updated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    space: Mapped[DocSpace] = relationship(back_populates="pages")
    parent: Mapped[Optional["DocPage"]] = relationship(remote_side="DocPage.id")
    revisions: Mapped[list["DocRevision"]] = relationship(back_populates="page", cascade="all, delete-orphan")
    outbound_relations: Mapped[list["DocRelation"]] = relationship("DocRelation", foreign_keys="DocRelation.source_page_id", back_populates="source_page", cascade="all, delete-orphan")
    inbound_relations: Mapped[list["DocRelation"]] = relationship("DocRelation", foreign_keys="DocRelation.target_page_id", back_populates="target_page")
    page_tags: Mapped[list["DocPageTag"]] = relationship("DocPageTag", back_populates="page", cascade="all, delete-orphan")
    sources: Mapped[list["DocSource"]] = relationship("DocSource", back_populates="page")


class DocRelation(Base, UUIDPKMixin):
    """Bidirectional relation edge connecting knowledge documents."""
    __tablename__ = "relations"
    __table_args__ = {"schema": SCHEMA}

    source_page_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), nullable=False, index=True)
    target_page_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), nullable=True, index=True)
    target_title: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    relation_type: Mapped[str] = mapped_column(String(32), default="links_to", nullable=False)
    anchor_text: Mapped[Optional[str]] = mapped_column(String(240), nullable=True)
    confidence: Mapped[str] = mapped_column(String(16), default="EXTRACTED", nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    source_page: Mapped[DocPage] = relationship("DocPage", foreign_keys=[source_page_id], back_populates="outbound_relations")
    target_page: Mapped[Optional[DocPage]] = relationship("DocPage", foreign_keys=[target_page_id], back_populates="inbound_relations")


class DocTag(Base, UUIDPKMixin):
    """Structured knowledge tag."""
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("name", name="uq_doc_tags_name"), {"schema": SCHEMA})

    name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    color: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    pages: Mapped[list["DocPageTag"]] = relationship("DocPageTag", back_populates="tag", cascade="all, delete-orphan")


class DocPageTag(Base):
    """Many-to-many relationship connecting documents to tags."""
    __tablename__ = "page_tags"
    __table_args__ = {"schema": SCHEMA}

    page_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.tags.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    page: Mapped[DocPage] = relationship("DocPage", back_populates="page_tags")
    tag: Mapped[DocTag] = relationship("DocTag", back_populates="pages")


class DocSource(Base, UUIDPKMixin, TimestampMixin):
    """Open Notebook research or reference source attached to a space or document."""
    __tablename__ = "sources"
    __table_args__ = {"schema": SCHEMA}

    space_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.spaces.id", ondelete="SET NULL"), nullable=True, index=True)
    page_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)  # url, pdf, code, text, adr, runbook
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    storage_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    content_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ready", nullable=False)  # pending, processing, ready, failed
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    space: Mapped[Optional[DocSpace]] = relationship("DocSpace", back_populates="sources")
    page: Mapped[Optional[DocPage]] = relationship("DocPage", back_populates="sources")
    chunks: Mapped[list["DocSourceChunk"]] = relationship("DocSourceChunk", back_populates="source", cascade="all, delete-orphan")


class DocSourceChunk(Base, UUIDPKMixin):
    """Normalized chunk for text retrieval and RAG."""
    __tablename__ = "source_chunks"
    __table_args__ = {"schema": SCHEMA}

    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.sources.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    source: Mapped[DocSource] = relationship("DocSource", back_populates="chunks")


class DocChatSession(Base, UUIDPKMixin, TimestampMixin):
    """Knowledge AI chat session."""
    __tablename__ = "chat_sessions"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    page_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    context_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    messages: Mapped[list["DocChatMessage"]] = relationship("DocChatMessage", back_populates="session", cascade="all, delete-orphan")


class DocChatMessage(Base, UUIDPKMixin):
    """Message in a Knowledge AI conversation."""
    __tablename__ = "chat_messages"
    __table_args__ = {"schema": SCHEMA}

    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user, assistant, system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(64), default="gpt-5.5", nullable=False)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session: Mapped[DocChatSession] = relationship("DocChatSession", back_populates="messages")
    citations: Mapped[list["DocCitation"]] = relationship("DocCitation", back_populates="message", cascade="all, delete-orphan")


class DocCitation(Base, UUIDPKMixin):
    """Clickable, auditable citation linking an AI answer to a source or document."""
    __tablename__ = "citations"
    __table_args__ = {"schema": SCHEMA}

    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.chat_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(24), nullable=False)  # page, source
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    chunk_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    location_anchor: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    message: Mapped[DocChatMessage] = relationship("DocChatMessage", back_populates="citations")


class DocPermission(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("resource_type", "resource_id", "subject_type", "subject_id", "permission", name="uq_doc_permission"), {"schema": SCHEMA})

    resource_type: Mapped[str] = mapped_column(String(24), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    subject_type: Mapped[str] = mapped_column(String(24), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(160), nullable=False)
    permission: Mapped[str] = mapped_column(String(24), nullable=False)


class DocRevision(Base, UUIDPKMixin):
    __tablename__ = "revisions"
    __table_args__ = (UniqueConstraint("page_id", "revision_number", name="uq_doc_revision_number"), {"schema": SCHEMA})

    page_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), index=True)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    page: Mapped[DocPage] = relationship(back_populates="revisions")


class DocFavorite(Base):
    __tablename__ = "favorites"
    __table_args__ = {"schema": SCHEMA}
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    page_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DocView(Base):
    __tablename__ = "views"
    __table_args__ = {"schema": SCHEMA}
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    page_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), primary_key=True)
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DocAttachment(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "attachments"
    __table_args__ = {"schema": SCHEMA}
    page_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(160), nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    storage_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)


class DocLink(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "links"
    __table_args__ = (UniqueConstraint("page_id", "entity_type", "entity_id", name="uq_doc_link"), {"schema": SCHEMA})
    page_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), index=True)
    entity_type: Mapped[str] = mapped_column(String(24), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)


class DocComment(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "comments"
    __table_args__ = {"schema": SCHEMA}
    page_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.pages.id", ondelete="CASCADE"), index=True)
    author_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    body: Mapped[str] = mapped_column(String(4000), nullable=False)
    selection_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    selection_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    selected_text: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
