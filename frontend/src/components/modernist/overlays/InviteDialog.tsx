import React, { useState } from 'react';
import { Team } from '../types';
import { Icon } from '../icons';
import { ROLES } from '../seedData';

interface InviteDialogProps {
  teams: Team[];
  onClose: () => void;
  onInvite: (user: { name: string; email: string; team: string; role: string }) => void;
}

export function InviteDialog({ teams, onClose, onInvite }: InviteDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [team, setTeam] = useState(teams[0]?.id || 'plt');
  const [role, setRole] = useState('Member');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter their full name.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid work email.');
      return;
    }
    onInvite({
      name: name.trim(),
      email: email.trim(),
      team,
      role,
    });
  };

  return (
    <div
      onClick={onClose}
      data-dlg="1"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'color-mix(in srgb, var(--color-text) 45%, transparent)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '5vh 16px',
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
        data-screen-label="Invite"
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--panel)',
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          borderTop: '4px solid var(--color-accent)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            padding: '20px 24px 16px',
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          <div>
            <h6 style={{ color: 'var(--color-accent)', marginBottom: 6 }}>People</h6>
            <h3 style={{ margin: 0 }}>Invite teammate</h3>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label htmlFor="iv-name">Full name</label>
            <input
              id="iv-name"
              className="input"
              style={{ minHeight: 44 }}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="iv-mail">Work email</label>
            <input
              id="iv-mail"
              type="email"
              className="input"
              style={{ minHeight: 44 }}
              placeholder="name@projectplatform.io"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="iv-team">Team</label>
            <select
              id="iv-team"
              className="input"
              style={{ minHeight: 44 }}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Role</label>
            <div className="seg">
              {ROLES.slice(0, 3).map((rKey, idx) => {
                const on = role === rKey;
                return (
                  <button
                    key={rKey}
                    type="button"
                    className="seg-opt"
                    onClick={() => setRole(rKey)}
                    style={{
                      border: 0,
                      borderLeft: idx ? '1px solid var(--color-divider)' : 0,
                      background: on ? 'var(--color-accent)' : 'transparent',
                      color: on ? 'var(--on-solid)' : 'var(--color-text)',
                      minHeight: 36,
                      fontWeight: 600,
                    }}
                  >
                    {rKey}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: 'var(--danger-bg)',
                color: 'var(--danger-fg)',
                padding: '10px 12px',
                fontSize: 13,
                borderTop: '2px solid var(--danger)',
                borderRadius: 'var(--r-md)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '16px 24px',
            borderTop: '2px solid var(--color-divider)',
            background: 'var(--color-surface)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ minHeight: 40, borderRadius: 'var(--r-sm)' }}
          >
            <Icon name="mail" size={16} />
            Send invite
          </button>
        </div>
      </form>
    </div>
  );
}
