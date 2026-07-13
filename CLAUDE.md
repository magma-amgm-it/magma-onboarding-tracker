# CLAUDE.md — MAGMA Onboarding Tracker

## Project overview
New-hire onboarding tracker for MAGMA. Tracks each new hire's Month 1–3 milestones and
30/60/90-day reviews across departments. Three role views: **HR** (whole org), **Manager**
(their department/unit), **New hire** (their own journey only). One "org-wide" set of
milestones (HR onboarding + Cross-Cultural Training) is tagged **MAGMA-wide** on every dept.

## Tech stack (MAGMA standard)
- **Frontend:** Vite + React, deployed to GitHub Pages via GitHub Actions
- **Auth:** Entra ID via MSAL (`src/services/auth.js`)
- **Data:** SharePoint Lists via Microsoft Graph (`src/services/graphApi.js`, polled by `dataSync.js`)
- **Automation:** Power Automate (onboarding-link email + review reminders)

## Key files
- `src/App.jsx` — the whole UI (sidebar, topbar, overview, dept detail, journey, assign modal)
- `src/data.js` — seed/fallback data + pure helpers (the shape the UI expects; Graph must match)
- `src/services/auth.js` — MSAL login + token
- `src/services/graphApi.js` — Graph wrapper + list CRUD + `getMyGroupNames()` for role
- `src/services/dataSync.js` — polling loader (60s active / 5min hidden)
- `docs/Onboarding-Build-Guide.md` — SharePoint list schema + phase checklist
- `docs/SECURITY-PLAYBOOK.md` — scopes, security groups, data-handling notes

## Workflow
When given a vague request, ask 2–3 clarifying questions first, then: Explore → Plan →
Implement (small steps) → Verify (does it still build / match the data shape).

## Where things stand
Phase 0 (scaffold) done — UI runs on `src/data.js`. Next: Phase 1 (create SharePoint lists),
Phase 2 (Entra app + security groups), Phase 3 (wire the app to Graph), Phase 4 (role from
group membership), Phase 5 (Power Automate). See the build guide.
