export type WorkspaceMode = 'teams' | 'docs';

export type WorkspacePage =
  | 'home'
  | 'projects'
  | 'project'
  | 'tasks'
  | 'timeline'
  | 'ai'
  | 'automations'
  | 'notifications'
  | 'activity'
  | 'org'
  | 'perf'
  | 'exec'
  | 'admin';

export type ThemeName = 'ocean' | 'modernist' | 'midnight' | 'glass';
export type RadiusName = 'sharp' | 'soft' | 'round';
export type StartScreen = 'login' | 'app';
export type LoginLayout = 'poster' | 'minimal';

export type TaskStatus = 'Backlog' | 'To do' | 'In progress' | 'In review' | 'Blocked' | 'Done';
export type TaskPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type TaskType = 'Feature' | 'Bug' | 'Chore' | 'Research';

export type ProjectStatus = 'On track' | 'At risk' | 'Blocked' | 'Done' | 'Planned';
export type ProjectLevel = 'Inter-team' | 'Inter-partition' | 'Organization';
export type PartitionName = 'Tech' | 'Operations' | 'Business' | 'Marketing' | 'Sales' | 'Design' | string;

export interface Person {
  name: string;
  role: string;
  dept: string;
  team: string | null;
  mgr: string | null;
  kind: 'exec' | 'head' | 'lead' | 'member';
  email: string;
  presence: 'online' | 'away' | 'offline';
  invited: boolean;
}

export interface Department {
  id: string;
  name: string;
  head: string;
  headRole: string;
}

export interface Team {
  id: string;
  name: string;
  dept: string;
  lead: string;
  role: string;
  members: string[];
  perf: number[];
  onTime: number;
  cycle: number;
}

export interface Project {
  id: string;
  name: string;
  owner: string;
  partition: PartitionName;
  level: ProjectLevel;
  progress: number;
  status: ProjectStatus;
  priority: TaskPriority;
  updated: string;
  s: number;
  e: number;
  m: number;
  team: string;
  desc: string;
  dep?: string;
  risk?: string;
  color?: string;
}

export interface Task {
  id: string;
  title: string;
  project: string | null;
  partition: PartitionName;
  labels: string[];
  status: TaskStatus;
  type: TaskType;
  priority: TaskPriority;
  assignees: string[];
  s: number | null;
  e: number | null;
  source: string;
  desc: string;
}

export interface NotificationItem {
  id: string;
  type: 'mention' | 'assigned' | 'blocked' | 'due' | 'review' | 'automation' | 'github' | 'invite';
  icon: string;
  title: string;
  detail: string;
  project: string;
  time: string;
  unread: boolean;
  task?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  when: string;
  then: string;
  scope: string;
  runs: number;
  last: string;
  on: boolean;
}

export interface ChatMessage {
  who: string;
  t: string;
  text: string;
}

export interface TaskComment {
  who: string;
  t: string;
  text: string;
}

export type PluginType = 'note' | 'canvas' | 'sheet' | 'slides' | 'pdf' | 'audio' | 'image' | 'chart';

export interface DocBlock {
  k: 'h' | 'p' | 'todo' | 'callout' | 'embed';
  t?: string;
  items?: [string, boolean][];
  tone?: 'info' | 'warn';
  id?: string;
  full?: boolean;
}

export interface SlideData {
  kind?: 'cover';
  kicker?: string;
  title: string;
  sub?: string;
  bullets?: string[];
  big?: string;
  bigSub?: string;
}

export interface CanvasElement {
  id: string;
  kind: 'rect' | 'diamond' | 'sticky' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  c: string;
}

export interface DocFile {
  id: string;
  title: string;
  type: PluginType;
  folder: string;
  team: string;
  owner: string;
  updated: string;
  status: 'Published' | 'Review' | 'Draft';
  tags: string[];
  links: string[];
  summary: string;
  blocks?: DocBlock[];
  data?: any;
}
