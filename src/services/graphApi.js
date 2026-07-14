import { getAccessToken } from './auth';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SHAREPOINT_SITE_URL = import.meta.env.VITE_SHAREPOINT_SITE_URL;

// SharePoint list display names (see docs/Onboarding-Build-Guide.md)
export const LIST_NAMES = {
  departments: 'Departments',
  milestoneTemplates: 'MilestoneTemplates',
  newHires: 'NewHires',
  completions: 'MilestoneCompletions',
  provRequests: 'ProvisioningRequests',
  provTasks: 'ProvisioningTasks',
};

/* ---- low-level fetch with token, 429 back-off, friendly errors ---- */
async function graphFetch(url, { method = 'GET', body, retries = 2, headers: extra } = {}) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(extra || {}) };
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${GRAPH_BASE}${url}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt + 1) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) {
      const errorBody = await res.text();
      if (res.status === 403) throw new Error("Access denied — sign out and back in, or ask IT for access to this system.");
      if (res.status === 401) throw new Error('Your session has expired. Please sign out and sign back in.');
      throw new Error(`Graph API error ${res.status}: ${res.statusText} — ${errorBody}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }
  throw new Error('Graph API request failed after maximum retries (429 throttling).');
}

/* ---- resolve the SharePoint site id once ---- */
let _siteId = null;
async function getSiteId() {
  if (_siteId) return _siteId;
  const u = new URL(SHAREPOINT_SITE_URL);
  const path = u.pathname; // e.g. /sites/App-Onboarding
  const data = await graphFetch(`/sites/${u.hostname}:${path}`);
  _siteId = data.id;
  return _siteId;
}

async function getListItems(listName) {
  const siteId = await getSiteId();
  const data = await graphFetch(
    `/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?expand=fields&$top=500`,
  );
  return (data.value || []).map((it) => ({
    id: it.id,
    createdDateTime: it.createdDateTime,
    lastModifiedDateTime: it.lastModifiedDateTime,
    ...it.fields,
  }));
}

async function createListItem(listName, fields) {
  const siteId = await getSiteId();
  return graphFetch(`/sites/${siteId}/lists/${encodeURIComponent(listName)}/items`, {
    method: 'POST', body: { fields },
  });
}

async function updateListItem(listName, itemId, fields) {
  const siteId = await getSiteId();
  return graphFetch(
    `/sites/${siteId}/lists/${encodeURIComponent(listName)}/items/${itemId}/fields`,
    { method: 'PATCH', body: fields },
  );
}

/* ---- domain reads ---- */
export const getDepartments        = () => getListItems(LIST_NAMES.departments);
export const getMilestoneTemplates = () => getListItems(LIST_NAMES.milestoneTemplates);
export const getNewHires           = () => getListItems(LIST_NAMES.newHires);
export const getCompletions        = () => getListItems(LIST_NAMES.completions);

/* ---- domain writes ---- */
// Create a NewHires record. `fields` uses only text/number/date columns (no person
// columns) so it round-trips through Graph without User-Information-List lookups.
// Expected: { Title, Position, Department, Unit, ManagerName, ManagerUpn, HireUpn,
//             StartDate, Ref, Review30, Review60, Review90 }
export function createNewHire(fields) {
  return createListItem(LIST_NAMES.newHires, fields);
}

// Update fields on an existing NewHires record (e.g. reassign manager).
export function updateNewHire(hireId, fields) {
  return updateListItem(LIST_NAMES.newHires, hireId, fields);
}

// Live directory search for the people pickers (manager + new hire).
// Uses $search (needs ConsistencyLevel: eventual) so it matches any name token,
// not just the start of the display name. Requires User.ReadBasic.All (granted).
export async function searchPeople(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const safe = q.replace(/"/g, '');
  const search = encodeURIComponent(`"displayName:${safe}" OR "mail:${safe}" OR "userPrincipalName:${safe}"`);
  const url = `/users?$search=${search}&$select=id,displayName,mail,userPrincipalName&$top=8`;
  const data = await graphFetch(url, { headers: { ConsistencyLevel: 'eventual' } });
  return (data.value || [])
    .filter((u) => u.userPrincipalName && !/#EXT#/i.test(u.userPrincipalName)) // skip guest accounts
    .map((u) => ({
      id: u.id,
      name: u.displayName || u.userPrincipalName,
      upn: (u.userPrincipalName || '').toLowerCase(),
      mail: (u.mail || '').toLowerCase(),
    }));
}

// Upsert a milestone completion. If we already have the SharePoint item id for this
// key (spId), PATCH it; otherwise POST a new row. Keyed by Title = `${hireId}|${month}|${index}`.
export async function upsertCompletion({ spId, key, hireId, done, byName }) {
  const stamp = new Date().toISOString();
  if (spId) {
    await updateListItem(LIST_NAMES.completions, spId, {
      Done: done, CompletedByName: byName || '', CompletedAt: stamp,
    });
    return { id: spId };
  }
  return createListItem(LIST_NAMES.completions, {
    Title: key, NewHireId: Number(hireId) || 0, Done: done,
    CompletedByName: byName || '', CompletedAt: stamp,
  });
}

/* ---- pre-boarding provisioning ---- */
export const getProvRequests = () => getListItems(LIST_NAMES.provRequests);
export const getProvTasks     = () => getListItems(LIST_NAMES.provTasks);
export function createProvRequest(fields) { return createListItem(LIST_NAMES.provRequests, fields); }
export function updateProvRequest(id, fields) { return updateListItem(LIST_NAMES.provRequests, id, fields); }
export function createProvTask(fields) { return createListItem(LIST_NAMES.provTasks, fields); }
export function updateProvTask(id, fields) { return updateListItem(LIST_NAMES.provTasks, id, fields); }

/* ---- signed-in user + role ---- */
export async function getMe() {
  return graphFetch('/me?$select=displayName,mail,userPrincipalName');
}

// Returns the names of the security groups the signed-in user belongs to.
export async function getMyGroupNames() {
  const data = await graphFetch('/me/memberOf?$select=displayName');
  return (data.value || []).map((g) => g.displayName).filter(Boolean);
}
