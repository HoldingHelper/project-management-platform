import React, { useState } from 'react';
import { Person, Team } from '../types';
import { Icon } from '../icons';
import { TN, avBg, ini, st } from '../tokens';
import { PERMS, ROLES, TEAMS, PARTS } from '../seedData';

interface AdminViewProps {
  people: Person[];
  teams?: Team[];
  partitions?: string[];
  partsList?: string[];
  roleOverrides: Record<string, string>;
  permissions?: Record<string, Record<string, boolean>>;
  perms?: Record<string, Record<string, boolean>>;
  integrations: Record<string, boolean>;
  onUpdateRole?: (name: string, role: string) => void;
  onSetRole?: (name: string, role: string) => void;
  onTogglePermission?: (permission: string, role: string) => void;
  onTogglePerm?: (perm: string, role: string) => void;
  onToggleIntegration: (key: string) => void;
  onAddPartition?: (name: string) => void;
  onAddPart?: (newPart: string) => void;
  onOpenPerson: (name: string) => void;
}

const DC: Record<string, string> = {
  eng: 'blue',
  ops: 'teal',
  com: 'green',
  dsn: 'purple',
  mkt: 'magenta',
};

const RC: Record<string, string> = {
  Admin: 'red',
  Manager: 'purple',
  Member: 'blue',
  Viewer: 'gray',
};

export function AdminView({
  people,
  teams = TEAMS,
  partitions,
  partsList = PARTS,
  roleOverrides,
  permissions,
  perms,
  integrations,
  onUpdateRole,
  onSetRole,
  onTogglePermission,
  onTogglePerm,
  onToggleIntegration,
  onAddPartition,
  onAddPart,
  onOpenPerson,
}: AdminViewProps) {
  const activePartitions = partitions || partsList;
  const activePermissions = perms || permissions || {};
  const handleRoleUpdate = onSetRole || onUpdateRole || (() => {});
  const handlePermToggle = onTogglePerm || onTogglePermission || (() => {});
  const handleAddPartition = onAddPart || onAddPartition || (() => {});
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'integrations' | 'partitions'>('users');
  const [searchQ, setSearchQ] = useState('');
  const [newPartName, setNewPartName] = useState('');

  const cleanQ = searchQ.trim().toLowerCase();
  const visiblePeople = people.filter(
    (u) => !cleanQ || `${u.name} ${u.email}`.toLowerCase().includes(cleanQ)
  );

  const defaultRole = (u: Person) =>
    u.name === 'Platform Admin' || u.kind === 'exec'
      ? 'Admin'
      : u.kind === 'head' || u.kind === 'lead'
      ? 'Manager'
      : 'Member';

  const handleAddPartitionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName.trim()) return;
    handleAddPartition(newPartName.trim());
    setNewPartName('');
  };

  const INTEGRATION_DEFS = [
    {
      id: 'github',
      name: 'GitHub',
      desc: 'Import issues as Backlog tasks and link pull requests.',
      icon: 'git',
      color: 'var(--color-text)',
    },
    {
      id: 'slack',
      name: 'Slack',
      desc: 'Post project updates and blocked alerts to channels.',
      icon: 'chat',
      color: TN.purple.solid,
    },
    {
      id: 'google',
      name: 'Google Workspace',
      desc: 'Sync accounts and single sign-on.',
      icon: 'mail',
      color: TN.blue.solid,
    },
    {
      id: 'webhooks',
      name: 'Webhooks',
      desc: 'Send task and project events to your own endpoints.',
      icon: 'automations',
      color: TN.orange.solid,
    },
  ];

  return (
    <div
      data-screen-label="Administration"
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Tabs */}
      <div style={{ borderBottom: '2px solid var(--color-divider)' }}>
        <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {[
            { id: 'users', label: 'Users', count: people.length },
            { id: 'roles', label: 'Roles & permissions', count: '' },
            { id: 'integrations', label: 'Integrations', count: '' },
            { id: 'partitions', label: 'Partitions', count: activePartitions.length },
          ].map((tb) => {
            const on = activeTab === tb.id;
            return (
              <button
                key={tb.id}
                role="tab"
                type="button"
                onClick={() => setActiveTab(tb.id as any)}
                style={{
                  padding: '10px 12px',
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  borderBottom: '2px solid transparent',
                  marginBottom: -2,
                  borderBottomColor: on ? 'var(--color-accent)' : 'transparent',
                  color: on
                    ? 'var(--color-text)'
                    : 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                }}
              >
                {tb.label}{' '}
                {tb.count !== '' && (
                  <span style={{ opacity: 0.55, fontWeight: 400 }}>{tb.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Users */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '0 1 320px', minWidth: 200 }}>
              <Icon
                name="search"
                size={16}
                style={{ position: 'absolute', left: 12, top: 12, opacity: 0.55 }}
              />
              <input
                className="input"
                style={{ minHeight: 40, paddingLeft: 36 }}
                placeholder="Search users…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                aria-label="Search users…"
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 800 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(260px, 2fr) 200px 160px 110px',
                  gap: 16,
                  padding: 8,
                  borderBottom: '2px solid var(--color-divider)',
                  fontSize: 11,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                }}
              >
                <span>User</span>
                <span>Team</span>
                <span>Role</span>
                <span>Status</span>
              </div>

              {visiblePeople.map((u) => {
                const tm = teams.find((t) => t.id === u.team);
                const currentRole = roleOverrides[u.name] || defaultRole(u);
                const status = u.invited ? 'Invited' : 'Active';
                const sObj = st(status);
                const deptColor = TN[DC[u.dept] || 'gray']?.solid || TN.gray.solid;

                return (
                  <div
                    key={u.name}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(260px, 2fr) 200px 160px 110px',
                      gap: 16,
                      alignItems: 'center',
                      padding: '10px 8px',
                      borderBottom: '1px solid var(--color-divider)',
                      fontSize: 14,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPerson(u.name)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        border: 0,
                        background: 'transparent',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                        minWidth: 0,
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <span
                        title={u.name}
                        style={{
                          width: 32,
                          height: 32,
                          flex: 'none',
                          background: avBg(u.name),
                          color: 'var(--on-solid)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 11,
                          fontWeight: 800,
                          borderRadius: 'var(--r-av)',
                        }}
                      >
                        {ini(u.name)}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontWeight: 600 }}>{u.name}</span>
                        <span className="text-muted" style={{ fontSize: 12 }}>
                          {u.email}
                        </span>
                      </span>
                    </button>

                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          flex: 'none',
                          background: deptColor,
                          borderRadius: 'var(--r-av)',
                        }}
                      />
                      {tm ? tm.name : 'Leadership'}
                    </span>

                    <select
                      className="input"
                      aria-label={`Role for ${u.name}`}
                      style={{ minHeight: 36 }}
                      value={currentRole}
                      onChange={(e) => handleRoleUpdate(u.name, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>

                    <span>
                      <span
                        className="tag"
                        style={{
                          background: sObj.sBg,
                          color: sObj.sFg,
                          border: `1px solid ${sObj.sBd}`,
                          whiteSpace: 'nowrap',
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '.04em',
                          padding: '2px 8px',
                          borderRadius: 'var(--r-xs)',
                        }}
                      >
                        {status}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Roles & Permissions */}
      {activeTab === 'roles' && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 720 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(260px, 2fr) repeat(4, 110px)',
                gap: 12,
                alignItems: 'center',
                padding: 8,
                borderBottom: '2px solid var(--color-divider)',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                }}
              >
                Permission
              </span>
              {ROLES.map((r) => {
                const tn = TN[RC[r] || 'gray'] || TN.gray;
                return (
                  <span key={r}>
                    <span className="tag" style={{ background: tn.bg, color: tn.fg, fontWeight: 700 }}>
                      {r}
                    </span>
                  </span>
                );
              })}
            </div>

            {PERMS.map((p) => (
              <div
                key={p}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(260px, 2fr) repeat(4, 110px)',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 8px',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 14,
                }}
              >
                <span>{p}</span>
                {ROLES.map((r) => {
                  const on = activePermissions[p]?.[r];
                  const locked = r === 'Admin';
                  return (
                    <span key={r}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${r}: ${p}`}
                        onClick={() => handlePermToggle(p, r)}
                        disabled={locked}
                        style={{
                          width: 22,
                          height: 22,
                          padding: 0,
                          display: 'grid',
                          placeItems: 'center',
                          cursor: locked ? 'default' : 'pointer',
                          border: on ? 0 : '1.5px solid var(--color-neutral-500)',
                          background: on
                            ? locked
                              ? 'var(--color-neutral-500)'
                              : TN.green.solid
                            : 'transparent',
                          color: on ? 'var(--on-solid)' : 'transparent',
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        <Icon name="check" size={13} strokeWidth={3.5} />
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
            <p className="text-muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
              Admin always has every permission.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Integrations */}
      {activeTab === 'integrations' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {INTEGRATION_DEFS.map((g) => {
            const on = integrations[g.id];
            const status = on ? 'Connected' : 'Not connected';
            const sObj = st(status);

            return (
              <div
                key={g.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  padding: 18,
                  background: 'var(--color-surface)',
                  borderTop: `4px solid ${g.color}`,
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      flex: 'none',
                      background: g.color,
                      color: 'var(--on-solid)',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <Icon name={g.icon} size={20} />
                  </span>
                  <span style={{ flex: 1, fontWeight: 800, fontSize: 17 }}>{g.name}</span>
                  <span
                    className="tag"
                    style={{
                      background: sObj.sBg,
                      color: sObj.sFg,
                      border: `1px solid ${sObj.sBd}`,
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '.04em',
                      padding: '2px 8px',
                      borderRadius: 'var(--r-xs)',
                    }}
                  >
                    {status}
                  </span>
                </div>
                <p className="text-muted" style={{ margin: 0, fontSize: 14, flex: 1 }}>
                  {g.desc}
                </p>
                <button
                  type="button"
                  className={`btn ${on ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => onToggleIntegration(g.id)}
                  style={{ alignSelf: 'flex-start', minHeight: 38, borderRadius: 'var(--r-sm)' }}
                >
                  {on ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 4: Partitions */}
      {activeTab === 'partitions' && (
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 640 }}>
          {activePartitions.map((p) => {
            const tn = TN.blue;
            return (
              <div
                key={p}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '14px minmax(0, 1fr) auto auto',
                  gap: 14,
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--color-divider)',
                }}
              >
                <span style={{ width: 14, height: 14, background: tn.solid }} />
                <span style={{ fontWeight: 700 }}>{p}</span>
                <span className="text-muted" style={{ fontSize: 13 }}>
                  Active partition
                </span>
                <span className="tag" style={{ background: tn.bg, color: tn.fg, fontWeight: 700 }}>
                  {p}
                </span>
              </div>
            );
          })}

          <form onSubmit={handleAddPartitionSubmit} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <input
              className="input"
              style={{ minHeight: 40 }}
              placeholder="New partition name"
              value={newPartName}
              onChange={(e) => setNewPartName(e.target.value)}
              aria-label="New partition name"
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minHeight: 40, flex: 'none', borderRadius: 'var(--r-sm)' }}
            >
              Add partition
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
