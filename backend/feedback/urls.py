# feedback/urls.py
from django.urls import path
from .views import SubmitFeedbackView, ListFeedbackView, InstructorSummaryView

urlpatterns = [
    path('', SubmitFeedbackView.as_view(), name='submit-feedback'),
    path('my/', ListFeedbackView.as_view(), name='list-feedback'),
    path('instructor-summary/', InstructorSummaryView.as_view(), name='instructor-summary-feedback'),
]