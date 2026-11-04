"""Settings shared by every environment. Values come from environment variables."""

from datetime import timedelta
from pathlib import Path

import environ
from celery.schedules import crontab

from apps.common.logging import configure_logging

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()

SECRET_KEY = env("DJANGO_SECRET_KEY", default="")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.admin",
    "rest_framework",
    "drf_spectacular",
    "apps.common",
    "apps.accounts",
    "apps.companies",
    "apps.applications",
    "apps.documents",
    "apps.jobdescriptions",
    "apps.ai",
    "apps.reminders",
    "apps.exports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "apps.common.middleware.RequestIdMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": env.db(
        "DATABASE_URL", default="postgres://applyvault:applyvault@postgres:5432/applyvault"
    )
}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DATABASE_CONN_MAX_AGE", default=60)
DATABASES["default"]["ATOMIC_REQUESTS"] = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Uploads: never buffer more than the file limit in memory.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES + 1024 * 1024

# --- Sessions, cookies and CSRF ------------------------------------------------
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=True)
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
SESSION_COOKIE_NAME = "av_session"
CSRF_COOKIE_NAME = "av_csrftoken"
# The SPA reads the CSRF cookie and echoes it in X-CSRFToken. It is not a secret on its own.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=True)
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:5173"])
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")

# --- DRF ----------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.common.auth.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.common.errors.exception_handler",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "login": env("THROTTLE_LOGIN", default="5/15m"),
        "register": env("THROTTLE_REGISTER", default="10/h"),
        "password_reset": env("THROTTLE_PASSWORD_RESET", default="5/h"),
        "upload": env("THROTTLE_UPLOAD", default="60/h"),
        "ai": env("THROTTLE_AI", default="20/h"),
        "export": env("THROTTLE_EXPORT", default="5/h"),
    },
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "ApplyVault API",
    "DESCRIPTION": "Your job search, organized.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "ApplicationStatusEnum": "apps.applications.statuses.Status",
        "DocumentTypeEnum": "apps.documents.models.DocumentType",
        "AsyncStatusEnum": "apps.common.models.AsyncStatus",
    },
}

# --- Cache (throttling) -------------------------------------------------------
REDIS_URL = env("REDIS_URL", default="redis://redis:6379/0")
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("CACHE_URL", default="redis://redis:6379/1"),
    }
}

# --- Celery -------------------------------------------------------------------
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = None
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_TIME_LIMIT = 300
CELERY_TASK_SOFT_TIME_LIMIT = 240
CELERY_TIMEZONE = "UTC"
CELERY_BEAT_SCHEDULE = {
    "dispatch-due-reminders": {
        "task": "apps.reminders.tasks.dispatch_due_reminders",
        "schedule": timedelta(minutes=1),
    },
    "purge-deleted-applications": {
        "task": "apps.applications.tasks.purge_deleted_applications",
        "schedule": crontab(hour=3, minute=15),
    },
    "purge-expired-exports": {
        "task": "apps.exports.tasks.purge_expired_exports",
        "schedule": crontab(hour=3, minute=45),
    },
}

# --- Email --------------------------------------------------------------------
MAILERS = {
    "default": {
        "BACKEND": env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend"),
        "OPTIONS": {
            "host": env("EMAIL_HOST", default="mailpit"),
            "port": env.int("EMAIL_PORT", default=1025),
            "username": env("EMAIL_HOST_USER", default=""),
            "password": env("EMAIL_HOST_PASSWORD", default=""),
            "use_tls": env.bool("EMAIL_USE_TLS", default=False),
            "timeout": 15,
        },
    }
}
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="ApplyVault <no-reply@applyvault.local>")

# --- Object storage -----------------------------------------------------------
STORAGE_BACKEND = env("STORAGE_BACKEND", default="s3")  # s3 | memory
S3_ENDPOINT_URL = env("S3_ENDPOINT_URL", default="http://minio:9000")
# Presigned URLs are signed for the host the browser uses, which differs from the
# in-network host in local Docker.
S3_PUBLIC_ENDPOINT_URL = env("S3_PUBLIC_ENDPOINT_URL", default="http://localhost:9000")
S3_REGION = env("S3_REGION", default="us-east-1")
S3_BUCKET = env("S3_BUCKET", default="applyvault-private")
S3_ACCESS_KEY_ID = env("S3_ACCESS_KEY_ID", default="")
S3_SECRET_ACCESS_KEY = env("S3_SECRET_ACCESS_KEY", default="")
PRESIGNED_URL_TTL_SECONDS = min(env.int("PRESIGNED_URL_TTL_SECONDS", default=300), 300)

# --- AI -------------------------------------------------------------------------
LLM_PROVIDER = env("LLM_PROVIDER", default="fake")  # fake | openai_compatible
LLM_API_BASE = env("LLM_API_BASE", default="https://api.openai.com/v1")
LLM_API_KEY = env("LLM_API_KEY", default="")
LLM_MODEL = env("LLM_MODEL", default="gpt-4o-mini")
LLM_TIMEOUT_SECONDS = env.int("LLM_TIMEOUT_SECONDS", default=60)
AI_DAILY_LIMIT = env.int("AI_DAILY_LIMIT", default=25)
# Character budgets approximate the PRD's token budgets (≈4 chars per token).
AI_MAX_JD_CHARS = env.int("AI_MAX_JD_CHARS", default=48_000)
AI_MAX_CV_CHARS = env.int("AI_MAX_CV_CHARS", default=24_000)

# --- Retention ------------------------------------------------------------------
SOFT_DELETE_RETENTION_DAYS = 30
EXPORT_LINK_TTL_HOURS = env.int("EXPORT_LINK_TTL_HOURS", default=72)

# --- Demo seed --------------------------------------------------------------------
DEMO_USER_EMAIL = env("DEMO_USER_EMAIL", default="demo@applyvault.dev")
DEMO_USER_PASSWORD = env("DEMO_USER_PASSWORD", default="")

# --- Logging ----------------------------------------------------------------------
LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING_CONFIG = None
configure_logging(LOG_LEVEL)
