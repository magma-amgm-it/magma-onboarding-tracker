# MAGMA Onboarding Tracker

New-hire onboarding tracker for MAGMA — a live view of every new hire's first 90 days
(Month 1–3 milestones + 30/60/90 reviews) across departments, with HR / Manager / New-hire
views. Built on the standard MAGMA stack (see `../../MAGMA-SYSTEMS-STANDARD.md`).

## Stack
- **Frontend:** Vite + React → GitHub Pages
- **Auth:** Entra ID via MSAL
- **Data:** SharePoint Lists via Microsoft Graph
- **Automation:** Power Automate (onboarding email + review reminders)

## Quick start
```bash
npm install
cp .env.example .env      # fill in from the Entra app registration
npm run dev               # http://localhost:5173/magma-onboarding-tracker/
npm run build             # outputs to dist/
```

## Deploy
Push to `main` → the GitHub Action builds and deploys to GitHub Pages.
Set repo secrets: `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_SHAREPOINT_SITE_URL`.

## Status (Phase 0 — scaffold)
- ✅ UI ported (branding, animations, role views, access control) — runs on seed data in `src/data.js`
- ✅ Service layer ready (`src/services/`)
- ⏳ Phase 3: replace `src/data.js` with live SharePoint loads via `services/dataSync.js`

See `docs/Onboarding-Build-Guide.md` for the SharePoint schema and the phase checklist.
