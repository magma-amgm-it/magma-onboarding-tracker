# Phase 2 tail — Entra app registration + security groups

Do these in the Entra admin center (https://entra.microsoft.com) as Global Admin.

---

## A. Register the Entra app (gives you the client id)

1. **Applications → App registrations → + New registration.**
2. **Name:** `MAGMA Onboarding Tracker`
3. **Supported account types:** *Accounts in this organizational directory only (single tenant).*
4. **Redirect URI:** platform **Single-page application (SPA)**, value:
   `https://magma-amgm-it.github.io/magma-onboarding-tracker/`
   *(GitHub Pages URL — same account as the Reception app. Optionally add a 2nd SPA redirect
   `http://localhost:5173/magma-onboarding-tracker/` for local `npm run dev`.)*
5. **Register.** On the Overview page, copy:
   - **Application (client) ID**  → this is `VITE_AZURE_CLIENT_ID`
   - **Directory (tenant) ID**    → `VITE_AZURE_TENANT_ID` (should be `d3e527c4-259d-4e96-aab6-3c6e5402bcbd`)
6. **API permissions → + Add a permission → Microsoft Graph → Delegated permissions**, add:
   - `Sites.ReadWrite.All`
   - `User.Read`
   - `User.ReadBasic.All`
   - `GroupMember.Read.All`
   Then **Grant admin consent for MAGMA** (you can, as Global Admin) — all four should show green.
7. That's it for the app (SPA uses PKCE; no client secret needed).

### Put the values in
- Local: create `.env` from `.env.example` and fill the three `VITE_*` vars.
- CI: GitHub repo → Settings → Secrets and variables → Actions → add the same three as secrets:
  `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`,
  `VITE_SHAREPOINT_SITE_URL = https://magmaamgmorg.sharepoint.com/sites/App-OnboardingTracker`

---

## B. Create the 3 security groups

1. **Groups → + New group.** Type: **Security**. Create three:
   - `MAGMA-OnboardingTracker-Admins`   — HR (e.g. Lara Falana)
   - `MAGMA-OnboardingTracker-Managers` — department managers (Afef, Ammar, etc.)
   - `MAGMA-OnboardingTracker-Users`    — new hires
2. Add the right people as **members** of each.

## C. Grant the groups access to the site
On the site (`/sites/App-OnboardingTracker`) → **Settings (gear) → Site permissions →
Advanced permissions settings → Grant Permissions**, add:
- `MAGMA-OnboardingTracker-Admins`   → **Edit** (or Full Control if they manage the site)
- `MAGMA-OnboardingTracker-Managers` → **Edit**
- `MAGMA-OnboardingTracker-Users`    → **Edit** (new hires need to tick their own milestones)

> Note: SharePoint permissions are list-level, not row-level, so "Edit" lets a user technically
> reach other rows via Graph. The app enforces who-sees-what by role. If you later want a hard
> row-level boundary, we split reads through a Power Automate/Azure Function proxy — track that in
> SECURITY-PLAYBOOK.md. For the pilot, group-level Edit is fine.

---

## When done
Tell the agent the **client id** is set (in `.env` + GitHub secrets) and the groups exist.
Then Phase 3: wire the app to read/write these lists via Graph and derive the role from the
user's group membership.
