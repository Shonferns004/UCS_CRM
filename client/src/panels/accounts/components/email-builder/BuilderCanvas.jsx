import { useState } from 'react';
import { blockLabel } from './blocks';

function BlockPreview({ block }) {
  switch (block.type) {
    case 'logo':
    case 'header':
    case 'image':
      return block.src
        ? <img className="eb-block-thumb" src={block.src} alt={block.alt || ''} />
        : <div className="eb-block-preview-muted">No image selected</div>;

    case 'heading':
      return <div className="eb-block-preview-text" style={{ fontWeight: 800, fontSize: 15 }}>{block.text || 'Empty heading'}</div>;

    case 'text':
      return <div className="eb-block-preview-text">{block.text || 'Empty text block'}</div>;

    case 'imageText':
      return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {block.src ? <img className="eb-block-thumb" src={block.src} alt={block.alt || ''} style={{ width: 90, height: 70 }} /> : null}
          <div style={{ minWidth: 0 }}>
            <div className="eb-block-preview-text" style={{ fontWeight: 700 }}>{block.heading || 'Heading'}</div>
            <div className="eb-block-preview-text">{block.text || 'Text'}</div>
          </div>
        </div>
      );

    case 'gallery': {
      const images = (block.images || []).filter((img) => img?.src);
      return images.length ? (
        <div className="eb-block-thumb-row">
          {images.map((img, index) => <img key={index} src={img.src} alt={img.alt || ''} />)}
        </div>
      ) : <div className="eb-block-preview-muted">No images selected</div>;
    }

    case 'button':
      return (
        <div style={{ textAlign: block.align || 'center' }}>
          <span style={{
            display: 'inline-block',
            padding: '8px 18px',
            borderRadius: Number(block.radius ?? 8),
            background: block.backgroundColor || '#0f766e',
            color: block.textColor || '#fff',
            fontSize: 12,
            fontWeight: 700,
          }}>
            {block.label || 'Button'}
          </span>
        </div>
      );

    case 'social': {
      const items = (block.items || []).filter((item) => item?.url);
      return items.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {items.map((item, index) => (
            <span key={index} style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)' }}>{item.label || item.platform}</span>
          ))}
        </div>
      ) : <div className="eb-block-preview-muted">No social links added</div>;
    }

    case 'divider':
      return <hr style={{ border: 0, borderTop: `1px solid ${block.color || '#e2e8f0'}`, margin: 0 }} />;

    case 'spacer':
      return <div style={{ height: Math.min(Number(block.height ?? 24), 60), background: 'repeating-linear-gradient(45deg, #f8fafc, #f8fafc 6px, #eef2f1 6px, #eef2f1 12px)', borderRadius: 6 }} />;

    case 'footer':
      return <div className="eb-block-preview-muted" style={{ whiteSpace: 'pre-wrap' }}>{block.text || 'Footer'}</div>;

    default:
      return <div className="eb-block-preview-muted">{blockLabel(block.type)}</div>;
  }
}

function readPayload(event) {
  const raw = event.dataTransfer.getData('application/x-email-block') || event.dataTransfer.getData('text/plain');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function BuilderCanvas({
  blocks,
  selectedId,
  onSelect,
  onInsert,
  onMove,
  onDuplicate,
  onDelete,
}) {
  const [overIndex, setOverIndex] = useState(null);

  const handleDrop = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readPayload(event);
    setOverIndex(null);
    if (!payload) return;
    if (payload.kind === 'palette' && payload.type) {
      onInsert(payload.type, index);
      return;
    }
    if (payload.kind === 'block' && payload.id) {
      const from = blocks.findIndex((block) => block.id === payload.id);
      if (from < 0) return;
      const finalIndex = from < index ? index - 1 : index;
      if (finalIndex !== from) onMove(payload.id, finalIndex);
    }
  };

  return (
    <div className="eb-canvas">
      <div className="eb-canvas-head">
        <span>{blocks.length} block{blocks.length === 1 ? '' : 's'}</span>
        <span>Drag blocks to reorder</span>
      </div>

      {blocks.map((block, index) => (
        <div key={block.id}>
          <div
            className={`eb-block${selectedId === block.id ? ' is-selected' : ''}${overIndex === index ? ' is-drop-target' : ''}`}
            draggable
            onDragStart={(event) => {
              const payload = JSON.stringify({ kind: 'block', id: block.id });
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('application/x-email-block', payload);
              event.dataTransfer.setData('text/plain', payload);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
            onDrop={(event) => handleDrop(event, index)}
            onClick={() => onSelect(block.id)}
          >
            <div className="eb-block-bar">
              <span className="eb-drag-handle" title="Drag to reorder">::</span>
              <span className="eb-block-name">{blockLabel(block.type)}</span>
              <button type="button" className="eb-icon-btn" title="Move up" disabled={index === 0} onClick={(e) => { e.stopPropagation(); onMove(block.id, index - 1); }}>↑</button>
              <button type="button" className="eb-icon-btn" title="Move down" disabled={index === blocks.length - 1} onClick={(e) => { e.stopPropagation(); onMove(block.id, index + 1); }}>↓</button>
              <button type="button" className="eb-icon-btn" title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicate(block.id); }}>⧉</button>
              <button type="button" className="eb-icon-btn is-danger" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}>×</button>
            </div>
            <div className="eb-block-body">
              <BlockPreview block={block} />
            </div>
          </div>
        </div>
      ))}

      <div
        className={`eb-canvas-drop${overIndex === blocks.length ? ' is-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOverIndex(blocks.length);
        }}
        onDragLeave={() => setOverIndex((current) => (current === blocks.length ? null : current))}
        onDrop={(event) => handleDrop(event, blocks.length)}
      >
        {blocks.length ? 'Drop here to add at the end' : 'Drag a block here, or click a block in the palette'}
      </div>
    </div>
  );
}
