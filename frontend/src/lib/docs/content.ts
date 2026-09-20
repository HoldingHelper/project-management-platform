export type PublicDoc = {
  category: string;
  categoryLabel: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  sections: { id: string; title: string; body: string; steps?: string[] }[];
  videoId?: string;
};

export const PUBLIC_DOCS: PublicDoc[] = [
  {
    category: "getting-started",
    categoryLabel: "Getting started",
    slug: "workspace-overview",
    title: "Project Management Platform overview",
    description: "Learn how Knowledge and Execution fit together in Project Management Platform.",
    tags: ["overview", "workspace", "navigation"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "two-modules", title: "Two modules, one workspace", body: "Internal Docs keeps decisions and context durable. Teams turns that context into projects, tasks, conversations, and measurable progress." },
      { id: "navigation", title: "Move between areas", body: "Use the Docs and Teams switcher in the global header. Your last active area is remembered for the next visit." },
      { id: "next", title: "Start with a clear home", body: "Open Teams to review assigned work, or open Internal Docs to browse recent pages and spaces." },
    ],
  },
  {
    category: "getting-started",
    categoryLabel: "Getting started",
    slug: "signing-in",
    title: "Sign in to your workspace",
    description: "Enter the private workspace safely and recover from sign-in problems.",
    tags: ["login", "account", "security"],
    sections: [
      { id: "login", title: "Sign in", body: "Open the login page and enter your email address or username and password.", steps: ["Open Login from the public navigation.", "Enter your account credentials.", "Select Sign in. You will enter the application shell, never a random project."] },
      { id: "problems", title: "If sign in fails", body: "Check the identifier, verify your connection, then retry. Password recovery is available from the sign-in screen." },
    ],
  },
  {
    category: "projects",
    categoryLabel: "Projects",
    slug: "creating-a-project",
    title: "Create and configure projects",
    description: "Create a project, set its owner, define two-week sprints, and bring the right team into the work.",
    tags: ["project", "owner", "sprints", "team"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "before", title: "Before you begin", body: "Prepare a concise outcome, owner, and target window. These become the project’s working contract." },
      { id: "create", title: "Create the project", body: "Open Teams, choose Projects, and select New project.", steps: ["Name the outcome, not the activity.", "Choose an accountable owner.", "Set priority, risk level, budget, and target milestone.", "Add two-week delivery sprints and tasks."] },
      { id: "connect", title: "Connect project knowledge", body: "Link the requirement, architecture, or launch document so the team can move from context to execution without searching across tools." },
    ],
  },
  {
    category: "projects",
    categoryLabel: "Projects",
    slug: "ai-project-generator",
    title: "AI project generator tutorial",
    description: "Generate structured project scopes, two-week delivery sprints, task DAGs, and risk assessments with Gemini.",
    tags: ["ai", "generator", "gemini", "automation"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "prompt", title: "Provide outcome prompt", body: "Describe your product goals, timeline constraints, and target technology stack in plain English." },
      { id: "generate", title: "Generate and review", body: "Gemini automatically formats sequential two-week sprints, granular tasks, and risk mitigation strategies." },
      { id: "import", title: "1-Click import", body: "Import the generated structure directly into your project portfolio with all team assignments ready." },
    ],
  },
  {
    category: "tasks",
    categoryLabel: "Tasks",
    slug: "assigning-tasks",
    title: "Assign and prioritize tasks",
    description: "Find the right contributor, clarify priority, and keep the Kanban board ordered.",
    tags: ["task", "assignee", "priority", "board"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "assign", title: "Choose an assignee", body: "Search developers by name, email, role, or job title. The list stays manageable as the workspace grows." },
      { id: "priority", title: "Set priority and dates", body: "Priority explains relative urgency (P0..P3). Due dates explain time." },
      { id: "board", title: "Order the board", body: "Drag tasks within a status to change their working order, or drag between statuses to update progress. Keyboard and visible controls remain available for accessibility." },
    ],
  },
  {
    category: "tasks",
    categoryLabel: "Tasks",
    slug: "critical-path-dag",
    title: "Task dependencies and DAG scheduling",
    description: "Link predecessor and successor dependencies to compute the critical path and track blockers.",
    tags: ["dependencies", "dag", "critical-path", "blockers"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "dag", title: "Asynchronous DAG calculations", body: "Dependencies form a directed acyclic graph. Upstream completion automatically unlocks downstream assignees." },
      { id: "blockers", title: "Flagging and resolving blockers", body: "Flag blockers with severity to alert team leads and trigger WhatsApp escalations." },
    ],
  },
  {
    category: "communication",
    categoryLabel: "Communication",
    slug: "messages-and-channels",
    title: "Messages and channels",
    description: "Keep project conversation close to the work it changes.",
    tags: ["messages", "channels", "mentions"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "channels", title: "Choose the right channel", body: "Use project channels for decisions tied to delivery and direct messages for focused coordination." },
      { id: "mentions", title: "Mention with intent", body: "Mention a person with @handle when they need to act or decide. Notifications link back to the source conversation." },
    ],
  },
  {
    category: "music",
    categoryLabel: "Music",
    slug: "music-rooms",
    title: "Use synchronized music rooms",
    description: "Share synchronized audio playback with teammates in channel listening rooms.",
    tags: ["music", "room", "playback", "realtime"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "join", title: "Join a room", body: "Open a music-enabled channel and join its room. Playback state is synchronized for members via WebSocket backplane." },
      { id: "controls", title: "Queueing and volume", body: "Search and queue audio tracks into the shared playlist while adjusting your personal volume independently." },
    ],
  },
  {
    category: "calendar",
    categoryLabel: "Calendar & Meetings",
    slug: "google-calendar-meetings",
    title: "Google Calendar & Smart Meeting Reminders",
    description: "Connect Google Calendar, view countdowns in the top header, and join calls with 1-click Google Meet.",
    tags: ["calendar", "google-meet", "reminders", "countdown"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "connect", title: "1-Click Google OAuth", body: "Authorize Google Calendar in Settings. Events and conference links sync automatically." },
      { id: "header-pill", title: "Global Header Meeting Pill", body: "Displays real-time countdown to your next call with a green 1-click Google Meet launch button." },
      { id: "reminders", title: "Smart T-10m and T-2m Alerts", body: "Receive background in-app and WhatsApp notifications before meetings start." },
    ],
  },
  {
    category: "integrations",
    categoryLabel: "Integrations & Automations",
    slug: "github-pr-sync",
    title: "GitHub Organization & PR Automation",
    description: "Auto-create tasks when PRs are opened and mark tasks done when merged.",
    tags: ["github", "pull-request", "webhook", "ci-cd"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "link-repo", title: "Connect GitHub Repositories", body: "Link your GitHub repository to a default project in Settings." },
      { id: "auto-tasks", title: "Automatic Task Creation", body: "Opening a PR automatically creates a task assigned to the author or links mentioned task IDs." },
      { id: "auto-done", title: "Auto-Done on Merge", body: "When a PR is merged into main, the task is marked Done and a celebratory comment is posted." },
    ],
  },
  {
    category: "integrations",
    categoryLabel: "Integrations & Automations",
    slug: "whatsapp-bot-alerts",
    title: "WhatsApp Notifications & Bot Assistant",
    description: "Receive instant WhatsApp alerts for meetings, mentions, and blockers, or query active tasks via chat.",
    tags: ["whatsapp", "notifications", "bot", "mobile"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "link-number", title: "Link Your Mobile Number", body: "Enter your phone number with country code in Settings and toggle notification categories." },
      { id: "bot-commands", title: "WhatsApp Bot Commands", body: "Send 'tasks' to the bot to get your active assigned tasks, or 'help' for available shortcuts." },
    ],
  },
  {
    category: "developer",
    categoryLabel: "Developer & AI Tools",
    slug: "mcp-server-ai-tools",
    title: "Model Context Protocol (MCP) Server",
    description: "Connect Claude Desktop, Cursor, and GPT agents to manage internal docs, diagrams, and tasks.",
    tags: ["mcp", "claude", "cursor", "ai-tools"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "personal-token", title: "Personal, Revocable Connection", body: "Open Settings → AI & MCP, select a subset of your current permissions, and generate a token. The secret is shown once; Platform stores only its hash. Never put your account password in an AI client." },
      { id: "mcp-config", title: "Ready-to-Copy Client Configuration", body: "Copy the generated MCP JSON, Codex config, or Claude CLI command. The endpoint and one-time personal token are already inserted." },
      { id: "live-permissions", title: "Live User Visibility", body: "Every request intersects token permissions with the user's current roles, then applies normal project membership, task access, and private/selected Docs rules. A token can only reduce access, never expand it." },
      { id: "skill-resource", title: "Agent-Discoverable SKILL.md", body: "The MCP initialize response points agents to pmp://agent/SKILL.md. It documents the connected identity, effective permissions, available tools, safety rules, and ticket workflow." },
      { id: "revoke", title: "Expiry and Revocation", body: "Review last-used time and expiry in Settings → AI & MCP. Revoke a connection at any time; its next request fails immediately." },
    ],
  },
  {
    category: "developer",
    categoryLabel: "Developer & AI Tools",
    slug: "strawberry-graphql-engine",
    title: "Strawberry GraphQL Engine & Explorer",
    description: "Unified GraphQL API and interactive GraphiQL playground at /graphql.",
    tags: ["graphql", "strawberry", "api", "graphiql"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "graphiql", title: "GraphiQL Interactive IDE", body: "Explore the schema, test queries, and run mutations directly at /graphql." },
      { id: "queries-mutations", title: "Rich Query & Mutation Capabilities", body: "Query projects, tasks, doc spaces, generated SVG diagrams, and reactive automation rules." },
    ],
  },
  {
    category: "developer",
    categoryLabel: "Developer & AI Tools",
    slug: "visual-automations-engine",
    title: "Visual Workflow Automations Builder",
    description: "Build reactive trigger-action rules for PR merges, status changes, and diagram generation.",
    tags: ["automations", "triggers", "actions", "rules"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "triggers", title: "Event Triggers", body: "Trigger rules from GitHub PR merges, task status updates, blocker flags, or meeting reminders." },
      { id: "actions", title: "Automated Actions", body: "Execute task status transitions, dispatch WhatsApp alerts, create follow-up tasks, or generate docs diagrams." },
      { id: "audit-logs", title: "Execution Audit Logs", body: "Inspect real-time execution histories and verify rule performance." },
    ],
  },
  {
    category: "teams",
    categoryLabel: "Teams & Administration",
    slug: "roles-and-permissions",
    title: "Roles and permissions",
    description: "Understand how roles, resource access, and confidential documents work.",
    tags: ["roles", "permissions", "security", "admin"],
    videoId: "dQw4w9WgXcQ",
    sections: [
      { id: "roles", title: "Workspace roles", body: "Roles grant broad capabilities. Resource permissions narrow access for confidential spaces and pages." },
      { id: "authority", title: "The API is authoritative", body: "Navigation explains availability, but every protected request is strictly checked by the API." },
    ],
  },
  {
    category: "account",
    categoryLabel: "Account",
    slug: "profile-and-preferences",
    title: "Profile and preferences",
    description: "Manage your identity, theme, security, and notification preferences.",
    tags: ["profile", "theme", "security"],
    sections: [
      { id: "profile", title: "Profile", body: "Keep your name, role, timezone, and contact information current so assignments and mentions are clear." },
      { id: "preferences", title: "Preferences", body: "Choose a light or dark theme and tune notifications without changing how your teammates work." },
    ],
  },
];

export const DOC_CATEGORIES = Array.from(new Map(PUBLIC_DOCS.map((doc) => [doc.category, doc.categoryLabel])).entries()).map(([slug, label]) => ({ slug, label, docs: PUBLIC_DOCS.filter((doc) => doc.category === slug) }));

export const TUTORIALS = PUBLIC_DOCS.filter((doc) => doc.videoId).map((doc) => ({ title: doc.title, category: doc.categoryLabel, description: doc.description, href: `/docs/${doc.category}/${doc.slug}`, videoId: doc.videoId! }));

export function findDoc(category: string, slug: string) {
  return PUBLIC_DOCS.find((doc) => doc.category === category && doc.slug === slug);
}
