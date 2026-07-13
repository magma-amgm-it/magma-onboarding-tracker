import React, { useState, useEffect, useRef } from 'react';
import RING from './assets/magma-ring.png';
import {
  INK, OK, WARN, BLOCKED, MUTED, BRAND,
  managerOptions, ini, colorFor, isOrgWide, fmtDate,
} from './data.js';
import { login, logout, getActiveAccount } from './services/auth.js';
import { getMe, getMyGroupNames, createNewHire, upsertCompletion } from './services/graphApi.js';
import { createDataSyncManager } from './services/dataSync.js';
import { mapAll } from './dataMap.js';

/* ---- role ← security group membership ---- */
const GROUPS = {
  admin: 'MAGMA-OnboardingTracker-Admins',
  manager: 'MAGMA-OnboardingTracker-Managers',
  user: 'MAGMA-OnboardingTracker-Users',
};
function roleFromGroups(names) {
  const set = new Set(names || []);
  if (set.has(GROUPS.admin)) return 'hr';
  if (set.has(GROUPS.manager)) return 'manager';
  if (set.has(GROUPS.user)) return 'employee';
  return null;
}

const TODAY = new Date();

/* ---- animated primitives ---- */
function CountUp({ end, dur = 850, suffix = '', style }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, t0; const to = Number(end) || 0;
    const tick = (t) => { if (!t0) t0 = t; const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 3); setV(Math.round(to * e)); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [end, dur]);
  return <span style={style}>{v}{suffix}</span>;
}
function Bar({ pct, color, height = 3, radius = 2, dur = 950, track = 'oklch(0.92 0.010 72)' }) {
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setW(pct)); return () => cancelAnimationFrame(id); }, [pct]);
  return <div style={{ height, borderRadius: radius, background: track, overflow: 'hidden' }}>
    <div style={{ width: w + '%', height: '100%', background: color, borderRadius: radius, transition: `width ${dur}ms cubic-bezier(.22,.61,.36,1)` }}></div>
  </div>;
}
function StatValue({ v, style }) {
  const s = String(v);
  if (/^\d+$/.test(s)) return <CountUp end={parseInt(s)} style={style} />;
  if (/^\d+%$/.test(s)) return <CountUp end={parseInt(s)} suffix="%" style={style} />;
  return <span style={style}>{s}</span>;
}
function DeptIcon({ svg, size = 22 }) {
  return <div style={{ display: 'flex' }} dangerouslySetInnerHTML={{
    __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`
  }} />;
}

/* ---- full-screen framed states (login / loading / denied / error) ---- */
function Shell({ children }) {
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'oklch(0.965 0.012 75)', color: INK, padding: 24 }}>
      <div style={{ width: 420, maxWidth: '100%', textAlign: 'center' }}>
        <img src={RING} alt="MAGMA" style={{ width: 46, height: 46, marginBottom: 20 }} />
        {children}
      </div>
    </div>
  );
}

export default function App() {
  /* ---- lifecycle / auth ---- */
  const [phase, setPhase] = useState('init');   // init | login | loading | ready | denied | error
  const [errMsg, setErrMsg] = useState('');
  const [me, setMe] = useState(null);           // { name, upn, email }
  const [myRole, setMyRole] = useState(null);   // real role from groups
  const [data, setData] = useState(null);       // { depts, milestones, emps, checked, compIndex }
  const [toast, setToast] = useState('');
  const syncRef = useRef(null);

  /* ---- view state ---- */
  const [role, setRole] = useState('hr');       // effective view role (admins can preview)
  const [view, setView] = useState('home');
  const [deptId, setDeptId] = useState(null);
  const [empId, setEmpId] = useState(null);
  const [month, setMonth] = useState(1);
  const [listFilter, setListFilter] = useState(null);
  const [query, setQuery] = useState('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignStep, setAssignStep] = useState('form'); // form | saving | done
  const [assignName, setAssignName] = useState('');
  const [assignEmail, setAssignEmail] = useState('');
  const [assignPos, setAssignPos] = useState('');
  const [assignDept, setAssignDept] = useState('');
  const [assignUnit, setAssignUnit] = useState('');
  const [assignManager, setAssignManager] = useState(managerOptions[0]);
  const [assignStart, setAssignStart] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => { boot(); /* once */ }, []); // eslint-disable-line
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4200); return () => clearTimeout(t); }, [toast]);

  async function boot() {
    try {
      const acct = getActiveAccount();
      if (!acct) { setPhase('login'); return; }
      await afterSignIn();
    } catch (e) { setErrMsg(e.message || String(e)); setPhase('error'); }
  }

  async function afterSignIn() {
    setPhase('loading');
    const [profile, groups] = await Promise.all([getMe(), getMyGroupNames()]);
    setMe({
      name: profile.displayName || 'You',
      upn: (profile.userPrincipalName || '').toLowerCase(),
      email: (profile.mail || '').toLowerCase(),
    });
    const r = roleFromGroups(groups);
    if (!r) { setPhase('denied'); return; }
    setMyRole(r);
    setRole(r);
    startSync();
  }

  function startSync() {
    if (syncRef.current) return;
    const mgr = createDataSyncManager(
      (raw) => { setData(mapAll(raw)); setPhase('ready'); },
      (e) => { setErrMsg(e.message || String(e)); setPhase('error'); },
    );
    syncRef.current = mgr;
    mgr.start();
  }

  async function onSignIn() {
    try { await login(); await afterSignIn(); }
    catch (e) { setErrMsg(e.message || String(e)); setPhase('error'); }
  }
  async function onSignOut() { try { await logout(); } catch { /* ignore */ } }

  /* ============ gated full-screen states ============ */
  if (phase === 'init' || phase === 'loading') {
    return <Shell><div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 26, letterSpacing: '-0.01em' }}>Onboarding Tracker</div>
      <div style={{ color: MUTED, marginTop: 10, fontSize: 15 }}>{phase === 'loading' ? 'Loading your workspace…' : 'Starting…'}</div></Shell>;
  }
  if (phase === 'login') {
    return <Shell>
      <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 30, letterSpacing: '-0.015em' }}>Onboarding Tracker</div>
      <div style={{ fontSize: 12, letterSpacing: '0.14em', color: BRAND, fontWeight: 700, marginTop: 4 }}>MAGMA · AMGM</div>
      <p style={{ color: 'oklch(0.44 0.010 60)', fontSize: 15, lineHeight: 1.55, margin: '18px 0 24px' }}>Sign in with your MAGMA account to view onboarding journeys.</p>
      <button onClick={onSignIn} className="lift" style={{ border: `1px solid ${INK}`, cursor: 'pointer', fontSize: 15, fontWeight: 500, padding: '12px 22px', borderRadius: 10, background: INK, color: 'oklch(0.965 0.012 75)' }}>Sign in with Microsoft</button>
    </Shell>;
  }
  if (phase === 'denied') {
    return <Shell>
      <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 26, letterSpacing: '-0.01em' }}>No access yet</div>
      <p style={{ color: 'oklch(0.44 0.010 60)', fontSize: 15, lineHeight: 1.55, margin: '16px 0 22px' }}>
        You’re signed in as {me?.name}, but you’re not in any Onboarding Tracker group yet. Ask HR to add you, then reload.
      </p>
      <button onClick={onSignOut} style={{ border: '1px solid oklch(0.88 0.012 70)', cursor: 'pointer', fontSize: 14, padding: '10px 18px', borderRadius: 10, background: 'oklch(0.985 0.006 80)', color: 'oklch(0.44 0.010 60)' }}>Sign out</button>
    </Shell>;
  }
  if (phase === 'error') {
    return <Shell>
      <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 26, letterSpacing: '-0.01em' }}>Something went wrong</div>
      <p style={{ color: BLOCKED, fontSize: 14, lineHeight: 1.5, margin: '16px 0 22px', wordBreak: 'break-word' }}>{errMsg}</p>
      <button onClick={() => { setPhase('init'); boot(); }} className="lift" style={{ border: `1px solid ${INK}`, cursor: 'pointer', fontSize: 14, padding: '10px 20px', borderRadius: 10, background: INK, color: 'oklch(0.965 0.012 75)' }}>Retry</button>
    </Shell>;
  }

  /* ============ ready: live data in scope ============ */
  const { depts, milestones, emps, compIndex } = data;
  const checked = data.checked;
  const events = data.events || [];
  const allDepts = Object.keys(depts);

  /* data-bound helpers (were in data.js; now close over live data) */
  const empsIn = (dept) => Object.keys(emps).filter((id) => emps[id].dept === dept);
  const totalOf = (id) => { const m = milestones[emps[id].dept] || {}; return (m[1]?.length || 0) + (m[2]?.length || 0) + (m[3]?.length || 0); };
  const doneOf = (ck, id) => { let n = 0; for (const k in ck) { if (ck[k] && k.split('|')[0] === id) n++; } return n; };
  const pctOf = (ck, id) => { const t = totalOf(id); return t ? Math.round(doneOf(ck, id) / t * 100) : 0; };
  const deptAvg = (ck, dept) => { const ids = empsIn(dept); if (!ids.length) return 0; return Math.round(ids.reduce((a, id) => a + pctOf(ck, id), 0) / ids.length); };

  /* identity → who this person can see */
  const myUpn = (me.upn || me.email || '').toLowerCase();
  const isAdmin = myRole === 'hr';
  const myHireId = Object.keys(emps).find((id) => emps[id].hireUpn && emps[id].hireUpn === myUpn) || null;
  const myManagedIds = Object.keys(emps).filter((id) => emps[id].managerUpn && emps[id].managerUpn === myUpn);
  // admin "view as" samples so the manager/new-hire layouts are demoable with real data
  const sampleHireId = Object.keys(emps)[0] || null;
  const previewDept = allDepts.slice().sort((a, b) => empsIn(b).length - empsIn(a).length)[0] || null;

  const isEmployee = role === 'employee';
  const empSubjectId = isEmployee ? (isAdmin ? sampleHireId : myHireId) : null;

  let scopeEmps, scopeDepts;
  if (role === 'hr') {
    scopeEmps = Object.keys(emps); scopeDepts = allDepts;
  } else if (role === 'manager') {
    const ids = isAdmin ? (previewDept ? empsIn(previewDept) : []) : myManagedIds;
    scopeEmps = ids;
    scopeDepts = [...new Set(ids.map((id) => emps[id].dept).filter((d) => depts[d]))];
    if (!scopeDepts.length && isAdmin && previewDept) scopeDepts = [previewDept];
  } else { // employee
    scopeEmps = empSubjectId ? [empSubjectId] : [];
    scopeDepts = empSubjectId ? [emps[empSubjectId].dept] : [];
  }

  const primaryDept = scopeDepts[0] || null;
  const rm = role === 'employee'
    ? { name: empSubjectId ? emps[empSubjectId].name : me.name, roleLabel: (empSubjectId && depts[emps[empSubjectId].dept] ? depts[emps[empSubjectId].dept].name + ' · ' : '') + 'New hire', empId: empSubjectId, dept: empSubjectId ? emps[empSubjectId].dept : null }
    : role === 'manager'
      ? { name: me.name, roleLabel: (scopeDepts.length === 1 && depts[primaryDept] ? depts[primaryDept].name : 'Team') + ' · Manager', dept: primaryDept }
      : { name: me.name, roleLabel: 'HR · Admin' };

  const meCard = { name: me.name, roleLabel: rm.roleLabel, initials: ini(me.name || 'You') };
  const canTick = role !== 'employee'; // HR + managers verify/tick; new hires are read-only
  const mgrOf = (id) => emps[id].manager || '—';

  const goHome = () => { setView('home'); setDeptId(null); setEmpId(null); setListFilter(null); };
  const switchRole = (id) => { setRole(id); setView('home'); setDeptId(null); setEmpId(null); setListFilter(null); setQuery(''); };
  const openList = (filter) => { if (isEmployee) return; setView('list'); setListFilter(filter); setDeptId(null); setEmpId(null); };
  const openDept = (id) => { if (isEmployee) return; setView('dept'); setDeptId(id); setListFilter(null); };
  const openActivity = () => { if (isEmployee) return; setView('activity'); setDeptId(null); setEmpId(null); setListFilter(null); };
  const openJourney = (id) => { if (isEmployee && id !== rm.empId) return; setView('journey'); setEmpId(id); setMonth(1); };

  const overallPct = scopeEmps.length ? Math.round(scopeEmps.reduce((a, id) => a + pctOf(checked, id), 0) / scopeEmps.length) : 0;
  const overallColor = colorFor(overallPct);
  const onTrack = scopeEmps.filter((id) => pctOf(checked, id) >= 70).length;
  const attentionIds = scopeEmps.filter((id) => pctOf(checked, id) < 40);
  const completedIds = scopeEmps.filter((id) => pctOf(checked, id) === 100);
  const needsAttention = attentionIds.length;
  const completedCount = completedIds.length;
  const searching = query.trim().length > 0;

  const activeDept = (view === 'dept' && deptId) || (view === 'journey' && empId && emps[empId] && emps[empId].dept);
  const navKey = [searching ? 'search' : view, deptId || '', empId || '', listFilter || '', role].join('|');

  const rowFor = (id) => { const e = emps[id]; const p2 = pctOf(checked, id);
    return { id, ix: (e.ref.split('-')[1] || e.ref), name: e.name, pos: e.pos, unit: e.unit, manager: mgrOf(id), deptName: depts[e.dept] ? depts[e.dept].name : e.dept, start: e.start ? fmtDate(e.start) : '—', pct: p2, color: colorFor(p2) };
  };

  /* ---- live write: toggle a milestone (optimistic + upsert) ---- */
  async function toggleMilestone(hireId, m, i) {
    if (!canTick) return;
    const key = `${hireId}|${m}|${i}`;
    const cur = !!checked[key];
    const next = !cur;
    setData((prev) => ({ ...prev, checked: { ...prev.checked, [key]: next } }));
    try {
      const res = await upsertCompletion({ spId: compIndex[key], key, hireId, done: next, byName: me.name });
      if (res && res.id) setData((prev) => ({ ...prev, compIndex: { ...prev.compIndex, [key]: String(res.id) } }));
    } catch (e) {
      setData((prev) => ({ ...prev, checked: { ...prev.checked, [key]: cur } }));
      setToast('Could not save that tick: ' + (e.message || e));
    }
  }

  /* ---- sidebar ---- */
  const sideItem = (active) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 9, fontSize: 14.5, cursor: 'pointer', color: active ? INK : 'oklch(0.44 0.010 60)', background: active ? 'oklch(0.985 0.006 80)' : 'transparent', boxShadow: active ? 'inset 0 0 0 1px oklch(0.88 0.012 70)' : 'none' });
  const Sidebar = () => (
    <aside style={{ borderRight: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.945 0.015 72)', padding: '22px 16px', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <div onClick={goHome} style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '26px', padding: '0 4px', cursor: 'pointer' }}>
        <img src={RING} alt="MAGMA" style={{ width: 26, height: 26, flex: 'none' }} />
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 18, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Onboarding</div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: BRAND, fontWeight: 700 }}>MAGMA · AMGM</div>
        </div>
      </div>

      {!isEmployee && (
        <div>
          <div style={{ fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, padding: '0 6px', margin: '8px 0' }}>Departments</div>
          {scopeDepts.map(id => {
            const a = activeDept === id; const n = empsIn(id).length;
            return (
              <div key={id} onClick={() => openDept(id)} className="rowhover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 9, fontSize: 14.5, cursor: 'pointer', whiteSpace: 'nowrap', color: a ? INK : 'oklch(0.44 0.010 60)', background: a ? 'oklch(0.985 0.006 80)' : 'transparent', boxShadow: a ? 'inset 0 0 0 1px oklch(0.88 0.012 70)' : 'none' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{depts[id] ? depts[id].name : id}</span>
                <span style={{ fontSize: 14, color: MUTED }}>{depts[id] && depts[id].pending && !n ? '·' : n}</span>
              </div>
            );
          })}
          {!scopeDepts.length && <div style={{ fontSize: 13.5, color: MUTED, padding: '4px 6px' }}>No departments in scope.</div>}
        </div>
      )}

      <div style={{ fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, padding: '0 6px', margin: '18px 0 8px' }}>{isEmployee ? 'My onboarding' : 'Views'}</div>
      <div onClick={goHome} className="rowhover" style={sideItem(view === 'home' && !searching)}><span>{isEmployee ? 'My journey' : 'Overview'}</span></div>
      {!isEmployee && (
        <div>
          <div onClick={() => openList('attention')} className="rowhover" style={sideItem(view === 'list' && listFilter === 'attention')}>
            <span>Needs attention</span><span style={{ fontSize: 14, color: MUTED }}>{needsAttention}</span>
          </div>
          <div onClick={() => openList('completed')} className="rowhover" style={sideItem(view === 'list' && listFilter === 'completed')}>
            <span>Completed</span><span style={{ fontSize: 14, color: MUTED }}>{completedCount}</span>
          </div>
        </div>
      )}

      {!isEmployee && (
        <div>
          <div style={{ fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, padding: '0 6px', margin: '18px 0 8px' }}>Workspace</div>
          <div onClick={openActivity} className="rowhover" style={sideItem(view === 'activity' && !searching)}><span>Activity log</span></div>
        </div>
      )}

      <div style={{ marginTop: 'auto', padding: '14px 8px 4px', borderTop: '1px solid oklch(0.88 0.012 70)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'oklch(0.92 0.035 55)', color: 'oklch(0.58 0.09 45)', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 500 }}>{meCard.initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meCard.name}</div>
          <div style={{ fontSize: 13, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={me.email || me.upn}>{me.email || me.upn}</div>
        </div>
        <span onClick={onSignOut} title="Sign out" className="rowhover" style={{ cursor: 'pointer', color: MUTED, padding: '5px', borderRadius: 7, flex: 'none', display: 'flex', alignItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
        </span>
      </div>
    </aside>
  );

  /* ---- topbar ---- */
  const roleTabs = [['hr', 'HR'], ['manager', 'Manager'], ['employee', 'New hire']];
  const openAssign = () => {
    const d0 = allDepts[0] || '';
    setAssignDept(d0); setAssignUnit((depts[d0] && depts[d0].units[0]) || '');
    setAssignName(''); setAssignEmail(''); setAssignPos(''); setAssignManager(managerOptions[0]);
    setAssignStart(new Date().toISOString().slice(0, 10));
    setAssignStep('form'); setAssignOpen(true);
  };
  const Topbar = () => (
    <div style={{ padding: '14px 30px', borderBottom: '1px solid oklch(0.88 0.012 70)', display: 'flex', alignItems: 'center', gap: '16px', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: 'none' }}>
        <img src={RING} alt="MAGMA" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 13.5, letterSpacing: '0.16em', color: BRAND, fontWeight: 700 }}>MAGMA</span>
      </div>
      <div style={{ width: 1, height: 24, background: 'oklch(0.88 0.012 70)', flex: 'none' }}></div>
      <div style={{ position: 'relative', flex: 1, maxWidth: 290 }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 12, top: 10, opacity: 0.45 }}><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"></circle><path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"></path></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search new hires, departments…" style={{ width: '100%', padding: '9px 32px 9px 34px', borderRadius: 10, background: 'oklch(0.945 0.015 72)', border: '1px solid oklch(0.88 0.012 70)', color: INK, fontSize: 14, outline: 'none' }} />
        {searching && <span onClick={() => setQuery('')} style={{ position: 'absolute', right: 11, top: 7, cursor: 'pointer', color: MUTED, fontSize: 16, lineHeight: 1 }}>×</span>}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} title="Preview each role (you're an admin)">
            {roleTabs.map(([id, label]) => {
              const a = role === id;
              return <button key={id} onClick={() => switchRole(id)} style={{ border: `1px solid ${a ? INK : 'oklch(0.88 0.012 70)'}`, cursor: 'pointer', fontSize: 14.5, fontWeight: 500, padding: '6px 13px', borderRadius: 999, background: a ? INK : 'oklch(0.985 0.006 80)', color: a ? 'oklch(0.965 0.012 75)' : 'oklch(0.44 0.010 60)', transition: 'all .15s ease' }}>{label}</button>;
            })}
          </div>
        )}
        {role === 'hr' && (
          <button onClick={openAssign} className="lift" style={{ border: `1px solid ${INK}`, cursor: 'pointer', fontSize: 15, fontWeight: 500, padding: '8px 15px', borderRadius: 999, background: INK, color: 'oklch(0.965 0.012 75)', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New journey
          </button>
        )}
      </div>
    </div>
  );

  /* ---- overview ---- */
  const ovEyebrow = { hr: 'The onboarding journey · MAGMA', manager: 'Your department · MAGMA', employee: 'Welcome to MAGMA' }[role];
  const ovTitle = role === 'manager' ? (depts[primaryDept] ? depts[primaryDept].name : 'Your') : (role === 'hr' ? 'New hire onboarding,' : 'Your first');
  const ovTitleEm = { hr: 'every department.', manager: 'team.', employee: 'ninety days.' }[role];
  const ovLede = { hr: 'A quiet, shared view of where each new hire is across their first ninety days — Month 1 to 3, color only where it matters.', manager: 'Track your new hires through their Month 1–3 milestones and verify completed work at each review checkpoint.', employee: 'Your manager checks off milestones as they verify your completed work. Follow your progress here across your first ninety days.' }[role];

  const footStats = isEmployee
    ? [{ label: 'Completion', value: overallPct + '%', color: overallColor }, { label: 'Milestones', value: rm.empId ? doneOf(checked, rm.empId) + '/' + totalOf(rm.empId) : '0/0', color: INK }, { label: 'Reviews', value: '30·60·90', color: INK }, { label: 'Department', value: rm.dept && depts[rm.dept] ? depts[rm.dept].name : '—', color: INK }]
    : [{ label: 'In onboarding', value: scopeEmps.length, color: INK }, { label: 'On track', value: onTrack, color: INK }, { label: 'Departments', value: scopeDepts.length, color: INK }, { label: 'Overall', value: overallPct + '%', color: overallColor }];

  const Overview = () => (
    <div style={{ padding: '52px 48px 64px', maxWidth: 1080 }}>
      <div style={{ fontSize: 14, letterSpacing: '0.01em', color: MUTED, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
        <span style={{ width: 18, height: 1, background: MUTED }}></span>{ovEyebrow}
      </div>
      <h1 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 60, lineHeight: 0.98, letterSpacing: '-0.025em', margin: 0, maxWidth: 760 }}>{ovTitle} <span style={{ fontStyle: 'italic', color: 'oklch(0.58 0.09 45)' }}>{ovTitleEm}</span></h1>
      <p style={{ fontSize: 16, lineHeight: 1.55, color: 'oklch(0.44 0.010 60)', maxWidth: 520, margin: '24px 0 0' }}>{ovLede}</p>

      <div style={{ marginTop: '44px', paddingTop: '28px', borderTop: '1px solid oklch(0.92 0.010 72)', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '28px' }}>
        {footStats.map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 14, letterSpacing: '0.01em', color: MUTED, marginBottom: '9px' }}>{s.label}</div>
            <StatValue v={s.value} style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 34, letterSpacing: '-0.01em', color: s.color }} />
          </div>
        ))}
      </div>

      {!isEmployee ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '52px 0 18px' }}>
            <h2 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 28, letterSpacing: '-0.01em', margin: 0 }}>{role === 'manager' ? 'Your department' : 'Departments'}</h2>
            <span style={{ fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, display: 'flex', alignItems: 'center', gap: '7px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>
              Managers &amp; HR only
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
            {scopeDepts.map(id => {
              const ids = empsIn(id); const has = ids.length > 0; const p = deptAvg(checked, id);
              const pending = depts[id] && depts[id].pending;
              const meta = has ? (ids.length + ' active · ' + ids.filter(e => pctOf(checked, e) >= 70).length + ' on track')
                : (pending ? 'Setup pending · milestones to be confirmed' : 'No active hires yet');
              const unitLine = depts[id] && depts[id].units.length ? ('Units: ' + depts[id].units.join(', ')) : null;
              return (
                <div key={id} onClick={() => openDept(id)} className="lift" style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 16, padding: '24px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', display: 'grid', placeItems: 'center', color: 'oklch(0.44 0.010 60)', flex: 'none' }}>
                        <DeptIcon svg={depts[id] ? depts[id].icon : ''} />
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 23, letterSpacing: '-0.01em', lineHeight: 1.05 }}>{depts[id] ? depts[id].name : id}</div>
                        <div style={{ fontSize: 14, color: MUTED, marginTop: '5px' }}>{meta}</div>
                        {unitLine && <div style={{ fontSize: 12.5, color: 'oklch(0.58 0.09 45)', marginTop: '4px' }}>{unitLine}</div>}
                      </div>
                    </div>
                    {has ? <CountUp end={p} suffix="%" style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 30, letterSpacing: '-0.01em', color: colorFor(p) }} />
                         : <span style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 30, letterSpacing: '-0.01em', color: MUTED }}>—</span>}
                  </div>
                  <div style={{ marginTop: '22px' }}>{has ? <Bar pct={p} color={colorFor(p)} /> : <div style={{ height: 3, borderRadius: 2, background: 'oklch(0.92 0.010 72)' }} />}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : rm.empId ? (
        <div style={{ marginTop: '48px' }}>
          <div onClick={() => openJourney(rm.empId)} className="lift" style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 18, padding: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', display: 'grid', placeItems: 'center', color: 'oklch(0.44 0.010 60)', flex: 'none' }}>
              <DeptIcon svg={depts[rm.dept] ? depts[rm.dept].icon : ''} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, letterSpacing: '0.01em', color: MUTED }}>{depts[rm.dept] ? depts[rm.dept].name : rm.dept}</div>
              <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 28, letterSpacing: '-0.015em', marginTop: '4px' }}>Your onboarding journey</div>
              <div style={{ fontSize: 14, color: MUTED, marginTop: '6px' }}>{doneOf(checked, rm.empId)} OF {totalOf(rm.empId)} MILESTONES · VERIFIED BY YOUR MANAGER</div>
            </div>
            <CountUp end={overallPct} suffix="%" style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 44, letterSpacing: '-0.01em', color: overallColor }} />
          </div>
          <div style={{ marginTop: '16px', fontSize: 14, letterSpacing: '0.01em', color: MUTED, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>
            Visible only to you, your manager, and HR
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '48px', background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 16, padding: '40px', textAlign: 'center', color: MUTED, fontSize: 15 }}>
          No onboarding journey is linked to your account yet. Once HR assigns you a journey, it’ll appear here.
        </div>
      )}
    </div>
  );

  /* ---- shared hires table ---- */
  const HiresTable = ({ rows, showDept }) => {
    const colTemplate = showDept ? '34px 2fr 1.2fr 1.3fr 1.5fr 88px' : '34px 2fr 1.3fr 1fr 1.5fr 88px';
    return (
      <div style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: colTemplate, gap: '16px', padding: '13px 24px', borderBottom: '1px solid oklch(0.88 0.012 70)', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED }}>
          <span>#</span><span>New hire</span><span>{showDept ? 'Department' : 'Manager'}</span><span>{showDept ? 'Manager' : 'Start'}</span><span>Progress</span><span style={{ textAlign: 'right' }}>Open</span>
        </div>
        {rows.map(h => (
          <div key={h.id} onClick={() => openJourney(h.id)} className="rowhover" style={{ display: 'grid', gridTemplateColumns: colTemplate, gap: '16px', padding: '17px 24px', borderBottom: '1px solid oklch(0.92 0.010 72)', alignItems: 'center', cursor: 'pointer' }}>
            <span style={{ fontSize: 14, color: MUTED }}>{h.ix}</span>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 500, color: INK }}>{h.name}</div>
              <div style={{ fontSize: 14, color: MUTED, marginTop: '2px' }}>{h.pos}{h.unit ? ' · ' + h.unit : ''}</div>
            </div>
            <span style={{ fontSize: 14.5, color: 'oklch(0.44 0.010 60)' }}>{showDept ? h.deptName : h.manager}</span>
            <span style={{ fontSize: 14.5, color: MUTED }}>{showDept ? h.manager : h.start}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <div style={{ flex: 1 }}><Bar pct={h.pct} color={h.color} /></div>
              <CountUp end={h.pct} suffix="%" style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 17, color: h.color, width: 38, textAlign: 'right' }} />
            </div>
            <span style={{ textAlign: 'right', fontSize: 14, letterSpacing: '0.01em', color: 'oklch(0.44 0.010 60)' }}>View ›</span>
          </div>
        ))}
      </div>
    );
  };

  /* ---- department detail ---- */
  const DeptDetail = () => {
    if (!deptId || isEmployee || !depts[deptId]) return null;
    const ids = empsIn(deptId); const has = ids.length > 0; const p = deptAvg(checked, deptId); const d = depts[deptId];
    const meta = has ? (ids.length + ' new hires onboarding · ' + p + '% average') : (d.pending ? 'Setup pending · milestones to be confirmed' : 'No active hires yet');
    const rows = ids.map(rowFor);
    return (
      <div style={{ padding: '40px 48px 64px' }}>
        <button onClick={goHome} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, letterSpacing: '0.01em', color: MUTED, padding: 0, marginBottom: '24px' }}>‹ Overview</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ width: 46, height: 46, borderRadius: 11, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.985 0.006 80)', display: 'grid', placeItems: 'center', color: 'oklch(0.44 0.010 60)', flex: 'none' }}>
            <DeptIcon svg={d.icon} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 38, letterSpacing: '-0.02em', margin: 0, lineHeight: 1 }}>{d.name}</h1>
            <div style={{ fontSize: 14, letterSpacing: '0.01em', color: MUTED, marginTop: '7px' }}>{meta}</div>
          </div>
          {has ? <CountUp end={p} suffix="%" style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 40, letterSpacing: '-0.01em', color: colorFor(p) }} />
               : <span style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 40, letterSpacing: '-0.01em', color: MUTED }}>—</span>}
        </div>
        {d.units.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '22px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, color: MUTED, alignSelf: 'center' }}>Units:</span>
            {d.units.map(u => <span key={u} style={{ fontSize: 13.5, padding: '4px 11px', borderRadius: 999, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.985 0.006 80)', color: 'oklch(0.58 0.09 45)' }}>{u}</span>)}
          </div>
        )}
        {has ? <HiresTable rows={rows} showDept={false} /> : (
          <div style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 16, padding: '40px', textAlign: 'center', color: MUTED, fontSize: 15 }}>
            {d.pending ? 'Milestones for this department are being finalised. No journeys assigned yet.' : 'No new hires in this department yet.'}
          </div>
        )}
      </div>
    );
  };

  /* ---- filtered list ---- */
  const ListView = () => {
    if (isEmployee) return null;
    const ids = listFilter === 'attention' ? attentionIds : completedIds;
    const rows = ids.map(rowFor);
    const title = listFilter === 'attention' ? 'Needs attention' : 'Completed';
    const blurb = listFilter === 'attention' ? 'New hires below 40% completion — these journeys may need a check-in.' : 'New hires who have completed every Month 1–3 milestone.';
    const empty = listFilter === 'attention' ? 'No one needs attention right now — every new hire is at 40% or above.' : 'No completed journeys yet.';
    return (
      <div style={{ padding: '40px 48px 64px', maxWidth: 1080 }}>
        <button onClick={goHome} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, letterSpacing: '0.01em', color: MUTED, padding: 0, marginBottom: '24px' }}>‹ Overview</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
          <h1 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 38, letterSpacing: '-0.02em', margin: 0, lineHeight: 1 }}>{title}</h1>
          <span style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 30, letterSpacing: '-0.01em', color: listFilter === 'attention' ? BLOCKED : OK }}>{rows.length}</span>
        </div>
        <p style={{ fontSize: 15, color: 'oklch(0.44 0.010 60)', margin: '0 0 26px', maxWidth: 560 }}>{blurb}</p>
        {rows.length ? <HiresTable rows={rows} showDept={true} /> : (
          <div style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 16, padding: '40px', textAlign: 'center', color: MUTED, fontSize: 15 }}>{empty}</div>
        )}
      </div>
    );
  };

  /* ---- activity feed (live: milestone check-offs + new journeys) ---- */
  const fmtDateTime = (s) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const ActivityFeed = () => {
    const inScope = new Set(scopeEmps);
    const items = [];
    for (const e of events) {
      const hireId = (e.key || '').split('|')[0];
      if (!emps[hireId] || !inScope.has(hireId)) continue;
      const m = parseInt((e.key || '').split('|')[1], 10);
      const idx = parseInt((e.key || '').split('|')[2], 10);
      const dept = emps[hireId].dept;
      const text = (milestones[dept] && milestones[dept][m] && milestones[dept][m][idx]) || 'a milestone';
      items.push({ type: 'tick', at: e.at, hire: emps[hireId].name, by: e.byName, text, dept });
    }
    for (const id of scopeEmps) {
      if (emps[id].created) items.push({ type: 'journey', at: emps[id].created, hire: emps[id].name, dept: emps[id].dept });
    }
    items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    const top = items.slice(0, 40);
    return (
      <div style={{ padding: '40px 48px 64px', maxWidth: 860 }}>
        <button onClick={goHome} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, letterSpacing: '0.01em', color: MUTED, padding: 0, marginBottom: '24px' }}>‹ Overview</button>
        <h1 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 38, letterSpacing: '-0.02em', margin: 0, lineHeight: 1 }}>Activity log</h1>
        <p style={{ fontSize: 15, color: 'oklch(0.44 0.010 60)', margin: '12px 0 26px', maxWidth: 560 }}>Recent milestone check-offs and new journeys{role === 'manager' ? ' in your department' : ''}, newest first.</p>
        {top.length ? (
          <div style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 16, overflow: 'hidden' }}>
            {top.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '13px', padding: '15px 22px', borderBottom: i < top.length - 1 ? '1px solid oklch(0.92 0.010 72)' : 'none' }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, flex: 'none', display: 'grid', placeItems: 'center', background: a.type === 'tick' ? 'oklch(0.95 0.05 150)' : 'oklch(0.92 0.035 55)', color: a.type === 'tick' ? OK : 'oklch(0.58 0.09 45)' }}>
                  {a.type === 'tick'
                    ? <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 6 2.5 2.5L10 3"></path></svg>
                    : <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: INK, lineHeight: 1.45 }}>
                    {a.type === 'tick'
                      ? <span><strong style={{ fontWeight: 500 }}>{a.by || 'Someone'}</strong> checked “{a.text}” for <strong style={{ fontWeight: 500 }}>{a.hire}</strong></span>
                      : <span>Journey created for <strong style={{ fontWeight: 500 }}>{a.hire}</strong></span>}
                  </div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: '3px' }}>{depts[a.dept] ? depts[a.dept].name : a.dept}{a.at ? ' · ' + fmtDateTime(a.at) : ''}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 16, padding: '40px', textAlign: 'center', color: MUTED, fontSize: 15 }}>No activity yet — milestone check-offs and new journeys will show up here.</div>
        )}
      </div>
    );
  };

  /* ---- search results ---- */
  const SearchResults = () => {
    const q = query.trim().toLowerCase();
    const ids = scopeEmps.filter(id => { const e = emps[id]; return (e.name + ' ' + e.pos + ' ' + (depts[e.dept] ? depts[e.dept].name : '') + ' ' + (e.unit || '')).toLowerCase().includes(q); });
    const rows = ids.map(rowFor);
    const deptHits = isEmployee ? [] : scopeDepts.filter(id => depts[id] && depts[id].name.toLowerCase().includes(q));
    return (
      <div style={{ padding: '40px 48px 64px', maxWidth: 1080 }}>
        <div style={{ fontSize: 14, letterSpacing: '0.01em', color: MUTED, marginBottom: '10px' }}>Search results for “{query.trim()}”</div>
        <h1 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 34, letterSpacing: '-0.02em', margin: '0 0 22px', lineHeight: 1 }}>{rows.length} new hire{rows.length === 1 ? '' : 's'}{deptHits.length ? ` · ${deptHits.length} department${deptHits.length === 1 ? '' : 's'}` : ''}</h1>
        {deptHits.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '22px' }}>
            {deptHits.map(id => <button key={id} onClick={() => { setQuery(''); openDept(id); }} style={{ cursor: 'pointer', fontSize: 14, padding: '7px 14px', borderRadius: 999, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.985 0.006 80)', color: INK }}>{depts[id].name} ›</button>)}
          </div>
        )}
        {rows.length ? <HiresTable rows={rows} showDept={!isEmployee} /> : (
          <div style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 16, padding: '40px', textAlign: 'center', color: MUTED, fontSize: 15 }}>No new hires match “{query.trim()}”.</div>
        )}
      </div>
    );
  };

  /* ---- journey ---- */
  const Journey = () => {
    if (!empId || !emps[empId]) return null;
    const id = empId, e = emps[id], p = pctOf(checked, id);
    const empColor = colorFor(p);
    const ms = milestones[e.dept] || { 1: [], 2: [], 3: [] };
    const cameFromList = listFilter !== null;
    const backLabel = isEmployee ? 'My journey' : cameFromList ? (listFilter === 'attention' ? 'Needs attention' : 'Completed') : (depts[e.dept] ? depts[e.dept].name : 'Overview');
    const unitTxt = e.unit ? ' · ' + e.unit + ' unit' : '';
    const emp = { name: e.name, ref: e.ref + (depts[e.dept] ? ' · ' + depts[e.dept].name.toUpperCase() : ''), meta: e.pos + unitTxt + ' · Reports to ' + mgrOf(id), manager: mgrOf(id), pct: p, done: doneOf(checked, id), total: totalOf(id) };

    const reviews = [['30-DAY', e.reviews[0]], ['60-DAY', e.reviews[1]], ['90-DAY', e.reviews[2]]].map(([lab, dt]) => {
      if (!dt) return { label: lab, date: '—', status: 'Not set', color: MUTED };
      const d = new Date(dt + 'T00:00:00'), diff = (d - TODAY) / 86400000;
      let status, color;
      if (diff < 0) { status = 'Complete'; color = OK; }
      else if (diff <= 14) { status = 'Due soon'; color = WARN; }
      else { status = 'Scheduled'; color = MUTED; }
      return { label: lab, date: fmtDate(dt), status, color };
    });

    const monthTabs = [1, 2, 3].map(m => {
      const arr = ms[m] || [], dn = arr.filter((_, i) => checked[id + '|' + m + '|' + i]).length, active = month === m, full = arr.length > 0 && dn === arr.length;
      return { m, label: 'Month ' + m, sub: ['Foundation', 'Guided practice', 'Independent'][m - 1], count: dn + '/' + arr.length,
        border: active ? INK : 'oklch(0.88 0.012 70)', bg: active ? 'oklch(0.985 0.006 80)' : 'oklch(0.965 0.012 75)',
        ring: active ? 'inset 0 0 0 1px ' + INK : 'none', countColor: full ? OK : MUTED };
    });

    const arr = ms[month] || [];
    const list = arr.map((text, i) => {
      const key = id + '|' + month + '|' + i, done = !!checked[key], org = isOrgWide(text);
      return { key, i, text, done, org,
        boxBorder: done ? INK : 'oklch(0.80 0.012 70)', boxBg: done ? INK : 'oklch(0.985 0.006 80)',
        textColor: done ? 'oklch(0.55 0.010 60)' : INK, tag: done ? 'Done' : '', tagColor: OK };
    });

    const backFromJourney = () => isEmployee ? goHome() : cameFromList ? setView('list') : setView('dept');
    const mopts = managerOptions.includes(emp.manager) || !emp.manager ? managerOptions : [emp.manager, ...managerOptions];

    return (
      <div style={{ padding: '40px 48px 72px', maxWidth: 980 }}>
        <button onClick={backFromJourney} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, letterSpacing: '0.01em', color: MUTED, padding: 0, marginBottom: '24px' }}>‹ {backLabel}</button>

        <div style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 18, padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', paddingBottom: '24px', borderBottom: '1px solid oklch(0.92 0.010 72)' }}>
            <div>
              <div style={{ fontSize: 14, letterSpacing: '0.01em', color: MUTED, marginBottom: '8px' }}>{emp.ref}</div>
              <h1 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 40, letterSpacing: '-0.02em', margin: 0, lineHeight: 1 }}>{emp.name}</h1>
              <div style={{ fontSize: 14, color: MUTED, marginTop: '10px' }}>{emp.meta}</div>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <CountUp end={emp.pct} suffix="%" style={{ display: 'block', fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 54, letterSpacing: '-0.02em', color: empColor, lineHeight: 0.9 }} />
              <div style={{ fontSize: 14, color: MUTED, marginTop: '6px' }}>{emp.done} / {emp.total} DONE</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', marginTop: '22px' }}>
            <div style={{ flex: 1, minWidth: 230 }}>
              <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '8px' }}>Reporting manager</label>
              <select value={emp.manager} disabled style={{ width: '100%', fontSize: 14.5, padding: '11px 12px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.945 0.015 72)', color: INK, cursor: 'default' }}>
                {mopts.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: '7px' }}>Set when the journey was created</div>
            </div>
            <div style={{ flex: 1, minWidth: 230 }}>
              <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '8px' }}>Review checkpoints</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {reviews.map((rv, i) => (
                  <div key={i} style={{ flex: 1, padding: '9px 8px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)' }}>
                    <div style={{ fontSize: 13.5, color: 'oklch(0.44 0.010 60)' }}>{rv.label}</div>
                    <div style={{ fontSize: 13.5, color: MUTED, marginTop: '3px' }}>{rv.date}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: rv.color }}></span>
                      <span style={{ fontSize: 13.5, color: 'oklch(0.44 0.010 60)' }}>{rv.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', margin: '22px 0 14px' }}>
          {monthTabs.map(mt => (
            <button key={mt.m} onClick={() => setMonth(mt.m)} style={{ flex: 1, textAlign: 'left', cursor: 'pointer', border: `1px solid ${mt.border}`, background: mt.bg, borderRadius: 13, padding: '14px 16px', boxShadow: mt.ring, transition: 'border-color .15s ease, background .15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 21, letterSpacing: '-0.01em', color: INK }}>{mt.label}</span>
                <span style={{ fontSize: 14, color: mt.countColor }}>{mt.count}</span>
              </div>
              <div style={{ fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginTop: '3px' }}>{mt.sub}</div>
            </button>
          ))}
        </div>

        {isEmployee && (
          <div style={{ fontSize: 13.5, color: MUTED, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>
            Read-only — your manager verifies and checks off each milestone.
          </div>
        )}

        <div style={{ background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 14, overflow: 'hidden' }}>
          {list.length === 0 && <div style={{ padding: '28px 22px', color: MUTED, fontSize: 15 }}>No milestones defined for this month yet.</div>}
          {list.map(item => (
            <div key={item.key} onClick={() => toggleMilestone(id, month, item.i)} className={canTick ? 'rowhover' : ''} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '15px 22px', borderBottom: '1px solid oklch(0.92 0.010 72)', cursor: canTick ? 'pointer' : 'default' }}>
              <div className="chkbox" style={{ width: 18, height: 18, borderRadius: 5, flex: 'none', border: `1.5px solid ${item.boxBorder}`, background: item.boxBg, display: 'grid', placeItems: 'center', opacity: canTick ? 1 : 0.85 }}>
                {item.done && <svg className="chkpop" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="oklch(0.985 0.006 80)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m2 6 2.5 2.5L10 3"></path></svg>}
              </div>
              <span style={{ flex: 1, fontSize: 16, color: item.textColor }}>{item.text}</span>
              {item.org && <span style={{ fontSize: 13.5, letterSpacing: '0.01em', padding: '3px 8px', borderRadius: 999, border: '1px solid oklch(0.88 0.012 70)', color: 'oklch(0.58 0.09 45)', flex: 'none' }}>MAGMA-wide</span>}
              <span style={{ fontSize: 13.5, letterSpacing: '0.01em', color: item.tagColor, flex: 'none', width: 42, textAlign: 'right' }}>{item.tag}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ---- assign modal (creates a real NewHires record) ---- */
  const closeAssign = () => { setAssignOpen(false); setAssignStep('form'); };
  const aDept = depts[assignDept] || { name: '', units: [], icon: '' };
  const assignDeptUnits = aDept.units;
  const onAssignDept = (v) => { setAssignDept(v); setAssignUnit((depts[v] && depts[v].units[0]) || ''); };
  const unitTxtA = assignUnit ? ' (' + assignUnit + ' unit)' : '';
  const previewItems = (milestones[assignDept] && milestones[assignDept][1]) || [];

  const nextRefNum = () => { let max = 42; for (const id in emps) { const n = parseInt((emps[id].ref || '').split('-')[1], 10); if (!isNaN(n) && n > max) max = n; } return max + 1; };
  const addDaysISO = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  async function submitJourney() {
    if (!assignName.trim()) { setToast('Please enter the new hire’s name.'); return; }
    setAssignStep('saving');
    try {
      const ref = 'MAGMA-' + String(nextRefNum()).padStart(4, '0');
      await createNewHire({
        Title: assignName.trim(),
        Position: assignPos.trim(),
        Department: assignDept,
        Unit: assignUnit,
        ManagerName: assignManager,
        ManagerUpn: '',
        HireUpn: assignEmail.trim().toLowerCase(),
        StartDate: assignStart,
        Ref: ref,
        Review30: addDaysISO(assignStart, 30),
        Review60: addDaysISO(assignStart, 60),
        Review90: addDaysISO(assignStart, 90),
      });
      if (syncRef.current) await syncRef.current.refresh();
      setAssignStep('done');
    } catch (e) {
      setToast('Could not create journey: ' + (e.message || e));
      setAssignStep('form');
    }
  }

  const AssignModal = () => (
    <div onClick={closeAssign} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'oklch(0.22 0.012 60 / 0.28)', display: 'grid', placeItems: 'center', padding: '24px', backdropFilter: 'blur(2px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="successcard" style={{ width: 560, maxWidth: '100%', background: 'oklch(0.985 0.006 80)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 18, overflow: 'hidden', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 30px 70px -30px rgba(50,40,20,.45)' }}>
        {assignStep !== 'done' ? (
          <div>
            <div style={{ padding: '24px 26px 16px', borderBottom: '1px solid oklch(0.92 0.010 72)' }}>
              <div style={{ fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '9px' }}>Assign onboarding journey</div>
              <h3 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 30, letterSpacing: '-0.015em', margin: 0 }}>Create a new hire journey</h3>
            </div>
            <div style={{ padding: '22px 26px' }}>
              <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '7px' }}>New hire name</label>
              <input value={assignName} onChange={(e) => setAssignName(e.target.value)} placeholder="e.g. Jordan Pierre" style={{ width: '100%', fontSize: 16, padding: '11px 13px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', color: INK, outline: 'none', marginBottom: '16px' }} />

              <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '7px' }}>New hire email <span style={{ color: MUTED }}>(so they can see their own journey — optional)</span></label>
              <input value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} placeholder="e.g. jordan.pierre@magma-amgm.org" style={{ width: '100%', fontSize: 16, padding: '11px 13px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', color: INK, outline: 'none', marginBottom: '16px' }} />

              <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '7px' }}>Position / title</label>
              <input value={assignPos} onChange={(e) => setAssignPos(e.target.value)} placeholder="e.g. Settlement Counsellor" style={{ width: '100%', fontSize: 16, padding: '11px 13px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', color: INK, outline: 'none', marginBottom: '16px' }} />

              <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '7px' }}>Department</label>
                  <select value={assignDept} onChange={(e) => onAssignDept(e.target.value)} style={{ width: '100%', fontSize: 14.5, padding: '11px 12px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', color: INK, cursor: 'pointer' }}>
                    {allDepts.map(id => <option key={id} value={id}>{depts[id].name}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '7px' }}>Reporting manager</label>
                  <select value={assignManager} onChange={(e) => setAssignManager(e.target.value)} style={{ width: '100%', fontSize: 14.5, padding: '11px 12px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', color: INK, cursor: 'pointer' }}>
                    {managerOptions.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {assignDeptUnits.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '7px' }}>Unit within {aDept.name}</label>
                  <select value={assignUnit} onChange={(e) => setAssignUnit(e.target.value)} style={{ width: '100%', fontSize: 14.5, padding: '11px 12px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', color: INK, cursor: 'pointer' }}>
                    {assignDeptUnits.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}
              <label style={{ display: 'block', fontSize: 13.5, letterSpacing: '0.01em', color: MUTED, marginBottom: '7px' }}>Start date</label>
              <input value={assignStart} onChange={(e) => setAssignStart(e.target.value)} type="date" style={{ width: '100%', fontSize: 16, padding: '11px 13px', borderRadius: 10, border: '1px solid oklch(0.88 0.012 70)', background: 'oklch(0.965 0.012 75)', color: INK, outline: 'none' }} />
              <div style={{ marginTop: '16px', display: 'flex', gap: '9px', alignItems: 'flex-start', fontSize: 15.5, color: 'oklch(0.44 0.010 60)', lineHeight: 1.5 }}>
                <span style={{ width: 15, height: 15, borderRadius: '50%', background: 'oklch(0.92 0.035 55)', color: 'oklch(0.58 0.09 45)', display: 'grid', placeItems: 'center', fontSize: 13.5, flex: 'none', marginTop: '2px' }}>i</span>
                <div>A Month 1–3 checklist is generated automatically from the {aDept.name || 'department'} template — opening with MAGMA-wide HR onboarding and closing Month 1 with Cross-Cultural Training. Review dates are set to 30 / 60 / 90 days from the start date.</div>
              </div>
            </div>
            <div style={{ padding: '16px 26px', background: 'oklch(0.945 0.015 72)', borderTop: '1px solid oklch(0.92 0.010 72)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={closeAssign} disabled={assignStep === 'saving'} style={{ border: '1px solid oklch(0.88 0.012 70)', cursor: 'pointer', fontSize: 14, fontWeight: 500, padding: '10px 18px', borderRadius: 10, background: 'oklch(0.985 0.006 80)', color: 'oklch(0.44 0.010 60)' }}>Cancel</button>
              <button onClick={submitJourney} disabled={assignStep === 'saving'} className="lift" style={{ border: `1px solid ${INK}`, cursor: assignStep === 'saving' ? 'default' : 'pointer', fontSize: 14, fontWeight: 500, padding: '10px 18px', borderRadius: 10, background: INK, color: 'oklch(0.965 0.012 75)', opacity: assignStep === 'saving' ? 0.7 : 1 }}>{assignStep === 'saving' ? 'Creating…' : 'Create journey'}</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '34px 32px 30px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
              <svg width="58" height="58" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="22" fill="oklch(0.95 0.05 150)" stroke={OK} strokeWidth="2.5" style={{ strokeDasharray: 139, strokeDashoffset: 139, animation: 'drawStroke .55s ease forwards' }} />
                <path d="M16 26.5 l6.5 6.5 L37 18.5" fill="none" stroke={OK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 34, strokeDashoffset: 34, animation: 'drawStroke .32s ease forwards .5s' }} />
              </svg>
            </div>
            <div className="rise" style={{ textAlign: 'center', fontSize: 13.5, letterSpacing: '0.02em', color: 'oklch(0.52 0.07 150)', marginBottom: '6px', animationDelay: '.15s' }}>Journey created</div>
            <h3 className="rise" style={{ textAlign: 'center', fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 400, fontSize: 30, letterSpacing: '-0.015em', margin: '0 0 6px', animationDelay: '.2s' }}>Saved to SharePoint</h3>
            <p className="rise" style={{ textAlign: 'center', fontSize: 15, color: 'oklch(0.44 0.010 60)', lineHeight: 1.5, margin: '0 0 18px', animationDelay: '.25s' }}>
              <strong style={{ color: INK }}>{assignName || 'The new hire'}</strong>{assignPos ? ' · ' + assignPos : ''}{unitTxtA} in {aDept.name}. Their Month 1–3 checklist is generated from the department template and now appears in the list.
            </p>

            <div className="rise" style={{ background: 'oklch(0.965 0.012 75)', border: '1px solid oklch(0.88 0.012 70)', borderRadius: 12, overflow: 'hidden', marginBottom: '16px', animationDelay: '.3s' }}>
              <div style={{ padding: '11px 15px', borderBottom: '1px solid oklch(0.90 0.010 72)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, color: MUTED, letterSpacing: '0.01em' }}>Checklist · Month 1</span>
                <span style={{ fontSize: 13, color: OK }}>{previewItems.length} milestones</span>
              </div>
              {previewItems.slice(0, 4).map((t, i) => (
                <div key={i} className="rise" style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '9px 15px', borderBottom: i < 3 ? '1px solid oklch(0.93 0.008 74)' : 'none', animationDelay: (0.35 + i * 0.08) + 's' }}>
                  <span style={{ width: 15, height: 15, borderRadius: 4, border: '1.5px solid oklch(0.80 0.012 70)', flex: 'none' }}></span>
                  <span style={{ flex: 1, fontSize: 14, color: 'oklch(0.34 0.010 60)' }}>{t}</span>
                  {isOrgWide(t) && <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 999, border: '1px solid oklch(0.88 0.012 70)', color: 'oklch(0.58 0.09 45)', flex: 'none' }}>MAGMA-wide</span>}
                </div>
              ))}
              {previewItems.length > 4 && <div style={{ padding: '8px 15px', fontSize: 13, color: MUTED }}>+ {previewItems.length - 4} more, plus Month 2 &amp; 3</div>}
            </div>

            <button onClick={closeAssign} className="lift" style={{ width: '100%', border: `1px solid ${INK}`, cursor: 'pointer', fontSize: 14.5, fontWeight: 500, padding: '12px', borderRadius: 10, background: INK, color: 'oklch(0.965 0.012 75)' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );

  let content;
  if (searching) content = SearchResults();
  else if (view === 'dept') content = DeptDetail();
  else if (view === 'list') content = ListView();
  else if (view === 'activity') content = ActivityFeed();
  else if (view === 'journey') content = Journey();
  else content = Overview();

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '252px 1fr', background: 'oklch(0.965 0.012 75)', color: INK, overflow: 'hidden' }}>
      {Sidebar()}
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {Topbar()}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div key={navKey} className="viewfade">{content}</div>
        </div>
      </main>
      {assignOpen && AssignModal()}
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 90, background: INK, color: 'oklch(0.965 0.012 75)', padding: '11px 18px', borderRadius: 10, fontSize: 14.5, boxShadow: '0 12px 30px -10px rgba(40,30,10,.5)', maxWidth: 520 }}>{toast}</div>
      )}
    </div>
  );
}
