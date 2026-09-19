# feedback/admin.py
from django.contrib import admin
from .models import SessionFeedback


@admin.register(SessionFeedback)
class SessionFeedbackAdmin(admin.ModelAdmin):
    list_display = [
        "id", "session", "student", "submitter",
        "rating_clarity", "rating_engagement", "rating_pace", "created_at",
    ]
    list_filter = ["session__class_obj", "created_at"]
    readonly_fields = ["created_at", "updated_at"]
    search_fields = ["student__email", "session__class_obj__name"]
