import json, uuid, os, zipfile, shutil, datetime

FLOW_ID = str(uuid.uuid4())
SP_RES  = str(uuid.uuid4())
OL_RES  = str(uuid.uuid4())
FLOW_RES= str(uuid.uuid4())
TELE    = str(uuid.uuid4())
NOW     = "2026-07-28T00:00:00.0000000Z"

SITE = "https://magmaamgmorg.sharepoint.com/sites/App-OnboardingTracker"
LIST = "d047894a-7f6a-499e-b1b2-452eb3eb7638"
DISPLAY = "MAGMA New-hire Notification (C-1)"

TO = ";".join([
  "abhishek.desai@magma-amgm.org",
  "trevor.tower@magma-amgm.org",
  "lara.falana@magma-amgm.org",
  "vanisha.weekes@magma-amgm.org",
  "don.gaudet@magma-amgm.org",
  "krisha.dassanayake@magma-amgm.org",
])

BODY = (
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE7;padding:26px 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;">'
'<tr><td align="center"><table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e7ded0;border-radius:12px;overflow:hidden;">'
'<tr><td style="background:#38335f;padding:16px 26px;"><div style="color:#C9B79C;font-size:12px;letter-spacing:2px;font-weight:700;">MAGMA &middot; AMGM</div><div style="color:#f0ece4;font-size:19px;">New hire &mdash; setup needed</div></td></tr>'
'<tr><td style="padding:24px 26px;color:#2A2620;font-size:15px;line-height:1.55;">'
'<p style="margin:0 0 12px;">A new hire is starting and needs your team&rsquo;s setup before day one:</p>'
"<p style=\"margin:0 0 4px;\"><strong>@{triggerOutputs()?['body/Title']}</strong> &mdash; @{triggerOutputs()?['body/Position']} &middot; @{triggerOutputs()?['body/Department']} @{triggerOutputs()?['body/Unit']}</p>"
"<p style=\"margin:0 0 4px;\">Start date: <strong>@{if(empty(triggerOutputs()?['body/StartDate']),'TBD',formatDateTime(triggerOutputs()?['body/StartDate'],'MMM d, yyyy'))}</strong> &middot; Email to create: @{triggerOutputs()?['body/DesiredUpn']}</p>"
"<p style=\"margin:0 0 4px;\">Office / location: @{triggerOutputs()?['body/Location']} &middot; Cost centre: @{triggerOutputs()?['body/CostCentre']}</p>"
'<p style="margin:14px 0 4px;">Please action and tick off your items in the tracker:</p>'
'<a href="https://magma-amgm-it.github.io/magma-onboarding-tracker/" style="display:inline-block;background:#B26B43;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:9px;">Open my setup tasks</a>'
'</td></tr></table></td></tr></table>'
)

definition = {
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$connections": {"defaultValue": {}, "type": "Object"},
    "$authentication": {"defaultValue": {}, "type": "SecureObject"}
  },
  "triggers": {
    "When_a_new_provisioning_request_is_created": {
      "type": "OpenApiConnection",
      "recurrence": {"frequency": "Minute", "interval": 3},
      "splitOn": "@triggerOutputs()?['body/value']",
      "inputs": {
        "host": {
          "connectionName": "shared_sharepointonline",
          "operationId": "GetOnNewItems",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"
        },
        "parameters": {"dataset": SITE, "table": LIST},
        "authentication": "@parameters('$authentication')"
      }
    }
  },
  "actions": {
    "CcArray": {
      "type": "Compose",
      "inputs": "@union(createArray(triggerOutputs()?['body/ManagerUpn'], triggerOutputs()?['body/DeptManagerUpn'], triggerOutputs()?['body/UnitManagerUpn']), createArray())",
      "runAfter": {}
    },
    "Filter_blanks_from_Cc": {
      "type": "Query",
      "inputs": {"from": "@outputs('CcArray')", "where": "@not(equals(trim(coalesce(item(),'')), ''))"},
      "runAfter": {"CcArray": ["Succeeded"]}
    },
    "CcList": {
      "type": "Compose",
      "inputs": "@join(body('Filter_blanks_from_Cc'), ';')",
      "runAfter": {"Filter_blanks_from_Cc": ["Succeeded"]}
    },
    "Send_notification_email": {
      "type": "OpenApiConnection",
      "inputs": {
        "host": {
          "connectionName": "shared_office365",
          "operationId": "SendEmailV2",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365"
        },
        "parameters": {
          "emailMessage/To": TO,
          "emailMessage/Cc": "@outputs('CcList')",
          "emailMessage/Subject": "@concat('New hire starting - setup needed: ', triggerOutputs()?['body/Title'])",
          "emailMessage/Body": BODY,
          "emailMessage/Importance": "Normal"
        },
        "authentication": "@parameters('$authentication')"
      },
      "runAfter": {"CcList": ["Succeeded"]}
    }
  },
  "outputs": {}
}

flow_definition_file = {
  "name": FLOW_ID,
  "id": "/providers/Microsoft.Flow/flows/" + FLOW_ID,
  "type": "Microsoft.Flow/flows",
  "properties": {
    "apiId": "/providers/Microsoft.PowerApps/apis/shared_logicflows",
    "displayName": DISPLAY,
    "definition": definition,
    "connectionReferences": {
      "shared_sharepointonline": {
        "connectionName": "shared_sharepointonline",
        "source": "Embedded",
        "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
        "tier": "NotSpecified"
      },
      "shared_office365": {
        "connectionName": "shared_office365",
        "source": "Embedded",
        "id": "/providers/Microsoft.PowerApps/apis/shared_office365",
        "tier": "NotSpecified"
      }
    },
    "flowFailureAlertSubscribed": False,
    "isManaged": False
  },
  "schemaVersion": "1.0.0.0"
}

manifest = {
  "schema": "1.0",
  "details": {
    "displayName": DISPLAY,
    "description": "Emails the task owners and CCs the managers when a ProvisioningRequests item is created. Replaces the manual onboarding-support email.",
    "createdTime": NOW,
    "packageTelemetryId": TELE,
    "creator": "Abhishek Desai",
    "sourceEnvironment": None
  },
  "resources": {
    FLOW_RES: {
      "id": None,
      "name": FLOW_ID,
      "type": "Microsoft.Flow/flows",
      "suggestedCreationType": "New",
      "creationType": "New, Existing, Update",
      "details": {"displayName": DISPLAY},
      "configurableBy": "User",
      "hierarchy": "Root",
      "dependsOn": [SP_RES, OL_RES]
    },
    SP_RES: {
      "id": None, "name": None,
      "type": "Microsoft.PowerApps/apis/connections",
      "suggestedCreationType": "Existing",
      "creationType": "Existing",
      "details": {
        "displayName": None,
        "connectorId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
        "connectorDisplayName": "SharePoint",
        "connectorIconUri": "https://connectoricons-prod.azureedge.net/releases/v1.0.1670/1.0.1670.3676/sharepointonline/icon.png",
        "connectorType": "Microsoft.PowerApps/apis"
      },
      "configurableBy": "User",
      "hierarchy": "Child",
      "dependsOn": []
    },
    OL_RES: {
      "id": None, "name": None,
      "type": "Microsoft.PowerApps/apis/connections",
      "suggestedCreationType": "Existing",
      "creationType": "Existing",
      "details": {
        "displayName": None,
        "connectorId": "/providers/Microsoft.PowerApps/apis/shared_office365",
        "connectorDisplayName": "Office 365 Outlook",
        "connectorIconUri": "https://connectoricons-prod.azureedge.net/releases/v1.0.1670/1.0.1670.3676/office365/icon.png",
        "connectorType": "Microsoft.PowerApps/apis"
      },
      "configurableBy": "User",
      "hierarchy": "Child",
      "dependsOn": []
    }
  }
}

root = "pkg"
if os.path.exists(root): shutil.rmtree(root)
flowdir = os.path.join(root, "Microsoft.Flow", "flows", FLOW_ID)
os.makedirs(flowdir)
with open(os.path.join(root, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
with open(os.path.join(flowdir, "definition.json"), "w", encoding="utf-8") as f:
    json.dump(flow_definition_file, f, indent=2)

zipname = "MAGMA-Newhire-Notification-C1.zip"
if os.path.exists(zipname): os.remove(zipname)
with zipfile.ZipFile(zipname, "w", zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk(root):
        for fn in files:
            full = os.path.join(base, fn)
            arc = os.path.relpath(full, root)
            z.write(full, arc)

print("FLOW_ID", FLOW_ID)
print("built", zipname)
os.system("unzip -l " + zipname)
