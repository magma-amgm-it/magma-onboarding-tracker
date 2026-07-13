# Security Playbook — MAGMA Onboarding Tracker

This app holds **HR / new-hire data**. Treat it as sensitive.

## Access model
- Access is controlled by **security groups**, never per-person:
  - `MAGMA-Onboarding-Admins` (HR) — see everyone, assign journeys.
  - `MAGMA-Onboarding-Managers` — see only their own department/unit.
  - `MAGMA-Onboarding-Users` (new hires) — see only their own journey.
- The app reads the signed-in user's groups via Graph (`getMyGroupNames()`) and renders the
  matching role view. The UI already hides departments/rosters/other hires from new hires —
  keep that enforcement whenever the views change.
- **Server-side truth:** the SharePoint list/site permissions must also reflect this — the
  UI scoping is convenience, not a security boundary. Grant list access to the groups so a
  user physically cannot read rows they shouldn't via Graph.

## Entra app registration
- One dedicated app: **MAGMA Onboarding Tracker** (SPA). Least-privilege scopes:
  `Sites.ReadWrite.All`, `User.Read`, `User.ReadBasic.All`, `GroupMember.Read.All`.
- Global Admin self-consents. Redirect URI = the exact Pages URL.

## Secrets
- No secrets in the repo. `.env` is gitignored; CI uses GitHub Actions secrets.
- The client id is not a secret, but keep tenant/site config in secrets for tidiness.

## Data handling
- Data stays in the MAGMA tenant (SharePoint). No third-party stores.
- Only expose the fields a role needs; avoid dumping full new-hire records to managers/new hires.
- Log/audit is available via SharePoint version history + Entra sign-in logs.
