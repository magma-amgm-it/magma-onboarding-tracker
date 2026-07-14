# MAGMA Onboarding Tracker — System Dossier

> **If you are a new AI agent or developer picking this up cold:** read this file end to
> end, then read **`OPS-PRIVATE.md`** (in this same folder — it's gitignored, so it exists on
> the machine but not on GitHub) for the internal ops runbook, security-group object IDs,
> and full project history. Also load the two MAGMA skills the user has installed:
> **`magma-systems-standard`** and **`magma-app-backend-setup`** — they encode how MAGMA
> builds every internal app and the hard-won gotchas below. With those, you have 100% context.

This is the authoritative technical reference for the live app. It is committed to the
(public) repo, so it contains only non-secret values. Anything sensitive lives in
`OPS-PRIVATE.md`.

---

## 1. What this app is

An onboarding tracker for MAGMA (AMGM — an immigrant/refugee settlement non-profit). It shows
every new hire's progress through a **Month 1–3 milestone checklist**, per department, with
30/60/90-day review checkpoints. HR assigns journeys; managers verify work and tick milestones;
new hires get a read-only view of their own progress.

- **Live app:** https://magma-amgm-it.github.io/magma-onboarding-tracker/
- **Repo:** https://github.com/magma-amgm-it/magma-onboarding-tracker (public)
- **Backend:** SharePoint Lists (data) + Microsoft Graph (API) + Entra ID (auth), on the
  MAGMA tenant. No custom server — it's a static SPA that talks to Graph directly.

## 2. The MAGMA standard stack (this app follows it exactly)

Vite + React → **GitHub Pages** (via GitHub Actions) · **MSAL / Entra ID** auth ·
**SharePoint Lists via Microsoft Graph** (`graph.microsoft.com/v1.0`) · **Power Automate**
(planned, not yet built). This is the same pattern as the MAGMA Reception app
(`magma-reception-app`) and is captured in the `magma-systems-standard` skill.

## 3. Key identifiers (non-secret)

| Thing | Value |
|---|---|
| Entra tenant | `magma-amgm.org` — tenant ID `d3e527c4-259d-4e96-aab6-3c6e5402bcbd` |
| SharePoint host | `magmaamgmorg.sharepoint.com` (admin center: `magmaamgmorg-admin.sharepoint.com`) |
| App registration (client) ID | `1d79ff6c-9cbd-456d-81df-afbb6e4c381d` |
| SharePoint site | `https://magmaamgmorg.sharepoint.com/sites/App-OnboardingTracker` |
| GitHub org / repo | `magma-amgm-it` / `magma-onboarding-tracker` |
| Live URL | `https://magma-amgm-it.github.io/magma-onboarding-tracker/` |
| Vite base path | `/magma-onboarding-tracker/` |

> The client ID and tenant ID are **not secrets** — they already ship inside the public
> deployed JS bundle (that's how SPA auth works). Security-group object IDs and member lists
> live in `OPS-PRIVATE.md`.

## 4. Auth & the delegated Graph scopes

Single-tenant SPA app registration (PKCE, **no client secret**). MSAL popup sign-in. Redirect
URIs registered: the live GitHub Pages URL and `http://localhost:5173/magma-onboarding-tracker/`
(for local dev). Delegated Microsoft Graph permissions (admin-consented):

- `Sites.ReadWrite.All` — CRUD on the onboarding lists
- `User.Read` — signed-in user profile
- `User.ReadBasic.All` — org people (for pickers)
- `GroupMember.Read.All` — read the user's group membership → derive role

## 5. Roles & access model

Role is derived at runtime from the signed-in user's security-group membership (via
`/me/memberOf`). **Five roles**, precedence highest-wins: **Admin > HR > Exec > Manager > New hire.**
Each person gets exactly ONE fixed view — there is no self-serve view switching **except** the
IT Admin, who has a "preview as" switcher for support/testing.

| Security group | App role | Site perm | Sees | Can create/edit | Can tick | Switcher |
|---|---|---|---|---|---|---|
| `MAGMA-OnboardingTracker-Admins` | `admin` (IT) | Full Control | everything | yes | yes | **yes** |
| `MAGMA-OnboardingTracker-HR` | `hr` | Contribute | everything | yes (create/edit/reassign) | **no** | no |
| `MAGMA-OnboardingTracker-Execs` | `exec` | Read | everything | no (read-only oversight) | no | no |
| `MAGMA-OnboardingTracker-Managers` | `manager` | Contribute | **only their own assigned hires** (grouped by dept) | create (auto-self as mgr) | yes | no |
| `MAGMA-OnboardingTracker-Users` | `employee` | Read | only their own journey | no | no | no |

Key rules: **Ticking is per-hire, not per-role.** You can tick a milestone only for hires where
**you are the named reporting manager** (matched by `ManagerUpn` = your email) — plus Admin, for
support. So HR generally doesn't tick, **but an HR person who also manages a department** (e.g. Lara
managing the HR department's own new hires) **can tick THOSE hires** right from their HR view, while
every other hire stays read-only for them. This is the `canTickHire(id)` helper in `App.jsx`.
**Managers see only the hires where they are the named reporting manager**, so no manager→department
mapping is needed. **Execs are read-only.** A new hire's identity match uses `HireUpn`. The IT
Admin's preview switcher can view any role, with a dropdown to pick whose view to preview.

**Security principle:** the SharePoint site permission is the *real* boundary (server-side); the UI
scoping is convenience. Read-only roles (Exec, New hire) are enforced by the **Read** grant — writes
are refused server-side. SharePoint permissions are list-level, not row-level, so a Contribute user
can technically reach other rows via Graph; a hard row-level boundary would need a Power
Automate/Function proxy (future work). Group object IDs and membership: see `OPS-PRIVATE.md`.

Admins also get a **"view as"** switch in the top bar to preview the Manager / New-hire layouts.

## 6. Data model — the four SharePoint lists

Site: `/sites/App-OnboardingTracker`. All created + seeded via the PowerShell scripts in §9.

### Departments  (8 rows)
`Title` = display name · `Slug` (text, required) · `Units` (multi-line text, **comma-joined**
e.g. `"RAP, CMS, AC"`) · `Pending` (bool) · `IconSvg` (multi-line text — inline SVG path markup).

### MilestoneTemplates  (103 rows)
`Title` = milestone text · `Department` (slug, required) · `Month` (number 1–3) · `Sort`
(number, 0-based order within the month) · `OrgWide` (bool — the "MAGMA-wide" pill).
Month 1 always opens with *Organizational onboarding* (Sort 0, OrgWide) and closes with
*Cross-Cultural Training* (OrgWide).

### NewHires  (starts empty; created by HR in-app)
`Title` = new hire name · `Position` · `Department` (slug) · `Unit` · `StartDate` (date) ·
`Ref` (e.g. `MAGMA-0043`) · `Review30`/`Review60`/`Review90` (dates) ·
`ManagerName` / `ManagerUpn` / `HireUpn` (text, added in Phase 3) · `Manager` (person column —
**created but UNUSED**, see gotcha in §10).

### MilestoneCompletions  (starts empty; one row per ticked milestone)
`Title` = the completion **key** `` `${newHiresItemId}|${month}|${index}` `` · `NewHireId`
(number) · `Done` (bool) · `CompletedByName` (text, added Phase 3) · `CompletedAt` (datetime) ·
`CompletedBy` (person column — **created but UNUSED**).

**Completion key contract (important):** `index` is the position of the milestone in the
**Sort-ordered** array for that department+month. It equals the milestone's `Sort` value, and it
is the exact same key the UI's Journey view builds (`id + '|' + month + '|' + i`). Ticks line up
with the right milestone only because Sort is stable. If templates are re-sorted, old completions
can misalign (acceptable for the pilot).

## 7. Code structure

```
src/
  main.jsx            Boots MSAL (initializeMsal) then renders <App/>
  App.jsx             The entire UI in one component. Auth gate + live data + role scoping +
                      writes. Sub-views (Sidebar/Topbar/Overview/Journey/AssignModal/…) are
                      invoked as FUNCTION CALLS `{Sidebar()}` — NOT `<Sidebar/>` — on purpose
                      (see gotcha §10, input-focus).
  dataMap.js          Pure mappers: raw SharePoint list items -> the exact {depts, milestones,
                      emps, checked, compIndex} shapes the UI consumes. mapAll(raw) is the entry.
  data.js             Color constants (INK/OK/WARN/…), pure helpers (ini/colorFor/isOrgWide/
                      fmtDate), managerOptions, and the original SEED data (kept only as a
                      shape reference / offline fallback — NOT used when live).
  services/
    auth.js           MSAL config, login/logout, getActiveAccount, getAccessToken (silent+popup).
    graphApi.js       graphFetch (token + 429 back-off + friendly 401/403), getSiteId (cached),
                      list read/create/update, domain reads (getDepartments/…/getCompletions),
                      writes (createNewHire, upsertCompletion), getMe, getMyGroupNames.
    dataSync.js       Polling manager: 60s when tab visible, 5min when hidden. refresh() forces.
  theme/global.css    Animations (viewfade, lift, rowhover, chkpop, rise, drawStroke) + fonts.
  assets/magma-ring.png   The MAGMA logo mark used in the sidebar/topbar lockup.
```

**Data flow:** sign in (MSAL popup) → `getMe` + `getMyGroupNames` → role → `dataSync` polls the
4 lists → `mapAll` → render. Ticking a milestone = optimistic UI update + `upsertCompletion`
(POST new row, or PATCH existing by SharePoint item id). "+ New journey" = `createNewHire`
then `dataSync.refresh()`.

## 8. Build, run, deploy

- **Local dev:** `npm install` then `npm run dev` (Vite on `localhost:5173`). Reads `.env`
  (gitignored) for the three `VITE_*` vars. Requires the localhost redirect URI in Entra.
- **Deploy:** push to `main` → `.github/workflows/deploy.yml` runs (build with `npm ci` +
  `npm run build`, then `actions/deploy-pages`). GitHub Pages **Source must = GitHub Actions**.
  The build injects the three `VITE_*` values from **GitHub repo secrets** (Settings → Secrets
  and variables → Actions): `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`,
  `VITE_SHAREPOINT_SITE_URL`.
- **One-command ship:** `./ship.ps1 "message"` stages + commits + pushes (which auto-deploys).
  Pushing must be done from an authenticated terminal (the isolated build sandbox has no
  GitHub credentials).

`.env` / `.env.example` hold the three `VITE_*` vars. `.env` is gitignored.

## 9. PowerShell setup scripts (all in repo root, all ASCII-only)

Run from the repo folder. All use the **Microsoft.Graph** module (`Connect-MgGraph`, browser
sign-in — **no custom client ID needed**). All idempotent.

- `Create-OnboardingLists.ps1` — creates the 4 lists with columns (scopes `Sites.Manage.All`).
- `Import-OnboardingData.ps1` (+ `onboarding-seed.json`) — imports 8 departments + 103 milestones.
- `Add-OnboardingColumns.ps1` — adds the Phase-3 text columns (`ManagerName`, `ManagerUpn`,
  `HireUpn`, `CompletedByName`) so writes avoid SharePoint person-field lookups.

## 10. Gotchas (hard-won — do not relearn these)

1. **Use the Microsoft.Graph PowerShell module, NOT PnP.** `Connect-MgGraph` signs you in
   through the browser; no app/client ID to register for scripting.
2. **Keep every `.ps1` pure ASCII.** Windows PowerShell reads scripts as ANSI; em-dashes,
   curly quotes, or bullets corrupt parsing. Read UTF-8 *data* from a separate `.json`.
3. **`npm ci` needs a committed `package-lock.json`.** Without it the CI build fails in ~11s.
4. **GitHub Pages must be enabled** (Settings → Pages → Source: GitHub Actions) or the
   `configure-pages` step fails with "Get Pages site failed" even when the build is fine.
5. **SharePoint person columns are painful via Graph** (writing one needs the User Information
   List LookupId, not an email). We deliberately use **text** columns (`ManagerName`,
   `ManagerUpn`, `HireUpn`, `CompletedByName`) and leave the `Manager`/`CompletedBy` person
   columns unused.
6. **Single-file React: render sub-views as function calls `{Comp()}`, not `<Comp/>`.**
   Defining components inside `App` and mounting them as elements remounts them every keystroke,
   which drops input focus (the search box / modal require an Enter per letter). Invoking as a
   function keeps identity stable.
7. A freshly created group-connected SharePoint site only admits its auto-created Owners group —
   you may be **locked out of your own site** until you add yourself as a Site admin in the
   SharePoint admin center.

## 11. Status & roadmap

**Done:** site + 4 lists + seed (8 depts, 103 milestones) · Entra app + 3 security groups +
site permissions · GitHub repo + Pages CI · **Phase 3** — MSAL sign-in gate, live Graph
reads/writes, role-from-groups scoping, milestone ticking, in-app journey creation.

**Pending / next:**
- **Power Automate (Phase 5):** full build runbook + branded email templates are in
  `docs/PowerAutomate-Flows.md`. Two flows — (A) on `NewHires` create: auto-add the hire to the
  Users group + welcome email to the hire + assignment email to the manager (HR CC'd); (B) on
  `MilestoneCompletions` change: a one-time completion email when the hire hits 100% (guarded by
  the `CompletedNotified` column). Needs the hire to have an Entra account first.
- Capture **ManagerUpn** in the New-journey modal (currently only manager *name* is stored, so
  manager-scoping matches nothing until UPNs exist; HireUpn is captured via the email field).
- Manager **reassignment** UI (the manager field is currently read-only/display).
- **Systems Catalog (Phase 6):** register this app in the MAGMA Systems hub catalog list.
- Optional hard row-level security via a Power Automate/Azure Function read proxy.

---
_Last updated: 2026-07-13 (Phase 3 shipped). Keep this file current when the system changes._
