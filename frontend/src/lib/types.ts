/* TypeScript mirrors of the backend Pydantic schemas + enums.
   Casing matches the backend exactly (see backend/app/modules/projects/enums.py).
   Note the deliberate inconsistency: TaskStatus is PascalCase, while
   ProjectStatus / HealthStatus / PhaseStatus are kebab-case. */

export type UUID = string;

// ---- Holding operating system ----
export type OrgNodeType =
  | "holding" | "function" | "venture" | "venture_function" | "program"
  | "project" | "shared_initiative" | "milestone" | "workstream" | "sprint"
  | "task" | "team" | "doc_space";
export type ConfidentialityTier = "standard" | "restricted" | "board";

export interface OrgNodeRead {
  id: UUID;
  type: OrgNodeType;
  parent_id: UUID | null;
  path: string;
  name: string;
  slug: string;
  status: "active" | "archived";
  confidentiality: ConfidentialityTier;
  metadata_json: Record<string, unknown>;
  acl_version: number;
  source_type?: string | null;
  source_id?: UUID | null;
  created_at: string;
  updated_at: string;
}

export interface VentureSummary {
  id: UUID;
  slug: string;
  name: string;
  status: string;
  confidentiality: ConfidentialityTier;
  project_count: number;
  member_count: number;
  allocation_percent: number;
  rag: string;
  top_risk?: string | null;
  next_milestone?: string | null;
}

export interface HoldingCockpit {
  holding: OrgNodeRead;
  ventures: VentureSummary[];
  active_ventures: number;
  at_risk_ventures: number;
  total_allocated_percent: number;
  orphan_projects: number;
}

export interface VisionRead {
  id: UUID;
  node_id: UUID;
  statement: string;
  horizon?: string | null;
  narrative_page_id?: UUID | null;
  updated_by: UUID;
  updated_at: string;
}

export interface ObjectiveRead {
  id: UUID;
  node_id: UUID;
  parent_objective_id?: UUID | null;
  title: string;
  period: string;
  owner_user_id: UUID;
  status: string;
  confidence: number;
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface WorkRequestRead {
  id: UUID;
  from_node_id: UUID;
  to_node_id: UUID;
  title: string;
  need: string;
  due_date?: string | null;
  priority: "P0" | "P1" | "P2" | "P3";
  status: string;
  created_by_user_id: UUID;
  created_task_id?: UUID | null;
  created_at: string;
  updated_at: string;
}

// ---- Enums (string unions) ----
export type ProductStatus = "Planning" | "Active" | "Maintenance" | "Sunset";
export type Environment = "Development" | "Staging" | "Production";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type HealthStatus = "on-track" | "at-risk" | "delayed" | "blocked" | "completed";
export type ProjectStatus = "not-started" | "in-progress" | "on-hold" | "completed" | "cancelled" | "archived";
export type PhaseType =
  | "Requirements" | "Architecture" | "Design" | "Development"
  | "Testing" | "Deployment" | "Maintenance";
export type PhaseStatus = "not-started" | "in-progress" | "blocked" | "completed" | "delayed";
export type TaskType =
  | "Feature" | "Bug" | "Enhancement" | "Research"
  | "Documentation" | "Meeting" | "Testing" | "Deployment";
export type TaskStatus =
  | "NotStarted" | "Ready" | "InProgress" | "Waiting" | "Blocked"
  | "Review" | "Testing" | "Done" | "Cancelled" | "Archived";
export type DependencyType =
  | "FinishToStart" | "StartToStart" | "FinishToFinish" | "StartToFinish";
export type ProjectMemberRole =
  | "ProjectManager" | "TeamLead" | "Developer" | "QA"
  | "UIUX" | "BusinessAnalyst" | "Client" | "Observer";

/** The 5-state semantic status used by StatusChip / ProgressBar tinting. */
export type SemanticStatus =
  | "not-started" | "in-progress" | "completed" | "blocked" | "delayed";

// ---- Pagination ----
export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total_count: number;
}

// ---- Identity ----
export type PresenceStatus = "online" | "busy" | "away" | "focus" | "offline";

export interface UserCustomStatus {
  text?: string | null;
  emoji?: string | null;
  expires_at?: string | null;
}

export interface UserPresenceInfo {
  status: PresenceStatus;
  status_text?: string | null;
  status_emoji?: string | null;
  status_expires_at?: string | null;
}

export interface CustomStatusUpdateRequest {
  presence_status?: PresenceStatus;
  status_text?: string | null;
  status_emoji?: string | null;
  clear_after_minutes?: number | null;
}

export interface UserRead {
  id: UUID;
  email: string;
  username?: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
  bio?: string | null;
  phone?: string | null;
  location?: string | null;
  presence_status?: PresenceStatus | string | null;
  status_text?: string | null;
  status_emoji?: string | null;
  status_expires_at?: string | null;
  department_id?: UUID | null;
  department_name?: string | null;
  team_id?: UUID | null;
  team_name?: string | null;
  manager_id?: UUID | null;
  manager_name?: string | null;
  manager_email?: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
  roles: string[];
  permissions: string[];
  created_at: string;
}

export interface InvitationRead {
  id: UUID;
  email: string;
  role_name: string;
  invited_by_user_id: UUID;
  department_id?: UUID | null;
  department_name?: string | null;
  team_id?: UUID | null;
  team_name?: string | null;
  manager_id?: UUID | null;
  manager_name?: string | null;
  expires_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invite_token?: string | null;
  invite_url?: string | null;
}

export interface InvitationPublicRead {
  email: string;
  role_name: string;
  department_name?: string | null;
  team_name?: string | null;
  manager_name?: string | null;
  expires_at: string;
}

export interface UserSettingsRead {
  notification_prefs: Record<string, unknown>;
  theme?: string | null;
  github_username?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: UserRead;
}

export interface RoleRead {
  id: UUID;
  name: string;
  description: string | null;
  permission_codes: string[];
}
export interface PermissionRead { id: UUID; code: string; description: string | null; }

// ---- Organization ----
export interface DepartmentRead {
  id: UUID;
  name: string;
  description?: string | null;
  head_of_department_user_id?: UUID | null;
  head_of_department_name?: string | null;
  teams_count?: number;
  members_count?: number;
}

export interface DepartmentCreate {
  name: string;
  description?: string | null;
  head_of_department_user_id?: UUID | null;
}

export interface DepartmentUpdate {
  name?: string;
  description?: string | null;
  head_of_department_user_id?: UUID | null;
}

export interface TeamRead {
  id: UUID;
  department_id: UUID;
  name: string;
  description?: string | null;
  lead_user_id?: UUID | null;
  lead_user_name?: string | null;
  department_name?: string | null;
  member_count?: number;
}

export interface TeamCreate {
  department_id: UUID;
  name: string;
  description?: string | null;
  lead_user_id?: UUID | null;
}

export interface TeamUpdate {
  name?: string;
  description?: string | null;
  department_id?: UUID;
  lead_user_id?: UUID | null;
}

export interface EmployeeRead {
  id: UUID;
  user_id: UUID;
  department_id?: UUID | null;
  department_name?: string | null;
  team_id?: UUID | null;
  team_name?: string | null;
  manager_employee_id?: UUID | null;
  job_title?: string | null;
  hire_date?: string | null;
  status: string;
}

export interface SkillRead { id: UUID; name: string; category?: string | null; }

export interface OrgTreeNode {
  id: UUID; // user_id
  employee_id?: UUID | null;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  department_id?: UUID | null;
  department_name?: string | null;
  team_id?: UUID | null;
  team_name?: string | null;
  manager_user_id?: UUID | null;
  manager_name?: string | null;
  presence_status?: PresenceStatus | string | null;
  status_text?: string | null;
  status_emoji?: string | null;
  role_names: string[];
  direct_reports_count: number;
  direct_reports: OrgTreeNode[];
}

export interface OrgTreeResponse {
  roots: OrgTreeNode[];
  total_departments: number;
  total_teams: number;
  total_employees: number;
  unassigned: OrgTreeNode[];
}

// ---- Projects domain ----
export interface ProductRead {
  id: UUID;
  name: string;
  description?: string | null;
  owner_user_id: UUID;
  status: ProductStatus | string;
  technology_stack: string[];
  repository_url?: string | null;
  documentation_link?: string | null;
  environment: Environment | string;
  priority: Priority | string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRead {
  id: UUID;
  product_id: UUID;
  name: string;
  description?: string | null;
  budget?: number | null;
  priority: Priority | string;
  risk_level: RiskLevel | string;
  start_date?: string | null;
  end_date?: string | null;
  estimated_completion_date?: string | null;
  actual_completion_date?: string | null;
  health_status: HealthStatus | string;
  status: ProjectStatus | string;
  tags: string[];
  progress_percentage: number;
  created_by?: string;
  last_modified_by?: string;
  generation_run_id?: UUID | null;
  ai_prompt_storage_key?: string | null;
  ai_summary_storage_key?: string | null;
  planning_mode: "sprints" | "legacy" | string;
  created_at: string;
  updated_at: string;
}

export interface PhaseRead {
  id: UUID;
  project_id: UUID;
  name: string;
  phase_type: PhaseType | string;
  sequence: number;
  start_date?: string | null;
  end_date?: string | null;
  status: PhaseStatus | string;
  progress_percentage: number;
  lead_assignee_user_id?: UUID | null;
  is_sprint: boolean;
  created_at: string;
  updated_at: string;
}

export type SprintRead = PhaseRead;

export interface TaskRead {
  id: UUID;
  phase_id: UUID | null;
  parent_task_id?: UUID | null;
  title: string;
  description?: string | null;
  task_type: TaskType | string;
  priority: Priority | string;
  status: TaskStatus | string;
  board_order: number;
  story_points?: number | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  reviewer_user_id?: UUID | null;
  github_url?: string | null;
  partition?: "tech" | "operations" | string | null;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  assignee_user_ids: UUID[];
  labels: string[];
  checklist_items: { id: UUID; text: string; is_done: boolean; order: number }[];
  earliest_start?: number | null;
  earliest_finish?: number | null;
  latest_start?: number | null;
  latest_finish?: number | null;
  total_slack?: number | null;
  is_critical: boolean;
  is_ticket: boolean;
  ticket_requested_by_user_id?: UUID | null;
  created_by?: string;
  last_modified_by?: string;
  generation_run_id?: UUID | null;
  created_at: string;
  updated_at: string;
}

export interface TaskPartitionRead {
  id: UUID;
  name: string;
  slug: string;
  description?: string | null;
  display_order: number;
  task_count: number;
  project_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskDependencyRead {
  id: UUID;
  predecessor_task_id: UUID;
  successor_task_id: UUID;
  dependency_type: DependencyType | string;
  lag_days: number;
}

export interface ProgressBreakdown {
  completed: number;
  in_progress: number;
  blocked: number;
  overdue: number;
  pending: number;
  percentage: number;
  blocks: string;
}

export interface GanttTaskRow {
  id: UUID;
  text: string;
  start_date?: string | null;
  due_date?: string | null;
  duration_days: number;
  progress: number;
  parent?: UUID | null;
  status: string;
  is_critical: boolean;
  done_late?: boolean;
}
export interface GanttLinkRow { id: string; source: UUID; target: UUID; type: string; }
export interface ProjectTimeline { project_id: UUID; tasks: GanttTaskRow[]; links: GanttLinkRow[]; }

// ---- Milestones / portfolio / overview ----
export interface MilestoneRead {
  id: UUID;
  project_id: UUID;
  name: string;
  description?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  sequence: number;
  created_by_user_id: UUID;
  created_at: string;
}

export interface ProjectDependencyRead {
  id: UUID;
  predecessor_project_id: UUID;
  successor_project_id: UUID;
  dependency_type: DependencyType | string;
  lag_days: number;
}

export interface PortfolioGanttProject {
  id: UUID;
  product_id: UUID;
  name: string;
  status: ProjectStatus | string;
  health_status: HealthStatus | string;
  priority: Priority | string;
  progress_percentage: number;
  start_date?: string | null;
  end_date?: string | null;
  current_phase?: string | null;
  current_sprint?: string | null;
  tags: string[];
  level?: ProjectLevel | string | null;
  milestones: MilestoneRead[];
}

export interface PortfolioGantt { projects: PortfolioGanttProject[]; links: ProjectDependencyRead[]; }

export type ProjectLevel = "inter-team" | "inter-partition" | "organization";

export interface ProjectMemberRead { project_id: UUID; user_id: UUID; role: string; }

export interface TaskStats { total: number; done: number; in_progress: number; blocked: number; overdue: number; unassigned: number; }
export interface UpcomingDeadline { task_id: UUID; title: string; due_date: string; status: string; assignee_user_ids: UUID[]; }

export interface ProjectOverview {
  project: ProjectRead;
  phases: PhaseRead[];
  sprints?: SprintRead[];
  current_phase?: PhaseRead | null;
  current_sprint?: SprintRead | null;
  members: ProjectMemberRead[];
  milestones: MilestoneRead[];
  task_stats: TaskStats;
  open_blockers: number;
  upcoming_deadlines: UpcomingDeadline[];
}

// ---- Blockers ----
export type BlockReason = "waiting_on_person" | "technical" | "business" | "external";

export interface BlockerRead {
  id: UUID;
  title: string;
  description?: string | null;
  severity: string;
  priority: string;
  blocked_task_id: UUID;
  owner_user_id: UUID;
  reported_by_user_id: UUID;
  pending_on_user_id: UUID;
  block_reason?: BlockReason | string | null;
  estimated_unblock_date?: string | null;
  expected_resolution_date?: string | null;
  actual_resolution_date?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PendingOnMeItem { kind: "blocker" | "review_task" | string; id: UUID; title: string; project_id?: UUID | null; priority: string; detail: string; }
export interface PendingOnOthersItem { task_id: UUID; title: string; project_id?: UUID | null; pending_on_user_ids: UUID[]; reason: string; }
export interface UserPendingWork { pending_on_me: PendingOnMeItem[]; pending_on_others: PendingOnOthersItem[]; }

// ---- Collaboration ----
export interface CommentRead { id: UUID; entity_type: string; entity_id: UUID; author_user_id: UUID; parent_comment_id?: UUID | null; body: string; mentioned_user_ids: UUID[]; is_deleted: boolean; created_at: string; updated_at: string; }
export interface FileAttachmentRead { id: UUID; entity_type: string; entity_id: UUID; file_name: string; content_type: string; size_bytes: number; uploaded_by_user_id: UUID; version: number; created_at: string; }
export interface NotificationRead {
  id: UUID;
  user_id: UUID;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  is_read: boolean;
  entity_type?: string | null;
  entity_id?: UUID | null;
  requires_action: boolean;
  resolved_at?: string | null;
  created_at: string;
}

// ---- Chat ----
export interface ChannelRead {
  id: UUID;
  type: "project" | "dm" | string;
  project_id?: UUID | null;
  name: string;
  archived_at?: string | null;
  created_at: string;
}

export interface ChannelListItem {
  channel: ChannelRead;
  unread_count: number;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  dm_user_id?: UUID | null;
}

export interface MessageReactionRead { user_id: UUID; emoji: string; }

export interface MessageRead {
  id: UUID;
  channel_id: UUID;
  sender_user_id: UUID;
  parent_message_id?: UUID | null;
  body: string;
  message_type: "text" | "voice" | "file" | string;
  attachment_id?: UUID | null;
  mentioned_user_ids: UUID[];
  edited_at?: string | null;
  deleted_at?: string | null;
  created_at: string;
  reactions: MessageReactionRead[];
  reply_count: number;
}

export interface ChannelMemberRead { user_id: UUID; last_read_message_id?: UUID | null; muted: boolean; }

// ---- Music ----
export type MusicChannelColor = "violet" | "gold" | "rose" | "teal" | "blue" | "green";
export type PlaybackAction = "play" | "pause" | "seek" | "next" | "prev" | "set_track";

export interface MusicChannelRead {
  id: UUID;
  name: string;
  color: MusicChannelColor | string;
  owner_user_id: UUID;
  drive_folder_id?: string | null;
  drive_folder_name?: string | null;
  created_at: string;
}

export interface MusicChannelListItem {
  channel: MusicChannelRead;
  member_count: number;
  is_member: boolean;
  can_control: boolean;
  is_playing: boolean;
  now_playing?: string | null;
}

export interface MusicMemberRead { user_id: UUID; can_control: boolean; }

export interface TrackInfo { id: string; name: string; mime_type?: string | null; size?: number | null; modified_time?: string | null; }

export interface PlaybackState {
  channel_id: UUID;
  playlist: TrackInfo[];
  track_index: number;
  track?: TrackInfo | null;
  is_playing: boolean;
  position_seconds: number;
  server_epoch_ms: number;
  /** Monotonic version; the client drops any frame not strictly newer. */
  state_version: number;
  /** Server clock at response time — used for client clock-offset correction. */
  server_now_ms?: number;
}

export interface DriveStatus { configured: boolean; connected: boolean; email?: string | null; }
export interface DriveFolder { id: string; name: string; }

// ---- Analytics ----
export interface AuditLogRead { id: UUID; user_id?: UUID | null; ip_address?: string | null; entity_type: string; entity_id: string; action_type: string; changes_json: string; correlation_id?: string | null; occurred_at: string; }
export interface ExecutiveDashboard {
  active_projects: number;
  completed_projects: number;
  delayed_projects: number;
  blocked_projects: number;
  department_progress: unknown[];
  recent_activity: AuditLogRead[];
}
export interface PersonalDashboard {
  assigned_tasks_total: number;
  open_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  blocked_tasks: number;
  attention_required_tasks: number;
  unscheduled_open_tasks: number;
  completion_rate_percent: number;
  upcoming_deadlines: Array<{ task_id: UUID; title: string; due_date: string }>;
  late_tasks: Array<{ task_id: UUID; title: string; due_date: string }>;
  velocity_points_completed: number;
  hours_logged: number;
}

// ---- RFC7807 error ----
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  correlationId?: string;
  details?: Record<string, unknown>;
}
