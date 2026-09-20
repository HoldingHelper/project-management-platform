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

export const NAV_GROUPS: AppNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/app/teams", label: "Home", icon: Home, match: (path) => path === "/app/teams" },
      {
        href: "/portfolio",
        label: "Projects",
        icon: FolderKanban,
        match: (path) => path.includes("/portfolio") || (path.includes("/projects") && !path.includes("/projects/ai-generator")),
      },
      { href: "/tasks", label: "Tasks", icon: CheckSquare, match: (path) => path.startsWith("/tasks"), badge: "pending" },
      { href: "/timeline", label: "Timeline", icon: GanttChartSquare, match: (path) => path.startsWith("/timeline") },
      {
        href: "/projects/ai-generator",
        label: "AI Generator",
        icon: Bot,
        match: (path) => path.includes("/projects/ai-generator"),
        anyPermission: ["projects.manage_assigned", "phases.manage_team", "tasks.manage_team", "tasks.manage_all"],
      },
      {
        href: "/automations",
        label: "Automations",
        icon: Zap,
        match: (path) => path.includes("/automations"),
      },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell, match: (path) => path.includes("/notifications"), badge: "notifications" },
      { href: "/activity", label: "Activity", icon: Activity, match: (path) => path.includes("/activity") },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/organization", label: "Org Chart", icon: Network, match: (path) => path.includes("/organization") },
      { href: "/performance", label: "Team Performance", icon: Gauge, match: (path) => path.includes("/performance"), anyPermission: ["reports.view_executive"] },
      { href: "/dashboards/executive", label: "Executive", icon: BarChart3, match: (path) => path.includes("/dashboards"), anyPermission: ["reports.view_executive", "analytics.view_org"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Administration", icon: ShieldCheck, match: (path) => path.includes("/admin"), anyPermission: ["system.manage_users", "users.invite"] },
    ],
  },
];

export const PERSONAL_NAV: AppNavItem[] = [
  { href: "/settings/mcp", label: "AI & MCP", icon: Bot, match: (path) => path.startsWith("/settings/mcp") },
  { href: "/settings", label: "Settings", icon: Settings, match: (path) => path === "/settings" },
];

export const MOBILE_PRIMARY_HREFS = ["/app/teams", "/portfolio", "/tasks", "/notifications"] as const;

const ROUTE_META = [
  { test: (path: string) => path === "/app/teams", crumb: "Personal", title: "Home Dashboard" },
  { test: (path: string) => path.includes("/portfolio"), crumb: "Organization", title: "Project Portfolio" },
  { test: (path: string) => path.includes("/projects/ai-generator"), crumb: "Projects", title: "AI Project Generator" },
  { test: (path: string) => path.includes("/projects"), crumb: "Projects / Workspace", title: "Project Workspace" },
  { test: (path: string) => path.includes("/tasks"), crumb: "Organization", title: "Task Browser" },
  { test: (path: string) => path.includes("/timeline"), crumb: "Global Views", title: "Portfolio Timeline" },
  { test: (path: string) => path.includes("/automations"), crumb: "Workspace", title: "Workflow Automations" },
  { test: (path: string) => path.includes("/organization"), crumb: "Organization", title: "Organization Hierarchy" },
  { test: (path: string) => path.includes("/performance"), crumb: "Management", title: "Team Performance" },
  { test: (path: string) => path.includes("/dashboards"), crumb: "Executive", title: "Executive Dashboard" },
  { test: (path: string) => path.includes("/notifications"), crumb: "Personal", title: "Notification Center" },
  { test: (path: string) => path.includes("/activity"), crumb: "Organization", title: "Activity Feed" },
  { test: (path: string) => path.includes("/admin"), crumb: "Administration", title: "Admin" },
  { test: (path: string) => path.includes("/profile"), crumb: "People", title: "Profile" },
  { test: (path: string) => path.startsWith("/settings/mcp"), crumb: "Personal / Settings", title: "AI & MCP Connections" },
  { test: (path: string) => path.includes("/settings"), crumb: "Personal", title: "Settings" },
];

export function getRouteMeta(pathname: string) {
  return ROUTE_META.find((item) => item.test(pathname)) ?? ROUTE_META[0];
}

export const ProfileIcon = UserRound;
