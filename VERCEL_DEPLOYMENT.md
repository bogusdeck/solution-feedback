# Vercel Deployment Guide

This guide explains how to deploy both the **Next.js Frontend** and **Django Backend** to Vercel.

---

## ⚠️ Important Note on Database (SQLite vs Postgres)

Vercel Serverless functions run in a **read-only, ephemeral environment**.
- **SQLite** works for read-only local demos, but write operations (`POST /feedback/`) will not persist across serverless invocations on Vercel.
- For full database persistence on Vercel, connect a free cloud PostgreSQL instance from **Neon** or **Supabase**:
  1. Create a free Postgres database at [Neon.tech](https://neon.tech) or [Supabase.com](https://supabase.com).
  2. Add the `DATABASE_URL` environment variable in your Vercel backend project settings (e.g. `postgres://user:password@ep-xyz.neon.tech/neondb?sslmode=require`).
  3. The backend automatically detects `DATABASE_URL` via `dj-database-url`.

---

## 1. Deploying the Backend (`/backend`)

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New > Project**.
2. Import your GitHub repository (`bogusdeck/solution-feedback`).
3. Under **Root Directory**, click **Edit** and set it to `backend`.
4. Leave Framework Preset as **Other**.
5. (Optional) Under **Environment Variables**, add `DATABASE_URL` for Postgres persistence.
6. Click **Deploy**.

Vercel will use `backend/vercel.json` to configure the Python WSGI serverless function for Django.

Once deployed, copy your backend Vercel URL (e.g., `https://solution-feedback-backend.vercel.app`).

---

## 2. Deploying the Frontend (`/frontend`)

1. Click **Add New > Project** in Vercel.
2. Import the same repository (`bogusdeck/solution-feedback`).
3. Under **Root Directory**, set it to `frontend`.
4. Framework Preset will auto-detect as **Next.js**.
5. Under **Environment Variables**, add:
   - **Key:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://<your-backend-vercel-url>/api/v1` (e.g. `https://solution-feedback-backend.vercel.app/api/v1`)
6. Click **Deploy**.

---

## 3. Post-Deployment Checklist

- Open your frontend Vercel URL.
- Test logging in using the credentials in `TEST_ACCOUNTS.md`.
- Verify API requests successfully reach the backend API endpoints.
