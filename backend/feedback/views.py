# feedback/views.py
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from core.permissions import IsStudentOrParent, IsInstructorOrAdmin
from django.utils import timezone
from datetime import timedelta
from collections import defaultdict

from .models import SessionFeedback
from .serializers import SessionFeedbackSerializer
from classes.models import Session
from accounts.models import FamilyLink, User
from core.pagination import StandardPagination


class SubmitFeedbackView(generics.CreateAPIView):
    serializer_class = SessionFeedbackSerializer
    permission_classes = [IsStudentOrParent]
    queryset = SessionFeedback.objects.all()

    def perform_create(self, serializer):
        serializer.save(submitter=self.request.user)


class ListFeedbackView(generics.ListAPIView):
    serializer_class = SessionFeedbackSerializer
    permission_classes = [IsStudentOrParent]
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        if user.role == 'student':
            return SessionFeedback.objects.filter(student=user).select_related(
                    'session',
                    'session__class_obj',
                    'student',
                    'submitter'
                )
        elif user.role == 'parent':
            # Get linked students
            children = FamilyLink.objects.filter(parent=user).values_list('student_id', flat=True)
            return SessionFeedback.objects.filter(student_id__in=children).select_related(
                    'session',
                    'session__class_obj',
                    'student',
                    'submitter'
                )
        else:
            # Should not happen due to permission class, but return empty
            return SessionFeedback.objects.none()


class InstructorSummaryView(APIView):
    permission_classes = [IsInstructorOrAdmin]

    def get(self, request, *args, **kwargs):
        # Determine which instructor's summary to return
        instructor_id = request.query_params.get('instructor_id')
        user = request.user

        if user.role == 'instructor':
            instructor = user
        elif user.role == 'admin':
            if not instructor_id:
                return Response(
                    {'error': 'instructor_id is required for admin users'},
                    status=400
                )
            try:
                instructor = User.objects.get(id=instructor_id, role='instructor')
            except User.DoesNotExist:
                return Response(
                    {'error': 'Instructor not found'},
                    status=404
                )
        else:
            return Response(
                {'error': 'Unauthorized'},
                status=403
            )

        # Get completed sessions for this instructor, ordered by most recent first
        sessions = Session.objects.filter(
            class_obj__instructor=instructor,
            status=Session.Status.COMPLETED
        ).order_by('-scheduled_date')

        # We need the last 10 completed sessions (by scheduled_date)
        recent_sessions = sessions[:10]

        if not recent_sessions:
            return Response({
                'rating_clarity_avg': 0,
                'rating_engagement_avg': 0,
                'rating_pace_avg': 0,
                'overall_avg': 0,
                'total_feedback_count': 0,
            })

        # Get feedback for these sessions
        feedbacks = SessionFeedback.objects.filter(session__in=recent_sessions)

        # Group feedback by session
        # We compute the average score per session first, then weight
        # those per-session averages by session duration.
        # Formula: sum(duration_i * avg_score_i) / sum(duration_i)
        # This ensures session weight is purely duration-based,
        # not inflated by how many students submitted feedback.
        feedback_by_session = defaultdict(list)
        for fb in feedbacks:
            feedback_by_session[fb.session_id].append(fb)

        total_weight = 0
        weighted_sum_clarity = 0
        weighted_sum_engagement = 0
        weighted_sum_pace = 0

        for session in recent_sessions:
            session_feedbacks = feedback_by_session.get(session.id, [])
            if not session_feedbacks:
                continue  # skip sessions with no feedback

            n = len(session_feedbacks)
            session_avg_clarity = sum(f.rating_clarity for f in session_feedbacks) / n
            session_avg_engagement = sum(f.rating_engagement for f in session_feedbacks) / n
            session_avg_pace = sum(f.rating_pace for f in session_feedbacks) / n

            weight = session.duration_minutes  # from session_metadata["duration_minutes"]
            total_weight += weight
            weighted_sum_clarity += session_avg_clarity * weight
            weighted_sum_engagement += session_avg_engagement * weight
            weighted_sum_pace += session_avg_pace * weight

        if total_weight > 0:
            avg_clarity = weighted_sum_clarity / total_weight
            avg_engagement = weighted_sum_engagement / total_weight
            avg_pace = weighted_sum_pace / total_weight
            overall_avg = (avg_clarity + avg_engagement + avg_pace) / 3
        else:
            avg_clarity = avg_engagement = avg_pace = overall_avg = 0

        total_feedback_count = feedbacks.count()

        return Response({
            'rating_clarity_avg': round(avg_clarity, 2),
            'rating_engagement_avg': round(avg_engagement, 2),
            'rating_pace_avg': round(avg_pace, 2),
            'overall_avg': round(overall_avg, 2),
            'total_feedback_count': total_feedback_count,
        })
