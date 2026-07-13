# Onboarding Tracker — Build Guide

Follow the phases in order. Steps marked 🖥️ are one-time tenant actions (Global Admin);
the rest are code (done in this repo).

---

## Phase 0 — Scaffold ✅ (done)
Vite + React project, UI ported, service layer, Pages workflow, docs. Runs on `src/data.js`.

---

## Phase 1 — SharePoint lists

Create these lists in `/sites/App-OnboardingTracker`. Column types in brackets.

### `Departments`
| Column | Type | Notes |
|---|---|---|
| Title | Single line | Display name, e.g. "Settlement" |
| Slug | Single line | `settlement` (stable key) |
| Units | Multi-line | Comma list, e.g. "RAP, CMS, AC" (blank if none) |
| Pending | Yes/No | True = milestones not finalised yet |
| IconSvg | Multi-line | Inner SVG paths for the dept icon (optional) |

### `MilestoneTemplates`
| Column | Type | Notes |
|---|---|---|
| Title | Single line | The milestone text |
| Department | Lookup→Departments (or Slug text) | |
| Month | Number | 1, 2, or 3 |
| Sort | Number | Order within the month |
| OrgWide | Yes/No | True for HR-onboarding + Cross-Cultural Training |

### `NewHires`
| Column | Type | Notes |
|---|---|---|
| Title | Single line | New hire name |
| Position | Single line | |
| Department | Lookup→Departments (or Slug) | |
| Unit | Single line | If dept has units |
| Manager | Person | Reporting manager |
| StartDate | Date | |
| Ref | Single line | e.g. MAGMA-0043 |
| Review30 / Review60 / Review90 | Date | Checkpoints |

### `MilestoneCompletions`
| Column | Type | Notes |
|---|---|---|
| Title | Single line | Milestone key: `<hireId>|<month>|<index>` |
| NewHireId | Number/Lookup | The NewHires item id |
| Done | Yes/No | |
| CompletedBy | Person | |
| CompletedAt | Date/Time | |

> Tip: you can script list creation like the Reception system's `Create-*List.ps1`.

---

## Phase 2 — Tenant setup 🖥️ (Global Admin)
1. Create site `/sites/App-OnboardingTracker` (Team site) and **associate to the MAGMA Systems hub**.
2. Register Entra app **MAGMA Onboarding Tracker** (platform: SPA; redirect = Pages URL).
   Add Graph scopes (see Environment-notes) and **Grant admin consent** (self).
3. Create security groups `MAGMA-Onboarding-Admins/Managers/Users`; grant the site access.
4. Put the client id / tenant id / site URL into `.env` and GitHub Actions secrets.

---

## Phase 3 — Wire the app to Graph (code)
- Replace the seed in `src/data.js` with live loads: on sign-in, `dataSync.start()` fills
  departments / milestoneTemplates / newHires / completions into React state.
- Ticking a milestone → `setMilestoneCompletion(...)`; "+ New journey" → `createNewHire(...)`.
- Map SharePoint fields → the shape `src/data.js` documents.

## Phase 4 — Roles from group membership (code)
- On sign-in, `getMyGroupNames()`; derive role: Admins→HR, Managers→manager (scoped to their
  dept), Users→new hire (self only). The UI already enforces the scoping.

## Phase 5 — Power Automate (flows, exported as .zip in repo)
- **Onboarding link:** on new `NewHires` item → email the new hire their personal link.
- **Review reminders:** daily check → email manager + HR at 30/60/90-day checkpoints.

## Phase 6 — Pilot + catalog + go live
- Pilot with one department (HR or Intake), then add a row to the hub `SystemsCatalog`.
