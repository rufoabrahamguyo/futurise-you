from .base import *  # noqa: F403
from .base import env

SECRET_KEY = "test-secret-key-not-for-production"
DEBUG = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
DATABASES = {
    "default": env.db(
        "TEST_DATABASE_URL",
        default=env(
            "DATABASE_URL", default="postgres://applyvault:applyvault@postgres:5432/applyvault"
        ),
    )
}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}
STORAGE_BACKEND = "memory"
LLM_PROVIDER = "fake"
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = "memory://"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
MIDDLEWARE = [m for m in MIDDLEWARE if "whitenoise" not in m]  # noqa: F405
