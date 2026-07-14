# Power Automate — Onboarding Tracker email + access automation

Two flows on the `App-OnboardingTracker` SharePoint lists. Build them at
https://make.powerautomate.com (same tenant). You can't script these — they're built in the
designer — so follow the steps. ~15–20 min total.

- **Flow A — "New journey"** (trigger: a `NewHires` item is created): auto-add the new hire to
  the Users security group, email the new hire (welcome), email the manager (assignment), CC HR.
- **Flow B — "Onboarding complete"** (trigger: a `MilestoneCompletions` item is created/modified):
  if that hire has now finished 100% of their milestones, email the new hire + manager + HR once.

---

## 0. Prerequisites (do these first)

1. **Add the guard column.** Re-run `Add-OnboardingColumns.ps1` — it now also adds
   `CompletedNotified` (text) on `NewHires`, which Flow B uses so the completion email fires only once.
2. **Sending mailbox:** `notifications@magma-amgm.org`. The flow's **Office 365 Outlook** connection
   is authorized by **your** account (Abhishek), and every *Send an email (V2)* action sets its
   **From (Send as)** field to `notifications@magma-amgm.org`. Confirm your account has **Send-as**
   on that mailbox (Exchange admin center → `notifications@magma-amgm.org` → *Delegation* →
   *Send as* → add your account). Without Send-as, the flow errors when it tries to send.
3. **HR copy address:** `HRMAGMA@magma-amgm.org` (the *MAGMA HR* shared mailbox) — CC'd on new journeys.
4. **Group-add permission.** Flow A adds people to the Users security group, so the account that
   authorizes the flow's **Azure AD** connection must be allowed to modify that group — the simplest
   route is to make that account an **Owner** of `MAGMA-OnboardingTracker-Users` (Entra → Groups →
   that group → Owners → Add), or give it the *Groups Administrator* role.
5. **Values you'll paste** (the actual Users-group object ID is in `OPS-PRIVATE.md`):
   - Site Address: `https://magmaamgmorg.sharepoint.com/sites/App-OnboardingTracker`
   - Users group object ID: `<see OPS-PRIVATE.md → security groups>`
   - App link (same for everyone; the app shows each person the right view):
     `https://magma-amgm-it.github.io/magma-onboarding-tracker/`

---

## Flow A — New journey created

**Trigger:** SharePoint → *When an item is created* → Site Address = the site above, List = `NewHires`.

> **Two things about the dynamic-content picker:**
> 1. Our text columns (`HireUpn`, `ManagerUpn`, `ManagerName`, `CompletedNotified`) appear **below**
>    `StartDate` / the review dates — scroll down, or type the name in the panel's **Search** box.
> 2. **Do NOT use `Manager Email` / `Manager DisplayName`** — those belong to the old unused *person*
>    column and are always **blank**. Always use the text columns `ManagerUpn` / `ManagerName` / `HireUpn`.

**Step 1 — resolve the new hire's account (for the group-add).**
- Office 365 Users → *Get user profile (V2)* → User (UPN) = `HireUpn`. (Gives you the user **Id**.)
- *(Optional guard, skip for a first build: wrap the group-add in a Condition `HireUpn is not equal to`
  empty. Not needed — the app's people-pickers already guarantee a real email.)*

**Step 2 — add them to the Users group.**
- Azure AD → *Add user to group*:
  - Group Id = the Users group object ID.
  - User Id = **Id** from Step 1.

**Step 3 — email the new hire (welcome).**
- Office 365 Outlook → *Send an email (V2)*:
  - **From (Send as):** `notifications@magma-amgm.org`
  - **To:** `HireUpn`
  - **CC:** `HRMAGMA@magma-amgm.org`
  - **Subject:** `Welcome to MAGMA — your onboarding starts here`
  - **Body:** switch the body editor to code view (`</>`) and paste the **Welcome** template below;
    map the `[[...]]` placeholders to dynamic content.

**Step 4 — email the manager (assignment).** (outside the condition; runs for every creation)
- Add a **Condition**: `ManagerUpn` **is not equal to** (empty). In **If yes**:
- Office 365 Outlook → *Send an email (V2)*:
  - **From:** `notifications@magma-amgm.org` · **To:** `ManagerUpn` · **CC:** `HRMAGMA@magma-amgm.org`
  - **Subject:** `You've been assigned a new hire — [[NewHireName]]`
  - **Body:** the **Assignment** template below.

Placeholder → dynamic field map: `[[NewHireName]]` = `Title`, `[[ManagerName]]` = `ManagerName`,
`[[AppLink]]` = the app link constant.

---

## Flow B — Onboarding complete (100%)

**Trigger:** SharePoint → *When an item is created or modified* → List = `MilestoneCompletions`.

**Step 1 — find the hire.** The completion `Title` is `hireId|month|index`.
- Compose **hireId** = `first(split(triggerOutputs()?['body/Title'], '|'))`
  (or just use the `NewHireId` column from the trigger item).

**Step 2 — get the hire record.** SharePoint → *Get item* → List = `NewHires`, Id = **hireId**.
- Read `Department`, `HireUpn`, `ManagerUpn`, `ManagerName`, `Title`, `CompletedNotified`.

**Step 3 — only continue if not already notified.**
- **Condition:** `CompletedNotified` **is equal to** (empty). Everything below goes in **If yes**.

**Step 4 — total milestones for the department.**
- SharePoint → *Get items* → List = `MilestoneTemplates`, Filter Query:
  `Department eq '<Department from Step 2>'`.
- Compose **total** = `length(body('Get_items')?['value'])`.

**Step 5 — completed milestones for this hire.**
- SharePoint → *Get items* → List = `MilestoneCompletions`, Filter Query:
  `NewHireId eq <hireId> and Done eq 1`  *(SharePoint stores yes/no as 1/0)*.
- Compose **done** = `length(body('Get_items_2')?['value'])`.

**Step 6 — if done, email + stamp.**
- **Condition:** **done** `is greater than or equal to` **total**, AND **total** `is greater than` 0.
- **If yes:**
  1. Office 365 Outlook → *Send an email (V2)*: From `notifications@magma-amgm.org`, To `HireUpn`,
     CC `ManagerUpn;<HR_MAILBOX>`, Subject `[[NewHireName]] has completed onboarding`,
     Body = the **Completion** template below.
  2. SharePoint → *Update item* → `NewHires`, Id = hireId, `CompletedNotified` = `utcNow()`
     (stops it re-sending on later ticks).

> Why the guard: unticking writes a `Done=false` row and re-ticking flips it, so completions fire
> often. Counting only `Done eq 1` and stamping `CompletedNotified` means the celebration email
> goes out exactly once.

---

## Branded HTML email templates

Paste into the *Send an email (V2)* body in **code view** (`</>`). Replace `[[NewHireName]]`,
`[[ManagerName]]`, and `[[AppLink]]` with dynamic content. Palette matches the app
(ink `#2A2620`, cream `#F4EFE7`, brand `#38335f`, terracotta `#B26B43`).

### Welcome (to the new hire)
```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE7;padding:28px 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7ded0;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#38335f;padding:18px 28px;">
        <div style="color:#ffffff;font-size:13px;letter-spacing:2px;font-weight:700;">MAGMA · AMGM</div>
        <div style="color:#f0ece4;font-size:20px;font-family:Georgia,serif;margin-top:2px;">Onboarding Tracker</div>
      </td></tr>
      <tr><td style="padding:30px 28px;color:#2A2620;font-size:16px;line-height:1.55;">
        <p style="margin:0 0 14px;">Hi [[NewHireName]],</p>
        <p style="margin:0 0 14px;">Welcome to MAGMA! Your personal onboarding tracker is ready. Over your first ninety days you'll move through your Month 1–3 milestones with your manager, <strong>[[ManagerName]]</strong>, who verifies and checks off each step as you complete it.</p>
        <p style="margin:0 0 24px;">You can follow your progress any time here:</p>
        <a href="[[AppLink]]" style="display:inline-block;background:#B26B43;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">Open my onboarding tracker</a>
        <p style="margin:24px 0 0;color:#6b6459;font-size:14px;">Sign in with your MAGMA account. Questions? Just reply to this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

### Assignment (to the manager)
```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE7;padding:28px 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7ded0;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#38335f;padding:18px 28px;">
        <div style="color:#ffffff;font-size:13px;letter-spacing:2px;font-weight:700;">MAGMA · AMGM</div>
        <div style="color:#f0ece4;font-size:20px;font-family:Georgia,serif;margin-top:2px;">Onboarding Tracker</div>
      </td></tr>
      <tr><td style="padding:30px 28px;color:#2A2620;font-size:16px;line-height:1.55;">
        <p style="margin:0 0 14px;">Hi [[ManagerName]],</p>
        <p style="margin:0 0 14px;"><strong>[[NewHireName]]</strong> has joined your team, and an onboarding journey has been created for them.</p>
        <p style="margin:0 0 24px;">Over the next three months, please verify their work and check off each Month 1–3 milestone as they complete it — that's what lets HR see progress at the 30 / 60 / 90-day checkpoints.</p>
        <a href="[[AppLink]]" style="display:inline-block;background:#B26B43;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">Open the tracker</a>
        <p style="margin:24px 0 0;color:#6b6459;font-size:14px;">You'll find [[NewHireName]] under your department. Only their milestones are yours to tick.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

### Completion (to new hire + manager, CC HR)
```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE7;padding:28px 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7ded0;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#38335f;padding:18px 28px;">
        <div style="color:#ffffff;font-size:13px;letter-spacing:2px;font-weight:700;">MAGMA · AMGM</div>
        <div style="color:#f0ece4;font-size:20px;font-family:Georgia,serif;margin-top:2px;">Onboarding Tracker</div>
      </td></tr>
      <tr><td style="padding:30px 28px;color:#2A2620;font-size:16px;line-height:1.55;">
        <p style="margin:0 0 14px;">Congratulations — <strong>[[NewHireName]]</strong> has completed every Month 1–3 onboarding milestone.</p>
        <p style="margin:0 0 24px;">Nice work to [[NewHireName]] and their manager, [[ManagerName]]. Their onboarding journey is now 100% complete.</p>
        <a href="[[AppLink]]" style="display:inline-block;background:#B26B43;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">View the journey</a>
      </td></tr>
    </table>
  </td></tr>
</table>
```

---

## Testing end-to-end

1. Create a journey with **yourself** as the new hire (your email) and **a colleague (e.g. Trevor)**
   as the manager.
2. On save you should: land in the Users group, get the **welcome** email, and the manager gets the
   **assignment** email (HR CC'd).
3. Tick every milestone for that test hire (as HR or the manager). When the last one flips the hire to
   100%, the **completion** email fires once, and `CompletedNotified` gets stamped on the record.
4. Delete the test `NewHires` row (and its `MilestoneCompletions`) when done.

> Note: to see the new-hire **read-only app view** while your account is an Admin, use the
> "view as → New hire" toggle in the top bar — the emails, though, go to real inboxes regardless.
