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

---

## Flow C-1 — new-hire notification (on request created)

**make.powerautomate.com → + Create → Automated cloud flow.**

**Trigger:** SharePoint *When an item is created* → the App-OnboardingTracker site, list `ProvisioningRequests`.

**Send an email (V2)** (Office 365 Outlook):
- **From (Send as):** `notifications@magma-amgm.org`
- **To:** the task owners (fixed) — `abhishek.desai@magma-amgm.org; trevor.tower@magma-amgm.org; HRMAGMA@magma-amgm.org; don.gaudet@magma-amgm.org; <Krisha's email>`
  *(these are the IT / HR / Facilities / icare owners; update if people change)*
- **Cc:** the managers, **de-duplicated and with blanks dropped** (the reporting manager is often
  also the dept manager, and there may be no unit manager). Before the email action, add a
  **Compose** named `CcList`:
  `join(union(createArray(triggerOutputs()?['body/ManagerUpn'], triggerOutputs()?['body/DeptManagerUpn'], triggerOutputs()?['body/UnitManagerUpn']), createArray()), ';')`
  then a **Filter array** on `outputs('CcList')`... simpler: use a **Compose** = the three emails,
  a **Filter array** with condition *item() is not equal to (empty)*, wrap in `union(...)` to dedupe,
  and `join(body('Filter_array'), ';')`. Put that join in the Cc field. *(Even if you skip this and
  just list all three, Exchange de-dupes and ignores blanks on send — but the filter avoids the
  occasional "invalid recipient" on an empty unit-manager.)*
- **Subject:** `New hire starting — setup needed: [Title]`
- **Body:** the **Notification** template below (includes the cost centre + each item spec).

---

## Flow C-2 — account provisioning (on request approved)

**+ Create → Automated cloud flow.** **Trigger:** SharePoint *When an item is created or modified*,
list `ProvisioningRequests`.

**Step 1 — guard (only run once, only when approved).**
- **Condition:** `Stage` is equal to `Approved` **AND** `AccountCreated` is equal to `false`.
  Put everything below in **If yes**; otherwise the flow ends.

**Step 2 — verify the approver (the security control).**
- **Condition:** `ApprovedByName` is equal to `Abhishek Desai` **OR** `ApprovedByName` is equal to
  `Trevor Tower`. Only continue in **If yes**. *(This stops anything but a real IT approval from
  creating an account — the automation trusts the identity, not just the status field.)*

**Step 3 — make a temp password.**
- **Compose** (name it `TempPassword`), value expression:
  `concat('Mg', substring(guid(), 0, 8), '!7')` — a random 12-char password meeting complexity.

**Step 4 — create the account (HTTP → Graph).**
Add an **HTTP** action (premium):
- Method: `POST` · URI: `https://graph.microsoft.com/v1.0/users`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "accountEnabled": true,
  "displayName": "@{triggerOutputs()?['body/Title']}",
  "mailNickname": "@{first(split(triggerOutputs()?['body/DesiredUpn'], '@'))}",
  "userPrincipalName": "@{triggerOutputs()?['body/DesiredUpn']}",
  "usageLocation": "CA",
  "passwordProfile": { "forceChangePasswordNextSignIn": true, "password": "@{outputs('TempPassword')}" }
}
```
- **Authentication:** `Active Directory OAuth` · Tenant = your tenant ID · Audience =
  `https://graph.microsoft.com` · Client ID = the app's client ID · Credential Type = `Secret` ·
  Secret = the client secret from Part 1.
- Follow with **Parse JSON** on the HTTP body (schema: at least `{ "id": "string" }`) to grab the new user's `id`.

**Step 5 — assign the licence** (skip if LicenseType = None).
- **Condition:** `LicenseType` is not equal to `None`. In **If yes**:
- (optional seat check) HTTP `GET https://graph.microsoft.com/v1.0/subscribedSkus` → if the chosen
  SKU has no free seat, send yourself an email "buy a seat" and stop; otherwise continue.
- HTTP `POST https://graph.microsoft.com/v1.0/users/@{body('Parse_JSON')?['id']}/assignLicense`
  (same OAuth auth), body:
```json
{ "addLicenses": [ { "skuId": "<Business Premium skuId, or Basic if LicenseType says so>" } ], "removeLicenses": [] }
```
  *(Use a Condition on LicenseType to pick the Premium vs Basic skuId.)*

**Step 6 — stamp the request.**
- SharePoint **Update item** → `ProvisioningRequests`, Id = trigger Id:
  `AccountCreated = Yes`, `LicenseAssigned = Yes` (or No if None), `TempPasswordSent = Yes`,
  `Stage = Provisioned`.

**Step 7 — email the temp password** (Office 365 Outlook, Send an email V2):
- From `notifications@magma-amgm.org` · To `HRMAGMA@magma-amgm.org` · Cc `ManagerUpn`
- Subject: `[Title] — account created, temporary password inside`
- Body: the **Temp-password** template below. *(Safe: it goes only to HR + the manager, who hand the
  laptop over in person on day one; the hire must change it at first sign-in.)*

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
3. **Delete the test account** in Entra and the test request when done.
4. Security: only Abhishek/Trevor can approve (enforced in the app + re-checked in Step 2). The app
   secret is the crown jewel — rotate it if ever exposed. Consider the admin-unit scoping later.

Prereq reminders: the **HTTP** action is a **premium** Power Automate connector — confirm your plan
covers it. The provisioning app + secret are separate from the app's own MSAL sign-in (that stays
user-delegated).
