import React from 'react';
import { Icon } from '../icons';

interface ImageBlockProps {
  id: string;
  title: string;
  data: {
    caption: string;
    dims: string;
  };
}

export function ImageBlock({ id: _id, title, data }: ImageBlockProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '3 / 2',
          maxHeight: 460,
          width: '100%',
          background: 'var(--color-surface)',
          display: 'grid',
          placeItems: 'center',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            color: 'var(--color-neutral-700)',
          }}
        >
          <Icon name="image" size={32} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        </div>
      </div>
      <div
        className="text-muted"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 12px',
          fontSize: 12,
        }}
      >
        <span>{data.caption}</span>
        <span>{data.dims}</span>
      </div>
    </div>
  );
}
