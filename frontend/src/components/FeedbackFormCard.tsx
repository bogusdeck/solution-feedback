"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type {
  ClassItem,
  Session,
  PaginatedResponse,
  SessionFeedback,
  User,
} from "@/lib/types";
import DashboardCard from "./DashboardCard";

// Inline star picker — small enough not to warrant a separate file
function StarRating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-gray-500">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            className="text-xl leading-none focus:outline-none"
          >
            <span
              className={
                (hovered || value) >= n ? "text-amber-400" : "text-gray-300"
              }
            >
              ★
            </span>
          </button>
        ))}
      </div>
      {value > 0 && (
        <span className="text-xs text-gray-400">{value}/5</span>
      )}
    </div>
  );
}

type Ratings = { clarity: number; engagement: number; pace: number };

const blank: Ratings = { clarity: 0, engagement: 0, pace: 0 };

export default function FeedbackFormCard({ onSuccess }: { onSuccess?: () => void }) {
  const { user } = useAuth();

  const [eligible, setEligible] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // form state
  const [sessionId, setSessionId] = useState<number | "">("");
  const [studentId, setStudentId] = useState<number | "">("");
  const [ratings, setRatings] = useState<Ratings>(blank);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // ids hidden optimistically after a successful submit
  const [submitted, setSubmitted] = useState<number[]>([]);

  // reviewed sessions keyed by student_id — used by parents to correctly
  // compute eligibility per selected child
  const [reviewedByStudent, setReviewedByStudent] = useState<
    Record<number, Set<number>>
  >({});
  // all sessions that are completed and within the 30-day window
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [familyLinks, setFamilyLinks] = useState<import("@/lib/types").FamilyLink[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchEligible();
  }, [user]);

  // When the selected student changes (parent flow), re-derive the visible
  // eligible sessions from the already-fetched data — no extra round trip.
  useEffect(() => {
    if (user?.role !== "parent" || !allSessions.length) return;
    if (!studentId) {
      setEligible([]);
      return;
    }
    const reviewed = reviewedByStudent[studentId as number] ?? new Set<number>();
    setEligible(allSessions.filter((s) => !reviewed.has(s.id)));
    setSessionId(""); // reset session selection when child changes
  }, [studentId, user?.role, allSessions, reviewedByStudent]);

  async function fetchEligible() {
    try {
      // pull already-reviewed sessions so we can exclude them
      const history = await api.get<PaginatedResponse<SessionFeedback>>(
        "/feedback/my/"
      );

      const classesRes = await api.get<PaginatedResponse<ClassItem>>(
        "/classes/"
      );
      const sessionsByClass = await Promise.all(
        classesRes.results.map((c) =>
          api
            .get<PaginatedResponse<Session>>(`/classes/${c.id}/sessions/`)
            .then((r) => r.results)
            .catch(() => [] as Session[])
        )
      );

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const candidates = sessionsByClass
        .flat()
        .filter(
          (s) =>
            s.status === "completed" &&
            new Date(s.scheduled_date).getTime() > thirtyDaysAgo
        );

      if (user?.role === "parent") {
        // Build a per-student reviewed set so we can re-filter when the
        // parent switches the child dropdown without another API call.
        const byStudent: Record<number, Set<number>> = {};
        for (const f of history.results) {
          if (!byStudent[f.student]) byStudent[f.student] = new Set();
          byStudent[f.student].add(f.session);
        }
        setReviewedByStudent(byStudent);
        setAllSessions(candidates);

        let children = user?.family_links ?? [];
        if (!children.length) {
          try {
            const profile = await api.get<User>("/accounts/profile/");
            if (profile.family_links) {
              children = profile.family_links;
              setFamilyLinks(children);
            }
          } catch {}
        } else {
          setFamilyLinks(children);
        }

        if (children.length > 0) {
          const defaultStudent = studentId || children[0].student;
          setStudentId(defaultStudent);
          const reviewed = byStudent[defaultStudent] ?? new Set<number>();
          setEligible(candidates.filter((s) => !reviewed.has(s.id)));
        } else {
          setEligible([]);
        }
      } else {
        // Student: simple set of already-reviewed session ids
        const reviewed = new Set(history.results.map((f) => f.session));
        setEligible(candidates.filter((s) => !reviewed.has(s.id)));
      }
    } catch {
      setLoadError("Couldn't load sessions right now.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;

    // Parent must have selected a child before submitting
    if (user?.role === "parent" && !studentId) {
      setFieldErrors({ student: "Please select which student you're submitting for." });
      return;
    }

    const { clarity, engagement, pace } = ratings;
    if (!clarity || !engagement || !pace) {
      setFieldErrors({ ratings: "Please rate all three dimensions." });
      return;
    }

    // hide the session immediately — roll back below if the request fails
    setSubmitted((prev) => [...prev, sessionId as number]);
    setSubmitting(true);
    setFieldErrors({});

    const body: Record<string, unknown> = {
      session: sessionId,
      rating_clarity: clarity,
      rating_engagement: engagement,
      rating_pace: pace,
    };
    if (note.trim()) body.note = note.trim();
    if (user?.role === "parent" && studentId) {
      body.student = studentId;
    } else if (user?.role === "student") {
      body.student = user.id;
    }

    try {
      await api.post("/feedback/", body);
      setSessionId("");
      setRatings(blank);
      setNote("");
      onSuccess?.();
    } catch (err) {
      // roll back — put the session back in the list
      setSubmitted((prev) => prev.filter((id) => id !== sessionId));

      if (err instanceof ApiError) {
        const msgs: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.body)) {
          msgs[k] = Array.isArray(v) ? (v[0] as string) : String(v);
        }
        setFieldErrors(msgs);
      } else {
        setFieldErrors({ detail: "Something went wrong. Try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <DashboardCard title="Submit Feedback">
        <p className="text-sm text-gray-400">Loading sessions...</p>
      </DashboardCard>
    );
  }

  if (loadError) {
    return (
      <DashboardCard title="Submit Feedback">
        <p className="text-sm text-red-500">{loadError}</p>
      </DashboardCard>
    );
  }

  const visible = eligible.filter((s) => !submitted.includes(s.id));
  const children = familyLinks.length ? familyLinks : (user?.family_links ?? []);

  if (visible.length === 0 && user?.role !== "parent") {
    return (
      <DashboardCard title="Submit Feedback">
        <p className="text-sm text-gray-500">
          No sessions pending feedback.
        </p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title="Submit Feedback"
      subtitle={`${visible.length} session${visible.length !== 1 ? "s" : ""} pending`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {user?.role === "parent" && children.length > 0 && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Submitting for
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(Number(e.target.value) || "")}
              className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-cda-blue focus:outline-none"
              required
            >
              <option value="">Select student</option>
              {children.map((link) => (
                <option key={link.student} value={link.student}>
                  {link.student_display.display_name}
                </option>
              ))}
            </select>
            {fieldErrors.student && (
              <p className="mt-0.5 text-xs text-red-500">{fieldErrors.student}</p>
            )}
          </div>
        )}

        {visible.length === 0 ? (
          <p className="py-2 text-sm text-gray-500">
            No sessions pending feedback for this student.
          </p>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Session</label>
              <select
                value={sessionId}
                onChange={(e) => setSessionId(Number(e.target.value) || "")}
                className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-cda-blue focus:outline-none"
                required
              >
                <option value="">Pick a session…</option>
                {visible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.class_name} —{" "}
                    {new Date(s.scheduled_date).toLocaleDateString()}
                    {s.topic ? ` (${s.topic})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <StarRating
                label="Clarity"
                value={ratings.clarity}
                onChange={(n) => setRatings((r) => ({ ...r, clarity: n }))}
              />
              <StarRating
                label="Engagement"
                value={ratings.engagement}
                onChange={(n) => setRatings((r) => ({ ...r, engagement: n }))}
              />
              <StarRating
                label="Pace"
                value={ratings.pace}
                onChange={(n) => setRatings((r) => ({ ...r, pace: n }))}
              />
              {fieldErrors.ratings && (
                <p className="text-xs text-red-500">{fieldErrors.ratings}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">
                Note{" "}
                <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Anything else you'd like to share…"
                className="w-full resize-none rounded border border-gray-200 px-3 py-2 text-sm focus:border-cda-blue focus:outline-none"
              />
              <p className="mt-0.5 text-right text-xs text-gray-400">
                {note.length}/500
              </p>
            </div>

            {Object.entries(fieldErrors)
              .filter(([k]) => k !== "ratings" && k !== "student")
              .map(([k, v]) => (
                <p key={k} className="text-xs text-red-500">
                  {v}
                </p>
              ))}

            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-cda-navy px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit feedback"}
            </button>
          </>
        )}
      </form>
    </DashboardCard>
  );
}
