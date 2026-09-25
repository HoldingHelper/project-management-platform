from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

Visibility = Literal["public", "workspace", "selected", "admins", "private", "inherit"]
Status = Literal["draft", "internal", "published", "archived"]
DocCategory = Literal["Technical", "Marketing", "Operations", "Platform", "Business", "Designs"]
DocType = Literal["document", "adr", "runbook", "rfc", "source_note"]


class SpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=1000)
    icon: Optional[str] = Field(default=None, max_length=64)
    category: DocCategory = "Platform"
    responsible_user_id: Optional[UUID] = None
    visibility: Visibility = "workspace"


class SpaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=1000)
    icon: Optional[str] = Field(default=None, max_length=64)
    category: Optional[DocCategory] = None
    responsible_user_id: Optional[UUID] = None
    visibility: Optional[Visibility] = None
    position: Optional[int] = Field(default=None, ge=0)


class SpaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    icon: Optional[str]
    category: str = "Platform"
    responsible_user_id: Optional[UUID] = None
    visibility: str
    position: int
    created_at: datetime
    updated_at: datetime


class PageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    parent_page_id: Optional[UUID] = None
    excerpt: Optional[str] = Field(default=None, max_length=500)
    content: str = ""
    content_json: dict = Field(default_factory=dict)
    visibility: Visibility = "private"
    responsible_user_id: Optional[UUID] = None
    position: int = Field(default=0, ge=0)
    youtube_url: Optional[str] = Field(default=None, max_length=500)
    doc_type: DocType = "document"
    tags: list[str] = Field(default_factory=list)

    @field_validator("youtube_url")
    @classmethod
    def safe_youtube_url(cls, value: Optional[str]) -> Optional[str]:
        if value and not value.startswith(("https://www.youtube.com/", "https://youtu.be/")):
            raise ValueError("Only youtube.com and youtu.be links are allowed.")
        return value


class PageUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=240)
    parent_page_id: Optional[UUID] = None
    excerpt: Optional[str] = Field(default=None, max_length=500)
    content: Optional[str] = None
    content_json: Optional[dict] = None
    visibility: Optional[Visibility] = None
    responsible_user_id: Optional[UUID] = None
    youtube_url: Optional[str] = Field(default=None, max_length=500)
    seo_title: Optional[str] = Field(default=None, max_length=240)
    seo_description: Optional[str] = Field(default=None, max_length=500)
    position: Optional[int] = Field(default=None, ge=0)
    doc_type: Optional[DocType] = None
    tags: Optional[list[str]] = None

    @field_validator("youtube_url")
    @classmethod
    def safe_youtube_url(cls, value: Optional[str]) -> Optional[str]:
        if value and not value.startswith(("https://www.youtube.com/", "https://youtu.be/")):
            raise ValueError("Only youtube.com and youtu.be links are allowed.")
        return value


class PageMove(BaseModel):
    parent_page_id: Optional[UUID] = None
    before_page_id: Optional[UUID] = None


class PageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    space_id: UUID
    parent_page_id: Optional[UUID]
    title: str
    slug: str
    excerpt: Optional[str]
    content: str
    content_json: dict
    status: str
    visibility: str
    responsible_user_id: Optional[UUID] = None
    position: int
    youtube_url: Optional[str]
    seo_title: Optional[str]
    seo_description: Optional[str]
    doc_type: str = "document"
    tags: list[str] = Field(default_factory=list)
    created_by: UUID
    updated_by: UUID
    created_at: datetime
    updated_at: datetime

    @field_validator("doc_type", mode="before")
    @classmethod
    def validate_doc_type(cls, v: Any) -> str:
        return v or "document"

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, v: Any) -> list[str]:
        if not v:
            return []
        if isinstance(v, list):
            res = []
            for item in v:
                if isinstance(item, str):
                    res.append(item)
                elif hasattr(item, "tag") and hasattr(item.tag, "name"):
                    res.append(item.tag.name)
                elif hasattr(item, "name"):
                    res.append(item.name)
            return res
        return []


class PublicPageRead(BaseModel):
    """Sanitized public DTO omitting created_by, updated_by, responsible_user_id, content_json (H-3)."""
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    space_id: UUID
    parent_page_id: Optional[UUID] = None
    title: str
    slug: str
    excerpt: Optional[str] = None
    content: str
    status: str
    visibility: str
    position: int = 0
    youtube_url: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    doc_type: str = "document"
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    @field_validator("doc_type", mode="before")
    @classmethod
    def validate_doc_type(cls, v: Any) -> str:
        return v or "document"

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, v: Any) -> list[str]:
        if not v:
            return []
        if isinstance(v, list):
            res = []
            for item in v:
                if isinstance(item, str):
                    res.append(item)
                elif hasattr(item, "tag") and hasattr(item.tag, "name"):
                    res.append(item.tag.name)
                elif hasattr(item, "name"):
                    res.append(item.name)
            return res
        return []


class PageSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    space_id: UUID
    parent_page_id: Optional[UUID]
    title: str
    slug: str
    excerpt: Optional[str]
    status: str
    visibility: str
    doc_type: str = "document"
    tags: list[str] = Field(default_factory=list)
    responsible_user_id: Optional[UUID] = None
    position: int
    updated_at: datetime

    @field_validator("doc_type", mode="before")
    @classmethod
    def validate_doc_type(cls, v: Any) -> str:
        return v or "document"

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, v: Any) -> list[str]:
        if not v:
            return []
        if isinstance(v, list):
            res = []
            for item in v:
                if isinstance(item, str):
                    res.append(item)
                elif hasattr(item, "tag") and hasattr(item.tag, "name"):
                    res.append(item.tag.name)
                elif hasattr(item, "name"):
                    res.append(item.name)
            return res
        return []


class RelationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_page_id: UUID
    target_page_id: Optional[UUID] = None
    target_title: str
    relation_type: str
    anchor_text: Optional[str] = None
    confidence: str
    confidence_score: float
    created_at: datetime
    # Caller details for backlinks
    source_page_title: Optional[str] = None
    source_page_slug: Optional[str] = None
    source_page_excerpt: Optional[str] = None


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    color: Optional[str] = None
    page_count: int = 0


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: Optional[str] = Field(default=None, max_length=32)


class SourceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    source_type: str = Field(pattern="^(url|pdf|code|text|adr|runbook)$")
    source_url: Optional[str] = Field(default=None, max_length=1000)
    content_text: Optional[str] = None
    metadata_json: dict = Field(default_factory=dict)
    space_id: Optional[UUID] = None
    page_id: Optional[UUID] = None


class SourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    space_id: Optional[UUID] = None
    page_id: Optional[UUID] = None
    title: str
    source_type: str
    source_url: Optional[str] = None
    content_text: str
    metadata_json: dict
    status: str
    error_message: Optional[str] = None
    chunk_count: int = 0
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class SourceChunkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_id: UUID
    chunk_index: int
    content: str
    token_count: int
    created_at: datetime


class GraphNode(BaseModel):
    id: str
    label: str
    title: str
    doc_type: str = "document"
    category: str = "Platform"
    space_id: Optional[str] = None
    cluster_id: int = 0
    degree: int = 0


class GraphEdge(BaseModel):
    source: str
    target: str
    relation_type: str = "links_to"
    confidence_score: float = 1.0


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class SearchResultItem(BaseModel):
    id: UUID
    result_type: Literal["page", "source", "section"] = "page"
    title: str
    slug: str
    space_id: UUID
    space_name: Optional[str] = None
    excerpt: Optional[str] = None
    snippet_html: Optional[str] = None
    matching_field: str = "content"
    rank_score: float = 0.0
    doc_type: str = "document"
    tags: list[str] = Field(default_factory=list)
    updated_at: datetime


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchResultItem]


class AICitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: int = 1
    source_type: Literal["page", "source"] = "page"
    source_id: UUID
    chunk_id: Optional[UUID] = None
    title: str
    excerpt: str
    location_anchor: Optional[str] = None


class AIChatRequest(BaseModel):
    session_id: Optional[UUID] = None
    question: str = Field(min_length=1, max_length=2000, validation_alias=AliasChoices("question", "prompt"))
    context_page_ids: list[UUID] = Field(default_factory=list, validation_alias=AliasChoices("context_page_ids", "page_ids"))
    context_source_ids: list[UUID] = Field(default_factory=list, validation_alias=AliasChoices("context_source_ids", "source_ids"))
    action: Optional[Literal["summarize", "adr", "runbook", "checklist", "explain", "contradictions"]] = None

    @property
    def prompt(self) -> str:
        return self.question

    @property
    def page_ids(self) -> list[UUID]:
        return self.context_page_ids

    @property
    def source_ids(self) -> list[UUID]:
        return self.context_source_ids


class AIChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    role: str
    content: str
    model: str
    tokens_used: Optional[int] = None
    created_at: datetime
    citations: list[AICitationRead] = Field(default_factory=list)


class SearchResult(BaseModel):
    page_id: UUID
    space_slug: str
    page_slug: str
    title: str
    excerpt: Optional[str]
    matched_in: str


class PermissionGrant(BaseModel):
    subject_type: Literal["user", "role", "team", "department"]
    subject_id: str = Field(min_length=1, max_length=160)
    permission: Literal["view", "comment", "edit", "manage"]


class PermissionRead(PermissionGrant):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    resource_type: str
    resource_id: UUID


class RevisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    page_id: UUID
    revision_number: int
    title: str
    content: str
    created_by: UUID
    created_at: datetime


class AttachmentCreate(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    file_url: str = Field(min_length=1, max_length=1000)
    mime_type: str = Field(min_length=1, max_length=160)

    @field_validator("file_url")
    @classmethod
    def safe_file_url(cls, value: str) -> str:
        if not value.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            raise ValueError("Attachment URLs must use HTTPS.")
        return value


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    page_id: UUID
    file_name: str
    file_url: Optional[str] = None
    mime_type: str
    uploaded_by: UUID
    size_bytes: Optional[int] = None
    stored: bool = False
    created_at: datetime


class LinkCreate(BaseModel):
    entity_type: Literal["project", "task", "team", "user"]
    entity_id: UUID


class LinkRead(LinkCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    page_id: UUID
    created_at: datetime


class EntityDocLinkRead(LinkRead):
    title: str
    slug: str
    space_id: UUID
    excerpt: Optional[str] = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    selection_start: Optional[int] = Field(default=None, ge=0)
    selection_end: Optional[int] = Field(default=None, ge=1)
    selected_text: Optional[str] = Field(default=None, min_length=1, max_length=1000)

    @model_validator(mode="after")
    def complete_anchor(self) -> "CommentCreate":
        values = (self.selection_start, self.selection_end, self.selected_text)
        if any(value is not None for value in values) and not all(value is not None for value in values):
            raise ValueError("Selection start, end, and text must be supplied together.")
        if self.selection_start is not None and self.selection_end is not None and self.selection_end <= self.selection_start:
            raise ValueError("Selection end must be after selection start.")
        return self


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    page_id: UUID
    author_user_id: UUID
    body: str
    selection_start: Optional[int] = None
    selection_end: Optional[int] = None
    selected_text: Optional[str] = None
    created_at: datetime
