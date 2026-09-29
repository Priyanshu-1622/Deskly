/* Deskly presets: departments, role templates, the default team and the
   appearance options used by the character editor. */
(function () {
  const DEFAULT_TEAM = [
    { id: 'aarav', name: 'Aarav Mehta', role: 'Developer', dept: 'Engineering', room: 'Dept_Engineering', deliverable: 'code',
      scope: 'writes and debugs application code, tests, Git work', persona: 'Pragmatic senior engineer; concise, loves clean tests.',
      tasks: ['Write a TypeScript function that validates a signup form and returns clear error messages', 'Build an Express endpoint for password reset with rate limiting', 'Write Jest unit tests for a date-range helper'],
      demoSensitive: { label: 'Push branch and open pull request', action: { kind: 'execute_command', summary: 'git push origin feature/signup-validation and open a PR', risk: 'medium' } },
      look: { height: 1.77, skin: '#c98f68', hair: '#1b1512', hairStyle: 'side', shirt: '#2d3e57', pants: '#2b2f3a', shoes: '#f1f1ef', sole: '#fff', glasses: '#141414', badge: '#2f6fd6', watch: '#222' } },
    { id: 'lena', name: 'Lena Fischer', role: 'Frontend Developer', dept: 'Engineering', room: 'Dept_Engineering', deliverable: 'code',
      scope: 'builds UI components, accessibility, CSS and React code', persona: 'Detail-oriented, cheerful, cares about accessibility.',
      tasks: ['Build an accessible React modal component with focus trapping', 'Write responsive CSS for a pricing table with three tiers', 'Create a React hook that debounces a search input'],
      look: { height: 1.68, skin: '#f1d0b5', hair: '#b98a52', hairStyle: 'ponytail', shirt: '#c7584a', pants: '#23262e', shoes: '#e9e7e2', bust: 1, hipsW: 1.08, shoulders: 0.9, shortSleeves: true, badge: '#2f6fd6', lips: '#b76a62' } },
    { id: 'kenji', name: 'Kenji Tanaka', role: 'DevOps Engineer', dept: 'Engineering', room: 'Dept_Engineering', deliverable: 'code',
      scope: 'infrastructure, CI/CD pipelines, containers and deployments', persona: 'Calm, methodical, always asks about rollback plans.',
      tasks: ['Write a GitHub Actions workflow that runs tests and deploys to staging', 'Write a production Dockerfile for a Node 20 API', 'Draft a runbook for rolling back a bad deploy'],
      demoSensitive: { label: 'Deploy to staging', action: { kind: 'deploy', summary: 'Deploy build #184 to the staging environment', risk: 'medium' } },
      look: { height: 1.74, skin: '#f0cfae', hair: '#1c1c20', hairStyle: 'short', shirt: '#3f4a3c', jacket: null, pants: '#1f2227', shoes: '#2a2a2a', badge: '#2f6fd6' } },
    { id: 'maya', name: 'Maya Okafor', role: 'Product Designer', dept: 'Design', room: 'Dept_Design', deliverable: 'markdown',
      scope: 'UI/UX design, design systems, UX copy, user flows', persona: 'Warm, visual thinker, explains ideas with examples.',
      tasks: ['Write a screen spec and UX copy for an onboarding checklist', 'Propose a colour and type system for a fintech app', 'Critique a checkout flow and list the top 5 UX fixes'],
      look: { height: 1.66, skin: '#8d5a3b', hair: '#1b1512', hairStyle: 'curly', shirt: '#efe6d6', jacket: '#6b4f7a', pants: '#2c2a33', shoes: '#5a3a24', sole: '#3a2a1c', bust: 1, hipsW: 1.08, shoulders: 0.92, lips: '#7c3f3a', badge: '#8a4fbf' } },
    { id: 'mei', name: 'Mei Chen', role: 'Product Manager', dept: 'Design', room: 'Dept_Design', deliverable: 'markdown',
      scope: 'PRDs, roadmaps, prioritisation, user stories', persona: 'Crisp and structured; thinks in outcomes and metrics.',
      tasks: ['Write a one-page PRD for team workspaces', 'Turn these goals into user stories with acceptance criteria: faster onboarding, fewer support tickets', 'Prioritise 8 feature ideas with RICE scores'],
      look: { height: 1.62, skin: '#f3d6bf', hair: '#16120f', hairStyle: 'bob', shirt: '#f4f1ea', jacket: '#2e4b6b', pants: '#2e4b6b', shoes: '#1a1a1a', bust: 1, hipsW: 1.06, shoulders: 0.88, lips: '#b1605a', badge: '#8a4fbf' } },
    { id: 'liam', name: "Liam O'Brien", role: 'Content Writer', dept: 'Marketing', room: 'Dept_Marketing', deliverable: 'markdown',
      scope: 'blog posts, docs, landing copy, newsletters', persona: 'Witty, clear writer; hates jargon.',
      tasks: ['Write a 400-word launch blog post for our AI office app', 'Write landing page hero copy with three variants', 'Draft this month\'s customer newsletter'],
      demoSensitive: { label: 'Publish post to the blog', action: { kind: 'publish', summary: 'Publish "Meet your AI office" to the company blog', risk: 'medium' } },
      look: { height: 1.8, skin: '#f2cdb4', hair: '#7a2e1c', hairStyle: 'short', beard: true, shirt: '#7a8c5a', pants: '#c7b99b', shoes: '#6b4a2e', sole: '#e0d8c8', shortSleeves: true, badge: '#e07b20' } },
    { id: 'priya', name: 'Priya Nair', role: 'Growth Marketer', dept: 'Marketing', room: 'Dept_Marketing', deliverable: 'markdown',
      scope: 'campaigns, SEO, ads, analytics, social', persona: 'Energetic, data-driven, always proposes an experiment.',
      tasks: ['Plan a two-week launch campaign across LinkedIn and email', 'Write 5 LinkedIn posts announcing our beta', 'Suggest 10 SEO keywords and article titles for AI productivity'],
      demoSensitive: { label: 'Schedule the posts', action: { kind: 'publish', summary: 'Schedule 5 LinkedIn posts on the company page', risk: 'low' } },
      look: { height: 1.64, skin: '#b97c55', hair: '#16100c', hairStyle: 'long', shirt: '#d9a13b', pants: '#1f2a3a', shoes: '#1a1a1a', bust: 1, hipsW: 1.08, shoulders: 0.88, lips: '#8a4a42', badge: '#e07b20' } },
    { id: 'elena', name: 'Dr. Elena Petrova', role: 'Research Lead', dept: 'Research', room: 'Dept_Research', deliverable: 'markdown',
      scope: 'research, literature and market analysis, reports', persona: 'Rigorous, cites uncertainty honestly, precise language.',
      tasks: ['Write a research brief on how teams adopt AI agents at work', 'Compare three approaches to on-device speech recognition', 'Summarise risks and mitigations for autonomous AI agents'],
      look: { height: 1.7, skin: '#f5d7c4', hair: '#9d9a95', hairStyle: 'bun', shirt: '#dfe7ee', jacket: '#3b3f4a', pants: '#3b3f4a', shoes: '#191919', glasses: '#6a4a2a', bust: 1, hipsW: 1.06, shoulders: 0.9, lips: '#a2605a', badge: '#2e3e8f' } },
    { id: 'omar', name: 'Omar Haddad', role: 'Research Analyst', dept: 'Research', room: 'Dept_Research', deliverable: 'markdown',
      scope: 'competitor research, market sizing, interviews synthesis', persona: 'Curious and friendly; loves a good spreadsheet.',
      tasks: ['Build a competitor comparison of 5 AI workspace tools', 'Estimate the market size for AI productivity tools for small teams', 'Draft 10 customer interview questions'],
      look: { height: 1.79, skin: '#c69070', hair: '#1b1512', hairStyle: 'short', beard: true, shirt: '#5f7fa6', pants: '#2b2f3a', shoes: '#3a2a1c', badge: '#2e3e8f' } },
    { id: 'grace', name: 'Grace Kim', role: 'Data Analyst', dept: 'Finance', room: 'Dept_Finance', deliverable: 'code',
      scope: 'Python, SQL, spreadsheets, forecasts and dashboards', persona: 'Precise and patient; explains numbers simply.',
      tasks: ['Write a Python script that computes monthly churn from a CSV of subscriptions', 'Write SQL for weekly active users by plan', 'Build a simple 12-month revenue forecast model'],
      look: { height: 1.63, skin: '#f1d3bd', hair: '#1d1714', hairStyle: 'long', shirt: '#3c7a5a', pants: '#26282e', shoes: '#f0efe9', sole: '#fff', bust: 1, hipsW: 1.05, shoulders: 0.88, glasses: '#1a1a1a', lips: '#b0625c', badge: '#2f8a4a' } },
    { id: 'daniel', name: 'Daniel Brooks', role: 'Sales Lead', dept: 'Sales', room: 'Dept_Sales', deliverable: 'markdown',
      scope: 'outreach, proposals, pricing conversations, CRM hygiene', persona: 'Confident, upbeat, straight to the point.',
      tasks: ['Write a cold email to a 50-person agency about Deskly', 'Draft a one-page proposal for a 20-seat pilot', 'Write objection-handling notes for pricing calls'],
      demoSensitive: { label: 'Send the email', action: { kind: 'send_email', summary: 'Send the outreach email to ops@brightagency.example', risk: 'medium' } },
      look: { height: 1.83, skin: '#6b4029', hair: '#1b1512', hairStyle: 'buzz', shirt: '#f0f0ee', jacket: '#23324a', tie: '#8a2432', pants: '#23324a', shoes: '#15120f', sole: '#15120f', watch: '#c9a646', badge: '#c43b3b' } },
    { id: 'fatima', name: 'Fatima Zahra', role: 'Support Specialist', dept: 'Support', room: 'Dept_Support', deliverable: 'markdown',
      scope: 'customer replies, help-centre articles, bug triage', persona: 'Empathetic, calm, turns angry tickets into fans.',
      tasks: ['Reply to a customer who was double-charged this month', 'Write a help-centre article: resetting two-factor auth', 'Triage these tickets and group them by root cause: login loops, slow sync, missing invoices'],
      demoSensitive: { label: 'Send reply to customer', action: { kind: 'send_email', summary: 'Send the refund reply to the customer ticket #4821', risk: 'low' } },
      look: { height: 1.63, skin: '#d49e7a', hair: '#20404a', hairStyle: 'hijab', shirt: '#6c4f8a', pants: '#2b2b33', shoes: '#333', bust: 1, hipsW: 1.08, shoulders: 0.9, headset: true, lips: '#8e4e48', badge: '#c49a1a' } },
    { id: 'hannah', name: 'Hannah Weber', role: 'People Partner (HR)', dept: 'HR', room: 'Dept_HR', deliverable: 'markdown',
      scope: 'hiring, job descriptions, onboarding, policies', persona: 'Kind, organised, clear about fairness and policy.',
      tasks: ['Write a job description for a senior backend engineer', 'Create a first-week onboarding plan for a new designer', 'Draft a remote-work policy in plain English'],
      look: { height: 1.69, skin: '#f0c9a8', hair: '#5b3a22', hairStyle: 'bob', shirt: '#2f8a86', pants: '#2d2f38', shoes: '#4a2f22', sole: '#2a1a12', bust: 1, hipsW: 1.08, shoulders: 0.9, lips: '#b5625d', badge: '#1b8c86' } },
    { id: 'carlos', name: 'Carlos Mendes', role: 'IT Administrator', dept: 'IT', room: 'IT_Helpdesk', deliverable: 'markdown',
      scope: 'accounts, devices, access control, security hygiene', persona: 'Friendly fixer; security-minded, never shares passwords.',
      tasks: ['Write a laptop setup checklist for new hires', 'Draft a password and 2FA policy', 'Plan an access review for all SaaS tools'],
      demoSensitive: { label: 'Grant repository access', action: { kind: 'other', summary: 'Grant the new designer read access to the design repo', risk: 'medium' } },
      look: { height: 1.76, skin: '#d8a882', hair: '#2a2a2e', hairStyle: 'short', shirt: '#55606e', pants: '#2b2f3a', shoes: '#222', shortSleeves: true, watch: '#333', badge: '#555' } },
    { id: 'zara', name: 'Zara Ahmed', role: 'Office Manager', dept: 'Reception', room: 'Reception', deliverable: 'markdown',
      scope: 'scheduling, visitors, office logistics, travel', persona: 'Welcoming, organised, knows everything happening in the office.',
      tasks: ['Plan a team offsite for 15 people in Goa, 2 days', 'Draft this week\'s office announcements', 'Create a visitor check-in process'],
      look: { height: 1.65, skin: '#c48c68', hair: '#1a1411', hairStyle: 'bun', shirt: '#e8dcc8', jacket: '#1f5f5c', pants: '#1f2a33', shoes: '#111', bust: 1, hipsW: 1.08, shoulders: 0.9, lips: '#9a4c46', badge: '#1f5f5c' } },
  ];

  const DEPARTMENTS = {
    Engineering: { room: 'Dept_Engineering', color: '#2f6fd6', seats: 72 },
    Design: { room: 'Dept_Design', color: '#8a4fbf', seats: 16 },
    Marketing: { room: 'Dept_Marketing', color: '#e07b20', seats: 16 },
    Research: { room: 'Dept_Research', color: '#3b4fc4', seats: 24 },
    Finance: { room: 'Dept_Finance', color: '#2f8a4a', seats: 8 },
    Sales: { room: 'Dept_Sales', color: '#c43b3b', seats: 24 },
    Support: { room: 'Dept_Support', color: '#c49a1a', seats: 24 },
    HR: { room: 'Dept_HR', color: '#1b8c86', seats: 10 },
    IT: { room: 'IT_Helpdesk', color: '#5a6472', seats: 2 },
    Reception: { room: 'Reception', color: '#1f7f7a', seats: 2 }
  };
  // one template per role, taken from the default team
  const ROLES = {};
  for (const t of DEFAULT_TEAM) ROLES[t.role] = { role: t.role, dept: t.dept, scope: t.scope, persona: t.persona, instructions: DesklyRolePrompts.forRole(t.role), tasks: t.tasks, deliverable: t.deliverable };
  ROLES['Custom role'] = { role: 'Custom role', dept: 'Engineering', scope: 'whatever you describe', persona: 'Helpful, clear and proactive.', instructions: DesklyRolePrompts.forRole('Custom role'), tasks: [] };

  const LOOKS = {
    skins: ['#f5d7c4', '#f1d0b5', '#e7bb98', '#d8a882', '#c98f68', '#b97c55', '#8d5a3b', '#6b4029'],
    hairColors: ['#16120f', '#3a2618', '#5b3a22', '#8a5a33', '#b98a52', '#d9b77e', '#7a2e1c', '#9d9a95', '#20404a'],
    hairStyles: ['short', 'side', 'buzz', 'curly', 'bob', 'long', 'bun', 'ponytail', 'hijab', 'bald'],
    outfits: ['#2d3e57', '#c7584a', '#3f4a3c', '#efe6d6', '#7a8c5a', '#d9a13b', '#5f7fa6', '#3c7a5a', '#6c4f8a', '#2f8a86', '#55606e', '#f0f0ee'],
    pants: ['#23262e', '#2b2f3a', '#1f2a3a', '#c7b99b', '#3b3f4a', '#2c2a33'],
    shoes: ['#1a1a1a', '#f1f1ef', '#5a3a24', '#333333']
  };
  const newId = () => 'emp_' + Math.random().toString(36).slice(2, 8);
  function makeEmployee(role = 'Developer', overrides = {}) {
    const R = ROLES[role] || ROLES['Custom role'];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const fem = Math.random() < 0.5;
    return {
      id: newId(), name: overrides.name || 'New teammate', role: R.role, dept: R.dept, scope: R.scope, persona: R.persona, instructions: R.instructions,
      tasks: R.tasks.slice(), deliverable: R.deliverable || 'markdown', provider: 'demo', model: '', baseUrl: '',
      look: {
        height: fem ? 1.64 + Math.random() * 0.08 : 1.72 + Math.random() * 0.1, skin: pick(LOOKS.skins), hair: pick(LOOKS.hairColors),
        hairStyle: fem ? pick(['bob', 'long', 'bun', 'ponytail', 'curly']) : pick(['short', 'side', 'buzz', 'curly']),
        shirt: pick(LOOKS.outfits), pants: pick(LOOKS.pants), shoes: pick(LOOKS.shoes), body: fem ? 'feminine' : 'masculine'
      },
      ...overrides
    };
  }
  // normalise a look into Human.build options
  function lookToRig(l) {
    const fem = l.body === 'feminine' || (l.bust && !l.body);
    return { ...l, bust: fem ? 1 : 0, hipsW: fem ? 1.08 : 1, shoulders: fem ? 0.9 : 1, lips: l.lips || (fem ? '#a65c56' : '#a45a52') };
  }
  function defaultTeam() {
    return DEFAULT_TEAM.map(t => ({
      id: t.id, name: t.name, role: t.role, dept: t.dept, scope: t.scope, persona: t.persona, instructions: DesklyRolePrompts.forRole(t.role), tasks: t.tasks.slice(),
      deliverable: t.deliverable, provider: 'demo', model: '', baseUrl: '',
      look: { ...t.look, body: t.look.bust ? 'feminine' : 'masculine' }
    }));
  }
  window.DesklyPresets = { DEPARTMENTS, ROLES, LOOKS, makeEmployee, defaultTeam, lookToRig };
})();
