/* ============================================================
   Seed / fallback data + pure helpers.
   In Phase 3 this data is replaced by live SharePoint loads
   (see services/dataSync.js). The shape here is the contract
   the UI expects, so the Graph mappers should produce the same.
   ============================================================ */

export const INK     = 'oklch(0.22 0.012 60)';
export const OK      = 'oklch(0.52 0.08 150)';
export const WARN    = 'oklch(0.60 0.10 72)';
export const BLOCKED = 'oklch(0.52 0.10 32)';
export const MUTED   = 'oklch(0.47 0.01 60)';
export const BRAND   = '#38335f';

export const managerOptions = ['Afef Tayech','Marie Leblanc','Claire Boudreau','Don Gaudet','Lara Falana','Ammar Mansour','Nadia Comeau'];

export const depts = {
  intake:     { name:'Intake', units:[], icon:'<circle cx="8" cy="9" r="3"></circle><circle cx="16" cy="9" r="3"></circle><path d="M2.5 19c0-3 2.4-5 5.5-5 1.2 0 2.3.3 3.2.9"></path><path d="M12.8 14.9A6 6 0 0 1 16 14c3.1 0 5.5 2 5.5 5"></path>' },
  settlement: { name:'Settlement', units:['RAP','CMS','AC'], icon:'<path d="M3 11l9-7 9 7"></path><path d="M5 10v9h14v-9"></path><path d="M10 19v-5h4v5"></path>' },
  language:   { name:'Language', units:[], icon:'<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"></path><path d="M7 9h10M7 12.5h6"></path>' },
  cfs:        { name:'Children & Family Services', units:['CNC','WoW','Community Connections'], icon:'<circle cx="8" cy="7" r="2.6"></circle><path d="M4 19v-3a4 4 0 0 1 8 0v3"></path><circle cx="16.5" cy="10" r="2"></circle><path d="M14 19v-2.4a3 3 0 0 1 6 0V19"></path>' },
  finance:    { name:'Finance', units:[], icon:'<rect x="3.5" y="11" width="3.6" height="8" rx="1"></rect><rect x="10.2" y="6" width="3.6" height="13" rx="1"></rect><rect x="16.9" y="9" width="3.6" height="10" rx="1"></rect>' },
  hr:         { name:'HR', units:[], icon:'<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="11" r="2"></circle><path d="M5.5 16.5c0-1.7 1.6-2.5 3.5-2.5s3.5 .8 3.5 2.5"></path><path d="M15 10h4M15 13h4"></path>' },
  it:         { name:'IT', units:[], pending:true, icon:'<rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path><path d="M7 9l2 2-2 2"></path><path d="M12 13h3"></path>' },
  marketing:  { name:'Marketing & Communications', units:[], icon:'<path d="M3 11v2a1 1 0 0 0 1 1h2l3 4V6L6 10H4a1 1 0 0 0-1 1z"></path><path d="M14 8a4 4 0 0 1 0 8"></path>' },
};

/* Month 1 opens with organizational/HR onboarding and closes with Cross-Cultural
   Training; both render a "MAGMA-wide" pill (see isOrgWide). */
export const milestones = {
  intake: {
    1:['Organizational onboarding — HR policies, cybersecurity, structure & goals','Introduction to MAGMA, community programs, eligibility & referral processes','Shadowing intake appointments & client interactions','CRM systems, documentation standards & internal procedures','Appointment scheduling, file management & communication protocols','Supporting client services under supervision','Cross-Cultural Training'],
    2:['Conducting client follow-ups & service coordination','Reporting & case documentation requirements','Active participation in team meetings & collaboration','Understanding referral pathways & program eligibility','Participation in community events & outreach'],
    3:['Independent Information & Orientation sessions and Needs Assessments','Accurate, timely completion of documentation & reports','Coordination with community partners & service providers','Independent information, referrals & client support','Full participation in daily Intake responsibilities'],
  },
  settlement: {
    1:['Organizational onboarding — HR policies, cybersecurity, structure & goals','Organization overview & technology and systems','Program overview — RAP, CMS & AC service streams','Shadowing activities (role-dependent) & core service-delivery training','Service standards, housing & reception services, and financial support','Community orientation, documentation & case management','Cross-Cultural Training'],
    2:['Manage a small caseload (5–10 clients or families) with supervisor support','Advanced client support','Partner collaboration'],
    3:['Professional development','Competency assessment','Independent service delivery & final 90-day evaluation'],
  },
  language: {
    1:['Core onboarding — orientation, HR policies, cybersecurity, health & safety','Classroom observation','Familiarization with curriculum & assessment tools','Cross-Cultural Training'],
    2:['Independent lesson delivery with support','Lesson planning & learner assessment practice'],
    3:['Full teaching responsibilities','Independent learner progress reporting'],
  },
  cfs: {
    1:['Core onboarding — confidentiality, safety, trauma-informed practice, HR & technology','Orientation to safeguarding policies & the settlement sector','Team roles (SWIS, HIPPY, Youth Integration, Women’s Wellness) & referral pathways','Shadowing & supervised client engagement','Cross-Cultural Training'],
    2:['Supporting clients with guidance — needs assessments, goal setting & service planning','Applying strengths-based, anti-oppressive & trauma-informed approaches','Involvement in program delivery (group sessions, school support, home visits)','Documentation, data entry & outcomes tracking'],
    3:['Independently managing a caseload or program responsibilities','Effective case management, advocacy & client empowerment','Leading or co-facilitating programs','Partner collaboration with schools, healthcare & community'],
  },
  finance: {
    1:['Core onboarding — orientation, HR policies, cybersecurity, health & safety','Key functions of Sage Intacct','Procurement procedures','Bookkeeping functions','Bank reconciliation','Cross-Cultural Training'],
    2:['Funding claims financial review','Payroll reconciliation','Cost analysis & review','Cashflows'],
    3:['Budgeting & forecasting','Department financial reporting','Reports for the Board'],
  },
  hr: {
    1:['Complete organizational onboarding and understand HR policies, systems, and structure','Support core HR activities (recruitment coordination, documentation, payroll support)','Learn and navigate HRIS (ADP); assist with data entry and employee updates','Cross-Cultural Training'],
    2:['Increase responsibility in recruitment and onboarding processes','Support payroll and produce basic HR reports/metrics','Process employee lifecycle transactions (Joiner, Mover, Leaver) and maintain records','Respond to routine employee and manager inquiries (with guidance)','Coordinate onboarding logistics (scheduling, documentation, system follow-ups)','Ensure accuracy and compliance in HR data updates and record-keeping','File and maintain employee records (physical and digital), ensuring confidentiality and archive knowledge'],
    3:['Manage recruitment and onboarding with minimal supervision','Own HR records management and HRIS administration independently','Support full employee lifecycle, including reporting and compliance (e.g., ROEs)','Understand benefits administration (Sun Life, parking, RRSP)','Understand performance review process expectations','Work independently on routine tasks; escalate complex issues as needed'],
  },
  it: {
    1:['Organizational onboarding — HR policies, cybersecurity, structure & goals','Department-specific milestones — awaiting input from IT','Cross-Cultural Training'],
    2:['Awaiting input from IT'],
    3:['Awaiting input from IT'],
  },
  marketing: {
    1:['Completion of core onboarding — orientation, HR policies, cybersecurity, health & safety','Introduction to organizational brand guidelines & communications processes','Familiarization with programs and services','Shadowing content creation, social media management & graphic design','Photography, event planning & community outreach activities','Cross-Cultural Training'],
    2:['Creating communications content with guidance — social media, newsletters, website updates & promotional materials','Assisting in the development of the communications & marketing calendar','Supporting event planning and promotion','Collaborating with vendors on marketing materials & projects','Learning approval processes & digital communication tools'],
    3:['Independently managing routine content creation & communications activities','Coordinating the communications & marketing calendar','Collaborating with internal departments & external vendors','Supporting the planning & execution of events and campaigns','Contributing to media & community engagement initiatives','Monitoring and reporting on communications performance & engagement metrics'],
  },
};

export const emps = {
  amara:  { name:'Amara Okonkwo', pos:'Intake & Settlement Worker', dept:'intake', unit:'', manager:'Afef Tayech', start:'2026-05-19', ref:'MAGMA-0041', reviews:['2026-06-18','2026-07-18','2026-08-17'] },
  liam:   { name:'Liam Chen', pos:'Client Services Assistant', dept:'intake', unit:'', manager:'Afef Tayech', start:'2026-06-02', ref:'MAGMA-0040', reviews:['2026-07-02','2026-08-01','2026-08-31'] },
  omar:   { name:'Omar Haddad', pos:'RAP Caseworker', dept:'settlement', unit:'RAP', manager:'Ammar Mansour', start:'2026-06-09', ref:'MAGMA-0042', reviews:['2026-07-09','2026-08-08','2026-09-07'] },
  leila:  { name:'Leila Haidari', pos:'CMS Coordinator', dept:'settlement', unit:'CMS', manager:'Ammar Mansour', start:'2026-05-12', ref:'MAGMA-0039', reviews:['2026-06-11','2026-07-11','2026-08-10'] },
  sofia:  { name:'Sofia Marquez', pos:'Language Instructor', dept:'language', unit:'', manager:'Marie Leblanc', start:'2026-04-14', ref:'MAGMA-0036', reviews:['2026-05-14','2026-06-13','2026-07-13'] },
  noah:   { name:'Noah Williams', pos:'Family & Youth Worker', dept:'cfs', unit:'CNC', manager:'Claire Boudreau', start:'2026-05-26', ref:'MAGMA-0038', reviews:['2026-06-25','2026-07-25','2026-08-24'] },
  ethan:  { name:'Ethan Park', pos:'Finance Assistant', dept:'finance', unit:'', manager:'Don Gaudet', start:'2026-04-07', ref:'MAGMA-0034', reviews:['2026-05-07','2026-06-06','2026-07-06'] },
  priya:  { name:'Priya Sharma', pos:'HR Coordinator', dept:'hr', unit:'', manager:'Lara Falana', start:'2026-05-05', ref:'MAGMA-0035', reviews:['2026-06-04','2026-07-04','2026-08-03'] },
  chloe:  { name:'Chloé Bernard', pos:'Communications Assistant', dept:'marketing', unit:'', manager:'Nadia Comeau', start:'2026-05-20', ref:'MAGMA-0037', reviews:['2026-06-19','2026-07-19','2026-08-18'] },
};

export const roleMeta = {
  hr:       { name:'Lara Falana', roleLabel:'HR · Manager' },
  manager:  { name:'Afef Tayech', roleLabel:'Intake · Manager', dept:'intake' },
  employee: { name:'Amara Okonkwo', roleLabel:'Intake · New hire', empId:'amara', dept:'intake' },
};

export const TODAY = new Date('2026-06-19');

/* ---- pure helpers ---- */
export const ini = (name) => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
export const colorFor = (p) => p>=70?OK:(p>=40?WARN:BLOCKED);
export const isOrgWide = (t) => /cross-cultural/i.test(t) || /organizational onboarding/i.test(t) || /core onboarding/i.test(t);
export const totalOf = (id) => { const d=emps[id].dept; return milestones[d][1].length+milestones[d][2].length+milestones[d][3].length; };
export const doneOf  = (checked,id) => { let n=0; for(const k in checked){ if(checked[k] && k.split('|')[0]===id) n++; } return n; };
export const pctOf   = (checked,id) => { const t=totalOf(id); return t?Math.round(doneOf(checked,id)/t*100):0; };
export const empsIn  = (dept) => Object.keys(emps).filter(id=>emps[id].dept===dept);
export const deptAvg = (checked,dept) => { const ids=empsIn(dept); if(!ids.length) return 0; return Math.round(ids.reduce((a,id)=>a+pctOf(checked,id),0)/ids.length); };
export const fmtDate = (s) => new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});

export function seed() {
  const c = {};
  const fill = (id, plan) => { [1,2,3].forEach(m => { const arr=milestones[emps[id].dept][m]; for(let i=0;i<(plan[m]||0)&&i<arr.length;i++) c[id+'|'+m+'|'+i]=true; }); };
  fill('amara',  {1:7,2:2,3:0});
  fill('liam',   {1:3,2:0,3:0});
  fill('omar',   {1:3,2:0,3:0});
  fill('leila',  {1:5,2:2,3:0});
  fill('sofia',  {1:4,2:2,3:1});
  fill('noah',   {1:5,2:2,3:0});
  fill('ethan',  {1:6,2:4,3:2});
  fill('priya',  {1:3,2:2,3:0});
  fill('chloe',  {1:3,2:1,3:0});
  return c;
}
