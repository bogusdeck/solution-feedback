# Design Decisions

## Data Model

- The main pain point for me at first was `student` vs `submitter`. I considered just having a single user field, but upon re-reading the requirements, it's clear that uniqueness is on `(session, student)`; even if mom submits feedback for her child, it's still the child's feedback. Therefore I added two ForeignKey fields: `student` and `submitter`

- For ratings, I created 3 separate integer columns (`rating_clarity`, `rating_engagement`, `rating_pace`) instead of a JSON field or a separate table. The ratings are fixed to these 3 options anyway, so keeping them as columns makes queries and calculations much simpler.

## Submitter & Student Validation Logic

- `submitter` is automatically set in `perform_create` (`serializer.save(submitter=self.request.user)`). It's set as `write_only=True` and `required=False` in the serializer, so users can't fake a request with a certain submitter id in the body

- I overrode `get_validators()` on `SessionFeedbackSerializer` to disable DRF's default `UniqueTogetherValidator`. Since `student` is optional in the request (students submitting for themselves don't send `student` ID), DRF's default validator was failing before `validate()` method could populate it. Doing the duplicate check inside `validate()` fixed this smoothly.

For parents, in `validate()` it checks if the `student` is linked to the `submitter` via `FamilyLink`. If not, it throws a validation error.

## Anonymization for Instructor Summary

I didn't make a separate serializer for the summary endpoint, since it's only 5 summary number fields, and returning a simple dict response is cleaner.

## Weighted Average Calculation

Formula used: `sum(duration * session_avg) / sum(duration)` across the last 10 completed sessions

Important note: I calculated the average score per session, and multiplied by session duration. If we directly calculate each feedback entry's weighted score by duration, a session with more student reviews will be disproportionately affected, which is incorrect. Sessions with zero feedback are skipped, so they don't bring the average down. Duration is taken from `session.duration_minutes`, which is reading `duration_minutes` from `session_metadata` (default 60).

For "last 10 completed sessions", I ordered the sessions by `scheduled_date` descending.

# Frontend & Trade-offs

**Eligible sessions logic:** Instead of creating a new custom backend endpoint for eligible sessions, the frontend fetches enrolled classes, sessions, and past feedback, then filters eligible sessions client-side.

**Parent with multiple children:** The frontend groups past feedback by `student_id` so when a parent switches between their children in the dropdown, the form instantly updates to show eligible sessions for that specific child.
