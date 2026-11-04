from django.urls import path

from . import views

urlpatterns = [
    path("csrf", views.CsrfView.as_view(), name="auth-csrf"),
    path("register", views.RegisterView.as_view(), name="auth-register"),
    path("login", views.LoginView.as_view(), name="auth-login"),
    path("logout", views.LogoutView.as_view(), name="auth-logout"),
    path("me", views.MeView.as_view(), name="auth-me"),
    path("change-password", views.PasswordChangeView.as_view(), name="auth-change-password"),
    path("verify-email", views.VerifyEmailView.as_view(), name="auth-verify-email"),
    path(
        "resend-verification",
        views.ResendVerificationView.as_view(),
        name="auth-resend-verification",
    ),
    path("password-reset", views.PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path(
        "password-reset/confirm",
        views.PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("ai-acknowledgement", views.AIAcknowledgementView.as_view(), name="auth-ai-ack"),
]
