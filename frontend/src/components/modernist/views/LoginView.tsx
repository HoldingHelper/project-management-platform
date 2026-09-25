import React, { useState } from 'react';
import { LoginLayout } from '../types';
import { Icon } from '../icons';

interface LoginViewProps {
  layout?: LoginLayout;
  onLoginSuccess: (username: string) => void;
}

export function LoginView({ layout = 'poster', onLoginSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Enter your username.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLoginSuccess(username.trim());
    }, 600);
  };

  return (
    <div
      data-screen-label="Login"
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
      }}
    >
      {layout === 'poster' && (
        <div
          style={{
            background: 'var(--color-accent)',
            color: 'var(--on-solid)',
            padding: '40px 48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 48,
            minHeight: 360,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                border: '2px solid var(--on-solid)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 13,
                borderRadius: 'var(--r-sm)',
              }}
            >
              PP
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>
              Project Platform
              <br />
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Management workspace
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontSize: 'clamp(48px, 6.4vw, 96px)',
                lineHeight: 0.94,
                letterSpacing: '-.035em',
                textWrap: 'balance',
              }}
            >
              Teams Management Platform
            </div>
            <div
              style={{
                height: 2,
                background: 'var(--on-solid)',
                margin: '32px 0 16px',
                maxWidth: 520,
              }}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 24,
                maxWidth: 520,
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>01 — Docs</div>
                <div>Processes, runbooks and policies for every team.</div>
              </div>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>02 — Teams</div>
                <div>Projects, tasks, people and delivery health.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        data-login-form="1"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 48,
        }}
      >
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{
            width: '100%',
            maxWidth: 380,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div>
            <h6 style={{ color: 'var(--color-accent)', marginBottom: 10 }}>Sign in</h6>
            <h2 style={{ margin: '0 0 6px' }}>Welcome back</h2>
            <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
              Use your workspace account to continue.
            </p>
          </div>

          <div className="field">
            <label htmlFor="tmp-user">Email or username</label>
            <input
              id="tmp-user"
              className="input"
              style={{ minHeight: 44 }}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. admin"
            />
          </div>

          <div className="field">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <label
                htmlFor="tmp-pass"
                style={{
                  display: 'block',
                  fontSize: 12,
                  marginBottom: 5,
                  color: 'color-mix(in srgb, var(--color-text) 70%, transparent)',
                }}
              >
                Password
              </label>
              <a
                href="#forgot"
                onClick={(e) => e.preventDefault()}
                style={{ fontSize: 12 }}
              >
                Forgot password?
              </a>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="tmp-pass"
                className="input"
                type={showPw ? 'text' : 'password'}
                style={{ minHeight: 44, paddingRight: 48 }}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="btn btn-icon"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                title={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: 4,
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
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

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
            style={{ minHeight: 48, fontSize: 15, borderRadius: 'var(--r-sm)' }}
          >
            <span>{loading ? 'Signing in…' : 'Sign in'}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginLeft: 'auto', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>

          <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Need access? Contact your workspace admin.
          </p>
        </form>
      </div>
    </div>
  );
}
