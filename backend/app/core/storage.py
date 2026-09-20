"""S3-compatible (MinIO) file storage service, used by the Collaboration
module for task/phase/blocker file attachments."""

from __future__ import annotations

from typing import Any, BinaryIO

import boto3
from botocore.client import Config as BotoConfig

from app.core.config import get_settings

settings = get_settings()


class FileStorageService:
    def __init__(self) -> None:
        client_kwargs: dict[str, Any] = {
            "region_name": settings.s3_region or "eu-central-1",
            "use_ssl": settings.s3_use_ssl,
            "config": BotoConfig(
                signature_version="s3v4", s3={"addressing_style": "path"}
            ),
        }
        if settings.s3_endpoint_url and settings.s3_endpoint_url.strip():
            client_kwargs["endpoint_url"] = settings.s3_endpoint_url.strip()
        if settings.s3_access_key and settings.s3_access_key.strip():
            client_kwargs["aws_access_key_id"] = settings.s3_access_key.strip()
        if settings.s3_secret_key and settings.s3_secret_key.strip():
            client_kwargs["aws_secret_access_key"] = settings.s3_secret_key.strip()

        self._client = boto3.client("s3", **client_kwargs)
        self._bucket = settings.s3_bucket

    def ensure_bucket(self) -> None:
        existing = [b["Name"] for b in self._client.list_buckets().get("Buckets", [])]
        if self._bucket not in existing:
            self._client.create_bucket(Bucket=self._bucket)

    def upload(self, key: str, content: BinaryIO, content_type: str) -> str:
        self._client.upload_fileobj(
            content, self._bucket, key, ExtraArgs={"ContentType": content_type}
        )
        return key

    def download(self, key: str) -> bytes:
        obj = self._client.get_object(Bucket=self._bucket, Key=key)
        return obj["Body"].read()

    def presigned_url(self, key: str, expires_in: int = 3600) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


file_storage_service = FileStorageService()
