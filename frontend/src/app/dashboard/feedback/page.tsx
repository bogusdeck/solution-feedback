"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import FeedbackFormCard from "@/components/FeedbackFormCard";
import FeedbackHistoryCard from "@/components/FeedbackHistoryCard";
import InstructorSummaryCard from "@/components/InstructorSummaryCard";

/**
 * Session Feedback Page
 *
 * Route: /dashboard/feedback
 */
export default function FeedbackPage() {
  const { user } = useAuth();
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0);

  if (!user) return null;

  const isStudentOrParent =
    user.role === "student" || user.role === "parent";
  const isInstructorOrAdmin =
    user.role === "instructor" || user.role === "admin";

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900">
        Session Feedback
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {isStudentOrParent
          ? "Submit and view feedback for completed sessions."
          : "View aggregated and anonymized feedback metrics."}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {isStudentOrParent && (
          <>
            <FeedbackFormCard
              onSuccess={() => setFeedbackRefreshKey((k) => k + 1)}
            />
            <FeedbackHistoryCard refreshKey={feedbackRefreshKey} />
          </>
        )}

        {isInstructorOrAdmin && <InstructorSummaryCard />}
      </div>
    </div>
  );
}
