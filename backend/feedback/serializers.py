# feedback/serializers.py
from rest_framework import serializers
from core.serializers import BaseModelSerializer

from .models import SessionFeedback
from classes.models import Session
from accounts.models import FamilyLink, User


# NOTE: This serializer is ONLY for student/parent-facing views.
# The instructor summary endpoint intentionally does NOT use this serializer
# to prevent accidental exposure of student identity or raw notes.
class SessionFeedbackSerializer(BaseModelSerializer):
    student_display = serializers.CharField(source='student.get_display_name', read_only=True)
    submitter_display = serializers.CharField(source='submitter.get_display_name', read_only=True)
    session_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SessionFeedback
        fields = [
            'id',
            'session',
            'student',
            'submitter',
            'note',
            'rating_clarity',
            'rating_engagement',
            'rating_pace',
            'created_at',
            'updated_at',
            'student_display',
            'submitter_display',
            'session_details',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'student_display',
            'submitter_display',
            'session_details'
        ]

        # submitter is set by the view, so not required in input
        # student can be omitted if the submitter is the student themselves
        # (will be set in validate)
        extra_kwargs = {
            'submitter': {'write_only': True, 'required': False},
            'student': {'required': False},
        }

    def get_validators(self):
        # Suppress automatic UniqueTogetherValidator because 'student' is auto-populated
        # in validate() when student submits for themselves.
        return []

    def get_session_details(self, obj):
        return {
            'id': obj.session.id,
            'class_name': obj.session.class_obj.name,
            'scheduled_date': obj.session.scheduled_date,
            'duration_minutes': obj.session.duration_minutes,
            'topic': obj.session.topic,
        }

    def validate(self, attrs):
        # If student is not provided, assume the submitter is the student
        # (only valid if submitter is student)
        request = self.context.get('request')

        if request and hasattr(request, 'user'):
            user = request.user
            if 'student' not in attrs:
                if user.role == 'student':
                    attrs['student'] = user
                else:
                    # For parent, student must be provided
                    raise serializers.ValidationError({
                        'student': 'Student must be specified when submitting feedback as a parent.'
                    })
            else:
                # If student is provided, validate that the submitter is
                # allowed to submit for that student
                if attrs['student'] != user:
                    # Check if submitter is a parent of the student
                    is_parent_linked = FamilyLink.objects.filter(
                        parent=user,
                        student=attrs['student']
                    ).exists()
                    if not is_parent_linked:
                        raise serializers.ValidationError({
                            'submitter': 'You are not authorized to submit feedback for this student.'
                        })

        # Check duplicate submission (one feedback per student per session)
        session = attrs.get('session')
        student = attrs.get('student')
        if session and student:
            qs = SessionFeedback.objects.filter(session=session, student=student)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    'session': 'Feedback already submitted for this session.'
                })

        # Validate session is completed and within
        # 30 days (model constraints will also catch, but we can give clearer error)
        if session:
            if session.status != Session.Status.COMPLETED:
                raise serializers.ValidationError({
                    'session': 'Feedback can only be submitted for completed sessions.'
                })
            from django.utils import timezone
            from datetime import timedelta
            if session.scheduled_date < timezone.now() - timedelta(days=30):
                raise serializers.ValidationError({
                    'session': 'Feedback cannot be submitted for sessions completed more than 30 days ago.'
                })

        return attrs
