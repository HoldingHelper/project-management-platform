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
  Settings,
  ShieldCheck,
  UserRound,
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
      { href: "/", label: "Home", icon: Home, match: (path) => path === "/" },
      {
        href: "/portfolio",
        label: "Projects",
        icon: FolderKanban,
        match: (path) => path.startsWith("/portfolio") || (path.startsWith("/projects") && !path.startsWith("/projects/ai-generator")),
      },
      { href: "/tasks", label: "Tasks", icon: CheckSquare, match: (path) => path.startsWith("/tasks"), badge: "pending" },
      { href: "/timeline", label: "Timeline", icon: GanttChartSquare, match: (path) => path.startsWith("/timeline") },
      {
        href: "/projects/ai-generator",
        label: "AI Generator",
        icon: Bot,
        match: (path) => path.startsWith("/projects/ai-generator"),
        anyPermission: ["projects.manage_assigned", "phases.manage_team", "tasks.manage_team", "tasks.manage_all"],
      },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell, match: (path) => path.startsWith("/notifications"), badge: "notifications" },
      { href: "/activity", label: "Activity", icon: Activity, match: (path) => path.startsWith("/activity") },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/performance", label: "Team Performance", icon: Gauge, match: (path) => path.startsWith("/performance"), anyPermission: ["reports.view_executive"] },
      { href: "/dashboards/executive", label: "Executive", icon: BarChart3, match: (path) => path.startsWith("/dashboards"), anyPermission: ["reports.view_executive", "analytics.view_org"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Administration", icon: ShieldCheck, match: (path) => path.startsWith("/admin"), anyPermission: ["system.manage_users", "users.invite"] },
    ],
  },
];

export const PERSONAL_NAV: AppNavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, match: (path) => path.startsWith("/settings") },
];

export const MOBILE_PRIMARY_HREFS = ["/", "/portfolio", "/tasks", "/notifications"] as const;

const ROUTE_META = [
  { test: (path: string) => path === "/", crumb: "Personal", title: "Home Dashboard" },
  { test: (path: string) => path.startsWith("/portfolio"), crumb: "Organization", title: "Project Portfolio" },
  { test: (path: string) => path.startsWith("/projects/ai-generator"), crumb: "Projects", title: "AI Project Generator" },
  { test: (path: string) => path.startsWith("/projects"), crumb: "Projects / Workspace", title: "Project Workspace" },
  { test: (path: string) => path.startsWith("/tasks"), crumb: "Organization", title: "Task Browser" },
  { test: (path: string) => path.startsWith("/timeline"), crumb: "Global Views", title: "Portfolio Timeline" },
  { test: (path: string) => path.startsWith("/performance"), crumb: "Management", title: "Team Performance" },
  { test: (path: string) => path.startsWith("/dashboards"), crumb: "Executive", title: "Executive Dashboard" },
  { test: (path: string) => path.startsWith("/notifications"), crumb: "Personal", title: "Notification Center" },
  { test: (path: string) => path.startsWith("/activity"), crumb: "Organization", title: "Activity Feed" },
  { test: (path: string) => path.startsWith("/admin"), crumb: "Administration", title: "Admin" },
  { test: (path: string) => path.startsWith("/profile"), crumb: "People", title: "Profile" },
  { test: (path: string) => path.startsWith("/settings"), crumb: "Personal", title: "Settings" },
];

export function getRouteMeta(pathname: string) {
  return ROUTE_META.find((item) => item.test(pathname)) ?? ROUTE_META[0];
}

export const ProfileIcon = UserRound;
