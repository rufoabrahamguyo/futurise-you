"""Private object storage.

Storage keys are generated here, stored only on the server and never returned
by the API. Clients receive short-lived presigned URLs from authorized endpoints.
"""

import threading
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from functools import cache
from typing import IO, Any, Protocol
from urllib.parse import quote, urlencode

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from django.conf import settings


def new_storage_key(owner_id: uuid.UUID | str, category: str) -> str:
    return f"users/{owner_id}/{category}/{uuid.uuid4().hex}"


def user_prefix(owner_id: uuid.UUID | str) -> str:
    return f"users/{owner_id}/"


def content_disposition(filename: str, *, inline: bool) -> str:
    kind = "inline" if inline else "attachment"
    ascii_name = filename.encode("ascii", "ignore").decode() or "download"
    ascii_name = ascii_name.replace('"', "")
    return f"{kind}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


class Storage(Protocol):
    def put(self, key: str, fileobj: IO[bytes], content_type: str) -> None: ...
    def read(self, key: str) -> bytes: ...
    def open_stream(self, key: str) -> Iterator[bytes]: ...
    def delete(self, key: str) -> None: ...
    def delete_prefix(self, prefix: str) -> int: ...
    def exists(self, key: str) -> bool: ...
    def presigned_get(self, key: str, *, filename: str, content_type: str, inline: bool) -> str: ...
    def ensure_bucket(self) -> None: ...


class S3Storage:
    def __init__(self) -> None:
        common = {
            "region_name": settings.S3_REGION,
            "aws_access_key_id": settings.S3_ACCESS_KEY_ID or None,
            "aws_secret_access_key": settings.S3_SECRET_ACCESS_KEY or None,
            "config": Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        }
        self.bucket = settings.S3_BUCKET
        self.client = boto3.client("s3", endpoint_url=settings.S3_ENDPOINT_URL or None, **common)
        self.signer = boto3.client(
            "s3",
            endpoint_url=settings.S3_PUBLIC_ENDPOINT_URL or settings.S3_ENDPOINT_URL or None,
            **common,
        )

    def put(self, key: str, fileobj: IO[bytes], content_type: str) -> None:
        fileobj.seek(0)
        self.client.upload_fileobj(
            fileobj, self.bucket, key, ExtraArgs={"ContentType": content_type}
        )

    def read(self, key: str) -> bytes:
        body: bytes = self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        return body

    def open_stream(self, key: str) -> Iterator[bytes]:
        body = self.client.get_object(Bucket=self.bucket, Key=key)["Body"]
        yield from body.iter_chunks(chunk_size=1024 * 1024)

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def delete_prefix(self, prefix: str) -> int:
        deleted = 0
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            keys: list[Any] = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            if keys:
                self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": keys})
                deleted += len(keys)
        return deleted

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise
        return True

    def presigned_get(self, key: str, *, filename: str, content_type: str, inline: bool) -> str:
        url: str = self.signer.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentDisposition": content_disposition(filename, inline=inline),
                "ResponseContentType": content_type,
            },
            ExpiresIn=settings.PRESIGNED_URL_TTL_SECONDS,
        )
        return url

    def ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)


@dataclass
class _StoredObject:
    data: bytes
    content_type: str


class MemoryStorage:
    """In-process storage with the same interface, used by tests."""

    def __init__(self) -> None:
        self.objects: dict[str, _StoredObject] = {}
        self._lock = threading.Lock()

    def put(self, key: str, fileobj: IO[bytes], content_type: str) -> None:
        fileobj.seek(0)
        with self._lock:
            self.objects[key] = _StoredObject(fileobj.read(), content_type)

    def read(self, key: str) -> bytes:
        return self.objects[key].data

    def open_stream(self, key: str) -> Iterator[bytes]:
        yield self.objects[key].data

    def delete(self, key: str) -> None:
        with self._lock:
            self.objects.pop(key, None)

    def delete_prefix(self, prefix: str) -> int:
        with self._lock:
            keys = [k for k in self.objects if k.startswith(prefix)]
            for k in keys:
                del self.objects[k]
        return len(keys)

    def exists(self, key: str) -> bool:
        return key in self.objects

    def presigned_get(self, key: str, *, filename: str, content_type: str, inline: bool) -> str:
        query = urlencode(
            {
                "X-Amz-Expires": settings.PRESIGNED_URL_TTL_SECONDS,
                "response-content-disposition": content_disposition(filename, inline=inline),
                "response-content-type": content_type,
            }
        )
        return f"https://storage.test/{settings.S3_BUCKET}/{uuid.uuid4().hex}?{query}"

    def ensure_bucket(self) -> None:
        return None


@cache
def get_storage() -> Storage:
    if settings.STORAGE_BACKEND == "memory":
        return MemoryStorage()
    return S3Storage()
