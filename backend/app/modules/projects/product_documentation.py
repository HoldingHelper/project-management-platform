"""Product-line documentation stored as authenticated file attachments."""
import asyncio
import io
import re
from contextlib import suppress
from pathlib import PurePath
from uuid import UUID, uuid4

from sqlalchemy import select
from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.storage import file_storage_service
from app.modules.collaboration.models import FileAttachment
from app.modules.projects.models import Product

MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".md", ".markdown", ".rtf", ".odt"}


def validate_document(file_name: str, content: bytes) -> None:
    if not content:
        raise ValidationAppError("Choose a non-empty documentation file.")
    if len(content) > MAX_DOCUMENT_BYTES:
        raise ValidationAppError("Documentation files must be 25 MB or smaller.")
    if PurePath(file_name).suffix.lower() not in DOCUMENT_EXTENSIONS:
        raise ValidationAppError("Use a PDF, Word, text, Markdown, RTF, or ODT document.")


async def get_document(db, product_id: UUID) -> FileAttachment:
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product line", product_id)
    reference = product.documentation_link or ""
    if not reference.startswith("attachment:"):
        raise NotFoundError("Documentation", product_id)
    try:
        attachment_id = UUID(reference.removeprefix("attachment:"))
    except ValueError:
        raise NotFoundError("Documentation", product_id)
    attachment = await db.get(FileAttachment, attachment_id)
    if attachment is None or attachment.entity_type != "product" or attachment.entity_id != product_id:
        raise NotFoundError("Documentation", product_id)
    return attachment


async def upload_document(db, product_id, actor, file_name, content_type, content):
    validate_document(file_name, content)
    product = (await db.execute(select(Product).where(Product.id == product_id).with_for_update())).scalar_one_or_none()
    if product is None:
        raise NotFoundError("Product line", product_id)
    clean_name = re.sub(r"[^\w.\-_]", "_", file_name.replace("\\", "/").split("/")[-1])[:128] or "document"
    storage_key = f"product/{product_id}/documentation/{uuid4()}-{clean_name}"
    await file_storage_service.upload_async(storage_key, io.BytesIO(content), content_type)
    try:
        attachment = FileAttachment(
            entity_type="product", entity_id=product_id, file_name=clean_name,
            content_type=content_type, size_bytes=len(content), storage_key=storage_key,
            uploaded_by_user_id=actor.user_id,
        )
        db.add(attachment)
        await db.flush()
        product.documentation_link = f"attachment:{attachment.id}"
        await db.commit()

    except Exception:
        await db.rollback()
        with suppress(Exception):
            await asyncio.to_thread(file_storage_service.delete, storage_key)
        raise

    await db.refresh(attachment)
    return attachment
