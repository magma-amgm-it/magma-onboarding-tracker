# Phase C — Real account provisioning (build runbook)

The payoff phase. When IT approves a request, a flow **creates the M365 account, assigns the
licence, emails the temp password, and marks the request Provisioned** — plus a second flow that
**notifies all the teams** the moment a request comes in. This is the security-sensitive part, so
do Part 1 carefully.

Two flows:
- **Flow C-1 — New-hire notification** (on request *created*): emails the task owners + CCs the
  managers, so everyone can start their part. Replaces Vanisha's manual "support required" email.
- **Flow C-2 — Account provisioning** (on request *approved* by IT): creates the account + licence.

---

## Part 1 — the provisioning identity (Entra app registration)

This app is what actually creates users, so treat its secret like a master key.

1. **entra.microsoft.com → Applications → App registrations → + New registration.**
   - Name: `MAGMA Onboarding Provisioning`
   - Accounts: single tenant. **Register.**
2. Copy the **Application (client) ID** and **Directory (tenant) ID** (`d3e527c4-259d-4e96-aab6-3c6e5402bcbd`).
   - **Registered:** app `MAGMA Onboarding Provisioning`, client ID **`b99ddb94-96ee-4a03-a4cb-584a412a8422`**.
     Graph app perms `User.ReadWrite.All` + `Organization.Read.All` granted (admin consent green). Secret
     (`provisioning-flow`, 24-mo) stored by Abhishek out-of-band — **never** committed or emailed.
3. **API permissions → + Add → Microsoft Graph → Application permissions**, add:
   - `User.ReadWrite.All` (create the user + assign the licence)
   - `Organization.Read.All` (read licence SKUs / seat counts)
   Then **Grant admin consent for MAGMA** (both go green).
4. **Certificates & secrets → + New client secret** → 12–24 month expiry → **copy the Value now**
   (you can't see it again). **Store it in a safe place** — ideally Azure Key Vault, or at minimum
   paste it only into the Power Automate HTTP action's auth (below). Never email it or put it in a
   SharePoint list. *(This is the one secret in the whole system — guard it.)*

> Optional hardening for later: create an Entra **administrative unit** holding only new-hire
> accounts and scope this app's rights to it, so a bug can't touch executives. Not required to start.

---

## Part 2 — find your licence SKU IDs (one-time)

You need the GUIDs of your licences. In **Graph Explorer** (developer.microsoft.com/graph/graph-explorer,
signed in as admin) run:

```
GET https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuId,skuPartNumber,prepaidUnits,consumedUnits
```

Note the `skuId` for:
- **Business Premium** — skuPartNumber `SPB`
- **Business Basic** — skuPartNumber `O365_BUSINESS_ESSENTIALS`

You'll paste these into Flow C-2. (The same call shows seats: `prepaidUnits.enabled - consumedUnits`.)

**Recorded for MAGMA (checked 2026-07-28):**
- Business Premium `SPB` → skuId **`cbdc14ab-d96c-4c30-b9f4-6ada7cdc1d46`** — **110/110 used, 0 free.**
  A Premium hire needs a seat purchased before the licence can be assigned; the seat-check in Flow C-2
  Step 5 catches this and emails IT to buy one.
- Business Basic `O365_BUSINESS_ESSENTIALS` → skuId **`3b555118-da6a-4418-894f-7df1e2096870`** — ~289 free.

---

## Flow C-1 — new-hire notification (on request created)  ✅ BUILT & LIVE (2026-07-28)

**Status: done, tested, working.** Built **by hand** in make.powerautomate.com — the Legacy Package
import failed in this tenant (the connection picker showed no items and "Create new" wouldn't complete,
so Import stayed greyed). An importable package was generated at `flows/MAGMA-Newhire-Notification-C1.zip`
(kept for reference / other tenants) but was **not** the method used. If rebuilding, build by hand.

**Trigger:** SharePoint *When an item is created* → App-OnboardingTracker site, list `ProvisioningRequests`
(list GUID `d047894a-7f6a-499e-b1b2-452eb3eb7638`). Connection: `abhishek.desai@`.

**Actions, in order (exact):**
1. **Compose `CcArray`** — inputs:
   `createArray(triggerOutputs()?['body/ManagerUpn'], triggerOutputs()?['body/DeptManagerUpn'], triggerOutputs()?['body/UnitManagerUpn'])`
   *(Do NOT wrap in `union(...)` with an empty `createArray()` — an empty `createArray()` is invalid
   and fails the run. We don't need dedupe: Outlook collapses duplicate recipients on send.)*
2. **Filter array `FilterBlanks`** — From `outputs('CcArray')`, advanced-mode condition
   `@not(equals(trim(coalesce(item(),'')), ''))` (drops blank managers).
3. **Compose `CcList`** — inputs `join(body('FilterBlanks'), ';')`.
4. **Compose `EmailBody`** — the notification HTML (below) pasted whole; the `@{...}` tokens resolve.
5. **Send an email (V2)** (Office 365 Outlook, `abhishek.desai@` connection):
   - **From (Send as):** `notifications@magma-amgm.org` — Abhishek has Send-As on it, so it works.
   - **To (fixed owners):** `abhishek.desai@magma-amgm.org; trevor.tower@magma-amgm.org; lara.falana@magma-amgm.org; vanisha.weekes@magma-amgm.org; don.gaudet@magma-amgm.org; krisha.dassanayake@magma-amgm.org`
     *(IT: Abhishek+Trevor · HR: Lara+Vanisha · Facilities: Don · icare: Krisha. Update if people change.)*
   - **Cc:** `outputs('CcList')` — the managers, blanks dropped; Outlook de-dupes if reporting==dept manager.
   - **Subject:** `New hire starting — setup needed: ` + trigger **Title**.
   - **Body:** code-view → `outputs('EmailBody')`.

<details><summary>Original exploratory notes (superseded by the built steps above)</summary>

- **Cc:** the managers, **de-duplicated and with blanks dropped** (the reporting manager is often
  also the dept manager, and there may be no unit manager). *(Even if you skip this and
  just list all three, Exchange de-dupes and ignores blanks on send — but the filter avoids the
  occasional "invalid recipient" on an empty unit-manager.)*
- **Subject:** `New hire starting — setup needed: [Title]`
- **Body:** the **Notification** template below (includes the cost centre + each item spec).

</details>

---

## Flow C-2 — account provisioning (on request approved)  — AS BUILT (2026-07-29)

Built by hand in the new designer. **Trigger:** SharePoint *When an item is created or modified*, list
`ProvisioningRequests`, connection `abhishek.desai@`.

### ⚠️ The critical auth lesson (why every Graph call uses the built-in HTTP action)
First attempt used the **Office 365 Users → "Send an HTTP request"** action for CreateUser. It signs in
**as the user** and that connector does **not** carry `User.ReadWrite.All`, so creating a user returned
**403 `Authorization_RequestDenied` — Insufficient privileges**. Fix: use the **built-in `HTTP` action**
(the plain one under the "HTTP" group, not "HTTP With Microsoft Entra ID") with **Authentication =
Active Directory OAuth** (app-only / client-credentials) against the Part-1 app, which holds the
**application** permissions `User.ReadWrite.All` + `Organization.Read.All` with admin consent. Every
Graph call in C-2 (CreateUser, GetSeats, AssignLicense, GetSeats2, AssignLicense2) uses this.

**Auth block (identical on all five HTTP actions):**
- Authentication type `Active Directory OAuth`
- Authority `https://login.microsoftonline.com`
- Tenant `d3e527c4-259d-4e96-aab6-3c6e5402bcbd`
- Audience `https://graph.microsoft.com`
- Client ID `b99ddb94-96ee-4a03-a4cb-584a412a8422`
- Credential Type `Secret` · Secret = the Part-1 client secret (stored out-of-band by Abhishek)

### The action chain (in order), all inside the Guard's **True** branch

**Guard (Condition):** `And` of — `Stage` **is equal to** `Approved` · `AccountCreated` **is not equal
to** `true` · `Or`( `ApprovedByName` = `Abhishek Desai`, `ApprovedByName` = `Trevor Tower` ).
> **Gotcha:** a brand-new request has `AccountCreated` = **null**, not `false`, so the original
> `= false` check made the guard fail. Use **`is not equal to true`** — passes when null/false, blocks
> only once set to Yes (which also stops the flow's own updates from re-triggering it).

1. **`TempPassword`** (Compose) = literal `Changeme1!` (fixed password, force-change on first sign-in).
2. **`CreateUser`** (HTTP POST `https://graph.microsoft.com/v1.0/users`, `Content-Type: application/json`) — body:
```json
{
  "accountEnabled": true,
  "displayName": "@{triggerBody()?['Title']}",
  "mailNickname": "@{first(split(triggerBody()?['DesiredUpn'], '@'))}",
  "userPrincipalName": "@{triggerBody()?['DesiredUpn']}",
  "usageLocation": "CA",
  "jobTitle": "@{triggerBody()?['Position']}",
  "department": "@{triggerBody()?['Department']}",
  "officeLocation": "@{triggerBody()?['Location']}",
  "passwordProfile": { "forceChangePasswordNextSignIn": true, "password": "@{outputs('TempPassword')}" }
}
```
   *(Sets the M365 profile too — job title, department [slug], office. Manager is a relationship, not
   set here; add a PUT to `/users/{id}/manager/$ref` later if wanted.)*
3. **`Parse JSON`** — Content `body('CreateUser')`, schema `{ "type":"object","properties":{ "id":{"type":"string"} } }` → gives the new user's `id`.
4. **`ClaimAccount`** (SharePoint Update item, Id `triggerBody()?['ID']`, Title `triggerBody()?['Title']`) → `AccountCreated = Yes`. Early stamp so a Premium seat-wait can't spawn a duplicate run.
5. **`SkuId`** (Compose): `if(equals(triggerBody()?['LicenseType'],'Business Premium'),'cbdc14ab-d96c-4c30-b9f4-6ada7cdc1d46',if(equals(triggerBody()?['LicenseType'],'Business Basic'),'3b555118-da6a-4418-894f-7df1e2096870',''))`
6. **`NeedsLicense`** (Condition): `outputs('SkuId')` **is not equal to** blank → **True** branch:
   - **`GetSeats`** (HTTP GET `.../subscribedSkus?$select=skuId,consumedUnits,prepaidUnits`).
   - **`MySku`** (Filter array): From `body('GetSeats')?['value']`, where `item()?['skuId']` = `outputs('SkuId')`.
   - **`FreeSeats`** (Compose): `sub(int(first(body('MySku'))?['prepaidUnits']?['enabled']), int(first(body('MySku'))?['consumedUnits']))`.
   - **`SeatFree`** (Condition): `outputs('FreeSeats')` **is greater than** `0`.
     - **True →** **`AssignLicense`** (HTTP POST `.../users/@{body('Parse_JSON')?['id']}/assignLicense`, body `{ "addLicenses":[{"skuId":"@{outputs('SkuId')}"}],"removeLicenses":[] }`).
     - **False →** **`NoSeatEmail`** (Send email V2, From `notifications@`, To Abhishek+Trevor) then
       **`WaitForSeat`** (Do until `outputs('FreeSeatsLoop')` > 0, limit **Count 84 / Timeout P7D**):
       `Delay 2h` → **`GetSeats2`** → **`MySku2`** → **`FreeSeatsLoop`** (same shapes as above). After the
       loop, **`AssignLicense2`** (same as AssignLicense). → auto-assigns the moment a seat is bought.
7. **`StampProvisioned`** (Update item, Id `triggerBody()?['ID']`, Title `triggerBody()?['Title']`):
   `Stage = Provisioned`, `AccountCreated = Yes`, `TempPasswordSent = Yes`,
   `LicenseAssigned = if(empty(outputs('SkuId')),false,true)`.
8. **`PasswordBody`** (Compose) — the branded "Account created" HTML card (name, sign-in, `Changeme1!`,
   change-at-first-login note). Held in a Compose so it renders (pasting HTML straight into the email body
   escapes the tags → shows raw `<table>` text; the Compose + code-view pattern is the fix, same as C-1's `EmailBody`).
9. **`PasswordEmail`** (Send email V2): **From** `notifications@magma-amgm.org` · **To** the six owners
   (Abhishek, Trevor, Lara, Vanisha, Don, Krisha) · **Cc** `triggerBody()?['ManagerUpn']` ·
   **Subject** `RE: New hire starting — setup needed: @{triggerBody()?['Title']}` · **Body** (code-view) `outputs('PasswordBody')`.
   > **Why not a threaded reply:** we first used "Reply to email V3" to thread the password into the C-1
   > conversation, but that action can only send **from the mailbox that owns the message (Abhishek)**, reply-all
   > makes `notifications@` a recipient, and it dumps the HTML as raw text. So we send a proper branded email
   > from `notifications@` to the same people instead; the `RE:` subject keeps it grouped in Outlook's conversation view.

### More build gotchas (so a future chat doesn't relive them)
- **Legacy package import is broken in this tenant** (connection picker never populates) → both C-1 and C-2 built by hand.
- Deleting/re-adding an HTTP action **breaks the next action's `body('X')` reference** → re-point it
  (hit this on `Parse JSON`, `MySku`, `MySku2` after swapping the Graph actions).
- New request's licence **defaults to Business Premium** in the app; IT changes it on the request-detail
  screen before approving. Premium is at **0 free seats**, so leaving it default sends C-2 into the seat-wait.
- The Select-action "Enter a valid JSON" trap (C-1) and empty-condition-row-in-OR trap (C-2 guard) — see those sections.

---

## Flow C-A — licence approval by email  — AS BUILT (2026-07-29)

Lets IT approve + pick the licence **from the inbox**, no tracker visit. Separate flow; it just sets the
fields on the request, and the existing **C-2 provisions** off the resulting modify. The in-app
"Approve & provision" button still works as a fallback (also sets `Stage=Approved` + `ApprovedByName`).

**Trigger:** SharePoint *When an item is created*, `ProvisioningRequests`.
1. **`Delay`** — `1 Minute`, so the **C-1 notification lands first**, then the approval request follows
   (both fire on create; without the delay the approval arrived a few seconds *before* the notification).
2. **Start and wait for an approval** — type **Custom Responses - Wait for one response**; responses
   `Business Premium` / `Business Basic` / `None` / `Reject`; **Assigned to** `abhishek.desai@;trevor.tower@`;
   Title `Provision <Title> — pick a licence`; Details = the hire's position/dept/start/email/location/cost/replacing.
   Actionable buttons render in Outlook (and the Approvals hub).
3. **`WasRejected`** (Condition): approval **Outcome** = `Reject`.
   - **True →** Update item `Stage = Rejected`.
   - **False →** (auto-wrapped in an **Apply to each** over the single Responses item) **`SetApproved`**
     Update item: `LicenseType` = **Outcome** (the button text) · `ApprovedByName` = **Responder Display name**
     · `ApprovedAt` = `utcNow()` · `Stage` = `Approved` · AccountCreated/LicenseAssigned/TempPasswordSent = No.
     → the modify fires **C-2**.

> The **Responder Display name** must match C-2's guard (`Abhishek Desai` / `Trevor Tower`) — it does,
> because those are their AAD display names. The `Apply to each` is harmless (one response).

**End-to-end order now:** HR submits → C-1 notifies the teams (with the item list) → 1 min later IT gets
the approval email → IT clicks a licence → C-A stamps Approved+licence → C-2 creates the account, assigns
the licence (or seat-waits), and emails `notifications@`→owners+manager the branded "Account created" card
with `Changeme1!`.

---

## Email templates

### Notification (Flow C-1 — to owners, cc managers)
```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE7;padding:26px 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
<tr><td align="center"><table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e7ded0;border-radius:12px;overflow:hidden;">
<tr><td style="background:#38335f;padding:16px 26px;"><div style="color:#C9B79C;font-size:12px;letter-spacing:2px;font-weight:700;">MAGMA · AMGM</div><div style="color:#f0ece4;font-size:19px;">New hire — setup needed</div></td></tr>
<tr><td style="padding:24px 26px;color:#2A2620;font-size:15px;line-height:1.55;">
<p style="margin:0 0 12px;">A new hire is starting and needs your team's setup before day one:</p>
<p style="margin:0 0 4px;"><strong>[[Title]]</strong> — [[Position]] · [[Department]] [[Unit]]</p>
<p style="margin:0 0 4px;">Start date: <strong>[[StartDate]]</strong> · Email to create: [[DesiredUpn]]</p>
<p style="margin:0 0 4px;">Office / location: [[Location]] · Cost centre: [[CostCentre]]</p>
<p style="margin:14px 0 4px;">Please action and tick off your items in the tracker:</p>
<a href="https://magma-amgm-it.github.io/magma-onboarding-tracker/" style="display:inline-block;background:#B26B43;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:9px;">Open my setup tasks</a>
</td></tr></table></td></tr></table>
```

### Temp-password (Flow C-2 — to HR + manager)
```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE7;padding:26px 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e7ded0;border-radius:12px;overflow:hidden;">
<tr><td style="background:#38335f;padding:16px 26px;"><div style="color:#C9B79C;font-size:12px;letter-spacing:2px;font-weight:700;">MAGMA · AMGM</div><div style="color:#f0ece4;font-size:19px;">Account created</div></td></tr>
<tr><td style="padding:24px 26px;color:#2A2620;font-size:15px;line-height:1.55;">
<p style="margin:0 0 12px;"><strong>[[Title]]</strong>'s Microsoft 365 account is ready.</p>
<p style="margin:0 0 6px;">Sign-in: <strong>[[DesiredUpn]]</strong></p>
<p style="margin:0 0 14px;">Temporary password: <strong>[[TempPassword]]</strong></p>
<p style="margin:0;color:#6b6459;font-size:14px;">They'll be asked to set a new password at first sign-in. Hand this over in person on day one.</p>
</td></tr></table></td></tr></table>
```

Map `[[...]]` to the trigger's dynamic fields (Title, Position, Department, Unit, StartDate,
DesiredUpn, Location, CostCentre) and `[[TempPassword]]` to the Compose output.

---

## Test + notes

1. Create a test request with **yourself** as the new hire (a throwaway UPN like `test.hire@magma-amgm.org`).
2. Approve it → confirm: the account appears in Entra, the licence is assigned, the temp-password
   email lands (HR + manager), and the request flips to **Provisioned** with the three flags ticked.
3. **Deleting a test / erroneous provisioning — do all three, in this order** (Abhishek's routine):
   1. **M365 admin centre → Users → Active users →** select the account **→ Delete user** (removes the
      account + frees the licence seat). *(Sits in Deleted users ~30 days if you need to restore.)*
   2. **SharePoint → `ProvisioningRequests` list →** delete that person's row.
   3. **SharePoint → `ProvisioningTasks` list →** delete that person's task rows.
   (If a NewHires journey was also created for them, delete that row from the `NewHires` list too.)
4. Security: only Abhishek/Trevor can approve (enforced in the app + re-checked in Step 2). The app
   secret is the crown jewel — rotate it if ever exposed. Consider the admin-unit scoping later.

Prereq reminders: the **HTTP** action is a **premium** Power Automate connector — confirm your plan
covers it. The provisioning app + secret are separate from the app's own MSAL sign-in (that stays
user-delegated).

**C-2 decisions locked (2026-07-29):**
- Temp password is a **fixed `Changeme1!`** every time, with `forceChangePasswordNextSignIn = true`
  (hire must change it at first sign-in). Small known-password window, mitigated by force-change; all
  internal. Held in a Compose named `TempPassword` = `Changeme1!`.
- The password email is sent as a **reply-all into the C-1 notification thread** (not a new email),
  so it stays in one Outlook conversation. Goes to **everyone** on that thread (all owners + managers)
  — the person decided that's fine since they're all managers/IT. C-2 finds the C-1 email by subject
  and uses **Reply to email (V2)** with Reply-all.
- Guard uses a fixed static condition (no advanced-mode textbox in the new designer — it's the row
  builder): `Stage = Approved` AND `AccountCreated = false` (expression `false`) AND
  (`ApprovedByName = Abhishek Desai` OR `= Trevor Tower`). Watch for stray empty rows — an empty row
  inside the OR reads as true and defeats the approver check; neutralise it (`ApprovedByName = __none__`).

---

## Returning Employees (leave / return)  ← requested by Lara — ✅ v1 BUILT 2026-08-04

**Scope Abhishek locked (leaner than the original design):** no group re-add (MAGMA never removes people
from groups on leave); the mailbox shared↔user flip stays an IT-only manual step and is **not** surfaced
to HR; the automated value is **re-enabling sign-in** so the returner can use email again, plus **one
heads-up email** (no tracking/follow-up) to reactivate card + iCare if needed. Same **IT approval gate**
as new hires (Approve / Reject by Abhishek or Trevor).

**As built:**
- **List** `ReturningEmployees` (Title=name, Upn, ReturnDate, Notes) — created by `Create-ReturningEmployeesList.ps1`.
- **App tab** "Returning employees" in the tracker (sidebar, gated to Admin/HR = `canProvision`). HR submits
  via a form (name, email, return date, notes) → writes a `ReturningEmployees` row. No raw SharePoint for HR.
  Code: `graphApi.getReturning/createReturning`, `dataSync` fetch, `dataMap.mapReturning`, and in `App.jsx`
  the `ReturningView` + `ReturningModal` + `openRetModal`/`submitReturning` (mirrors the New-hire request pattern).
- **Flow `MAGMA Returning Employee`:** trigger on `ReturningEmployees` item created → **Start and wait for an
  approval** (Approve/Reject, to Abhishek+Trevor) → on **Approve**: HTTP `PATCH /users/{Upn}` `accountEnabled=true`
  (built-in HTTP + app OAuth, same app/secret as C-2) → Compose `ReturnBody` (green branded card) → Send email
  V2 from `notifications@` to Don+Krisha, cc Lara+Abhishek ("sign-in re-enabled; reactivate card/iCare if needed").
  On **Reject**: nothing happens (sign-in stays off).

**Original design notes (for the fuller version, if ever wanted):**

Lara asked (email, 2026-07-29) to add two tabs to the pre-boarding area: **New Hires** and **Returning
Employees (Maternity or Medical Leave)**. New Hires flows into onboarding as today (reminder: the new
hire must be **added to the relevant security groups** as part of it). Returning Employees is a new
**reboarding** flow that mirrors provisioning but *reinstates* instead of creating.

**What happens at MAGMA today (IT side), per Abhishek:**
- **Going on leave:** IT **blocks sign-in** (M365 admin centre), converts the person's mailbox to a
  **shared mailbox** (Exchange admin centre), and grants **their manager access** to that shared mailbox.
- **Returning from leave:** IT **unblocks sign-in** and converts the **shared mailbox back to a user
  mailbox**. Then (per Lara) reinstate: **email access, re-add to relevant groups, reactivate the
  access card, reinstate system access (e.g. iCare).**

**Automation feasibility (for when we build it):**
- Block / unblock sign-in → Graph `PATCH /users/{id}` `accountEnabled = false/true` — **automatable** (same app/secret).
- Group membership add/remove → Graph `/groups/{id}/members/$ref` — **automatable.**
- Mailbox user↔shared conversion → **Exchange Online PowerShell** (`Set-Mailbox -Type Shared/Regular`);
  no native Power Automate action → needs an **Azure Automation runbook** (or stays a manual IT task).
- Access card reactivation (Facilities/Don) + iCare (Krisha) → **task-routed / manual**, like provisioning.

Design as a sibling of the provisioning module: a `ReboardingRequests` list + reuse of the team-task
routing, with a leave-date / return-date pair driving block-on-leave and reinstate-on-return. Build
**after** Phase C is done and tested.

---

## Still to build — designed 2026-07-31 (decisions locked with Abhishek)

### 1. "Needs attention" — make it schedule-aware (app change)  ✅ DONE 2026-07-31
Implemented in `App.jsx` — `monthDone(ck,id,m)` + `isBehind(id)` replace the old `pctOf < 40` filter;
`attentionIds = scopeEmps.filter(isBehind)`. List blurb/empty text updated too.
Today the app flags anyone **< 40%** complete, so a brand-new hire sits in "Needs attention" for weeks
even when perfectly on track. **New rule:** flag a hire only when a **review period has elapsed and that
period's milestones aren't complete** — e.g. today is past their **day-30** review but month-1 milestones
aren't all ticked (same for day-60 / day-90). On-pace hires never appear. Implementation is in the app
(the view that computes "needs attention"), using each hire's start date + the 30/60/90 review dates vs.
which month's milestones are done. Not a Power Automate flow.

### 2. Setup-task reminder + completion — by email, tracker stays source of truth
Replaces "go tick it in the tracker" with email, but **the tracker (`ProvisioningTasks` status) remains
the source of truth** — replies just flip status; a non-reply simply leaves an item "open," nothing breaks.
- **R-1 — day-before nudge** (scheduled daily; finds hires whose `StartDate` = tomorrow): for each team
  that **still has open items** for that hire, email the owner(s) their open items **per item**, each with
  a **Mark done** control that sets that item's `Status = Done` in `ProvisioningTasks`. Teams already done
  don't get pestered. *(Per-item marking from email needs either an Adaptive Card with a button per item,
  or a small HTTP-triggered "MarkTaskDone?taskId=" flow whose link is embedded per row — decide at build.)*
- **R-2 — start-date roll-up** (scheduled daily; finds hires whose `StartDate` = today): read that hire's
  `ProvisioningTasks`.
  - **All required done →** send "✅ All set for <hire>" to **everyone on the original setup-notification**
    (the six owners + managers).
  - **Any still open →** send "⚠️ <hire> starts today — still outstanding: [item · team]" to **everyone on
    the notification** (Abhishek's choice — full transparency so it gets chased). **Never a false all-clear.**
- **All-clear timing:** **start-date roll-up only** (no early "the moment the last item is ticked" message).
- This is robust to non-replies: the Sunday-email / Monday-start worry is handled because R-2 reads the
  tracker on start morning and escalates whatever's open rather than depending on everyone having replied.

### Remaining backlog (order TBD with Abhishek)
1. Phase D — `CreateJourney` step in C-2 (sync provisioned hire → `NewHires` so they appear under their dept). *(steps drafted; may already be added)*
2. Needs-attention schedule-aware fix (app).
3. R-1 + R-2 reminder/roll-up flows.
4. Returning-Employees (maternity) module — see section above.
5. End-to-end test + delete the test accounts/rows.
