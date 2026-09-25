'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Project,
  Task,
  Person,
  DocFile,
  AutomationRule,
  ChatMessage,
} from './types';
import { Icon, IC } from './icons';
import {
  THEMES,
  RADII,
  THEME_KEYS,
  buildTN,
  tone,
  st,
  seg,
  dayStr,
  ini,
  avBg,
  projBg,
  FOLDERS,
  PLUG,
  PARTS,
  ME,
  TODAY,
} from './tokens';
import {
  PROJECTS,
  TASKS,
  NOTIFS,
  ACTS,
  AUTOS,
  MSGS,
  DOCS,
  buildPeople,
  initPerms,
  DEPTS,
  TEAMS,
} from './seedData';

// Views
import { HomeView } from './views/HomeView';
import { ProjectsView } from './views/ProjectsView';
import { TimelineView } from './views/TimelineView';
import { ProjectDetailView } from './views/ProjectDetailView';
import { TasksView } from './views/TasksView';
import { AiGeneratorView } from './views/AiGeneratorView';
import { AutomationsView } from './views/AutomationsView';
import { NotificationsView } from './views/NotificationsView';
import { ActivityView } from './views/ActivityView';
import { OrgChartView } from './views/OrgChartView';
import { PerformanceView } from './views/PerformanceView';
import { ExecutiveView } from './views/ExecutiveView';
import { AdminView } from './views/AdminView';
import { VaultHomeView } from './views/VaultHomeView';
import { VaultGraphView } from './views/VaultGraphView';
import { DocDetailView } from './views/DocDetailView';

// Overlays
import { TaskDrawer } from './overlays/TaskDrawer';
import { PersonDrawer } from './overlays/PersonDrawer';
import { CreateTaskDialog } from './overlays/CreateTaskDialog';
import { CreateProjectDialog } from './overlays/CreateProjectDialog';
import { InviteDialog } from './overlays/InviteDialog';
import { CreateDocDialog } from './overlays/CreateDocDialog';
import { CommandPalette } from './overlays/CommandPalette';
import { SlidePresenter } from './overlays/SlidePresenter';
import { ChatDrawer } from './overlays/ChatDrawer';
import { Toast } from './overlays/Toast';

export interface ModernistPlatformProps {
  initialMode?: 'teams' | 'docs';
  initialPage?: string;
  theme?: 'ocean' | 'modernist' | 'midnight' | 'glass';
  corners?: 'sharp' | 'soft' | 'round';
}

export const ModernistPlatform: React.FC<ModernistPlatformProps> = ({
  initialMode = 'teams',
  initialPage = 'home',
  theme = 'ocean',
  corners = 'soft',
}) => {
  const router = useRouter();

  // Mode and Page
  const [mode, setMode] = useState<'teams' | 'docs'>(initialMode);
  const [page, setPage] = useState<string>(initialPage);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Overlays state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatView, setChatView] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [dialog, setDialog] = useState<'task' | 'project' | 'invite' | 'doc' | null>(null);
  const [taskDialogPreset, setTaskDialogPreset] = useState<{ project?: string; status?: string; assignees?: string[] }>({});
  const [docDialogPreset, setDocDialogPreset] = useState<{ type?: DocFile['type']; folder?: string }>({});
  const [palette, setPalette] = useState(false);
  const [presenting, setPresenting] = useState<string | null>(null);
  const [toastData, setToastData] = useState<{ text: string; actLabel?: string; act?: () => void } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile / Navigation
  const [navOpen, setNavOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Docs state
  const [docId, setDocId] = useState<string | null>(null);
  const [docView, setDocView] = useState<'all' | 'recent' | 'starred' | 'graph' | 'tag'>('all');
  const [docTag, setDocTag] = useState<string | null>(null);
  const [starred, setStarred] = useState<Record<string, boolean>>({ d2: true, f3: true });
  const [folderOpen, setFolderOpen] = useState<Record<string, boolean>>({ handbook: true, eng: true, ops: true });

  // Data Collections
  const [projects, setProjects] = useState<Project[]>(PROJECTS);
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [people, setPeople] = useState<Person[]>(buildPeople());
  const [docs, setDocs] = useState<DocFile[]>(DOCS);
  const [chatMsgs, setChatMsgs] = useState<Record<string, ChatMessage[]>>(MSGS);
  const [autos, setAutos] = useState<AutomationRule[]>(AUTOS);
  const [readNotifs, setReadNotifs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFS.filter(n => !n.unread).map(n => [n.id, true]))
  );
  const [perms, setPerms] = useState(initPerms());
  const [roleOverrides, setRoleOverrides] = useState<Record<string, string>>({});
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({
    github: true,
    slack: false,
    google: true,
    webhooks: true,
  });
  const [partsList, setPartsList] = useState<string[]>(PARTS);

  // Theme application
  useEffect(() => {
    buildTN(theme === 'midnight');
    const root = document.documentElement;
    const style = root.style;
    THEME_KEYS.forEach(x => style.removeProperty(x));
    const activeTheme = THEMES[theme] || THEMES.ocean;
    const activeRadius = RADII[corners] || RADII.soft;
    Object.entries({ ...activeTheme, ...activeRadius }).forEach(([k, v]) => {
      style.setProperty(k, v);
    });
    root.style.colorScheme = theme === 'midnight' ? 'dark' : 'light';
  }, [theme, corners]);

  // Global Keydown Handler (⌘K, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(prev => !prev);
      }
      if (e.key === 'Escape') {
        setPalette(false);
        setDialog(null);
        setTaskId(null);
        setPersonId(null);
        setPresenting(null);
        setNavOpen(false);
        setMobileMoreOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toast = (text: string, actLabel?: string, act?: () => void) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastData({ text, actLabel, act });
    toastTimeoutRef.current = setTimeout(() => {
      setToastData(null);
    }, 5000);
  };

  // Helper functions
  const unreadCount = NOTIFS.filter(n => !readNotifs[n.id]).length;

  const navigateTo = (newPage: string, extra?: { projectId?: string; taskTab?: string }) => {
    setMode('teams');
    setPage(newPage);
    if (extra?.projectId) setProjectId(extra.projectId);
    else if (newPage !== 'project') setProjectId(null);
    setTaskId(null);
    setPersonId(null);
    setPalette(false);
    setNavOpen(false);
    setMobileMoreOpen(false);
  };

  const openTaskDialog = (pre: { project?: string; status?: string; assignees?: string[] } = {}) => {
    setTaskDialogPreset(pre);
    setDialog('task');
  };

  const openDocDialog = (pre: { type?: DocFile['type']; folder?: string } = {}) => {
    setDocDialogPreset(pre);
    setDialog('doc');
  };

  const handleUpdateTask = (id: string, patch: Partial<Task>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  };

  const handleCreateTask = (newTask: Task) => {
    setTasks(prev => [...prev, newTask]);
    toast(`${newTask.id} created: ${newTask.title}`, 'View', () => setTaskId(newTask.id));
  };

  const handleCreateProject = (newProj: Project, starterTasks: Task[], createChannel: boolean) => {
    setProjects(prev => [...prev, newProj]);
    if (starterTasks.length > 0) {
      setTasks(prev => [...prev, ...starterTasks]);
    }
    if (createChannel) {
      setChatMsgs(prev => ({
        ...prev,
        [newProj.id]: [{ who: ME, t: 'Just now', text: `Channel created for ${newProj.name}.` }],
      }));
    }
    setProjectId(newProj.id);
    setPage('project');
    toast(`${newProj.id} ${newProj.name} created with ${starterTasks.length} starter tasks`);
  };

  const handleInvitePerson = (newPerson: Person, role: string) => {
    setPeople(prev => [...prev, newPerson]);
    setRoleOverrides(prev => ({ ...prev, [newPerson.name]: role }));
    toast(`Invitation sent to ${newPerson.email}`);
  };

  const handleNewDocFile = (
    docType: DocFile['type'],
    tpl: string,
    name: string,
    folder: string,
    tags: string[]
  ): string => {
    const id = 'n' + Date.now().toString(36) + Math.floor(Math.random() * 90 + 10);
    const plInfo = PLUG[docType] || PLUG.note;
    const newDoc: DocFile = {
      id,
      title: name || `Untitled ${plInfo.l.toLowerCase()}`,
      type: docType,
      folder: folder || 'att',
      team: 'plt',
      owner: ME,
      updated: 'Sep 25',
      status: 'Draft',
      tags: tags || [],
      links: [],
      summary: `${plInfo.l} created from ${tpl} template.`,
      blocks: docType === 'note' ? [{ k: 'p', t: '' }] : [],
    };
    setDocs(prev => [...prev, newDoc]);
    return id;
  };

  const handleUpdateDoc = (id: string, fn: (doc: DocFile) => DocFile) => {
    setDocs(prev => prev.map(d => (d.id === id ? fn(d) : d)));
  };

  // Nav definitions
  const NAV_SECTIONS = [
    {
      label: 'Workspace',
      items: [
        { id: 'home', label: 'Home', icon: IC.home },
        { id: 'projects', label: 'Projects', icon: IC.projects },
        { id: 'tasks', label: 'Tasks', icon: IC.tasks },
        { id: 'timeline', label: 'Timeline', icon: IC.timeline },
        { id: 'ai', label: 'AI Generator', icon: IC.ai },
        { id: 'automations', label: 'Automations', icon: IC.automations },
      ],
    },
    {
      label: 'Communication',
      items: [
        { id: 'notifications', label: 'Notifications', icon: IC.notifications, badge: unreadCount },
        { id: 'activity', label: 'Activity', icon: IC.activity },
      ],
    },
    {
      label: 'Monitoring',
      items: [
        { id: 'org', label: 'Org Chart', icon: IC.org },
        { id: 'perf', label: 'Team Performance', icon: IC.perf },
        { id: 'exec', label: 'Executive', icon: IC.exec },
      ],
    },
    {
      label: 'Administration',
      items: [{ id: 'admin', label: 'Administration', icon: IC.admin }],
    },
  ];

  // Active Project for project page
  const currentProject = page === 'project' && projectId ? projects.find(p => p.id === projectId) : null;
  const currentDoc = mode === 'docs' && docId ? docs.find(d => d.id === docId) : null;

  // Header breadcrumb calculations
  const { crumbKicker, crumbTitle } = useMemo(() => {
    if (mode === 'docs') {
      if (currentDoc) {
        const fo = FOLDERS.find(f => f[0] === currentDoc.folder) || ['att', 'Vault'];
        return { crumbKicker: `Vault · ${fo[1]}`, crumbTitle: currentDoc.title };
      }
      if (docView === 'graph') {
        return { crumbKicker: 'Knowledge vault', crumbTitle: 'Graph view' };
      }
      const VT: Record<string, string> = {
        all: 'Company vault',
        recent: 'Recent files',
        starred: 'Starred',
        tag: `#${docTag}`,
      };
      return { crumbKicker: 'Knowledge vault', crumbTitle: VT[docView] || 'Company vault' };
    }

    if (page === 'project' && currentProject) {
      return {
        crumbKicker: `${currentProject.id} · ${currentProject.partition} · ${currentProject.level}`,
        crumbTitle: currentProject.name,
      };
    }

    const titles: Record<string, [string, string]> = {
      home: ['Personal', 'Home Dashboard'],
      projects: ['Organization', 'Project Portfolio'],
      tasks: ['Organization', 'Task Browser'],
      timeline: ['Global views', 'Portfolio Timeline'],
      ai: ['Workspace', 'AI Generator'],
      automations: ['Workspace', 'Automations'],
      notifications: ['Communication', 'Notifications'],
      activity: ['Communication', 'Activity'],
      org: ['Organization', 'Organization Hierarchy'],
      perf: ['Monitoring', 'Team Performance'],
      exec: ['Monitoring', 'Executive Overview'],
      admin: ['Administration', 'Administration'],
    };

    const t = titles[page] || ['Workspace', 'Project Platform'];
    return { crumbKicker: t[0], crumbTitle: t[1] };
  }, [mode, page, currentProject, currentDoc, docView, docTag]);

  // Page header meta (title, subtitle, actions)
  const pageHeader = useMemo(() => {
    const act = (label: string, icon: string, on: () => void, primary?: boolean) => ({
      label,
      icon,
      on,
      cls: primary ? 'btn-primary' : 'btn-secondary',
      minW: primary ? '150px' : 'auto',
    });

    interface PageHeaderData {
      kicker: string;
      title: string;
      sub: string;
      hasBack: boolean;
      backLabel: string;
      back: () => void;
      actions: ReturnType<typeof act>[];
    }

    const createHeader = (
      kicker: string,
      title: string,
      sub: string,
      actions: ReturnType<typeof act>[] = [],
      hasBack = false,
      backLabel = '',
      back = () => {}
    ): PageHeaderData => ({
      kicker,
      title,
      sub,
      hasBack,
      backLabel,
      back,
      actions,
    });

    if (mode === 'docs') {
      if (currentDoc) {
        const fo = FOLDERS.find(f => f[0] === currentDoc.folder) || ['att', 'Attachments'];
        return createHeader(
          `${(PLUG[currentDoc.type] || PLUG.note).l} · ${fo[1]}`,
          currentDoc.title,
          currentDoc.summary,
          [],
          true,
          'Vault',
          () => setDocId(null)
        );
      }
      if (docView === 'graph') {
        return createHeader(
          'Knowledge vault',
          'Graph view',
          'How every file links to the others. Hover a file to trace its links, click to open it.',
          [act('New file', IC.plus, () => openDocDialog(), true)],
          true,
          'All files',
          () => setDocView('all')
        );
      }
      return createHeader(
        'Knowledge vault',
        docView === 'starred' ? 'Starred files' : docView === 'recent' ? 'Recently updated' : 'Company vault',
        `${docs.length} files in ${FOLDERS.length} folders: notes, canvases, sheets, slides, PDFs, audio, images and charts, all linked.`,
        [
          act('Graph view', IC.graph, () => setDocView('graph')),
          act('New file', IC.plus, () => openDocDialog(), true),
        ]
      );
    }

    if (page === 'project' && currentProject) {
      return createHeader(
        `${currentProject.id} · ${currentProject.partition} · ${currentProject.level}`,
        currentProject.name,
        currentProject.desc,
        [act('New task', IC.plus, () => openTaskDialog({ project: currentProject.id }), true)],
        true,
        'All projects',
        () => navigateTo('projects')
      );
    }

    const META: Record<string, PageHeaderData> = {
      home: createHeader(
        'Personal',
        'Home Dashboard',
        'Assigned tasks and personal delivery signals.',
        [
          act('New project', IC.projects, () => setDialog('project')),
          act('Create task', IC.plus, () => openTaskDialog(), true),
        ]
      ),
      projects: createHeader(
        'Organization',
        'Project Portfolio',
        `${projects.length} projects · organization-wide.`,
        [
          act('AI project', IC.ai, () => navigateTo('ai')),
          act('New project', IC.plus, () => setDialog('project'), true),
        ]
      ),
      tasks: createHeader(
        'Organization',
        'Task Browser',
        `${tasks.length} total tasks across all projects and partitions.`,
        [act('New task', IC.plus, () => openTaskDialog(), true)]
      ),
      timeline: createHeader(
        'Global views',
        'Portfolio Timeline',
        'Project-only Gantt filtered by required project level.'
      ),
      ai: createHeader(
        'Workspace',
        'AI Generator',
        'Describe a project and get a draft plan with phases and tasks. Review it before anything is created.'
      ),
      automations: createHeader(
        'Workspace',
        'Automations',
        `${autos.filter(a => a.on).length} of ${autos.length} rules active.`,
        [
          act(
            'New automation',
            IC.plus,
            () =>
              setAutos(prev => [
                ...prev,
                {
                  id: 'a' + Date.now(),
                  name: 'Untitled rule',
                  when: 'Choose a trigger',
                  then: 'Choose an action',
                  scope: 'All projects',
                  runs: 0,
                  last: 'Never',
                  on: false,
                },
              ]),
            true
          ),
        ]
      ),
      notifications: createHeader(
        'Communication',
        'Notifications',
        `${unreadCount} unread notifications.`,
        [
          act('Mark all as read', IC.check, () => {
            setReadNotifs(Object.fromEntries(NOTIFS.map(n => [n.id, true])));
          }),
        ]
      ),
      activity: createHeader(
        'Communication',
        'Activity',
        'Everything that changed across projects, tasks, people and integrations.'
      ),
      org: createHeader(
        'Organization',
        'Organization Structure',
        'Company hierarchy, reporting lines, departments and teams.',
        [act('Invite teammate', IC.userplus, () => setDialog('invite'), true)]
      ),
      perf: createHeader(
        'Monitoring',
        'Team Performance',
        'Delivery signals per team over the selected period.'
      ),
      exec: createHeader(
        'Monitoring',
        'Executive Overview',
        'Org-wide delivery health across partitions and departments.'
      ),
      admin: createHeader(
        'Administration',
        'Administration',
        'Users, roles, integrations and workspace settings.',
        [act('Invite user', IC.userplus, () => setDialog('invite'), true)]
      ),
    };

    return META[page] || createHeader('Workspace', 'Platform', '');
  }, [mode, page, currentProject, currentDoc, docView, docs.length, projects.length, tasks.length, autos, unreadCount]);

  // Stats row for selected views
  const statsList = useMemo(() => {
    if (mode === 'docs') return [];

    if (page === 'home') {
      const mine = tasks.filter(t => t.assignees.includes(ME));
      const myOpen = mine.filter(t => t.status !== 'Done');
      const myDone = mine.filter(t => t.status === 'Done');
      const myProg = myOpen.filter(t => t.status === 'In progress');
      const attention = myOpen.filter(
        t => t.status === 'Blocked' || t.status === 'In review' || (t.e != null && t.e < TODAY)
      );
      return [
        { label: 'Assigned tasks', v: myOpen.length, sub: 'currently open', icon: IC.target, color: tone('blue').fg },
        { label: 'Completed', v: myDone.length, sub: 'this month', icon: IC.check, color: tone('green').fg },
        { label: 'In progress', v: myProg.length, sub: 'active assigned work', icon: IC.activity, color: tone('blue').fg },
        {
          label: 'Needs attention',
          v: attention.length,
          sub: 'reviews, blockers and late work',
          icon: IC.automations,
          color: attention.length ? tone('red').fg : 'inherit',
        },
      ];
    }

    if (page === 'project' && currentProject) {
      const pTasks = tasks.filter(t => t.project === currentProject.id);
      return [
        { label: 'Progress', v: `${currentProject.progress}%`, sub: currentProject.status, icon: IC.activity, color: tone('blue').fg },
        { label: 'Open tasks', v: pTasks.filter(t => t.status !== 'Done').length, sub: 'not done', icon: IC.tasks, color: tone('blue').fg },
        { label: 'Done', v: pTasks.filter(t => t.status === 'Done').length, sub: 'completed tasks', icon: IC.check, color: tone('green').fg },
        { label: 'Due', v: dayStr(currentProject.e), sub: 'target date', icon: IC.timeline, color: 'inherit' },
      ];
    }

    if (page === 'timeline') {
      return [
        { label: 'Projects in view', v: projects.length, sub: 'Portfolio', icon: IC.projects, color: 'inherit' },
        { label: 'Average progress', v: '56%', sub: 'across active', icon: IC.activity, color: 'inherit' },
        { label: 'At risk / blocked', v: projects.filter(p => p.status === 'At risk' || p.status === 'Blocked').length, sub: 'need decision', icon: IC.automations, color: tone('amber').fg },
      ];
    }

    if (page === 'org') {
      return [
        { label: 'Total teammates', v: people.length, sub: 'active members', icon: IC.teams, color: 'inherit' },
        { label: 'Departments', v: DEPTS.length, sub: 'functional units', icon: IC.building, color: 'inherit' },
        { label: 'Teams', v: TEAMS.length, sub: 'squads and delivery', icon: IC.org, color: 'inherit' },
        { label: 'Reporting lines', v: 9, sub: 'managers with reports', icon: IC.org, color: 'inherit' },
      ];
    }

    if (page === 'exec') {
      return [
        { label: 'Active projects', v: projects.filter(p => p.status !== 'Done' && p.status !== 'Planned').length, sub: 'in flight', icon: IC.projects, color: tone('blue').fg },
        { label: 'Completed', v: projects.filter(p => p.status === 'Done').length, sub: 'this quarter', icon: IC.check, color: tone('green').fg },
        { label: 'At risk', v: projects.filter(p => p.status === 'At risk').length, sub: 'slipping', icon: IC.timeline, color: tone('amber').fg },
        { label: 'Blocked', v: projects.filter(p => p.status === 'Blocked').length, sub: 'waiting decision', icon: IC.x, color: tone('red').fg },
      ];
    }

    return [];
  }, [mode, page, tasks, projects, people, currentProject]);

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'var(--font-body)', color: 'var(--color-text)', background: 'transparent' }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar */}
        <aside
          data-side="1"
          data-open={navOpen ? '1' : '0'}
          style={{
            width: '248px',
            flex: 'none',
            position: 'sticky',
            top: 0,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '2px solid var(--color-divider)',
            background: 'var(--panel)',
            backdropFilter: 'var(--blur)',
            WebkitBackdropFilter: 'var(--blur)',
            zIndex: 46,
          }}
        >
          {/* Logo / Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '0 20px',
              minHeight: '64px',
              borderBottom: '2px solid var(--color-divider)',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                background: 'var(--color-accent)',
                color: 'var(--on-solid)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: '11px',
                borderRadius: 'var(--r-sm)',
              }}
            >
              PP
            </div>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>Project Platform</div>
              <div className="text-muted" style={{ fontSize: '9.5px', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                Management workspace
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav
            role="navigation"
            aria-label="Primary navigation"
            style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 20px' }}
          >
            {mode === 'teams' ? (
              NAV_SECTIONS.map((group, gIdx) => (
                <div key={gIdx}>
                  <h6 className="text-muted" style={{ margin: '20px 10px 6px', fontSize: '10.5px' }}>
                    {group.label}
                  </h6>
                  {group.items.map(item => {
                    const active = page === item.id || (item.id === 'projects' && page === 'project');
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigateTo(item.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          width: '100%',
                          padding: '9px 10px',
                          border: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 600,
                          background: active ? 'var(--color-accent-100)' : 'transparent',
                          color: active ? 'var(--color-accent-800)' : 'var(--color-text)',
                          boxShadow: active ? 'inset 3px 0 0 var(--color-accent)' : 'none',
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        <Icon d={item.icon} size={17} style={{ flex: 'none' }} />
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {Boolean(item.badge && item.badge > 0) && (
                          <span
                            style={{
                              minWidth: '20px',
                              height: '20px',
                              padding: '0 5px',
                              background: 'var(--color-accent)',
                              color: 'var(--on-solid)',
                              fontSize: '11px',
                              fontWeight: 800,
                              display: 'grid',
                              placeItems: 'center',
                              borderRadius: '99px',
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '6px', padding: '16px 2px 6px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => openDocDialog()}
                    style={{ flex: 1, minHeight: '36px' }}
                  >
                    <Icon d={IC.plus} size={15} style={{ flex: 'none' }} />
                    New file
                  </button>
                  <button
                    className="btn btn-secondary btn-icon"
                    aria-label="Graph view"
                    title="Graph view"
                    onClick={() => {
                      setDocView('graph');
                      setDocId(null);
                      setNavOpen(false);
                    }}
                    style={{ width: '36px', height: '36px', flex: 'none' }}
                  >
                    <Icon d={IC.graph} size={16} />
                  </button>
                </div>

                {[
                  { id: 'all', label: 'All files', icon: IC.docs, count: docs.length },
                  { id: 'recent', label: 'Recent', icon: IC.clock, count: '' },
                  { id: 'starred', label: 'Starred', icon: IC.star, count: docs.filter(d => starred[d.id]).length },
                  { id: 'graph', label: 'Graph view', icon: IC.graph, count: '' },
                ].map(v => {
                  const on = !docId && docView === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        setDocView(v.id as any);
                        setDocId(null);
                        setDocTag(null);
                        setNavOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        padding: '8px 10px',
                        border: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: on ? 'var(--color-accent-100)' : 'transparent',
                        color: on ? 'var(--color-accent-800)' : 'var(--color-text)',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <Icon d={v.icon} size={16} style={{ flex: 'none' }} />
                      <span style={{ flex: 1 }}>{v.label}</span>
                      <span style={{ fontSize: '12px', opacity: 0.6 }}>{v.count}</span>
                    </button>
                  );
                })}

                <h6 className="text-muted" style={{ margin: '20px 10px 6px', fontSize: '10.5px' }}>
                  Folders
                </h6>
                {FOLDERS.map(([k, l, col]) => {
                  const folderFiles = docs.filter(d => d.folder === k);
                  const open = !!folderOpen[k];
                  const folderColor = tone(col).solid;
                  return (
                    <div key={k}>
                      <button
                        onClick={() => setFolderOpen(prev => ({ ...prev, [k]: !prev[k] }))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '7px 8px',
                          border: 0,
                          background: 'transparent',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 600,
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        <Icon
                          d={IC.chevron}
                          size={13}
                          style={{
                            flex: 'none',
                            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                            opacity: 0.6,
                          }}
                        />
                        <Icon
                          d={IC.folder}
                          size={16}
                          style={{
                            flex: 'none',
                            fill: folderColor,
                            fillOpacity: 0.25,
                            stroke: folderColor,
                            strokeWidth: 1.8,
                          }}
                        />
                        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {l}
                        </span>
                        <span style={{ fontSize: '12px', opacity: 0.55 }}>{folderFiles.length}</span>
                      </button>

                      {open && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '0 0 4px 8px',
                            marginLeft: '15px',
                            borderLeft: '1px solid var(--color-divider)',
                          }}
                        >
                          {folderFiles.map(d => {
                            const on = docId === d.id;
                            const dPl = PLUG[d.type] || PLUG.note;
                            const dTn = tone(dPl.c);
                            return (
                              <button
                                key={d.id}
                                onClick={() => {
                                  setDocId(d.id);
                                  setNavOpen(false);
                                }}
                                title={d.title}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  width: '100%',
                                  padding: '6px 8px',
                                  border: 0,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  background: on ? 'var(--color-accent-100)' : 'transparent',
                                  color: on ? 'var(--color-accent-800)' : 'var(--color-text)',
                                  borderRadius: 'var(--r-sm)',
                                }}
                              >
                                <Icon d={dPl.i} size={14} style={{ flex: 'none', stroke: dTn.solid, strokeWidth: 2 }} />
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {d.title}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <h6 className="text-muted" style={{ margin: '20px 10px 8px', fontSize: '10.5px' }}>
                  Tags
                </h6>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '0 6px' }}>
                  {Array.from(new Set(docs.flatMap(d => d.tags))).slice(0, 10).map((tg, idx) => {
                    const on = docView === 'tag' && docTag === tg;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setDocView('tag');
                          setDocTag(tg);
                          setDocId(null);
                          setNavOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          gap: '4px',
                          padding: '3px 8px',
                          border: 0,
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: on ? 'var(--color-accent-100)' : 'var(--color-neutral-200)',
                          color: on ? 'var(--color-accent-800)' : 'var(--color-neutral-800)',
                          borderRadius: 'var(--r-xs)',
                        }}
                      >
                        #{tg}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>

          {/* User profile footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderTop: '2px solid var(--color-divider)',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '36px',
                height: '36px',
                flex: 'none',
                background: 'var(--color-text)',
                color: 'var(--on-solid)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: 'var(--r-av)',
              }}
            >
              PA
              <span
                style={{
                  position: 'absolute',
                  right: '-3px',
                  bottom: '-3px',
                  width: '10px',
                  height: '10px',
                  background: 'var(--color-accent)',
                  border: '2px solid var(--panel)',
                  borderRadius: 'var(--r-av)',
                }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Platform Admin</div>
              <div className="text-muted" style={{ fontSize: '11px' }}>
                Administrator
              </div>
            </div>
            <button
              className="btn btn-icon"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => router.push('/login')}
            >
              <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" size={16} />
            </button>
          </div>
        </aside>

        {/* Mobile Backdrop */}
        {navOpen && (
          <div
            data-sidebd="1"
            onClick={() => setNavOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 45,
              background: 'color-mix(in srgb, var(--color-text) 40%, transparent)',
            }}
          />
        )}

        {/* Main Content Area */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <header
            data-hdr="1"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 6,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '0 20px',
              minHeight: '64px',
              overflow: 'hidden',
              minWidth: 0,
              containerType: 'inline-size',
              containerName: 'hdr',
              borderBottom: '2px solid var(--color-divider)',
              background: 'var(--panel)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
            }}
          >
            <button
              data-burger="1"
              className="btn btn-secondary btn-icon"
              aria-label="Open menu"
              onClick={() => setNavOpen(!navOpen)}
              style={{
                width: '40px',
                height: '40px',
                flex: 'none',
                display: 'none',
                placeItems: 'center',
              }}
            >
              <Icon d={IC.menu} size={18} />
            </button>

            {/* Mode Segment Switch */}
            <div className="seg" style={{ flex: 'none' }}>
              {[
                { id: 'docs', label: 'Docs', icon: IC.docs },
                { id: 'teams', label: 'Teams', icon: IC.teams },
              ].map((o, idx) => {
                const on = mode === o.id;
                return (
                  <button
                    key={o.id}
                    className="seg-opt"
                    onClick={() => {
                      setMode(o.id as 'teams' | 'docs');
                      setPalette(false);
                      setNavOpen(false);
                    }}
                    style={{
                      border: 0,
                      borderLeft: idx ? '1px solid var(--color-divider)' : '0',
                      background: on ? 'var(--color-accent)' : 'transparent',
                      color: on ? 'var(--on-solid)' : 'var(--color-text)',
                      minHeight: '36px',
                      fontWeight: 600,
                    }}
                  >
                    <Icon d={o.icon} size={15} />
                    <span data-hl="1">{o.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Breadcrumb kicker & title */}
            <div
              data-hc="1"
              style={{
                display: 'flex',
                flexDirection: 'column',
                lineHeight: 1.2,
                minWidth: 0,
                flex: '0 1 auto',
                overflow: 'hidden',
              }}
            >
              <span
                className="text-muted"
                style={{
                  fontSize: '10.5px',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {crumbKicker}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '16px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {crumbTitle}
              </span>
            </div>

            {/* Global Search trigger */}
            <button
              data-search-btn="1"
              onClick={() => setPalette(true)}
              aria-label="Search projects, tasks, people…"
              style={{
                marginLeft: 'auto',
                justifyContent: 'center',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flex: '0 1 300px',
                minWidth: '40px',
                overflow: 'hidden',
                minHeight: '40px',
                padding: '0 10px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-divider)',
                cursor: 'pointer',
                fontSize: '14px',
                color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <Icon d={IC.search} size={16} style={{ flex: 'none' }} />
              <span data-hl="1" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Search projects, tasks, people…
              </span>
              <span
                data-hl="1"
                style={{
                  marginLeft: 'auto',
                  fontSize: '11px',
                  border: '1px solid var(--color-divider)',
                  padding: '1px 6px',
                  flex: 'none',
                  borderRadius: 'var(--r-xs)',
                }}
              >
                ⌘K
              </span>
            </button>

            {/* Header "+ Create" button */}
            <button
              data-create-btn="1"
              className="btn btn-primary"
              aria-label="Create task"
              title="Create task"
              onClick={() => {
                if (mode === 'docs') openDocDialog();
                else openTaskDialog({ project: page === 'project' && projectId ? projectId : undefined });
              }}
              style={{ minHeight: '40px', flex: 'none', borderRadius: 'var(--r-sm)' }}
            >
              <Icon d={IC.plus} size={16} style={{ flex: 'none' }} />
              <span data-hl="1">Create</span>
            </button>

            {/* Notifications button */}
            <button
              className="btn btn-secondary btn-icon"
              aria-label="Notifications"
              onClick={() => navigateTo('notifications')}
              style={{
                position: 'relative',
                width: '40px',
                height: '40px',
                flex: 'none',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <Icon d={IC.notifications} size={18} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 4px',
                    background: 'var(--color-accent)',
                    color: 'var(--on-solid)',
                    fontSize: '10px',
                    fontWeight: 800,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '99px',
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Online Badge */}
            <span
              data-hn="1"
              className="tag tag-neutral"
              style={{ gap: '6px', fontWeight: 600, whiteSpace: 'nowrap', flex: 'none' }}
            >
              <span style={{ width: '7px', height: '7px', background: 'oklch(0.6 0.15 152)', borderRadius: 'var(--r-av)' }} />
              Online
            </span>

            {/* Team chat toggle button */}
            <button
              className="btn btn-secondary btn-icon"
              aria-label="Team chat"
              title="Team chat"
              onClick={() => setChatOpen(!chatOpen)}
              style={{
                width: '40px',
                height: '40px',
                flex: 'none',
                background: chatOpen ? 'var(--color-accent)' : 'transparent',
                color: chatOpen ? 'var(--on-solid)' : 'var(--color-text)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <Icon d={IC.chat} size={18} />
            </button>
          </header>

          {/* Main content body */}
          <main
            role="main"
            data-main="1"
            style={{
              flex: 1,
              width: '100%',
              maxWidth: '1360px',
              padding: '32px',
              containerType: 'inline-size',
              containerName: 'main',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '28px',
              boxSizing: 'border-box',
            }}
          >
            {/* Page Title & Actions Header */}
            <div
              data-pg="1"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: '16px',
                paddingBottom: '24px',
                borderBottom: '2px solid var(--color-divider)',
              }}
            >
              <div style={{ minWidth: 0, maxWidth: '880px' }}>
                {pageHeader.hasBack && (
                  <button
                    className="btn btn-ghost"
                    onClick={pageHeader.back}
                    style={{ margin: '0 0 12px -4px', borderRadius: 'var(--r-sm)' }}
                  >
                    <Icon d={IC.back} size={16} />
                    {pageHeader.backLabel}
                  </button>
                )}
                <h6 style={{ color: 'var(--color-accent)', marginBottom: '10px' }}>
                  {pageHeader.kicker}
                </h6>
                <h1 style={{ margin: 0, fontSize: 'clamp(32px, 3.6vw, 44px)', textWrap: 'balance' }}>
                  {pageHeader.title}
                </h1>
                <div className="text-muted" style={{ fontSize: '15px', marginTop: '8px', textWrap: 'pretty' }}>
                  {pageHeader.sub}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {pageHeader.actions.map((a, i) => (
                  <button
                    key={i}
                    className={`btn ${a.cls}`}
                    onClick={a.on}
                    style={{
                      minHeight: '40px',
                      minWidth: a.minW,
                      justifyContent: 'flex-start',
                      whiteSpace: 'nowrap',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <Icon d={a.icon} size={16} style={{ flex: 'none' }} />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Top Stats Cards if present */}
            {statsList.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  borderBottom: '2px solid var(--color-divider)',
                  marginTop: '-28px',
                }}
              >
                {statsList.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '20px 20px 20px 0',
                      marginRight: '20px',
                      borderRight: '1px solid var(--color-divider)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span className="text-muted" style={{ fontSize: '12px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                        {s.label}
                      </span>
                      <Icon d={s.icon} size={16} style={{ opacity: 0.5 }} />
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 800,
                        fontSize: '42px',
                        lineHeight: 1.05,
                        letterSpacing: '-.02em',
                        color: s.color,
                      }}
                    >
                      {s.v}
                    </div>
                    <div className="text-muted" style={{ fontSize: '12px' }}>
                      {s.sub}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* View Switching */}
            {mode === 'teams' ? (
              <>
                {page === 'home' && (
                  <HomeView
                    tasks={tasks}
                    projects={projects}
                    people={people}
                    onOpenTask={id => setTaskId(id)}
                    onOpenPerson={name => setPersonId(name)}
                    onGoTasks={() => navigateTo('tasks', { taskTab: 'mine' })}
                  />
                )}

                {page === 'projects' && (
                  <ProjectsView
                    projects={projects}
                    tasks={tasks}
                    people={people}
                    partsList={partsList}
                    onOpenProject={id => {
                      setProjectId(id);
                      setPage('project');
                    }}
                  />
                )}

                {page === 'project' && currentProject && (
                  <ProjectDetailView
                    project={currentProject}
                    tasks={tasks}
                    people={people}
                    onOpenTask={(id: string) => setTaskId(id)}
                    onOpenPerson={(name: string) => setPersonId(name)}
                    onUpdateTask={handleUpdateTask}
                    onOpenCreateTask={(status?: string) => openTaskDialog({ project: currentProject.id, status })}
                  />
                )}

                {page === 'tasks' && (
                  <TasksView
                    tasks={tasks}
                    projects={projects}
                    people={people}
                    partsList={partsList}
                    onOpenTask={(id: string) => setTaskId(id)}
                    onUpdateTask={handleUpdateTask}
                    onOpenCreateTask={(status?: string) => openTaskDialog({ status })}
                  />
                )}

                {page === 'timeline' && (
                  <TimelineView
                    projects={projects}
                    tasks={tasks}
                    people={people}
                    onOpenProject={(id: string) => {
                      setProjectId(id);
                      setPage('project');
                    }}
                  />
                )}

                {page === 'ai' && (
                  <AiGeneratorView
                    partsList={partsList}
                    onCreateProject={handleCreateProject}
                  />
                )}

                {page === 'automations' && (
                  <AutomationsView
                    autos={autos}
                    onToggleAuto={(id: string) =>
                      setAutos(prev =>
                        prev.map(a => (a.id === id ? { ...a, on: !a.on } : a))
                      )
                    }
                  />
                )}

                {page === 'notifications' && (
                  <NotificationsView
                    notifs={NOTIFS}
                    readNotifs={readNotifs}
                    onMarkRead={(id: string) => setReadNotifs(prev => ({ ...prev, [id]: true }))}
                    onOpenTask={(id: string) => setTaskId(id)}
                  />
                )}

                {page === 'activity' && (
                  <ActivityView acts={ACTS} />
                )}

                {page === 'org' && (
                  <OrgChartView
                    people={people}
                    onOpenPerson={(name: string) => setPersonId(name)}
                  />
                )}

                {page === 'perf' && (
                  <PerformanceView
                    tasks={tasks}
                    onOpenPerson={(name: string) => setPersonId(name)}
                  />
                )}

                {page === 'exec' && (
                  <ExecutiveView
                    projects={projects}
                    tasks={tasks}
                    people={people}
                    partsList={partsList}
                    onOpenProject={(id: string) => {
                      setProjectId(id);
                      setPage('project');
                    }}
                  />
                )}

                {page === 'admin' && (
                  <AdminView
                    people={people}
                    partsList={partsList}
                    roleOverrides={roleOverrides}
                    perms={perms}
                    integrations={integrations}
                    onOpenPerson={(name: string) => setPersonId(name)}
                    onSetRole={(name: string, role: string) =>
                      setRoleOverrides(prev => ({ ...prev, [name]: role }))
                    }
                    onTogglePerm={(perm: string, role: string) =>
                      setPerms(prev => ({
                        ...prev,
                        [perm]: {
                          ...prev[perm],
                          [role]: !prev[perm][role],
                        },
                      }))
                    }
                    onToggleIntegration={(k: string) => {
                      setIntegrations(prev => ({ ...prev, [k]: !prev[k] }));
                      toast(
                        `${k[0].toUpperCase() + k.slice(1)} ${
                          integrations[k] ? 'disconnected' : 'connected'
                        }`
                      );
                    }}
                    onAddPart={(newPart: string) => {
                      setPartsList(prev => [...prev, newPart]);
                      toast(`Partition ${newPart} added`);
                    }}
                  />
                )}
              </>
            ) : (
              <>
                {currentDoc ? (
                  <DocDetailView
                    doc={currentDoc}
                    docs={docs}
                    teams={TEAMS}
                    starred={starred}
                    onToggleStar={(id: string) => setStarred(prev => ({ ...prev, [id]: !prev[id] }))}
                    onUpdateDoc={handleUpdateDoc}
                    onOpenDoc={(id: string) => setDocId(id)}
                    onNewDocFile={handleNewDocFile}
                    onPresent={(id: string) => setPresenting(id)}
                    onToast={(msg: string) => toast(msg)}
                  />
                ) : docView === 'graph' ? (
                  <VaultGraphView docs={docs} onOpenDoc={(id: string) => setDocId(id)} />
                ) : (
                  <VaultHomeView
                    docs={docs}
                    docView={docView}
                    docTag={docTag}
                    starred={starred}
                    onOpenDoc={(id: string) => setDocId(id)}
                    onOpenCreateDoc={(type?: DocFile['type']) => openDocDialog({ type })}
                  />
                )}
              </>
            )}
          </main>
        </div>

        {/* Team Chat Drawer on the Right */}
        {chatOpen && (
          <ChatDrawer
            chatView={chatView}
            projects={projects}
            people={people}
            messages={chatMsgs}
            onClose={() => setChatOpen(false)}
            onSelectView={setChatView}
            onSendMessage={(convId: string, text: string) => {
              const now = new Date();
              const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              setChatMsgs(prev => ({
                ...prev,
                [convId]: [...(prev[convId] || []), { who: ME, t: timeStr, text }],
              }));
            }}
          />
        )}
      </div>

      {/* Mobile Primary Navigation Bar to satisfy tests & responsive UI */}
      <nav
        role="navigation"
        aria-label="Mobile primary navigation"
        className="pmp-mobile-nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 44,
          background: 'var(--panel)',
          borderTop: '1px solid var(--color-divider)',
          display: 'none',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '8px 4px',
        }}
      >
        <button
          onClick={() => navigateTo('home')}
          style={{ border: 0, background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10 }}
        >
          <Icon d={IC.home} size={18} />
          Home
        </button>
        <button
          onClick={() => navigateTo('projects')}
          style={{ border: 0, background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10 }}
        >
          <Icon d={IC.projects} size={18} />
          Projects
        </button>
        <button
          onClick={() => navigateTo('tasks')}
          style={{ border: 0, background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10 }}
        >
          <Icon d={IC.tasks} size={18} />
          Tasks
        </button>
        <button
          onClick={() => setMobileMoreOpen(true)}
          style={{ border: 0, background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10 }}
        >
          <Icon d={IC.menu} size={18} />
          More
        </button>
      </nav>

      {/* Mobile More Navigation Dialog */}
      {mobileMoreOpen && (
        <div
          role="dialog"
          aria-label="More navigation"
          onClick={() => setMobileMoreOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 65,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              background: 'var(--panel)',
              borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>More navigation</h3>
              <button className="btn btn-icon" onClick={() => setMobileMoreOpen(false)}>
                <Icon d={IC.x} size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {NAV_SECTIONS.flatMap(g => g.items).map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    navigateTo(item.id);
                    setMobileMoreOpen(false);
                  }}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start' }}
                >
                  <Icon d={item.icon} size={16} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* OVERLAYS */}
      {/* 1. Task Drawer */}
      {taskId && (
        <TaskDrawer
          task={tasks.find(t => t.id === taskId) || null}
          project={
            (() => {
              const cur = tasks.find(t => t.id === taskId);
              return cur?.project ? projects.find(p => p.id === cur.project) || null : null;
            })()
          }
          comments={[]}
          onClose={() => setTaskId(null)}
          onUpdateTask={handleUpdateTask}
          onAddComment={(_tId: string, _txt: string) => {
            toast('Comment added');
          }}
          onOpenProject={id => {
            setTaskId(null);
            navigateTo('project', { projectId: id });
          }}
        />
      )}

      {/* 2. Person Drawer */}
      {personId && (
        <PersonDrawer
          person={people.find(p => p.name === personId) || null}
          tasks={tasks.filter(t => t.assignees.includes(personId || ''))}
          teamName={
            (() => {
              const p = people.find(x => x.name === personId);
              const tm = TEAMS.find(t => t.id === p?.team);
              return tm ? tm.name : 'Platform';
            })()
          }
          deptName={
            (() => {
              const p = people.find(x => x.name === personId);
              const dp = DEPTS.find(d => d.id === p?.dept);
              return dp ? dp.name : 'Engineering';
            })()
          }
          onClose={() => setPersonId(null)}
          onOpenTask={id => {
            setPersonId(null);
            setTaskId(id);
          }}
          onMessage={name => {
            setPersonId(null);
            setChatOpen(true);
            setChatView(`dm:${name}`);
          }}
          onAssignTask={name => {
            setPersonId(null);
            openTaskDialog({ assignees: [name] });
          }}
        />
      )}

      {/* 3. Create Task Dialog */}
      {dialog === 'task' && (
        <CreateTaskDialog
          projects={projects}
          people={people}
          partitions={partsList}
          initialProject={taskDialogPreset.project}
          initialStatus={taskDialogPreset.status}
          initialAssignees={taskDialogPreset.assignees}
          onClose={() => setDialog(null)}
          onCreateTask={(newTaskData, createAnother) => {
            const nextNum = Math.max(...tasks.map(t => +t.id.slice(2))) + 1;
            const created: Task = {
              id: `T-${nextNum}`,
              ...newTaskData,
            };
            handleCreateTask(created);
            if (!createAnother) {
              setDialog(null);
            }
          }}
        />
      )}

      {/* 4. Create Project Dialog */}
      {dialog === 'project' && (
        <CreateProjectDialog
          existingProjects={projects}
          teams={TEAMS}
          partitions={partsList}
          nextKey={`P-${Math.max(...projects.map(x => +x.id.slice(2))) + 1}`}
          onClose={() => setDialog(null)}
          onCreateProject={projData => {
            const si = parseInt(projData.start) || 0;
            const ei = parseInt(projData.end) || 60;
            const mi = parseInt(projData.ms) || 30;
            const newP: Project = {
              id: projData.key,
              name: projData.name,
              desc: projData.desc || 'No description yet.',
              color: projData.color,
              partition: projData.partition,
              level: projData.level,
              team: projData.team,
              owner: projData.owner,
              priority: projData.priority,
              status: 'Planned',
              progress: 0,
              updated: 'Sep 25',
              s: si,
              e: ei,
              m: mi,
              dep: projData.dep || undefined,
            };
            let n = Math.max(...tasks.map(t => +t.id.slice(2))) + 1;
            const starterTasks: Task[] = projData.starter
              ? [
                  {
                    id: `T-${n++}`,
                    title: 'Kickoff meeting',
                    project: newP.id,
                    partition: newP.partition,
                    labels: ['setup'],
                    status: 'To do',
                    type: 'Chore',
                    priority: 'Medium',
                    assignees: [newP.owner],
                    s: si,
                    e: si + 2,
                    source: 'In-app',
                    desc: '',
                  },
                ]
              : [];
            handleCreateProject(newP, starterTasks, projData.channel);
            setDialog(null);
          }}
        />
      )}

      {/* 5. Invite Dialog */}
      {dialog === 'invite' && (
        <InviteDialog
          teams={TEAMS}
          onClose={() => setDialog(null)}
          onInvite={({ name, email, team, role }) => {
            const t = TEAMS.find(x => x.id === team) || TEAMS[0];
            const newP: Person = {
              name,
              email,
              team: t.id,
              dept: t.dept,
              role: 'Member',
              mgr: t.lead,
              kind: 'member',
              presence: 'offline',
              invited: true,
            };
            handleInvitePerson(newP, role);
            setDialog(null);
          }}
        />
      )}

      {/* 6. Create Doc Dialog */}
      {dialog === 'doc' && (
        <CreateDocDialog
          initialType={docDialogPreset.type}
          initialFolder={docDialogPreset.folder}
          onClose={() => setDialog(null)}
          onCreateDoc={({ type, name, folder, tpl, tags }) => {
            const newId = handleNewDocFile(type, tpl, name, folder, tags);
            setDocId(newId);
            setMode('docs');
            setDocView('all');
            setDialog(null);
            toast(`Created ${name}`);
          }}
        />
      )}

      {/* 7. Command Palette */}
      {palette && (
        <CommandPalette
          projects={projects}
          tasks={tasks}
          people={people}
          docs={docs}
          onClose={() => setPalette(false)}
          onOpenTask={id => {
            setPalette(false);
            setTaskId(id);
          }}
          onOpenProject={id => {
            setPalette(false);
            navigateTo('project', { projectId: id });
          }}
          onOpenPerson={name => {
            setPalette(false);
            setPersonId(name);
          }}
          onOpenDoc={id => {
            setPalette(false);
            setMode('docs');
            setDocId(id);
          }}
          onNavigatePage={(pg: string) => {
            setPalette(false);
            navigateTo(pg);
          }}
          onTriggerAction={(actKey: string) => {
            setPalette(false);
            if (actKey === 'task') openTaskDialog();
            else if (actKey === 'project') setDialog('project');
            else if (actKey === 'invite') setDialog('invite');
            else if (actKey === 'doc') openDocDialog();
          }}
        />
      )}

      {/* 8. Slide Presenter */}
      {presenting && (
        (() => {
          const pDoc = docs.find(d => d.id === presenting);
          if (!pDoc) return null;
          return (
            <SlidePresenter
              doc={pDoc}
              slideIdx={0}
              onUpdateIdx={() => {}}
              onClose={() => setPresenting(null)}
            />
          );
        })()
      )}

      {/* 9. Toast Notification */}
      {toastData && (
        <Toast
          text={toastData.text}
          actLabel={toastData.actLabel}
          onAct={toastData.act}
          onClose={() => setToastData(null)}
        />
      )}
    </div>
  );
};
