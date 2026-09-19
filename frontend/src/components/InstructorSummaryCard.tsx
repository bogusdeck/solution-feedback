"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { FeedbackSummary, ClassItem, PaginatedResponse } from "@/lib/types";
import DashboardCard from "./DashboardCard";

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-xs font-medium text-gray-900">
          {value.toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-cda-navy transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface InstructorOption {
  id: number;
  name: string;
}

export default function InstructorSummaryCard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Admin state
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [selectedInstructorId, setSelectedInstructorId] = useState<number | "">("");

  const isAdmin = user?.role === "admin";

  // If admin, fetch instructor list first
  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      api
        .get<PaginatedResponse<ClassItem>>("/classes/")
        .then((res) => {
          const map = new Map<number, string>();
          res.results.forEach((c) => {
            if (c.instructor && c.instructor_display) {
              map.set(c.instructor, c.instructor_display.display_name);
            }
          });
          const list: InstructorOption[] = Array.from(map.entries()).map(
            ([id, name]) => ({ id, name })
          );
          setInstructors(list);
          if (list.length > 0) {
            setSelectedInstructorId(list[0].id);
          } else {
            setLoading(false);
          }
        })
        .catch(() => {
          setError("Could not load instructors.");
          setLoading(false);
        });
    }
  }, [user, isAdmin]);

  // Fetch feedback summary
  useEffect(() => {
    if (!user) return;

    if (isAdmin) {
      if (!selectedInstructorId) return;
      setLoading(true);
      setError("");
      api
        .get<FeedbackSummary>(
          `/feedback/instructor-summary/?instructor_id=${selectedInstructorId}`
        )
        .then(setSummary)
        .catch(() => setError("Could not load feedback summary."))
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      setError("");
      api
        .get<FeedbackSummary>("/feedback/instructor-summary/")
        .then(setSummary)
        .catch(() => setError("Could not load feedback summary."))
        .finally(() => setLoading(false));
    }
  }, [user, isAdmin, selectedInstructorId]);

  if (loading) {
    return (
      <DashboardCard title="Feedback Summary">
        <p className="text-sm text-gray-400">Loading...</p>
      </DashboardCard>
    );
  }

  if (error) {
    return (
      <DashboardCard title="Feedback Summary">
        <p className="text-sm text-red-500">{error}</p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title="Feedback Summary"
      subtitle={
        summary
          ? `${summary.total_feedback_count} response${summary.total_feedback_count !== 1 ? "s" : ""} · last 10 sessions`
          : undefined
      }
    >
      <div className="space-y-4">
        {isAdmin && instructors.length > 0 && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Select Instructor
            </label>
            <select
              value={selectedInstructorId}
              onChange={(e) =>
                setSelectedInstructorId(Number(e.target.value) || "")
              }
              className="w-full rounded border border-gray-200 px-3 py-1.5 text-sm focus:border-cda-blue focus:outline-none"
            >
              {instructors.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!summary || summary.total_feedback_count === 0 ? (
          <p className="text-sm text-gray-500">No feedback received yet.</p>
        ) : (
          <>
            <div className="space-y-3">
              <ScoreBar label="Clarity" value={summary.rating_clarity_avg} />
              <ScoreBar label="Engagement" value={summary.rating_engagement_avg} />
              <ScoreBar label="Pace" value={summary.rating_pace_avg} />
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-600">Overall</span>
              <span className="text-lg font-semibold text-cda-navy">
                {summary.overall_avg.toFixed(1)}
                <span className="text-xs font-normal text-gray-400"> / 5</span>
              </span>
            </div>

            <p className="text-xs text-gray-400">
              Scores are aggregated and anonymized. Weighted by session duration.
            </p>
          </>
        )}
      </div>
    </DashboardCard>
  );
}
