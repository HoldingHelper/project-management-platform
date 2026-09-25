import React, { useState } from 'react';
import { Project, Person, ChatMessage } from '../types';
import { Icon } from '../icons';
import { ini, avBg, projBg, TN, ME } from '../tokens';

interface ChatDrawerProps {
  chatView: string | null;
  projects: Project[];
  people: Person[];
  messages: Record<string, ChatMessage[]>;
  onClose: () => void;
  onSelectView: (view: string | null) => void;
  onSendMessage: (conversationId: string, text: string) => void;
}

export function ChatDrawer({
  chatView,
  projects,
  people,
  messages,
  onClose,
  onSelectView,
  onSendMessage,
}: ChatDrawerProps) {
  const [draft, setDraft] = useState('');

  const isDm = !!chatView && chatView.startsWith('dm:');
  const targetProject = chatView && !isDm ? projects.find((p) => p.id === chatView) : null;

  const chatKicker = !chatView
    ? 'Team chat'
    : isDm
    ? 'Direct message'
    : `Project channel · ${chatView}`;

  const chatTitle = !chatView
    ? 'Conversations'
    : isDm
    ? chatView.slice(3)
    : targetProject
    ? targetProject.name
    : chatView;

  const currentMessages = chatView ? messages[chatView] || [] : [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !chatView) return;
    onSendMessage(chatView, draft.trim());
    setDraft('');
  };

  const dms = ['Aiko Tanaka', 'Jonas Brandt', 'Sofia Marchetti', 'Ravi Kapoor', 'Clara Weiss'];

  return (
    <aside
      data-chat="1"
      data-screen-label="Chat"
      style={{
        width: 320,
        flex: 'none',
        position: 'sticky',
        top: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '2px solid var(--color-divider)',
        background: 'var(--panel)',
        backdropFilter: 'var(--blur)',
        WebkitBackdropFilter: 'var(--blur)',
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px 0 16px',
          minHeight: 64,
          borderBottom: '2px solid var(--color-divider)',
        }}
      >
        {chatView && (
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Back to conversations"
            onClick={() => onSelectView(null)}
          >
            <Icon name="back" size={16} />
          </button>
        )}
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span
            className="text-muted"
            style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase' }}
          >
            {chatKicker}
          </span>
          <span
            style={{
              fontWeight: 800,
              fontSize: 15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {chatTitle}
          </span>
        </span>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Close chat"
          onClick={onClose}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Conversations list view */}
      {!chatView && (
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px 16px' }}>
          <h6 className="text-muted" style={{ margin: '16px 8px 6px', fontSize: 10.5 }}>
            Project channels
          </h6>
          {projects
            .filter((p) => p.status !== 'Done')
            .map((p) => {
              const ms = messages[p.id] || [];
              const last = ms[ms.length - 1];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectView(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: 8,
                    border: 0,
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      flex: 'none',
                      background: projBg(p),
                      color: 'var(--on-solid)',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <Icon name="hash" size={15} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                    <span
                      className="text-muted"
                      style={{
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {last ? `${last.who.split(' ')[0]}: ${last.text}` : 'No messages yet'}
                    </span>
                  </span>
                </button>
              );
            })}

          <h6 className="text-muted" style={{ margin: '16px 8px 6px', fontSize: 10.5 }}>
            Direct messages
          </h6>
          {dms.map((name) => {
            const u = people.find((p) => p.name === name) || {
              name,
              role: 'Member',
              presence: 'online',
            };
            const presColor =
              u.presence === 'online'
                ? TN.green.solid
                : u.presence === 'away'
                ? TN.amber.solid
                : 'var(--color-neutral-400)';
            return (
              <button
                key={name}
                type="button"
                onClick={() => onSelectView(`dm:${name}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: 8,
                  border: 0,
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <span
                  style={{
                    position: 'relative',
                    width: 32,
                    height: 32,
                    flex: 'none',
                    background: avBg(name),
                    color: 'var(--on-solid)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    borderRadius: 'var(--r-av)',
                  }}
                >
                  {ini(name)}
                  <span
                    style={{
                      position: 'absolute',
                      right: -3,
                      bottom: -3,
                      width: 10,
                      height: 10,
                      background: presColor,
                      border: '2px solid var(--panel)',
                      borderRadius: 'var(--r-av)',
                    }}
                  />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {u.role}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Conversation View */}
      {chatView && (
        <>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {currentMessages.map((m, idx) => (
              <div
                key={idx}
                style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10 }}
              >
                <span
                  title={m.who}
                  style={{
                    width: 28,
                    height: 28,
                    flex: 'none',
                    background: avBg(m.who),
                    color: 'var(--on-solid)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 10,
                    fontWeight: 800,
                    borderRadius: 'var(--r-av)',
                  }}
                >
                  {ini(m.who)}
                </span>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{m.who}</span>
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {m.t}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.45 }}>{m.text}</div>
                </div>
              </div>
            ))}
            {currentMessages.length === 0 && (
              <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
                No messages yet. Say hello.
              </p>
            )}
          </div>

          <form
            onSubmit={handleSend}
            style={{
              display: 'flex',
              gap: 6,
              padding: 12,
              borderTop: '2px solid var(--color-divider)',
            }}
          >
            <input
              className="input"
              style={{ minHeight: 40 }}
              placeholder="Message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Message"
            />
            <button
              type="submit"
              className="btn btn-primary btn-icon"
              style={{ width: 40, height: 40, flex: 'none', borderRadius: 'var(--r-sm)' }}
              aria-label="Send"
            >
              <Icon name="send" size={16} />
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
