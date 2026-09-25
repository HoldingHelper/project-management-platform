import React, { useState } from 'react';
import { PluginType } from '../types';
import { Icon } from '../icons';
import { PLUG, TPLS, FOLDERS, TN } from '../tokens';

interface CreateDocDialogProps {
  initialType?: PluginType;
  initialFolder?: string;
  onClose: () => void;
  onCreateDoc: (file: {
    type: PluginType;
    name: string;
    folder: string;
    tpl: string;
    tags: string[];
  }) => void;
}

const PH: Record<string, string> = {
  note: 'e.g. Release checklist',
  canvas: 'e.g. Onboarding flow',
  sheet: 'e.g. Q1 budget',
  slides: 'e.g. October all-hands',
  pdf: 'e.g. Vendor contract',
  audio: 'e.g. Customer interview',
  image: 'e.g. Dashboard screenshot',
  chart: 'e.g. Weekly signups',
};

export function CreateDocDialog({
  initialType = 'note',
  initialFolder,
  onClose,
  onCreateDoc,
}: CreateDocDialogProps) {
  const [type, setType] = useState<PluginType>(initialType);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(
    initialFolder || (initialType === 'note' ? 'handbook' : 'att')
  );
  const [tpl, setTpl] = useState(TPLS[initialType][0][0]);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [error, setError] = useState('');

  const pl = PLUG[type];
  const isUpload = ['pdf', 'audio', 'image'].includes(type);

  const handleTypeSelect = (newType: PluginType) => {
    setType(newType);
    setTpl(TPLS[newType][0][0]);
    setUploaded(null);
    if (newType === 'note' && folder === 'att') {
      setFolder('handbook');
    }
  };

  const handleFakeUpload = () => {
    const uploadMap: Record<string, string> = {
      pdf: 'document.pdf',
      audio: 'recording.m4a',
      image: 'screenshot.png',
    };
    const defaultNames: Record<string, string> = {
      pdf: 'Uploaded document',
      audio: 'New recording',
      image: 'New image',
    };
    setUploaded(uploadMap[type] || 'file.bin');
    if (!name.trim()) {
      setName(defaultNames[type] || 'New file');
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagDraft.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
      }
      setTagDraft('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the file a name.');
      return;
    }
    onCreateDoc({
      type,
      name: name.trim(),
      folder,
      tpl,
      tags,
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
        data-screen-label="New file"
        style={{
          width: '100%',
          maxWidth: 780,
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
            <h6 style={{ color: 'var(--color-accent)', marginBottom: 6 }}>
              Knowledge vault
            </h6>
            <h3 style={{ margin: 0 }}>Create a file</h3>
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

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* File type selection grid */}
          <div className="field">
            <label>File type</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 8,
              }}
            >
              {Object.entries(PLUG).map(([k, p]) => {
                const on = type === k;
                const tn = TN[p.c] || TN.gray;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleTypeSelect(k as PluginType)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                      border: on ? `2px solid ${tn.solid}` : '1px solid var(--color-divider)',
                      background: on ? tn.bg : 'transparent',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        flex: 'none',
                        display: 'grid',
                        placeItems: 'center',
                        background: tn.solid,
                        color: 'var(--on-solid)',
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      <Icon name={k === 'canvas' ? 'rect' : k === 'audio' ? 'music' : k} size={15} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.l}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        {p.s}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name & Folder */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="nd-name">
                Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="nd-name"
                className="input"
                style={{ minHeight: 44, fontSize: 15 }}
                placeholder={PH[type] || 'File name'}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="nd-folder">Folder</label>
              <select
                id="nd-folder"
                className="input"
                style={{ minHeight: 44 }}
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              >
                {FOLDERS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Templates */}
          <div className="field">
            <label>Start from</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TPLS[type]?.map(([l, dd]) => {
                const on = tpl === l;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setTpl(l)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      padding: '8px 12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      border: on ? '2px solid var(--color-accent)' : '1px solid var(--color-divider)',
                      background: on ? 'var(--color-accent-100)' : 'transparent',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{l}</span>
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {dd}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Upload Zone */}
          {isUpload && (
            <button
              type="button"
              onClick={handleFakeUpload}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: 24,
                border: `2px dashed ${uploaded ? TN.green.solid : 'var(--color-divider)'}`,
                background: 'var(--color-surface)',
                cursor: 'pointer',
                borderRadius: 'var(--r-md)',
              }}
            >
              <Icon name={uploaded ? 'check' : 'upload'} size={24} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {uploaded ? `${uploaded} is ready` : 'Drop a file here, or click to browse'}
              </span>
              <span className="text-muted" style={{ fontSize: 12 }}>
                {type === 'pdf'
                  ? 'PDF up to 50 MB'
                  : type === 'audio'
                  ? 'MP3, M4A or WAV up to 200 MB. A transcript is generated.'
                  : 'PNG, JPG or SVG up to 20 MB'}
              </span>
            </button>
          )}

          {/* Tags */}
          <div className="field">
            <label htmlFor="nd-tag">Tags</label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center',
                minHeight: 40,
                padding: 4,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-divider)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              {tags.map((tg) => (
                <span
                  key={tg}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 2px 2px 8px',
                    background: 'var(--color-neutral-200)',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 'var(--r-xs)',
                  }}
                >
                  #{tg}
                  <button
                    type="button"
                    aria-label="Remove tag"
                    onClick={() => setTags(tags.filter((x) => x !== tg))}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2, display: 'grid' }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              <input
                id="nd-tag"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag, press Enter"
                style={{
                  flex: 1,
                  minWidth: 140,
                  border: 0,
                  background: 'transparent',
                  font: 'inherit',
                  fontSize: 14,
                  padding: 6,
                  outline: 'none',
                  color: 'inherit',
                }}
              />
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
                borderRadius: 'var(--r-sm)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            padding: '16px 24px',
            borderTop: '2px solid var(--color-divider)',
            background: 'var(--color-surface)',
          }}
        >
          <span className="text-muted" style={{ fontSize: 12, marginRight: 'auto' }}>
            {type === 'note'
              ? 'Opens in editing mode so you can start writing.'
              : 'Opens the file. Embed it in any note with Add block.'}
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ minHeight: 40, minWidth: 150 }}
          >
            <Icon name="plus" size={16} />
            Create {pl.l.toLowerCase()}
          </button>
        </div>
      </form>
    </div>
  );
}
