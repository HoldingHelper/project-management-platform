import {
  Department,
  Team,
  Person,
  Project,
  Task,
  NotificationItem,
  AutomationRule,
  ChatMessage,
  DocFile,
  DocBlock,
  TaskPriority,
  TaskType,
  TaskStatus,
} from './types';
import { ME, slug } from './tokens';

export const CEO = 'Nora Castellanos';

export const DEPTS: Department[] = [
  { id: 'eng', name: 'Engineering', head: 'Mara Lindqvist', headRole: 'VP Engineering' },
  { id: 'ops', name: 'Operations', head: 'Hana Novak', headRole: 'Head of Operations' },
  { id: 'com', name: 'Commercial', head: 'Daniel Okafor', headRole: 'Head of Commercial' },
  { id: 'dsn', name: 'Design', head: 'Lena Hoffmann', headRole: 'Head of Design' },
  { id: 'mkt', name: 'Marketing', head: 'Zoe Laurent', headRole: 'Head of Marketing' },
];

export const TEAMS: Team[] = [
  {
    id: 'plt',
    name: 'Platform',
    dept: 'eng',
    lead: 'Jonas Brandt',
    role: 'Engineer',
    members: ['Sofia Marchetti', 'Kwame Mensah', 'Ravi Kapoor', ME],
    perf: [6, 8, 7, 9, 11, 10, 12, 13],
    onTime: 92,
    cycle: 2.4,
  },
  {
    id: 'dat',
    name: 'Data Services',
    dept: 'eng',
    lead: 'Tomás Ferreira',
    role: 'Data Engineer',
    members: ['Mei Chen', 'Luis Ortega', 'Elif Demir'],
    perf: [4, 5, 5, 6, 4, 5, 6, 7],
    onTime: 85,
    cycle: 3.1,
  },
  {
    id: 'qa',
    name: 'Quality Assurance',
    dept: 'ops',
    lead: 'Aiko Tanaka',
    role: 'QA Specialist',
    members: ['Ben Carter', 'Nadia Haddad'],
    perf: [7, 6, 8, 5, 4, 5, 3, 4],
    onTime: 71,
    cycle: 4.2,
  },
  {
    id: 'wf',
    name: 'Workforce',
    dept: 'ops',
    lead: 'Priya Raman',
    role: 'Coordinator',
    members: ['Oskar Nilsson', 'Julia Becker'],
    perf: [3, 4, 4, 5, 5, 6, 5, 6],
    onTime: 88,
    cycle: 2.9,
  },
  {
    id: 'se',
    name: 'Solutions Engineering',
    dept: 'com',
    lead: 'Clara Weiss',
    role: 'Solutions Engineer',
    members: ['Yusuf Aydin', 'Pieter de Vries'],
    perf: [5, 6, 7, 6, 8, 7, 9, 8],
    onTime: 90,
    cycle: 2.2,
  },
  {
    id: 'sal',
    name: 'Sales',
    dept: 'com',
    lead: 'Arjun Mehta',
    role: 'Account Executive',
    members: ['Marta Kowalska'],
    perf: [2, 3, 2, 3, 2, 1, 2, 1],
    onTime: 64,
    cycle: 5.0,
  },
  {
    id: 'pd',
    name: 'Product Design',
    dept: 'dsn',
    lead: 'Theo Martin',
    role: 'Product Designer',
    members: ['Ines Silva'],
    perf: [4, 4, 5, 5, 6, 6, 5, 7],
    onTime: 94,
    cycle: 1.9,
  },
  {
    id: 'gro',
    name: 'Growth',
    dept: 'mkt',
    lead: "Sam O'Neill",
    role: 'Growth Marketer',
    members: ['Hugo Laine'],
    perf: [3, 3, 4, 5, 4, 6, 5, 5],
    onTime: 80,
    cycle: 3.4,
  },
];

export function buildPeople(): Person[] {
  const o: Person[] = [];
  const add = (
    name: string,
    role: string,
    dept: string,
    team: string | null,
    mgr: string | null,
    kind: 'exec' | 'head' | 'lead' | 'member'
  ) => {
    o.push({
      name,
      role,
      dept,
      team,
      mgr,
      kind,
      email: `${slug(name)}@projectplatform.io`,
      presence: name === ME ? 'online' : (['online', 'away', 'online', 'offline'][o.length % 4] as any),
      invited: false,
    });
  };

  add(CEO, 'Chief Executive Officer', 'exec', null, null, 'exec');
  DEPTS.forEach((d) => add(d.head, d.headRole, d.id, null, CEO, 'head'));
  TEAMS.forEach((t) => {
    const d = DEPTS.find((dept) => dept.id === t.dept);
    add(t.lead, 'Team Lead', t.dept, t.id, d ? d.head : null, 'lead');
    t.members.forEach((m) =>
      add(m, m === ME ? 'Administrator' : t.role, t.dept, t.id, t.lead, 'member')
    );
  });
  return o;
}

export const PARTS = ['Tech', 'Operations', 'Business', 'Marketing', 'Sales', 'Design'];

export const LEVELS: [string, string][] = [
  ['Inter-team', 'Projects inside one partition'],
  ['Inter-partition', 'Cross-partition projects'],
  ['Organization', 'Company-wide projects'],
];

export const PROJECTS: Project[] = [
  {
    id: 'P-101',
    name: 'Workforce portal v2',
    owner: 'Jonas Brandt',
    partition: 'Tech',
    level: 'Inter-team',
    progress: 62,
    status: 'On track',
    priority: 'High',
    updated: 'Sep 23',
    s: 0,
    e: 63,
    m: 45,
    team: 'plt',
    desc: 'Self-serve portal for schedules, timesheets and SSO sign-in.',
  },
  {
    id: 'P-102',
    name: 'Annotation QA pipeline',
    owner: 'Aiko Tanaka',
    partition: 'Operations',
    level: 'Inter-partition',
    progress: 41,
    status: 'At risk',
    priority: 'Critical',
    updated: 'Sep 22',
    s: 7,
    e: 56,
    m: 35,
    team: 'qa',
    desc: 'Sampling, scoring and escalation for every annotation batch.',
    risk: 'Sampling thresholds not agreed; reviewer capacity short by two.',
  },
  {
    id: 'P-103',
    name: 'Q4 capacity plan',
    owner: 'Priya Raman',
    partition: 'Operations',
    level: 'Organization',
    progress: 28,
    status: 'On track',
    priority: 'Medium',
    updated: 'Sep 21',
    s: 14,
    e: 80,
    m: 63,
    team: 'wf',
    desc: 'Headcount and throughput plan for committed Q4 volume.',
  },
  {
    id: 'P-104',
    name: 'Client onboarding kit',
    owner: 'Clara Weiss',
    partition: 'Sales',
    level: 'Inter-partition',
    progress: 75,
    status: 'On track',
    priority: 'High',
    updated: 'Sep 20',
    s: 0,
    e: 42,
    m: 28,
    team: 'se',
    desc: 'Kickoff deck, email sequence and scoping template for new clients.',
  },
  {
    id: 'P-105',
    name: 'Pricing model refresh',
    owner: 'Arjun Mehta',
    partition: 'Business',
    level: 'Organization',
    progress: 15,
    status: 'Blocked',
    priority: 'High',
    updated: 'Sep 19',
    s: 14,
    e: 70,
    m: 49,
    team: 'sal',
    dep: 'P-103',
    desc: 'New price bands for annotation and evaluation work.',
    risk: 'Waiting on the Q4 capacity plan and finance data.',
  },
  {
    id: 'P-106',
    name: 'Design system audit',
    owner: 'Theo Martin',
    partition: 'Design',
    level: 'Inter-team',
    progress: 88,
    status: 'On track',
    priority: 'Low',
    updated: 'Sep 18',
    s: 0,
    e: 35,
    m: 21,
    team: 'pd',
    desc: 'Token and component audit across internal tools.',
  },
  {
    id: 'P-107',
    name: 'Autumn campaign',
    owner: "Sam O'Neill",
    partition: 'Marketing',
    level: 'Inter-team',
    progress: 54,
    status: 'At risk',
    priority: 'Medium',
    updated: 'Sep 17',
    s: 7,
    e: 49,
    m: 42,
    team: 'gro',
    desc: 'Landing page, paid social and webinar for the autumn launch.',
    risk: 'Paid social budget not signed off.',
  },
  {
    id: 'P-108',
    name: 'Data warehouse migration',
    owner: 'Tomás Ferreira',
    partition: 'Tech',
    level: 'Inter-partition',
    progress: 0,
    status: 'Planned',
    priority: 'Medium',
    updated: 'Sep 16',
    s: 35,
    e: 91,
    m: 70,
    team: 'dat',
    desc: 'Move reporting and task data to the new warehouse.',
  },
  {
    id: 'P-109',
    name: 'SSO rollout',
    owner: 'Kwame Mensah',
    partition: 'Tech',
    level: 'Organization',
    progress: 100,
    status: 'Done',
    priority: 'High',
    updated: 'Sep 5',
    s: 0,
    e: 21,
    m: 14,
    team: 'plt',
    desc: 'Single sign-on for every workspace member.',
  },
];

export const T = (
  id: string,
  title: string,
  project: string | null,
  partition: string,
  labels: string[],
  status: TaskStatus,
  type: TaskType,
  priority: TaskPriority,
  assignees: string[],
  s: number | null,
  e: number | null,
  source: string,
  desc: string = ''
): Task => ({
  id,
  title,
  project,
  partition,
  labels,
  status,
  type,
  priority,
  assignees,
  s,
  e,
  source,
  desc,
});

export const TASKS: Task[] = [
  T(
    'T-231',
    'Set up SSO callback handling',
    'P-101',
    'Tech',
    ['backend', 'auth'],
    'In progress',
    'Feature',
    'High',
    [ME, 'Ravi Kapoor'],
    20,
    25,
    'GitHub',
    'Handle the identity provider callback, map claims to workspace roles and create the session.'
  ),
  T(
    'T-232',
    'Fix timezone offset in timesheets',
    'P-101',
    'Tech',
    ['bug', 'frontend'],
    'In review',
    'Bug',
    'High',
    ['Sofia Marchetti'],
    17,
    23,
    'GitHub',
    'Entries logged after 22:00 UTC appear on the next day for users in the Americas.'
  ),
  T(
    'T-233',
    'Define QA sampling thresholds',
    'P-102',
    'Operations',
    ['process'],
    'Blocked',
    'Research',
    'Critical',
    ['Aiko Tanaka', ME],
    14,
    24,
    'In-app',
    'Agree sample rates per batch size and annotator tenure with Solutions Engineering.'
  ),
  T(
    'T-234',
    'Reviewer dashboard wireframes',
    'P-102',
    'Design',
    ['ux'],
    'To do',
    'Feature',
    'Medium',
    ['Ines Silva'],
    27,
    32,
    'In-app'
  ),
  T(
    'T-235',
    'Import headcount forecast',
    'P-103',
    'Operations',
    ['data'],
    'In progress',
    'Chore',
    'Medium',
    ['Oskar Nilsson'],
    21,
    29,
    'In-app'
  ),
  T(
    'T-236',
    'Draft onboarding email sequence',
    'P-104',
    'Sales',
    ['content'],
    'Done',
    'Feature',
    'Medium',
    ['Yusuf Aydin'],
    9,
    16,
    'In-app'
  ),
  T(
    'T-237',
    'Kickoff deck template',
    'P-104',
    'Sales',
    ['content', 'design'],
    'In review',
    'Chore',
    'Low',
    ['Pieter de Vries', 'Theo Martin'],
    18,
    24,
    'In-app'
  ),
  T(
    'T-238',
    'Competitor pricing research',
    'P-105',
    'Business',
    ['research'],
    'Blocked',
    'Research',
    'High',
    ['Marta Kowalska'],
    13,
    26,
    'In-app'
  ),
  T(
    'T-239',
    'Audit button and input tokens',
    'P-106',
    'Design',
    ['design-system'],
    'Done',
    'Chore',
    'Low',
    ['Theo Martin'],
    7,
    15,
    'GitHub'
  ),
  T(
    'T-240',
    'Landing page copy',
    'P-107',
    'Marketing',
    ['content'],
    'In progress',
    'Feature',
    'Medium',
    ['Hugo Laine'],
    19,
    28,
    'In-app'
  ),
  T(
    'T-241',
    'Paid social budget sign-off',
    'P-107',
    'Marketing',
    ['finance'],
    'To do',
    'Chore',
    'High',
    ["Sam O'Neill", ME],
    24,
    29,
    'In-app'
  ),
  T(
    'T-242',
    'Warehouse schema mapping',
    'P-108',
    'Tech',
    ['data', 'backend'],
    'Backlog',
    'Research',
    'Medium',
    ['Mei Chen'],
    null,
    null,
    'GitHub'
  ),
  T(
    'T-243',
    'Rate limit the public API',
    null,
    'Tech',
    ['backend'],
    'Backlog',
    'Feature',
    'Low',
    [],
    null,
    null,
    'GitHub'
  ),
  T(
    'T-244',
    'Retire legacy login page',
    'P-109',
    'Tech',
    ['frontend'],
    'Done',
    'Chore',
    'Low',
    ['Kwame Mensah'],
    0,
    4,
    'GitHub'
  ),
  T(
    'T-245',
    'Load test SSO endpoints',
    'P-101',
    'Tech',
    ['backend', 'perf'],
    'To do',
    'Chore',
    'Medium',
    [ME],
    26,
    31,
    'GitHub'
  ),
  T(
    'T-246',
    'Escalation rules for low scores',
    'P-102',
    'Operations',
    ['process'],
    'In progress',
    'Feature',
    'High',
    ['Nadia Haddad'],
    20,
    27,
    'In-app'
  ),
];

export const NOTIFS: NotificationItem[] = [
  {
    id: 'n1',
    type: 'mention',
    icon: 'chat',
    title: 'Aiko Tanaka mentioned you',
    detail: '“Can you confirm the thresholds by Friday?” on T-233',
    project: 'P-102',
    time: '12 min ago',
    unread: true,
    task: 'T-233',
  },
  {
    id: 'n2',
    type: 'assigned',
    icon: 'userplus',
    title: 'You were assigned T-245',
    detail: 'Load test SSO endpoints',
    project: 'P-101',
    time: '1 h ago',
    unread: true,
    task: 'T-245',
  },
  {
    id: 'n3',
    type: 'blocked',
    icon: 'x',
    title: 'T-238 is blocked',
    detail: 'Competitor pricing research is waiting on finance data',
    project: 'P-105',
    time: '3 h ago',
    unread: true,
    task: 'T-238',
  },
  {
    id: 'n4',
    type: 'due',
    icon: 'timeline',
    title: 'T-241 is due in 5 days',
    detail: 'Paid social budget sign-off',
    project: 'P-107',
    time: '5 h ago',
    unread: true,
    task: 'T-241',
  },
  {
    id: 'n5',
    type: 'review',
    icon: 'check',
    title: 'T-232 is ready for review',
    detail: 'Sofia Marchetti requested your review',
    project: 'P-101',
    time: '6 h ago',
    unread: false,
    task: 'T-232',
  },
  {
    id: 'n6',
    type: 'automation',
    icon: 'automations',
    title: 'Automation ran: Notify owner on blocked',
    detail: '2 project owners notified',
    project: '',
    time: 'Yesterday',
    unread: false,
  },
  {
    id: 'n7',
    type: 'github',
    icon: 'git',
    title: '14 issues imported from GitHub',
    detail: 'platform/workforce-portal',
    project: 'P-101',
    time: 'Yesterday',
    unread: false,
  },
  {
    id: 'n8',
    type: 'invite',
    icon: 'userplus',
    title: 'Hugo Laine joined Growth',
    detail: 'Accepted your invitation',
    project: '',
    time: 'Sep 21',
    unread: false,
  },
];

export const ACTS: [string, string, string, string, string, string][] = [
  ['Today', 'Sofia Marchetti', 'moved T-232 to', 'In review', '09:41', 'Tasks'],
  ['Today', 'Jonas Brandt', 'updated progress on', 'P-101 Workforce portal v2', '09:12', 'Projects'],
  ['Today', 'GitHub', 'imported 3 issues into', 'P-101', '08:30', 'Integrations'],
  ['Today', 'Aiko Tanaka', 'marked T-233 as', 'Blocked', '08:05', 'Tasks'],
  ['Yesterday', 'Clara Weiss', 'completed', 'T-236 Draft onboarding email sequence', '17:20', 'Tasks'],
  ['Yesterday', 'Platform Admin', 'invited', 'Hugo Laine to Growth', '15:02', 'People'],
  ['Yesterday', 'Arjun Mehta', 'set', 'P-105 to Blocked', '11:48', 'Projects'],
  ['Sep 22', 'Theo Martin', 'completed', 'T-239 Audit button and input tokens', '16:10', 'Tasks'],
  ['Sep 22', 'Priya Raman', 'created project', 'P-103 Q4 capacity plan', '10:00', 'Projects'],
  ['Sep 22', 'Google Workspace', 'synced', '27 accounts', '07:00', 'Integrations'],
];

export const AUTOS: AutomationRule[] = [
  {
    id: 'a1',
    name: 'Notify owner on blocked',
    when: 'A task moves to Blocked',
    then: 'Notify the project owner and post in the project channel',
    scope: 'All projects',
    runs: 18,
    last: '3 h ago',
    on: true,
  },
  {
    id: 'a2',
    name: 'Auto-assign reviewer',
    when: 'A task moves to In review',
    then: 'Assign the team lead as reviewer',
    scope: 'Tech, Design',
    runs: 42,
    last: '5 h ago',
    on: true,
  },
  {
    id: 'a3',
    name: 'GitHub issue import',
    when: 'An issue is opened in a linked repository',
    then: 'Create a Backlog task with the issue labels',
    scope: '3 repositories',
    runs: 126,
    last: '1 h ago',
    on: true,
  },
  {
    id: 'a4',
    name: 'Due date reminder',
    when: 'A task is due in 48 hours',
    then: 'Remind every assignee',
    scope: 'All projects',
    runs: 57,
    last: 'Today 08:00',
    on: true,
  },
  {
    id: 'a5',
    name: 'Close project at 100%',
    when: 'All tasks in a project are Done',
    then: 'Mark the project Done and archive its channel',
    scope: 'All projects',
    runs: 4,
    last: 'Sep 5',
    on: false,
  },
  {
    id: 'a6',
    name: 'Weekly digest',
    when: 'Every Monday at 09:00',
    then: 'Email each lead a summary of their team’s work',
    scope: 'All teams',
    runs: 12,
    last: 'Sep 21',
    on: true,
  },
];

export const MSGS: Record<string, ChatMessage[]> = {
  'P-101': [
    {
      who: 'Jonas Brandt',
      t: '09:12',
      text: 'SSO callback is merged behind a flag. Load testing is next.',
    },
    {
      who: 'Ravi Kapoor',
      t: '09:20',
      text: 'I can pair on T-245 this afternoon.',
    },
    {
      who: ME,
      t: '09:24',
      text: 'Great, I’ll join at 14:00.',
    },
  ],
  'P-102': [
    {
      who: 'Aiko Tanaka',
      t: '08:05',
      text: 'Blocking T-233 until SE confirms the sample rates.',
    },
    {
      who: 'Nadia Haddad',
      t: '08:30',
      text: 'Escalation rules draft is in the doc.',
    },
  ],
  'dm:Aiko Tanaka': [
    {
      who: 'Aiko Tanaka',
      t: 'Yesterday',
      text: 'Can you confirm the thresholds by Friday?',
    },
  ],
};

export const PERMS = [
  'View projects and tasks',
  'Create and edit tasks',
  'Run the AI generator',
  'Manage projects',
  'Manage teams and org chart',
  'Configure automations',
  'Manage integrations',
  'Manage users and roles',
];

export const ROLES = ['Admin', 'Manager', 'Member', 'Viewer'];

export function initPerms(): Record<string, Record<string, boolean>> {
  const o: Record<string, Record<string, boolean>> = {};
  PERMS.forEach((p, i) => {
    o[p] = {
      Admin: true,
      Manager: i < 6,
      Member: i < 3,
      Viewer: i < 1,
    };
  });
  return o;
}

export const AI_PH: [string, string[]][] = [
  [
    'Discover and scope',
    ['Interview stakeholders', 'Write the project brief', 'Agree success metrics'],
  ],
  [
    'Build',
    [
      'Draft the delivery plan',
      'Build the first version',
      'Review with stakeholders',
      'Fix review findings',
    ],
  ],
  [
    'Launch and review',
    ['Prepare the launch checklist', 'Launch to first users', 'Run the retrospective'],
  ],
];

export const Hb = (t: string): DocBlock => ({ k: 'h', t });
export const Pb = (t: string): DocBlock => ({ k: 'p', t });
export const TDb = (items: [string, boolean][]): DocBlock => ({ k: 'todo', items });
export const COb = (tone: 'info' | 'warn', t: string): DocBlock => ({
  k: 'callout',
  tone,
  t,
});
export const EMb = (id: string, full?: boolean): DocBlock => ({
  k: 'embed',
  id,
  full,
});

export const DOCS: DocFile[] = [
  {
    id: 'd1',
    title: 'Onboarding checklist for new team members',
    type: 'note',
    folder: 'handbook',
    team: 'wf',
    owner: 'Priya Raman',
    updated: 'Sep 22',
    status: 'Published',
    tags: ['onboarding', 'people'],
    links: ['d7', 'd8'],
    summary: 'Everything a new hire and their lead need to complete in the first two weeks.',
    blocks: [
      Pb(
        'Everything a new hire and their lead need to complete in the first two weeks. Work through it together and tick items off as you go.'
      ),
      Hb('Before day one'),
      TDb([
        ['Confirm the start date and equipment', true],
        ['Request accounts for every tool', true],
        ['Assign an onboarding buddy from the same team', false],
      ]),
      Hb('Week one'),
      Pb(
        'Complete access setup, read your team’s notes in this vault and shadow two working sessions.'
      ),
      EMb('f6'),
      Hb('Week two'),
      Pb(
        'Take ownership of a first small task and hold a check-in with your lead at the end of the week.'
      ),
      COb('info', 'Stuck on anything? Ask your buddy first, then your lead.'),
    ],
  },
  {
    id: 'd2',
    title: 'Incident response runbook',
    type: 'note',
    folder: 'eng',
    team: 'plt',
    owner: 'Kwame Mensah',
    updated: 'Sep 19',
    status: 'Published',
    tags: ['runbook', 'on-call'],
    links: ['d7'],
    summary: 'How to declare, handle and close out a production incident.',
    blocks: [
      COb(
        'warn',
        'Sev-1 incidents page the on-call engineer immediately. Do not wait to confirm the root cause.'
      ),
      Hb('Declare'),
      Pb(
        'Anyone can declare an incident in the incidents channel. State the impact, the affected service and who is investigating.'
      ),
      EMb('f2'),
      Hb('Mitigate'),
      Pb('The on-call engineer owns mitigation. Roll back first, investigate second.'),
      Hb('Review'),
      Pb('Every Sev-1 and Sev-2 gets a written review within five working days, filed in this folder.'),
    ],
  },
  {
    id: 'd3',
    title: 'Annotation quality guidelines v3',
    type: 'note',
    folder: 'ops',
    team: 'qa',
    owner: 'Aiko Tanaka',
    updated: 'Sep 18',
    status: 'Review',
    tags: ['quality', 'guideline'],
    links: ['d6'],
    summary: 'Scoring rubric and review rules for annotation projects.',
    blocks: [
      Hb('Rubric'),
      Pb(
        'Each item is scored on accuracy, completeness and adherence to instructions on a 1–5 scale. The full rubric is attached below.'
      ),
      EMb('f4'),
      Hb('Sampling'),
      Pb(
        'Reviewers sample 10% of each batch, rising to 25% for new annotators in their first week.'
      ),
      Hb('Escalation'),
      Pb('Items scored 2 or below are returned with a written note and re-reviewed after correction.'),
    ],
  },
  {
    id: 'd4',
    title: 'Client project scoping template',
    type: 'note',
    folder: 'com',
    team: 'se',
    owner: 'Clara Weiss',
    updated: 'Sep 15',
    status: 'Published',
    tags: ['template', 'clients'],
    links: ['f9', 'd3'],
    summary: 'The structure every scoping document follows before it goes to a client.',
    blocks: [
      Hb('Discovery'),
      Pb('Record the client’s goal, data types, volume and deadline.'),
      Hb('Project design'),
      Pb(
        'Describe the task, quality targets and review pipeline. Link the quality guidelines rather than copying them.'
      ),
      Hb('Before sending'),
      TDb([
        ['Ramp-up plan attached', false],
        ['Pricing sheet attached', false],
        ['Assumptions listed', false],
        ['Reviewed by a second solutions engineer', false],
      ]),
    ],
  },
  {
    id: 'd5',
    title: 'Design review process',
    type: 'note',
    folder: 'dsn',
    team: 'pd',
    owner: 'Theo Martin',
    updated: 'Sep 12',
    status: 'Draft',
    tags: ['process', 'design'],
    links: ['f8'],
    summary: 'When and how product designs are reviewed before build.',
    blocks: [
      Hb('When to review'),
      Pb('Any change to a shared component or a new flow goes through review.'),
      Hb('Format'),
      Pb('A 30-minute session with the designer, a design peer and the engineering lead. Sessions are recorded.'),
      EMb('f5'),
      Hb('Outcome'),
      Pb('Decisions and open questions are recorded on the design file within a day.'),
    ],
  },
  {
    id: 'd6',
    title: 'Workforce capacity planning',
    type: 'note',
    folder: 'ops',
    team: 'wf',
    owner: 'Priya Raman',
    updated: 'Sep 10',
    status: 'Published',
    tags: ['planning', 'capacity'],
    links: ['d3', 'd8'],
    summary: 'Weekly planning of capacity against committed project volume.',
    blocks: [
      Hb('Inputs'),
      Pb(
        'Committed volume per project, current headcount and average throughput per person. The live model is below; edit any cell.'
      ),
      EMb('f3'),
      Hb('Weekly cycle'),
      Pb('Capacity is reviewed every Monday. Gaps above 10% trigger a recruiting request.'),
      EMb('f7'),
      Hb('Reporting'),
      Pb('The plan is shared with Solutions Engineering and project leads by Tuesday.'),
    ],
  },
  {
    id: 'd7',
    title: 'Access and permissions policy',
    type: 'note',
    folder: 'handbook',
    team: 'plt',
    owner: 'Mara Lindqvist',
    updated: 'Sep 4',
    status: 'Published',
    tags: ['policy', 'security'],
    links: [],
    summary: 'Who can access which systems, and how access is granted and removed.',
    blocks: [
      Hb('Roles'),
      Pb(
        'Admins manage teams and workspace settings. Managers manage their team’s members and projects. Members work on tasks.'
      ),
      Hb('Granting access'),
      Pb('Access requests go through the team lead and are approved by an admin.'),
      Hb('Offboarding'),
      Pb('Access is removed on the person’s last working day.'),
    ],
  },
  {
    id: 'd8',
    title: 'Quarterly planning playbook',
    type: 'note',
    folder: 'handbook',
    team: 'wf',
    owner: 'Priya Raman',
    updated: 'Aug 28',
    status: 'Review',
    tags: ['planning'],
    links: ['d6'],
    summary: 'How teams set and review goals each quarter.',
    blocks: [
      Hb('Timeline'),
      Pb('Planning starts three weeks before the quarter ends. This quarter’s kickoff deck is below.'),
      EMb('f1'),
      Hb('Goals'),
      Pb('Each team sets up to three goals with one owner each.'),
      Hb('Review'),
      Pb('Goals are scored at the end of the quarter and summarized in this vault.'),
    ],
  },
  {
    id: 'f10',
    title: 'Weekly sync — Sep 22',
    type: 'note',
    folder: 'meet',
    team: 'wf',
    owner: ME,
    updated: 'Sep 22',
    status: 'Published',
    tags: ['meeting'],
    links: ['d6', 'd2', 'd5'],
    summary: 'Leads sync: capacity gap, incident follow-ups and design review dates.',
    blocks: [
      Hb('Agenda'),
      TDb([
        ['Q4 capacity gap', true],
        ['Incident follow-ups', true],
        ['Design review schedule', false],
      ]),
      Hb('Decisions'),
      Pb('Open two annotator roles for Quality Assurance. Move the reviewer dashboard review to Thursday.'),
      Hb('Action items'),
      TDb([
        ['Priya posts the roles by Wednesday', false],
        ['Kwame files the SSO incident review', false],
      ]),
    ],
  },
  {
    id: 'f1',
    title: 'Q4 planning kickoff',
    type: 'slides',
    folder: 'meet',
    team: 'wf',
    owner: 'Priya Raman',
    updated: 'Sep 21',
    status: 'Published',
    tags: ['planning', 'all-hands'],
    links: [],
    summary: 'Five-slide deck for the company all-hands on Sep 29.',
    data: {
      slides: [
        { kind: 'cover', kicker: 'Company all-hands', title: 'Q4 planning kickoff', sub: 'Sep 29, 2026' },
        {
          kicker: 'Review',
          title: 'Where Q3 landed',
          bullets: [
            '92% of committed volume delivered',
            'On-time rate up 6 points',
            'Pricing and QA pipeline slipped',
          ],
        },
        {
          kicker: 'Goals',
          title: 'Three goals for Q4',
          bullets: [
            'Ship Workforce portal v2',
            'Cut QA cycle time to two days',
            'Close the pricing refresh',
          ],
        },
        {
          kicker: 'Throughput',
          title: 'Tasks completed in week 39',
          big: '64',
          bigSub: 'Up from 51 in week 33',
        },
        {
          kicker: 'Next',
          title: 'What happens next',
          bullets: [
            'Teams draft goals by Oct 3',
            'Leads review on Oct 7',
            'Final plan shared Oct 10',
          ],
        },
      ],
    },
  },
  {
    id: 'f2',
    title: 'Incident response flow',
    type: 'canvas',
    folder: 'eng',
    team: 'plt',
    owner: 'Kwame Mensah',
    updated: 'Sep 19',
    status: 'Published',
    tags: ['runbook', 'diagram'],
    links: [],
    summary: 'Whiteboard of the decision path from alert to review.',
    data: {
      els: [
        { id: 'a', kind: 'rect', x: 30, y: 150, w: 140, h: 64, text: 'Alert fires', c: 'blue' },
        { id: 'b', kind: 'diamond', x: 230, y: 122, w: 120, h: 120, text: 'Customer impact?', c: 'amber' },
        { id: 'c', kind: 'rect', x: 420, y: 60, w: 160, h: 64, text: 'Declare incident', c: 'red' },
        { id: 'd', kind: 'rect', x: 420, y: 250, w: 160, h: 64, text: 'Log and monitor', c: 'gray' },
        { id: 'e', kind: 'rect', x: 690, y: 60, w: 150, h: 64, text: 'Write review', c: 'green' },
        {
          id: 'f',
          kind: 'sticky',
          x: 660,
          y: 215,
          w: 180,
          h: 110,
          text: 'On-call owns mitigation. Roll back first.',
          c: 'amber',
        },
      ],
      arrows: [
        ['a', 'b', ''],
        ['b', 'c', 'Yes'],
        ['b', 'd', 'No'],
        ['c', 'e', ''],
      ],
    },
  },
  {
    id: 'f3',
    title: 'Q4 capacity model',
    type: 'sheet',
    folder: 'ops',
    team: 'wf',
    owner: 'Priya Raman',
    updated: 'Sep 23',
    status: 'Published',
    tags: ['capacity', 'planning'],
    links: [],
    summary: 'Throughput against committed weekly volume per team.',
    data: {
      gapCol: true,
      rows: [
        ['Team', 'Headcount', 'Tasks / week', 'Committed', 'Gap'],
        ['Platform', '5', '13', '14', '=D2-C2'],
        ['Data Services', '4', '7', '8', '=D3-C3'],
        ['Quality Assurance', '3', '4', '7', '=D4-C4'],
        ['Workforce', '3', '6', '6', '=D5-C5'],
        ['Solutions Eng.', '3', '8', '8', '=D6-C6'],
        ['Sales', '2', '1', '3', '=D7-C7'],
        ['Total', '=SUM(B2:B7)', '=SUM(C2:C7)', '=SUM(D2:D7)', '=SUM(E2:E7)'],
      ],
    },
  },
  {
    id: 'f4',
    title: 'Quality rubric v3.pdf',
    type: 'pdf',
    folder: 'ops',
    team: 'qa',
    owner: 'Aiko Tanaka',
    updated: 'Sep 18',
    status: 'Review',
    tags: ['quality'],
    links: [],
    summary: 'Six-page scoring rubric shared with clients.',
    data: {
      pages: [
        'Quality rubric v3',
        'Scoring scale',
        'Accuracy',
        'Completeness',
        'Instruction adherence',
        'Escalation',
      ],
      note: [1, 'Aiko: confirm the 25% sample rate with SE'],
    },
  },
  {
    id: 'f5',
    title: 'Design review — Sep 18',
    type: 'audio',
    folder: 'dsn',
    team: 'pd',
    owner: 'Theo Martin',
    updated: 'Sep 18',
    status: 'Published',
    tags: ['design', 'recording'],
    links: [],
    summary: 'Recording of the reviewer dashboard review, with transcript.',
    data: {
      dur: 312,
      lines: [
        [0, 'Theo Martin', 'Let’s start with the reviewer dashboard flow.'],
        [24, 'Ines Silva', 'I cut the filters down to three presets.'],
        [61, 'Jonas Brandt', 'Engineering can build presets without new endpoints.'],
        [118, 'Theo Martin', 'Decision: ship presets first, custom filters later.'],
        [190, 'Ines Silva', 'I’ll update the file and share it by Monday.'],
        [260, 'Theo Martin', 'Open question: do leads need an export?'],
      ],
    },
  },
  {
    id: 'f6',
    title: 'Office floor plan',
    type: 'image',
    folder: 'att',
    team: 'wf',
    owner: 'Priya Raman',
    updated: 'Sep 2',
    status: 'Published',
    tags: ['onboarding', 'office'],
    links: [],
    summary: 'Desk map for the second floor.',
    data: { caption: 'Second floor, desks by team', dims: '2400 × 1600' },
  },
  {
    id: 'f7',
    title: 'Weekly throughput',
    type: 'chart',
    folder: 'ops',
    team: 'wf',
    owner: 'Priya Raman',
    updated: 'Sep 23',
    status: 'Published',
    tags: ['capacity', 'metrics'],
    links: ['f3'],
    summary: 'Tasks completed and on-time rate, weeks 33–40.',
    data: {
      labels: ['W33', 'W34', 'W35', 'W36', 'W37', 'W38', 'W39', 'W40'],
      series: [
        ['Tasks done', [34, 39, 42, 44, 44, 46, 47, 51]],
        ['On-time %', [81, 83, 82, 85, 86, 85, 88, 89]],
      ],
      mode: 'Bar',
    },
  },
  {
    id: 'f8',
    title: 'Reviewer dashboard wireframe',
    type: 'image',
    folder: 'att',
    team: 'pd',
    owner: 'Ines Silva',
    updated: 'Sep 17',
    status: 'Draft',
    tags: ['design', 'wireframe'],
    links: [],
    summary: 'Wireframe discussed in the Sep 18 review.',
    data: { caption: 'Reviewer dashboard, filter presets', dims: '1920 × 1200' },
  },
  {
    id: 'f9',
    title: 'Master services agreement.pdf',
    type: 'pdf',
    folder: 'com',
    team: 'se',
    owner: 'Clara Weiss',
    updated: 'Sep 8',
    status: 'Published',
    tags: ['clients', 'legal'],
    links: [],
    summary: 'Standard agreement used for new clients.',
    data: {
      pages: [
        'Master services agreement',
        'Definitions',
        'Services and delivery',
        'Fees and payment',
      ],
      note: null,
    },
  },
];

export const mkData = (type: string, tpl: string): any => {
  if (type === 'note') {
    return {
      blocks:
        tpl === 'Meeting notes'
          ? [
              Hb('Agenda'),
              TDb([['', false]]),
              Hb('Decisions'),
              Pb(''),
              Hb('Action items'),
              TDb([['', false]]),
            ]
          : tpl === 'Runbook'
          ? [
              COb('warn', 'Describe when this runbook applies and who owns it.'),
              Hb('Steps'),
              TDb([['', false]]),
              Hb('Escalation'),
              Pb(''),
            ]
          : tpl === 'Project brief'
          ? [
              Hb('Goal'),
              Pb(''),
              Hb('Scope'),
              Pb(''),
              Hb('Milestones'),
              TDb([['', false]]),
              Hb('Risks'),
              COb('info', ''),
            ]
          : [Pb('')],
    };
  }
  if (type === 'sheet') {
    return {
      data: {
        rows:
          tpl === 'Budget'
            ? [
                ['Item', 'Q3', 'Q4', 'Change'],
                ['Tools', '4200', '4600', '=C2-B2'],
                ['Contractors', '12000', '9000', '=C3-B3'],
                ['Travel', '1800', '2400', '=C4-B4'],
                ['Total', '=SUM(B2:B4)', '=SUM(C2:C4)', '=SUM(D2:D4)'],
              ]
            : tpl === 'Tracker'
            ? [
                ['Task', 'Owner', 'Status', 'Due'],
                ['Draft brief', 'Priya', 'Done', 'Sep 20'],
                ['Review with leads', 'Jonas', 'In progress', 'Sep 27'],
                ['Publish', 'Priya', 'To do', 'Oct 3'],
              ]
            : [
                ['Column A', 'Column B', 'Column C', 'Column D'],
                ['', '', '', ''],
                ['', '', '', ''],
                ['', '', '', ''],
              ],
      },
    };
  }
  if (type === 'slides') {
    return {
      data: {
        slides:
          tpl === 'All-hands'
            ? [
                {
                  kind: 'cover',
                  kicker: 'All-hands',
                  title: 'Monthly update',
                  sub: 'Add the date',
                },
                {
                  kicker: 'Update',
                  title: 'What we shipped',
                  bullets: ['First item', 'Second item', 'Third item'],
                },
                {
                  kicker: 'Next',
                  title: 'Next steps',
                  bullets: ['Owner and date', 'Owner and date'],
                },
              ]
            : tpl === 'Project kickoff'
            ? [
                {
                  kind: 'cover',
                  kicker: 'Kickoff',
                  title: 'Project name',
                  sub: 'Team and date',
                },
                {
                  kicker: 'Goal',
                  title: 'What success looks like',
                  bullets: ['Outcome one', 'Outcome two'],
                },
                {
                  kicker: 'Timeline',
                  title: 'Milestones',
                  bullets: [
                    'Week 2: scope signed off',
                    'Week 6: first release',
                    'Week 8: review',
                  ],
                },
              ]
            : [{ kind: 'cover', kicker: 'Draft', title: 'Untitled deck', sub: '' }],
      },
    };
  }
  if (type === 'canvas') {
    return {
      data:
        tpl === 'Flowchart'
          ? {
              els: [
                { id: 's', kind: 'rect', x: 60, y: 150, w: 140, h: 64, text: 'Start', c: 'blue' },
                { id: 'q', kind: 'diamond', x: 300, y: 122, w: 120, h: 120, text: 'Decision?', c: 'amber' },
                { id: 'y', kind: 'rect', x: 540, y: 60, w: 150, h: 64, text: 'Outcome A', c: 'green' },
                { id: 'n', kind: 'rect', x: 540, y: 250, w: 150, h: 64, text: 'Outcome B', c: 'gray' },
              ],
              arrows: [
                ['s', 'q', ''],
                ['q', 'y', 'Yes'],
                ['q', 'n', 'No'],
              ],
            }
          : tpl === 'Mind map'
          ? {
              els: [
                { id: 'm', kind: 'rect', x: 350, y: 155, w: 180, h: 70, text: 'Central idea', c: 'purple' },
                { id: 'a', kind: 'sticky', x: 80, y: 40, w: 150, h: 90, text: 'Branch one', c: 'amber' },
                { id: 'b', kind: 'sticky', x: 650, y: 40, w: 150, h: 90, text: 'Branch two', c: 'amber' },
                { id: 'c', kind: 'sticky', x: 80, y: 250, w: 150, h: 90, text: 'Branch three', c: 'amber' },
                { id: 'd', kind: 'sticky', x: 650, y: 250, w: 150, h: 90, text: 'Branch four', c: 'amber' },
              ],
              arrows: [
                ['m', 'a', ''],
                ['m', 'b', ''],
                ['m', 'c', ''],
                ['m', 'd', ''],
              ],
            }
          : { els: [], arrows: [] },
    };
  }
  if (type === 'chart') {
    return {
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        series: [['Value', [12, 18, 15, 22, 26, 31]]],
        mode: tpl === 'Line' ? 'Line' : 'Bar',
      },
    };
  }
  if (type === 'pdf') {
    return { data: { pages: ['Uploaded document', 'Page 2', 'Page 3'], note: null } };
  }
  if (type === 'audio') {
    return {
      data: {
        dur: 95,
        lines: [
          [0, ME, 'Recording started.'],
          [30, ME, 'The transcript appears here once the recording is processed.'],
        ],
      },
    };
  }
  return { data: { caption: 'Drop an image into the frame', dims: '—' } };
};
