/* Practical, editable capabilities for each employee role. These describe what
   the agent can draw on during work; they are not fictional career histories. */
(function (root) {
  const RESUMES = {
    Developer: { skills: ['Debugging', 'API design', 'Automated testing'], knowledge: ['Software architecture', 'Security basics', 'Code review'], tools: ['JavaScript', 'Git', 'SQL'] },
    'Frontend Developer': { skills: ['Accessible UI', 'Responsive layouts', 'Component design'], knowledge: ['Browser behavior', 'Design systems', 'Web performance'], tools: ['HTML/CSS', 'JavaScript', 'React'] },
    'DevOps Engineer': { skills: ['CI/CD', 'Deployment planning', 'Incident response'], knowledge: ['Containers', 'Infrastructure', 'Rollback strategy'], tools: ['Docker', 'GitHub Actions', 'Shell'] },
    'Product Designer': { skills: ['User flows', 'Interaction design', 'UX writing'], knowledge: ['Accessibility', 'Design systems', 'Usability research'], tools: ['Wireframes', 'Prototypes', 'Design specs'] },
    'Product Manager': { skills: ['Prioritization', 'Requirements', 'Roadmapping'], knowledge: ['User needs', 'Product metrics', 'Delivery tradeoffs'], tools: ['PRDs', 'User stories', 'RICE'] },
    'Content Writer': { skills: ['Editing', 'Brand voice', 'Long-form writing'], knowledge: ['Audience intent', 'Content strategy', 'Editorial quality'], tools: ['Briefs', 'Markdown', 'Style guides'] },
    'Growth Marketer': { skills: ['Campaign planning', 'Experiment design', 'SEO'], knowledge: ['Acquisition funnels', 'Attribution', 'Audience segments'], tools: ['Analytics', 'Keyword research', 'A/B tests'] },
    'Research Lead': { skills: ['Evidence review', 'Synthesis', 'Research design'], knowledge: ['Source quality', 'Uncertainty', 'Research ethics'], tools: ['Literature reviews', 'Interview guides', 'Reports'] },
    'Research Analyst': { skills: ['Competitive analysis', 'Market sizing', 'Interview synthesis'], knowledge: ['Research methods', 'Source quality', 'Market categories'], tools: ['Spreadsheets', 'Comparison matrices', 'Briefs'] },
    'Data Analyst': { skills: ['Data cleaning', 'SQL analysis', 'Forecasting'], knowledge: ['Metrics definitions', 'Statistics', 'Data quality'], tools: ['Python', 'SQL', 'Spreadsheets'] },
    'Sales Lead': { skills: ['Discovery', 'Proposal writing', 'Objection handling'], knowledge: ['Buyer needs', 'Pricing', 'Pipeline stages'], tools: ['CRM notes', 'Outreach drafts', 'Call briefs'] },
    'Support Specialist': { skills: ['Issue triage', 'Customer writing', 'Bug reproduction'], knowledge: ['Product behavior', 'Escalation paths', 'Support policy'], tools: ['Ticket summaries', 'Help articles', 'Bug reports'] },
    'People Partner (HR)': { skills: ['Hiring plans', 'Onboarding', 'Policy drafting'], knowledge: ['Role design', 'Fairness', 'Team processes'], tools: ['Job descriptions', 'Checklists', 'Policy docs'] },
    'IT Administrator': { skills: ['Access reviews', 'Device setup', 'Security hygiene'], knowledge: ['Least privilege', 'Account recovery', 'Audit trails'], tools: ['Runbooks', 'Inventory', 'Checklists'] },
    'Office Manager': { skills: ['Scheduling', 'Coordination', 'Follow-up'], knowledge: ['Team availability', 'Office logistics', 'Decision tracking'], tools: ['Calendars', 'Agendas', 'Checklists'] },
    'Custom role': { skills: [], knowledge: [], tools: [] }
  };
  const clean = values => (Array.isArray(values) ? values : String(values || '').split(/[,\n]/)).map(x => String(x).trim()).filter(Boolean).slice(0, 12);
  const forRole = role => {
    const r = RESUMES[role] || RESUMES['Custom role'];
    return { skills: [...r.skills], knowledge: [...r.knowledge], tools: [...r.tools] };
  };
  const forEmployee = employee => {
    const base = forRole(employee?.role);
    const saved = employee?.resume || {};
    return { skills: clean(saved.skills ?? base.skills), knowledge: clean(saved.knowledge ?? base.knowledge), tools: clean(saved.tools ?? base.tools) };
  };
  const api = { forRole, forEmployee, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DesklyResumes = api;
})(globalThis);
