import React, { useState } from 'react';
import { NotificationItem } from '../types';
import { Icon } from '../icons';
import { TN } from '../tokens';

interface NotificationsViewProps {
  notifications?: NotificationItem[];
  notifs?: NotificationItem[];
  readMap?: Record<string, boolean>;
  readNotifs?: Record<string, boolean>;
  onOpenNotification?: (item: NotificationItem) => void;
  onMarkRead?: (id: string) => void;
  onOpenTask?: (id: string) => void;
}

const NT: Record<string, string> = {
  mention: 'purple',
  assigned: 'blue',
  blocked: 'red',
  due: 'amber',
  review: 'purple',
  automation: 'teal',
  github: 'gray',
  invite: 'green',
};

export function NotificationsView({
  notifications,
  notifs,
  readMap,
  readNotifs,
  onOpenNotification,
  onMarkRead,
  onOpenTask,
}: NotificationsViewProps) {
  const activeNotifs = notifs || notifications || [];
  const activeReadMap = readNotifs || readMap || {};
  const handleOpen = onOpenNotification || ((item: NotificationItem) => {
    onMarkRead?.(item.id);
    if (item.task) onOpenTask?.(item.task);
  });
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'mention' | 'assigned'>('all');

  const filterFn = {
    all: () => true,
    unread: (n: NotificationItem) => !activeReadMap[n.id],
    mention: (n: NotificationItem) => n.type === 'mention',
    assigned: (n: NotificationItem) => n.type === 'assigned',
  }[activeTab];

  const visible = activeNotifs.filter(filterFn);

  return (
    <div data-screen-label="Notifications" style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 2,
          borderBottom: '2px solid var(--color-divider)',
        }}
      >
        {[
          { id: 'all', label: 'All', count: activeNotifs.length },
          { id: 'unread', label: 'Unread', count: activeNotifs.filter((n) => !activeReadMap[n.id]).length },
          { id: 'mention', label: 'Mentions', count: activeNotifs.filter((n) => n.type === 'mention').length },
          { id: 'assigned', label: 'Assigned', count: activeNotifs.filter((n) => n.type === 'assigned').length },
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
                color: on ? 'var(--color-text)' : 'color-mix(in srgb, var(--color-text) 60%, transparent)',
              }}
            >
              {tb.label} <span style={{ opacity: 0.55, fontWeight: 400 }}>{tb.count}</span>
            </button>
          );
        })}
      </div>

      {visible.map((n) => {
        const u = !activeReadMap[n.id];
        const tn = TN[NT[n.type] || 'gray'] || TN.gray;
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => handleOpen(n)}
            style={{
              display: 'grid',
              gridTemplateColumns: '10px 40px minmax(0, 1fr) auto',
              gap: 14,
              alignItems: 'center',
              padding: '14px 4px',
              border: 0,
              borderBottom: '1px solid var(--color-divider)',
              textAlign: 'left',
              cursor: 'pointer',
              background: u ? TN.blue.bg : 'transparent',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                background: u ? TN.blue.solid : 'transparent',
                borderRadius: 'var(--r-av)',
              }}
            />
            <span
              style={{
                width: 40,
                height: 40,
                background: tn.bg,
                color: tn.fg,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <Icon name={n.icon} size={18} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: u ? 700 : 500 }}>{n.title}</span>
              <span className="text-muted" style={{ fontSize: 13 }}>
                {n.detail}
              </span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {n.time}
              </span>
              {n.project && (
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-accent)' }}>
                  {n.project}
                </span>
              )}
            </span>
          </button>
        );
      })}

      {visible.length === 0 && (
        <div style={{ padding: '32px 4px' }}>
          <h4 style={{ margin: '0 0 4px' }}>You’re all caught up</h4>
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
            New mentions, assignments and alerts appear here.
          </p>
        </div>
      )}
    </div>
  );
}
