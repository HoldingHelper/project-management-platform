import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  CheckSquare,
  FolderKanban,
  GanttChartSquare,
  Gauge,
  Landmark,
  Home,
  Network,
  Settings,
  ShieldCheck,
  UserRound,
  Zap,
} from "lucide-react";

export interface AppNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  badge?: "pending" | "notifications";
  anyPermission?: string[];
}

export interface AppNavGroup {
  label: string;
  items: AppNavItem[];
}

const isRoute = (path: string, route: string) => path === route || path.startsWith(`${route}/`);

export const NAV_GROUPS: AppNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "My Work", icon: Home, match: (path) => path === "/" },
      { href: "/h/holding", label: "Holding", icon: Landmark, match: (path) => path.startsWith("/h/") || path.startsWith("/v/") },
      {
        href: "/portfolio",
        label: "Projects",
        icon: FolderKanban,
        match: (path) => isRoute(path, "/portfolio") || (isRoute(path, "/projects") && !isRoute(path, "/projects/ai-generator")),
      },
      { href: "/tasks", label: "Tasks", icon: CheckSquare, match: (path) => path.startsWith("/tasks"), badge: "pending" },
      { href: "/timeline", label: "Timeline", icon: GanttChartSquare, match: (path) => path.startsWith("/timeline") },
      {
        href: "/projects/ai-generator",
        label: "AI Generator",
        icon: Bot,
        match: (path) => isRoute(path, "/projects/ai-generator"),
        anyPermission: ["projects.manage_assigned", "phases.manage_team", "tasks.manage_team", "tasks.manage_all"],
      },
      {
        href: "/automations",
        label: "Automations",
        icon: Zap,
        match: (path) => isRoute(path, "/automations"),
      },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell, match: (path) => isRoute(path, "/notifications"), badge: "notifications" },
      { href: "/activity", label: "Activity", icon: Activity, match: (path) => isRoute(path, "/activity") },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/organization", label: "Org Chart", icon: Network, match: (path) => isRoute(path, "/organization") },
      { href: "/performance", label: "Team Performance", icon: Gauge, match: (path) => isRoute(path, "/performance"), anyPermission: ["reports.view_executive"] },
      { href: "/dashboards/executive", label: "Executive", icon: BarChart3, match: (path) => isRoute(path, "/dashboards/executive"), anyPermission: ["reports.view_executive", "analytics.view_org"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "People", icon: ShieldCheck, match: (path) => path === "/admin/users", anyPermission: ["system.manage_users"] },
      { href: "/admin/departments", label: "Departments", icon: Network, match: (path) => path === "/admin/departments", anyPermission: ["system.manage_users"] },
      { href: "/admin/teams", label: "Teams", icon: UserRound, match: (path) => path === "/admin/teams", anyPermission: ["system.manage_users"] },
      { href: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck, match: (path) => path === "/admin/roles", anyPermission: ["system.manage_roles"] },
      { href: "/admin/partitions", label: "Task Partitions", icon: GanttChartSquare, match: (path) => path === "/admin/partitions", anyPermission: ["system.manage_users", "system.manage_settings"] },
      { href: "/admin/invitations", label: "Invitations", icon: Bell, match: (path) => path === "/admin/invitations", anyPermission: ["system.manage_users", "users.invite"] },
      { href: "/admin/org", label: "Org & Access", icon: Network, match: (path) => path.startsWith("/admin/org"), anyPermission: ["system.manage_users", "system.manage_roles"] },
    ],
  },
];

export const PERSONAL_NAV: AppNavItem[] = [
  { href: "/settings/mcp", label: "AI & MCP", icon: Bot, match: (path) => path.startsWith("/settings/mcp") },
  { href: "/settings", label: "Settings", icon: Settings, match: (path) => path === "/settings" },
];

export const MOBILE_PRIMARY_HREFS = ["/", "/portfolio", "/tasks", "/notifications"] as const;

const ROUTE_META = [
  { test: (path: string) => /^\/h\/[^/]+\/functions\/[^/]+\/?$/.test(path), crumb: "Holding / Function", title: "Function Hub" },
  { test: (path: string) => /^\/h\/[^/]+\/?$/.test(path), crumb: "Holding", title: "Holding Cockpit" },
  { test: (path: string) => path.startsWith("/v/"), crumb: "Portfolio / Venture", title: "Venture Home" },
  { test: (path: string) => path === "/", crumb: "Personal", title: "My Work" },
  { test: (path: string) => isRoute(path, "/portfolio"), crumb: "Organization", title: "Project Portfolio" },
  { test: (path: string) => isRoute(path, "/projects/ai-generator"), crumb: "Projects", title: "AI Project Generator" },
  { test: (path: string) => isRoute(path, "/projects"), crumb: "Projects / Workspace", title: "Project Workspace" },
  { test: (path: string) => isRoute(path, "/tasks"), crumb: "Organization", title: "Task Browser" },
  { test: (path: string) => isRoute(path, "/timeline"), crumb: "Global Views", title: "Portfolio Timeline" },
  { test: (path: string) => isRoute(path, "/automations"), crumb: "Workspace", title: "Workflow Automations" },
  { test: (path: string) => isRoute(path, "/organization"), crumb: "Organization", title: "Organization Hierarchy" },
  { test: (path: string) => isRoute(path, "/performance"), crumb: "Management", title: "Team Performance" },
  { test: (path: string) => isRoute(path, "/dashboards/executive"), crumb: "Executive", title: "Executive Dashboard" },
  { test: (path: string) => isRoute(path, "/notifications"), crumb: "Personal", title: "Notification Center" },
  { test: (path: string) => isRoute(path, "/activity"), crumb: "Organization", title: "Activity Feed" },
  { test: (path: string) => path === "/admin/users", crumb: "Administration", title: "People" },
  { test: (path: string) => path === "/admin/departments", crumb: "Administration", title: "Departments" },
  { test: (path: string) => path === "/admin/teams", crumb: "Administration", title: "Teams" },
  { test: (path: string) => path === "/admin/roles", crumb: "Administration", title: "Roles & Permissions" },
  { test: (path: string) => path === "/admin/partitions", crumb: "Administration", title: "Task Partitions" },
  { test: (path: string) => path === "/admin/invitations", crumb: "Administration", title: "Invitations" },
  { test: (path: string) => path === "/admin/org", crumb: "Administration", title: "Organization & Access" },
  { test: (path: string) => isRoute(path, "/profile"), crumb: "People", title: "Profile" },
  { test: (path: string) => path.startsWith("/settings/mcp"), crumb: "Personal / Settings", title: "AI & MCP Connections" },
  { test: (path: string) => path === "/settings", crumb: "Personal", title: "Settings" },
  { test: (path: string) => path === "/app", crumb: "Workspace", title: "Opening Workspace" },
  { test: (path: string) => path.endsWith("/callback"), crumb: "Settings / Integrations", title: "Integration Callback" },
];

const DEFAULT_ROUTE_META = { crumb: "Workspace", title: "Project Platform" };

export function getRouteMeta(pathname: string) {
  return ROUTE_META.find((item) => item.test(pathname)) ?? DEFAULT_ROUTE_META;
}

export const ProfileIcon = UserRound;
