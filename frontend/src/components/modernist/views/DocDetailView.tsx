'use client';

import React, { useState } from 'react';
import { DocFile, DocBlock, Team } from '../types';
import { Icon, IC } from '../icons';
import { FOLDERS, PLUG, tone, st, seg, SegOption } from '../tokens';
import { PdfBlock } from '../plugins/PdfBlock';
import { SheetBlock } from '../plugins/SheetBlock';
import { SlidesBlock } from '../plugins/SlidesBlock';
import { CanvasBlock } from '../plugins/CanvasBlock';
import { AudioBlock } from '../plugins/AudioBlock';
import { ImageBlock } from '../plugins/ImageBlock';
import { ChartBlock } from '../plugins/ChartBlock';

interface DocDetailViewProps {
  doc: DocFile;
  docs: DocFile[];
  teams: Team[];
  starred: Record<string, boolean>;
  onToggleStar: (id: string) => void;
  onUpdateDoc: (id: string, fn: (doc: DocFile) => DocFile) => void;
  onOpenDoc: (id: string) => void;
  onNewDocFile: (type: DocFile['type'], tpl: string, name: string, folder: string, tags: string[]) => string;
  onPresent: (id: string) => void;
  onToast: (text: string) => void;
}

export const DocDetailView: React.FC<DocDetailViewProps> = ({
  doc,
  docs,
  teams,
  starred,
  onToggleStar,
  onUpdateDoc,
  onOpenDoc,
  onNewDocFile,
  onPresent,
  onToast,
}) => {
  const [editing, setEditing] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);

  const isNote = doc.type === 'note';
  const pl = PLUG[doc.type] || PLUG.note;
  const tn = tone(pl.c);
  const fo = FOLDERS.find(x => x[0] === doc.folder) || ['att', 'Attachments', 'magenta'];
  const folderName = fo[1];
  const stStyle = st(doc.status);
  const isStarred = !!starred[doc.id];
  const teamObj = teams.find(t => t.id === doc.team);

  const setBlocks = (fn: (blocks: DocBlock[]) => DocBlock[]) => {
    onUpdateDoc(doc.id, d => ({
      ...d,
      blocks: fn(d.blocks || []),
      updated: 'Sep 25',
    }));
  };

  const copyLink = () => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(`vault://${doc.id}`);
      }
    } catch {
      // ignore
    }
    onToast(`Link to “${doc.title}” copied`);
  };

  const blocks: DocBlock[] = isNote ? (doc.blocks || []) : [{ k: 'embed', id: doc.id }];

  const linksOf = (d: DocFile): string[] => {
    const embedIds = (d.blocks || []).filter(b => b.k === 'embed' && b.id).map(b => b.id as string);
    const combined = [...(d.links || []), ...embedIds];
    return Array.from(new Set(combined)).filter(x => x !== d.id && docs.some(o => o.id === x));
  };

  const backlinks = docs.filter(x => x.id !== doc.id && linksOf(x).includes(doc.id));
  const outlinks = linksOf(doc)
    .map(id => docs.find(d => d.id === id))
    .filter((d): d is DocFile => Boolean(d));

  const outlineHeadings = isNote
    ? (doc.blocks || [])
        .map((b, i) => ({ b, i }))
        .filter(x => x.b.k === 'h')
        .map(x => ({
          i: x.i,
          t: x.b.t || 'Untitled heading',
          go: () => {
            const el = document.getElementById(`blk-${x.i}`);
            if (el) {
              window.scrollTo({
                top: el.getBoundingClientRect().top + window.scrollY - 90,
                behavior: 'smooth',
              });
            }
          },
        }))
    : [];

  const addBlock = (newBlock: DocBlock) => {
    setBlocks(bs => [...bs, newBlock]);
    setInsertOpen(false);
  };

  const embedded = new Set((doc.blocks || []).filter(b => b.k === 'embed').map(b => b.id));

  const modeOpts: SegOption[] = seg(['Reading', 'Editing'], editing ? 'Editing' : 'Reading', (l: string) => {
    setEditing(l === 'Editing');
    setInsertOpen(false);
  });

  return (
    <div
      data-screen-label="Doc"
      data-m1="1"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 260px',
        gap: '40px',
        alignItems: 'start',
      }}
    >
      <article style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px 3px 3px',
              background: tn.bg,
              color: tn.fg,
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: 'var(--r-sm)',
            }}
          >
            <span
              style={{
                width: '22px',
                height: '22px',
                display: 'grid',
                placeItems: 'center',
                background: tn.solid,
                color: 'var(--on-solid)',
                borderRadius: 'var(--r-xs)',
              }}
            >
              <Icon d={pl.i} size={12} />
            </span>
            {pl.l}
          </span>
          <span className="text-muted" style={{ fontSize: '13px' }}>
            Vault / {folderName}
          </span>
          <span style={{ flex: 1 }} />

          {isNote && (
            <div className="seg">
              {modeOpts.map((o: SegOption, idx: number) => (
                <button
                  key={idx}
                  type="button"
                  className="seg-opt"
                  onClick={o.pick}
                  style={{
                    border: 0,
                    borderLeft: o.bl,
                    background: o.bg,
                    color: o.fg,
                    minHeight: '34px',
                    fontWeight: 600,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <button
            className="btn btn-secondary"
            onClick={() => onToggleStar(doc.id)}
            style={{ minHeight: '36px' }}
          >
            <Icon
              d={IC.star}
              size={15}
              style={{
                fill: isStarred ? 'oklch(0.75 0.15 75)' : 'none',
                stroke: isStarred ? 'oklch(0.75 0.15 75)' : 'currentColor',
                strokeWidth: 2,
              }}
            />
            {isStarred ? 'Starred' : 'Star'}
          </button>
          <button
            className="btn btn-secondary btn-icon"
            aria-label="Copy link"
            title="Copy link"
            onClick={copyLink}
            style={{ width: '36px', height: '36px' }}
          >
            <Icon d={IC.link} size={15} />
          </button>
        </div>

        {/* Properties Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '0 24px',
            padding: '6px 16px',
            background: 'var(--color-surface)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' }}>
            <span className="text-muted" style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Type
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{pl.l}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' }}>
            <span className="text-muted" style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Folder
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{folderName}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' }}>
            <span className="text-muted" style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Owner
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{doc.owner}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' }}>
            <span className="text-muted" style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Team
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{teamObj ? teamObj.name : '—'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' }}>
            <span className="text-muted" style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Updated
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{doc.updated}, 2026</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0' }}>
            <span className="text-muted" style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Status
            </span>
            <span>
              <span
                className="tag"
                style={{
                  background: stStyle.sBg,
                  color: stStyle.sFg,
                  border: `1px solid ${stStyle.sBd}`,
                  whiteSpace: 'nowrap',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-xs)',
                }}
              >
                {doc.status}
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0' }}>
            <span className="text-muted" style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Tags
            </span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {doc.tags.map((tg, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    background: 'var(--color-neutral-200)',
                    borderRadius: 'var(--r-xs)',
                  }}
                >
                  #{tg}
                </span>
              ))}
            </span>
          </div>
        </div>

        {/* Title input when editing */}
        {editing && (
          <input
            aria-label="Title"
            value={doc.title}
            onChange={e => {
              const val = e.target.value;
              onUpdateDoc(doc.id, d => ({ ...d, title: val }));
            }}
            style={{
              font: 'inherit',
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: '28px',
              border: 0,
              borderBottom: '2px dashed var(--color-divider)',
              background: 'transparent',
              color: 'inherit',
              padding: '4px 0',
              outline: 'none',
              width: '100%',
            }}
          />
        )}

        {/* Blocks List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {blocks.map((b, i) => {
            const isH = b.k === 'h';
            const isP = b.k === 'p';
            const isTodo = b.k === 'todo';
            const isCallout = b.k === 'callout';
            const isEmbed = b.k === 'embed';

            const embeddedFile = isEmbed && b.id ? docs.find(x => x.id === b.id) : null;
            const embedPl = embeddedFile ? PLUG[embeddedFile.type] || PLUG.note : null;
            const embedTn = embedPl ? tone(embedPl.c) : null;

            return (
              <div
                key={i}
                id={`blk-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: editing ? '28px minmax(0,1fr)' : 'minmax(0,1fr)',
                  gap: '8px',
                  alignItems: 'start',
                }}
              >
                {editing && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '4px' }}>
                    <button
                      aria-label="Move up"
                      onClick={() => {
                        if (i > 0) {
                          setBlocks(bs => {
                            const arr = [...bs];
                            [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                            return arr;
                          });
                        }
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        display: 'grid',
                        placeItems: 'center',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--color-neutral-700)',
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      <Icon d={IC.up} size={13} />
                    </button>
                    <button
                      aria-label="Move down"
                      onClick={() => {
                        if (i < blocks.length - 1) {
                          setBlocks(bs => {
                            const arr = [...bs];
                            [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
                            return arr;
                          });
                        }
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        display: 'grid',
                        placeItems: 'center',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--color-neutral-700)',
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      <Icon d={IC.chevron} size={13} />
                    </button>
                    <button
                      aria-label="Delete block"
                      onClick={() => setBlocks(bs => bs.filter((_, idx) => idx !== i))}
                      style={{
                        width: '24px',
                        height: '24px',
                        display: 'grid',
                        placeItems: 'center',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--danger)',
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      <Icon d={IC.trash} size={13} />
                    </button>
                  </div>
                )}

                <div style={{ minWidth: 0 }}>
                  {/* Heading */}
                  {isH && (
                    <>
                      {!editing ? (
                        <h3 style={{ margin: '10px 0 0' }}>{b.t}</h3>
                      ) : (
                        <input
                          aria-label="Heading"
                          placeholder="Heading"
                          value={b.t || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setBlocks(bs => bs.map((q, idx) => (idx === i ? { ...q, t: val } : q)));
                          }}
                          style={{
                            font: 'inherit',
                            fontFamily: 'var(--font-heading)',
                            fontWeight: 800,
                            fontSize: '22px',
                            width: '100%',
                            border: 0,
                            borderBottom: '1px dashed var(--color-divider)',
                            background: 'transparent',
                            color: 'inherit',
                            padding: '4px 0',
                            outline: 'none',
                          }}
                        />
                      )}
                    </>
                  )}

                  {/* Paragraph */}
                  {isP && (
                    <>
                      {!editing ? (
                        <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.65, textWrap: 'pretty', maxWidth: '720px' }}>
                          {b.t}
                        </p>
                      ) : (
                        <textarea
                          className="input"
                          aria-label="Text"
                          placeholder="Write something…"
                          value={b.t || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setBlocks(bs => bs.map((q, idx) => (idx === i ? { ...q, t: val } : q)));
                          }}
                          style={{ minHeight: '84px', fontSize: '15px', lineHeight: 1.6 }}
                        />
                      )}
                    </>
                  )}

                  {/* Todo list */}
                  {isTodo && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        padding: '8px 14px',
                        background: 'var(--color-surface)',
                        borderRadius: 'var(--r-md)',
                      }}
                    >
                      <span className="text-muted" style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', padding: '4px 0' }}>
                        Checklist · {(b.items || []).filter(q => q[1]).length} of {(b.items || []).length} done
                      </span>
                      {(b.items || []).map((it, itemIdx) => {
                        const done = it[1];
                        return (
                          <div key={itemIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
                            <button
                              role="checkbox"
                              aria-checked={done ? 'true' : 'false'}
                              aria-label="Toggle item"
                              onClick={() => {
                                setBlocks(bs =>
                                  bs.map((q, idx) =>
                                    idx === i
                                      ? {
                                          ...q,
                                          items: (q.items || []).map((item, qIdx) =>
                                            qIdx === itemIdx ? [item[0], !item[1]] : item
                                          ),
                                        }
                                      : q
                                  )
                                );
                              }}
                              style={{
                                width: '20px',
                                height: '20px',
                                flex: 'none',
                                padding: 0,
                                display: 'grid',
                                placeItems: 'center',
                                cursor: 'pointer',
                                border: done ? `1.5px solid ${tone('green').solid}` : '1.5px solid var(--color-neutral-400)',
                                background: done ? tone('green').solid : 'transparent',
                                borderRadius: 'var(--r-xs)',
                              }}
                            >
                              <Icon
                                d={IC.check}
                                size={12}
                                style={{
                                  stroke: done ? 'var(--on-solid)' : 'transparent',
                                  strokeWidth: 3.5,
                                }}
                              />
                            </button>
                            {!editing ? (
                              <span
                                style={{
                                  fontSize: '15px',
                                  textDecoration: done ? 'line-through' : 'none',
                                  opacity: done ? 0.6 : 1,
                                }}
                              >
                                {it[0]}
                              </span>
                            ) : (
                              <>
                                <input
                                  aria-label="Item"
                                  placeholder="To-do"
                                  value={it[0]}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setBlocks(bs =>
                                      bs.map((q, idx) =>
                                        idx === i
                                          ? {
                                              ...q,
                                              items: (q.items || []).map((item, qIdx) =>
                                                qIdx === itemIdx ? [val, item[1]] : item
                                              ),
                                            }
                                          : q
                                      )
                                    );
                                  }}
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    border: 0,
                                    borderBottom: '1px dashed var(--color-divider)',
                                    background: 'transparent',
                                    font: 'inherit',
                                    fontSize: '15px',
                                    padding: '3px 0',
                                    outline: 'none',
                                    color: 'inherit',
                                  }}
                                />
                                <button
                                  aria-label="Remove item"
                                  onClick={() => {
                                    setBlocks(bs =>
                                      bs.map((q, idx) =>
                                        idx === i
                                          ? {
                                              ...q,
                                              items: (q.items || []).filter((_, qIdx) => qIdx !== itemIdx),
                                            }
                                          : q
                                      )
                                    );
                                  }}
                                  style={{
                                    width: '24px',
                                    height: '24px',
                                    display: 'grid',
                                    placeItems: 'center',
                                    border: 0,
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: 'var(--color-neutral-700)',
                                    borderRadius: 'var(--r-xs)',
                                  }}
                                >
                                  <Icon d={IC.x} size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {editing && (
                        <button
                          onClick={() => {
                            setBlocks(bs =>
                              bs.map((q, idx) =>
                                idx === i ? { ...q, items: [...(q.items || []), ['', false]] } : q
                              )
                            );
                          }}
                          style={{
                            alignSelf: 'flex-start',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 0',
                            border: 0,
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--color-accent-700)',
                          }}
                        >
                          <Icon d={IC.plus} size={13} />
                          Add item
                        </button>
                      )}
                    </div>
                  )}

                  {/* Callout */}
                  {isCallout && (
                    (() => {
                      const calloutTn = b.tone === 'warn' ? tone('amber') : tone('blue');
                      return (
                        <div
                          style={{
                            display: 'flex',
                            gap: '12px',
                            padding: '14px 16px',
                            background: calloutTn.bg,
                            borderRadius: 'var(--r-md)',
                          }}
                        >
                          <span style={{ color: calloutTn.fg, paddingTop: '2px' }}>
                            <Icon d={b.tone === 'warn' ? IC.alert : IC.info} size={18} />
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 800,
                                letterSpacing: '.06em',
                                textTransform: 'uppercase',
                                color: calloutTn.fg,
                              }}
                            >
                              {b.tone === 'warn' ? 'Warning' : 'Note'}
                            </span>
                            {!editing ? (
                              <span style={{ fontSize: '15px', lineHeight: 1.55 }}>{b.t}</span>
                            ) : (
                              <textarea
                                className="input"
                                aria-label="Callout text"
                                value={b.t || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setBlocks(bs => bs.map((q, idx) => (idx === i ? { ...q, t: val } : q)));
                                }}
                                style={{ minHeight: '60px', background: 'var(--panel)' }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })()
                  )}

                  {/* Embed block */}
                  {isEmbed && embeddedFile && embedPl && embedTn && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid var(--color-divider)',
                        background: 'var(--panel)',
                        borderRadius: 'var(--r-md)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--color-divider)',
                        }}
                      >
                        <span
                          style={{
                            width: '24px',
                            height: '24px',
                            flex: 'none',
                            display: 'grid',
                            placeItems: 'center',
                            background: embedTn.solid,
                            color: 'var(--on-solid)',
                            borderRadius: 'var(--r-xs)',
                          }}
                        >
                          <Icon d={embedPl.i} size={13} />
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontWeight: 700,
                            fontSize: '14px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {embeddedFile.title}
                        </span>
                        <span className="text-muted" data-mhide="1" style={{ fontSize: '12px' }}>
                          {embedPl.l}
                        </span>
                        {embeddedFile.id !== doc.id && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => onOpenDoc(embeddedFile.id)}
                            style={{ minHeight: '30px', padding: '4px 8px' }}
                          >
                            Open
                            <Icon d={IC.right} size={14} />
                          </button>
                        )}
                      </div>

                      {/* Embed content rendering */}
                      {embeddedFile.type === 'note' && (
                        <p style={{ margin: 0, padding: '14px 16px', fontSize: '14px' }}>
                          {embeddedFile.summary}
                        </p>
                      )}

                      {embeddedFile.type === 'pdf' && (
                        <PdfBlock
                          id={embeddedFile.id}
                          title={embeddedFile.title}
                          data={embeddedFile.data as any}
                          onToast={onToast}
                        />
                      )}

                      {embeddedFile.type === 'sheet' && (
                        <SheetBlock
                          data={embeddedFile.data as any}
                          onUpdateRows={rows =>
                            onUpdateDoc(embeddedFile.id, d => ({
                              ...d,
                              data: { ...d.data, rows },
                            }))
                          }
                        />
                      )}

                      {embeddedFile.type === 'slides' && (
                        <SlidesBlock
                          slides={(embeddedFile.data as any)?.slides || []}
                          onPresent={() => onPresent(embeddedFile.id)}
                        />
                      )}

                      {embeddedFile.type === 'canvas' && (
                        <CanvasBlock
                          id={embeddedFile.id}
                          data={embeddedFile.data as any}
                          onUpdate={newData =>
                            onUpdateDoc(embeddedFile.id, d => ({
                              ...d,
                              data: newData,
                            }))
                          }
                        />
                      )}

                      {embeddedFile.type === 'audio' && (
                        <AudioBlock id={embeddedFile.id} data={embeddedFile.data as any} />
                      )}

                      {embeddedFile.type === 'image' && (
                        <ImageBlock
                          id={embeddedFile.id}
                          title={embeddedFile.title}
                          data={embeddedFile.data as any}
                        />
                      )}

                      {embeddedFile.type === 'chart' && (
                        <ChartBlock data={embeddedFile.data as any} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add block dropdown trigger when editing */}
        {editing && (
          <div data-dd="1" style={{ position: 'relative' }}>
            <button
              onClick={() => setInsertOpen(!insertOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                width: '100%',
                padding: '14px',
                border: '1.5px dashed var(--color-divider)',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: 'var(--r-md)',
              }}
            >
              <Icon d={IC.plus} size={16} />
              Add block
              <span className="text-muted" style={{ fontWeight: 400, fontSize: '13px' }}>
                Text, checklist, callout or any plugin
              </span>
            </button>

            {insertOpen && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 15,
                  background: 'var(--panel)',
                  backdropFilter: 'var(--blur)',
                  WebkitBackdropFilter: 'var(--blur)',
                  border: '1px solid var(--color-divider)',
                  boxShadow: 'var(--shadow-lg)',
                  borderRadius: 'var(--r-lg)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  maxHeight: '440px',
                  overflow: 'auto',
                }}
              >
                {/* Basic blocks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h6 className="text-muted" style={{ margin: '0 4px' }}>
                    Basic blocks
                  </h6>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '4px' }}>
                    <button
                      onClick={() => addBlock({ k: 'p', t: '' })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <span style={{ width: '32px', height: '32px', flex: 'none', display: 'grid', placeItems: 'center', background: tone('gray').bg, color: tone('gray').fg, borderRadius: 'var(--r-sm)' }}>
                        <Icon d={IC.docs} size={16} />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Text</span>
                        <span className="text-muted" style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          A paragraph
                        </span>
                      </span>
                    </button>

                    <button
                      onClick={() => addBlock({ k: 'h', t: '' })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <span style={{ width: '32px', height: '32px', flex: 'none', display: 'grid', placeItems: 'center', background: tone('gray').bg, color: tone('gray').fg, borderRadius: 'var(--r-sm)' }}>
                        <Icon d={IC.heading} size={16} />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Heading</span>
                        <span className="text-muted" style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Section title, shows in outline
                        </span>
                      </span>
                    </button>

                    <button
                      onClick={() => addBlock({ k: 'todo', items: [['', false]] })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <span style={{ width: '32px', height: '32px', flex: 'none', display: 'grid', placeItems: 'center', background: tone('green').bg, color: tone('green').fg, borderRadius: 'var(--r-sm)' }}>
                        <Icon d={IC.checklist} size={16} />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Checklist</span>
                        <span className="text-muted" style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Tickable to-dos
                        </span>
                      </span>
                    </button>

                    <button
                      onClick={() => addBlock({ k: 'callout', tone: 'info', t: '' })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <span style={{ width: '32px', height: '32px', flex: 'none', display: 'grid', placeItems: 'center', background: tone('blue').bg, color: tone('blue').fg, borderRadius: 'var(--r-sm)' }}>
                        <Icon d={IC.info} size={16} />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Callout</span>
                        <span className="text-muted" style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Highlighted note or warning
                        </span>
                      </span>
                    </button>
                  </div>
                </div>

                {/* Plugins */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h6 className="text-muted" style={{ margin: '0 4px' }}>
                    Plugins · creates a new file in Attachments
                  </h6>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '4px' }}>
                    {Object.entries(PLUG)
                      .filter(([k]) => k !== 'note')
                      .map(([k, p]) => {
                        const ptn = tone(p.c);
                        return (
                          <button
                            key={k}
                            onClick={() => {
                              const nid = onNewDocFile(
                                k as DocFile['type'],
                                'Blank',
                                `Untitled ${p.l.toLowerCase()}`,
                                'att',
                                []
                              );
                              addBlock({ k: 'embed', id: nid });
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px',
                              border: 0,
                              background: 'transparent',
                              cursor: 'pointer',
                              textAlign: 'left',
                              borderRadius: 'var(--r-sm)',
                            }}
                          >
                            <span
                              style={{
                                width: '32px',
                                height: '32px',
                                flex: 'none',
                                display: 'grid',
                                placeItems: 'center',
                                background: ptn.bg,
                                color: ptn.fg,
                                borderRadius: 'var(--r-sm)',
                              }}
                            >
                              <Icon d={p.i} size={16} />
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontSize: '14px', fontWeight: 600 }}>{p.l}</span>
                              <span className="text-muted" style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {p.d}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Embed an existing file */}
                {docs.filter(x => x.id !== doc.id && x.type !== 'note' && !embedded.has(x.id)).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <h6 className="text-muted" style={{ margin: '0 4px' }}>
                      Embed an existing file
                    </h6>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '4px' }}>
                      {docs
                        .filter(x => x.id !== doc.id && x.type !== 'note' && !embedded.has(x.id))
                        .slice(0, 8)
                        .map(x => {
                          const xpl = PLUG[x.type] || PLUG.note;
                          const xtn = tone(xpl.c);
                          const xfo = FOLDERS.find(f => f[0] === x.folder) || ['att', 'Attachments'];
                          return (
                            <button
                              key={x.id}
                              onClick={() => addBlock({ k: 'embed', id: x.id })}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px',
                                border: 0,
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                borderRadius: 'var(--r-sm)',
                              }}
                            >
                              <span
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  flex: 'none',
                                  display: 'grid',
                                  placeItems: 'center',
                                  background: xtn.bg,
                                  color: xtn.fg,
                                  borderRadius: 'var(--r-sm)',
                                }}
                              >
                                <Icon d={xpl.i} size={16} />
                              </span>
                              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {x.title}
                                </span>
                                <span className="text-muted" style={{ fontSize: '12px' }}>
                                  {xpl.l} · {xfo[1]}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </article>

      {/* Right Sidebar: Outline, Backlinks, Outlinks */}
      <aside
        data-nosticky="1"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          position: 'sticky',
          top: '96px',
        }}
      >
        {outlineHeadings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h6 className="text-muted" style={{ marginBottom: '6px' }}>
              Outline
            </h6>
            {outlineHeadings.map((ol, idx) => (
              <button
                key={idx}
                onClick={ol.go}
                style={{
                  padding: '6px 8px',
                  border: 0,
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                {ol.t}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h6 className="text-muted" style={{ marginBottom: '6px' }}>
            Backlinks
          </h6>
          {backlinks.map(l => {
            const lpl = PLUG[l.type] || PLUG.note;
            const ltn = tone(lpl.c);
            return (
              <button
                key={l.id}
                onClick={() => onOpenDoc(l.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 8px',
                  border: 0,
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <Icon d={lpl.i} size={14} style={{ stroke: ltn.solid, strokeWidth: 2 }} />
                <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.title}
                </span>
              </button>
            );
          })}
          {backlinks.length === 0 && (
            <p className="text-muted" style={{ margin: 0, fontSize: '13px', padding: '0 8px' }}>
              No other file links here yet.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h6 className="text-muted" style={{ marginBottom: '6px' }}>
            Links from this file
          </h6>
          {outlinks.map(l => {
            const lpl = PLUG[l.type] || PLUG.note;
            const ltn = tone(lpl.c);
            return (
              <button
                key={l.id}
                onClick={() => onOpenDoc(l.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 8px',
                  border: 0,
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <Icon d={lpl.i} size={14} style={{ stroke: ltn.solid, strokeWidth: 2 }} />
                <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.title}
                </span>
              </button>
            );
          })}
          {outlinks.length === 0 && (
            <p className="text-muted" style={{ margin: 0, fontSize: '13px', padding: '0 8px' }}>
              This file doesn’t link anywhere yet.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
};
