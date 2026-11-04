"""FR-09: due reminders are claimed once, notified in-app, and emailed with safe retries."""

import threading
from datetime import timedelta
from unittest import mock

import pytest
from django.core import mail
from django.db import connection
from django.utils import timezone

from apps.reminders.models import Notification, Reminder
from apps.reminders.tasks import dispatch_due_reminders, send_reminder_email
from tests.factories import ApplicationFactory, ReminderFactory, UserFactory


@pytest.mark.django_db
def test_dispatch_notifies_and_emails_once(django_capture_on_commit_callbacks) -> None:
    reminder = ReminderFactory(remind_at=timezone.now() - timedelta(minutes=1))
    future = ReminderFactory(remind_at=timezone.now() + timedelta(hours=1))
    with django_capture_on_commit_callbacks(execute=True):
        assert dispatch_due_reminders() == 1
    with django_capture_on_commit_callbacks(execute=True):
        assert dispatch_due_reminders() == 0
    reminder.refresh_from_db()
    assert reminder.status == "sent"
    assert reminder.email_sent_at is not None
    assert Notification.objects.filter(reminder=reminder).count() == 1
    assert Reminder.objects.get(pk=future.pk).status == "pending"
    assert len(mail.outbox) == 1
    assert mail.outbox[0].subject == f"Reminder: {reminder.title}"
    assert mail.outbox[0].to == [reminder.owner.email]


@pytest.mark.django_db
def test_email_respects_channel_preference_and_verification(django_capture_on_commit_callbacks) -> None:
    past = timezone.now() - timedelta(minutes=1)
    ReminderFactory(remind_at=past, channels=["in_app"])
    ReminderFactory(application=ApplicationFactory(owner=UserFactory(email_notifications=False)), remind_at=past)
    ReminderFactory(application=ApplicationFactory(owner=UserFactory(email_verified_at=None)), remind_at=past)
    with django_capture_on_commit_callbacks(execute=True):
        assert dispatch_due_reminders() == 3
    assert Notification.objects.count() == 3
    assert mail.outbox == []


@pytest.mark.django_db
def test_failed_email_retries_without_duplicate_notification(django_capture_on_commit_callbacks) -> None:
    reminder = ReminderFactory(remind_at=timezone.now() - timedelta(minutes=1))
    with mock.patch("apps.reminders.tasks.send_mail", side_effect=ConnectionError("SMTP down")):
        dispatch_due_reminders()
        with pytest.raises(ConnectionError):
            send_reminder_email.run(str(reminder.pk))
    reminder.refresh_from_db()
    assert reminder.email_sent_at is None
    # The retry succeeds, then further retries are no-ops.
    assert send_reminder_email.run(str(reminder.pk)) is True
    assert send_reminder_email.run(str(reminder.pk)) is False
    assert len(mail.outbox) == 1
    assert Notification.objects.filter(reminder=reminder).count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_workers_do_not_send_duplicates() -> None:
    past = timezone.now() - timedelta(minutes=1)
    app = ApplicationFactory()
    for _ in range(20):
        ReminderFactory(application=app, remind_at=past, channels=["in_app"])

    barrier = threading.Barrier(3)
    results: list[int] = []

    def worker() -> None:
        try:
            barrier.wait()
            results.append(dispatch_due_reminders(batch_size=7))
            results.append(dispatch_due_reminders(batch_size=7))
        finally:
            connection.close()

    threads = [threading.Thread(target=worker) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    while dispatch_due_reminders():
        pass
    assert Notification.objects.count() == 20
    assert Reminder.objects.filter(status="sent").count() == 20
    assert sum(results) <= 20
