"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { PaginatedResponse, SessionFeedback } from "@/lib/types";
import DashboardCard from "./DashboardCard";

function RatingDots({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${
            n <= value ? "bg-cda-navy" : "bg-gray-200"
          }`}
        />
      ))}
    </span>
  );
}

export default function FeedbackHistoryCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { user } = useAuth();
  const [feedback, setFeedback] = useState<SessionFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHistory = () => {
    api
      .get<PaginatedResponse<SessionFeedback>>("/feedback/my/")
      .then((res) => setFeedback(res.results))
      .catch(() => setError("Could not load feedback history."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshKey]);

  if (loading) {
    return (
      <DashboardCard title="Feedback History">
        <p className="text-sm text-gray-400">Loading...</p>
      </DashboardCard>
    );
  }

  if (error) {
    return (
      <DashboardCard title="Feedback History">
        <p className="text-sm text-red-500">{error}</p>
      </DashboardCard>
    );
  }

  if (feedback.length === 0) {
    return (
      <DashboardCard title="Feedback History">
        <p className="text-sm text-gray-500">No feedback submitted yet.</p>
      </DashboardCard>
    );
  }

  const isParent = user?.role === "parent";

  // parents see entries grouped under each child's name
  const grouped = isParent
    ? feedback.reduce<Record<string, SessionFeedback[]>>((acc, f) => {
        const name = f.student_display;
        if (!acc[name]) acc[name] = [];
        acc[name].push(f);
        return acc;
      }, {})
    : { "": feedback };

  return (
    <DashboardCard
      title="Feedback History"
      subtitle={`${feedback.length} submission${feedback.length !== 1 ? "s" : ""}`}
      flush
    >
      {Object.entries(grouped).map(([studentName, entries]) => (
        <div key={studentName || "self"}>
          {isParent && (
            <p className="border-b border-gray-100 bg-gray-50 px-5 py-2 text-xs font-medium text-gray-600">
              {studentName}
            </p>
          )}
          <ul className="divide-y divide-gray-100">
            {entries.map((f) => (
              <li key={f.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {f.session_details.class_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(
                        f.session_details.scheduled_date
                      ).toLocaleDateString()}
                      {f.session_details.topic
                        ? ` · ${f.session_details.topic}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-1 text-right">
                    {(
                      [
                        ["Clarity", f.rating_clarity],
                        ["Engagement", f.rating_engagement],
                        ["Pace", f.rating_pace],
                      ] as [string, number][]
                    ).map(([label, val]) => (
                      <div
                        key={label}
                        className="flex items-center justify-end gap-2"
                      >
                        <span className="text-xs text-gray-400">{label}</span>
                        <RatingDots value={val} />
                      </div>
                    ))}
                  </div>
                </div>
                {f.note && (
                  <p className="mt-2 text-xs italic text-gray-500">{f.note}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </DashboardCard>
  );
}
