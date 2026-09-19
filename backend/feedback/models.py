# feedback/models.py
from django.db import models
from django.core.validators import (
    MaxValueValidator, MinValueValidator
)
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import timedelta

from accounts.models import User, FamilyLink
from classes.models import Session


class SessionFeedback(models.Model):
    session = models.ForeignKey(
        Session,
        on_delete=models.CASCADE,
        related_name="feedback_entries"
    )
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="feedback_received",
        limit_choices_to={"role": "student"},
    )
    submitter = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="feedback_submitted"
    )
    note = models.TextField(blank=True, null=True, max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    rating_clarity = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="How clearly the instructor explained concepts"
    )
    rating_engagement = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="How engaging the session was"
    )
    rating_pace = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Whether the pacing felt right"
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Session Feedback"
        indexes = [
            models.Index(fields=["session", "student"]),
        ]
        constraints = [
            # one feedback per student per session
            models.UniqueConstraint(
                fields=["session", "student"],
                name="no_duplicated_feedback"
            ),
            # ratings should be between 1 and 5 inclusive
            models.CheckConstraint(
                check=models.Q(rating_clarity__gte=1, rating_clarity__lte=5),
                name="rating_clarity_range"
            ),
            models.CheckConstraint(
                check=models.Q(rating_engagement__gte=1, rating_engagement__lte=5),
                name="rating_engagement_range"
            ),
            models.CheckConstraint(
                check=models.Q(rating_pace__gte=1, rating_pace__lte=5),
                name="rating_pace_range"
            ),
        ]

    def clean(self):
        super().clean()
        errors = {}

        # Ensure submitter is either the student
        # or a parent linked to the student
        if self.submitter != self.student:
            is_parent_linked = FamilyLink.objects.filter(
                parent=self.submitter,
                student=self.student
            ).exists()
            if not is_parent_linked:
                errors['submitter'] = (
                    "Submitter must be the student"
                    " or a parent linked to the student."
                )

        if self.session.status != Session.Status.COMPLETED:
            errors['session'] = (
                "Feedback can only be submitted for completed sessions."
            )
        elif self.session.scheduled_date < timezone.now() - timedelta(days=30):
            # Only check the 30-day window for completed sessions —
            # scheduled_date is the closest proxy we have for completion time.
            errors['session_window'] = (
                "Feedback cannot be submitted for sessions "
                "completed more than 30 days ago."
            )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"Feedback for {self.session} by {self.submitter} for student {self.student}"