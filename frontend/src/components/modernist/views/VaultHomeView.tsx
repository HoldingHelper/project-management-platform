import React, { useState } from 'react';
import { DocFile, PluginType, Person } from '../types';
import { Icon } from '../icons';
import { PLUG, FOLDERS, TN, avBg, ini, st } from '../tokens';

interface VaultHomeProps {
  docs: DocFile[];
  people?: Person[];
  currentFolderFilter?: string | null;
  currentTagFilter?: string | null;
  docTag?: string | null;
  docView?: 'all' | 'recent' | 'starred' | 'graph' | 'tag';
  starredMap?: Record<string, boolean>;
  starred?: Record<string, boolean>;
  onOpenDoc: (id: string) => void;
  onOpenCreateDialog?: (type?: PluginType) => void;
  onOpenCreateDoc?: (type?: PluginType) => void;
}

export function VaultHomeView({
  docs,
  people: _people,
  currentFolderFilter,
  currentTagFilter,
  docTag,
  docView = 'all',
  starredMap,
  starred,
  onOpenDoc,
  onOpenCreateDialog,
  onOpenCreateDoc,
}: VaultHomeProps) {
  const activeStarred = starred || starredMap || {};
  const activeTag = docTag || currentTagFilter;
  const handleOpenCreate = onOpenCreateDoc || onOpenCreateDialog || (() => {});
  const [docQuery, setDocQuery] = useState('');
  const [docType, setDocType] = useState('All');

  const dq = docQuery.trim().toLowerCase();

  let list = docs.filter(
    (d) =>
      !dq ||
      `${d.title} ${d.summary} ${d.owner} ${d.tags.join(' ')}`
        .toLowerCase()
        .includes(dq)
  );

  if (currentFolderFilter) {
    list = list.filter((d) => d.folder === currentFolderFilter);
  }
  if (docView === 'starred') {
    list = list.filter((d) => activeStarred[d.id]);
  }
  if (activeTag) {
    list = list.filter((d) => d.tags.includes(activeTag));
  }

  const baseList = list;
  if (docType !== 'All') {
    list = list.filter((d) => d.type === docType);
  }

  const upd = (d: DocFile) => Date.parse(`${d.updated}, 2026`) || 0;
  list = [...list].sort((a, b) => upd(b) - upd(a));

  return (
    <div
      data-screen-label="Vault"
      style={{ display: 'flex', flexDirection: 'column', gap: 28 }}
    >
      {/* Create plugin cards section */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h4 style={{ margin: 0 }}>Create</h4>
          <span className="text-muted" style={{ fontSize: 13 }}>
            Every file type lives in one vault, with links, tags, backlinks and search.
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 10,
          }}
        >
          {Object.entries(PLUG).map(([k, p]) => {
            const tn = TN[p.c] || TN.gray;
            return (
              <button
                key={k}
                type="button"
                onClick={() => handleOpenCreate(k as PluginType)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 14,
                  border: '1px solid var(--color-divider)',
                  background: 'var(--panel)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    display: 'grid',
                    placeItems: 'center',
                    background: tn.bg,
                    color: tn.fg,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <Icon name={k === 'canvas' ? 'rect' : k === 'audio' ? 'music' : k} size={18} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{p.l}</span>
                  <span className="text-muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
                    {p.d}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Vault Files Table */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <h4 style={{ margin: 0 }}>
            {currentTagFilter
              ? `Tagged #${currentTagFilter}`
              : currentFolderFilter
              ? FOLDERS.find((f) => f[0] === currentFolderFilter)?.[1] || 'Folder files'
              : 'All files'}
          </h4>
          <div style={{ position: 'relative', flex: '0 1 320px', minWidth: 200 }}>
            <Icon
              name="search"
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: 12,
                opacity: 0.55,
              }}
            />
            <input
              className="input"
              style={{ minHeight: 40, paddingLeft: 36 }}
              placeholder="Search the vault…"
              value={docQuery}
              onChange={(e) => setDocQuery(e.target.value)}
              aria-label="Search the vault"
            />
          </div>
        </div>

        {/* Type filter buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            ['All', 'All types', 'var(--color-text)'],
            ...Object.entries(PLUG).map(([k, p]) => [k, p.l, TN[p.c]?.solid || TN.gray.solid]),
          ].map(([k, label, col]) => {
            const on = docType === k;
            const count =
              k === 'All' ? baseList.length : baseList.filter((d) => d.type === k).length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setDocType(k)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: on ? 700 : 500,
                  border: `1px solid ${on ? col : 'var(--color-divider)'}`,
                  background: on ? 'var(--color-surface)' : 'transparent',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 'var(--r-av)',
                    background: col,
                  }}
                />
                {label}
                <span style={{ opacity: 0.55 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 940 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'minmax(260px, 2.4fr) 150px 170px minmax(140px, 1fr) 90px 110px',
                gap: 16,
                padding: 8,
                borderBottom: '2px solid var(--color-divider)',
                fontSize: 11,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
              }}
            >
              <span>Name</span>
              <span>Folder</span>
              <span>Owner</span>
              <span>Tags</span>
              <span>Updated</span>
              <span>Status</span>
            </div>

            {list.map((d) => {
              const pl = PLUG[d.type] || PLUG.note;
              const tn = TN[pl.c] || TN.gray;
              const fo = FOLDERS.find((f) => f[0] === d.folder) || ['att', 'Attachments', 'magenta'];
              const foColor = TN[fo[2]]?.solid || TN.gray.solid;
              const sObj = st(d.status);

              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onOpenDoc(d.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(260px, 2.4fr) 150px 170px minmax(140px, 1fr) 90px 110px',
                    gap: 16,
                    alignItems: 'center',
                    width: '100%',
                    padding: '12px 8px',
                    border: 0,
                    borderBottom: '1px solid var(--color-divider)',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        flex: 'none',
                        display: 'grid',
                        placeItems: 'center',
                        background: tn.bg,
                        color: tn.fg,
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <Icon name={d.type === 'canvas' ? 'rect' : d.type === 'audio' ? 'music' : d.type} size={16} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span
                        style={{
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {d.title}
                        {activeStarred[d.id] && (
                          <span style={{ marginLeft: 6, color: TN.amber.solid }}>★</span>
                        )}
                      </span>
                      <span
                        className="text-muted"
                        style={{
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {pl.l} · {d.summary}
                      </span>
                    </span>
                  </span>

                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        flex: 'none',
                        borderRadius: 'var(--r-av)',
                        background: foColor,
                      }}
                    />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fo[1]}
                    </span>
                  </span>

                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      minWidth: 0,
                    }}
                  >
                    <span
                      title={d.owner}
                      style={{
                        width: 24,
                        height: 24,
                        flex: 'none',
                        background: avBg(d.owner),
                        color: 'var(--on-solid)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 9,
                        fontWeight: 800,
                        borderRadius: 'var(--r-av)',
                      }}
                    >
                      {ini(d.owner)}
                    </span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.owner}
                    </span>
                  </span>

                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {d.tags.map((tg) => (
                      <span
                        key={tg}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '1px 6px',
                          background: 'var(--color-neutral-200)',
                          borderRadius: 'var(--r-xs)',
                        }}
                      >
                        #{tg}
                      </span>
                    ))}
                  </span>

                  <span className="text-muted" style={{ fontSize: 13 }}>
                    {d.updated}
                  </span>

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
                      {d.status}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {list.length === 0 && (
          <div style={{ padding: '24px 8px' }}>
            <h4 style={{ margin: '0 0 4px' }}>Nothing here yet</h4>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              Change the search or type filter, or create a file above.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
