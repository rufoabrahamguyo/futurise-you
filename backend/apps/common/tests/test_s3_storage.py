"""The S3 storage implementation against a mocked S3 (moto)."""

import io
from urllib.parse import parse_qs, urlparse

import pytest
from moto import mock_aws

from apps.common.storage import S3Storage, new_storage_key, user_prefix


@pytest.fixture
def s3(settings):
    settings.S3_ENDPOINT_URL = ""
    settings.S3_PUBLIC_ENDPOINT_URL = ""
    settings.S3_ACCESS_KEY_ID = "test"
    settings.S3_SECRET_ACCESS_KEY = "test"
    settings.S3_BUCKET = "applyvault-test"
    with mock_aws():
        storage = S3Storage()
        storage.ensure_bucket()
        storage.ensure_bucket()  # idempotent
        yield storage


def test_put_read_stream_delete(s3) -> None:
    key = new_storage_key("user-1")
    s3.put(key, io.BytesIO(b"%PDF-1.4 hello"), "application/pdf")
    assert s3.exists(key)
    assert s3.read(key) == b"%PDF-1.4 hello"
    assert b"".join(s3.open_stream(key)) == b"%PDF-1.4 hello"
    s3.delete(key)
    assert not s3.exists(key)
    s3.delete(key)  # deleting twice is fine


def test_delete_prefix_only_removes_that_user(s3) -> None:
    mine = [new_storage_key("user-1") for _ in range(3)]
    theirs = new_storage_key("user-2")
    for key in [*mine, theirs]:
        s3.put(key, io.BytesIO(b"x"), "application/pdf")
    assert s3.delete_prefix(user_prefix("user-1")) == 3
    assert all(not s3.exists(k) for k in mine)
    assert s3.exists(theirs)


def test_presigned_url_is_short_lived_and_sets_disposition(s3, settings) -> None:
    key = new_storage_key("user-1")
    s3.put(key, io.BytesIO(b"x"), "application/pdf")
    url = s3.presigned_get(
        key, filename="Mon CV é.pdf", content_type="application/pdf", inline=False
    )
    query = parse_qs(urlparse(url).query)
    assert int(query["X-Amz-Expires"][0]) == settings.PRESIGNED_URL_TTL_SECONDS <= 300
    disposition = query["response-content-disposition"][0]
    assert disposition.startswith("attachment;")
    assert "filename*=UTF-8''Mon%20CV%20%C3%A9.pdf" in disposition
