/* ============================================================
   Phase 3 — map raw SharePoint list items into the exact shapes
   the UI (App.jsx) already consumes:
     depts      : { slug: { name, units[], icon, pending } }
     milestones : { slug: { 1:[text...], 2:[...], 3:[...] } }   (ordered by Sort)
     emps       : { spItemId: { name, pos, dept, unit, manager,
                                managerUpn, hireUpn, start, ref, reviews[] } }
     checked    : { "<hireId>|<month>|<index>": bool }
     compIndex  : { "<hireId>|<month>|<index>": spItemId }   (for PATCH vs POST)

   The completion key equals `${hireId}|${month}|${index}` where index is the
   position in the Sort-ordered milestone array — identical to the key the
   Journey view builds, so ticks line up with the right milestone.
   ============================================================ */

const dOnly = (x) => (x ? String(x).slice(0, 10) : ''); // ISO date/datetime -> yyyy-mm-dd

function addDays(iso, n) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mapDepartments(items) {
  const out = {};
  for (const it of items || []) {
    const slug = (it.Slug || '').trim();
    if (!slug) continue;
    out[slug] = {
      name: it.Title || slug,
      units: (it.Units || '').split(',').map((s) => s.trim()).filter(Boolean),
      icon: it.IconSvg || '',
      pending: !!it.Pending,
    };
  }
  return out;
}

export function mapMilestones(items) {
  const out = {};
  for (const it of items || []) {
    const d = (it.Department || '').trim();
    const m = Number(it.Month) || 1;
    if (!d) continue;
    if (!out[d]) out[d] = { 1: [], 2: [], 3: [] };
    if (!out[d][m]) out[d][m] = [];
    out[d][m].push({ sort: Number(it.Sort) || 0, text: it.Title || '' });
  }
  for (const d in out) {
    for (const m of [1, 2, 3]) {
      const arr = out[d][m] || [];
      out[d][m] = arr.sort((a, b) => a.sort - b.sort).map((x) => x.text);
    }
  }
  return out;
}

export function mapNewHires(items) {
  const out = {};
  for (const it of items || []) {
    const start = dOnly(it.StartDate);
    // Prefer stored review dates; fall back to start + 30/60/90 if missing.
    const r30 = dOnly(it.Review30) || (start ? addDays(start, 30) : '');
    const r60 = dOnly(it.Review60) || (start ? addDays(start, 60) : '');
    const r90 = dOnly(it.Review90) || (start ? addDays(start, 90) : '');
    out[String(it.id)] = {
      name: it.Title || '(unnamed)',
      pos: it.Position || '',
      dept: (it.Department || '').trim(),
      unit: it.Unit || '',
      manager: it.ManagerName || '',
      managerUpn: (it.ManagerUpn || '').toLowerCase(),
      hireUpn: (it.HireUpn || '').toLowerCase(),
      start,
      ref: it.Ref || ('MAGMA-' + it.id),
      reviews: [r30, r60, r90],
    };
  }
  return out;
}

export function mapCompletions(items) {
  const checked = {};
  const compIndex = {};
  for (const it of items || []) {
    const key = it.Title;
    if (!key) continue;
    checked[key] = !!it.Done;
    compIndex[key] = String(it.id);
  }
  return { checked, compIndex };
}

export function mapAll(raw) {
  const depts = mapDepartments(raw.departments);
  const milestones = mapMilestones(raw.milestoneTemplates);
  const emps = mapNewHires(raw.newHires);
  const { checked, compIndex } = mapCompletions(raw.completions);
  return { depts, milestones, emps, checked, compIndex };
}
