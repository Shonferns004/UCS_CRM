import { SOCIAL_PLATFORMS } from './blocks';

function Field({ label, children, span }) {
  return (
    <div className={`eb-inspector-field${span ? ' eb-span-2' : ''}`}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function AlignSelect({ value, onChange }) {
  return (
    <select className="be-select" value={value || 'left'} onChange={(e) => onChange(e.target.value)}>
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </select>
  );
}

function ColorField({ label, value, fallback, onChange }) {
  return (
    <Field label={label}>
      <div className="eb-color-row">
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} />
        <input className="be-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={fallback} />
      </div>
    </Field>
  );
}

function TokenButtons({ onInsert }) {
  return (
    <div className="eb-token-row">
      <button type="button" className="eb-token-btn" onClick={() => onInsert('{{Name}}')}>+ Name</button>
      <button type="button" className="eb-token-btn" onClick={() => onInsert('{{Email}}')}>+ Email</button>
    </div>
  );
}

function ImageField({ label, value, alt, onSrcChange, onUpload, uploading }) {
  return (
    <Field label={label}>
      <div className="eb-image-picker">
        {value ? <img src={value} alt="" /> : null}
        <label className="be-btn-small" style={{ cursor: uploading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          {uploading ? 'Uploading...' : value ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onUpload(file);
            }}
          />
        </label>
        {value ? <button type="button" className="be-link-btn be-danger-link" onClick={() => onSrcChange('')}>Remove</button> : null}
      </div>
      <input
        className="be-input"
        value={value || ''}
        onChange={(e) => onSrcChange(e.target.value)}
        placeholder="https://... or upload above"
        aria-label={alt || label}
      />
    </Field>
  );
}

export default function BlockInspector({ block, onChange, onUpload, uploading }) {
  if (!block) {
    return <div className="eb-empty-note">Select a block on the canvas to edit it.</div>;
  }

  const patch = (value) => onChange({ ...block, ...value });

  const textWithTokens = (field, label = 'Text', rows = 5) => (
    <Field label={label}>
      <textarea className="be-textarea" rows={rows} value={block[field] || ''} onChange={(e) => patch({ [field]: e.target.value })} />
      <TokenButtons onInsert={(token) => patch({ [field]: `${block[field] || ''}${token}` })} />
    </Field>
  );

  const imageSrc = (field, label = 'Image') => (
    <ImageField
      label={label}
      value={block[field] || ''}
      alt={block.alt}
      uploading={uploading}
      onSrcChange={(src) => patch({ [field]: src })}
      onUpload={(file) => onUpload(file, (url) => patch({ [field]: url }))}
    />
  );

  switch (block.type) {
    case 'logo':
      return (
        <>
          {imageSrc('src', 'Logo image')}
          <Field label="Alt text">
            <input className="be-input" value={block.alt || ''} onChange={(e) => patch({ alt: e.target.value })} />
          </Field>
          <div className="eb-inspector-row">
            <Field label="Width (px)">
              <input className="be-input" type="number" min="40" max="320" value={block.width ?? 150} onChange={(e) => patch({ width: Number(e.target.value) })} />
            </Field>
            <Field label="Align">
              <AlignSelect value={block.align} onChange={(align) => patch({ align })} />
            </Field>
          </div>
          <Field label="Link (optional)">
            <input className="be-input" value={block.href || ''} onChange={(e) => patch({ href: e.target.value })} placeholder="https://..." />
          </Field>
        </>
      );

    case 'header':
      return (
        <>
          {imageSrc('src', 'Header image')}
          <Field label="Alt text">
            <input className="be-input" value={block.alt || ''} onChange={(e) => patch({ alt: e.target.value })} />
          </Field>
          <Field label="Link (optional)">
            <input className="be-input" value={block.href || ''} onChange={(e) => patch({ href: e.target.value })} placeholder="https://..." />
          </Field>
        </>
      );

    case 'heading':
      return (
        <>
          {textWithTokens('text', 'Heading', 2)}
          <div className="eb-inspector-row">
            <Field label="Align">
              <AlignSelect value={block.align} onChange={(align) => patch({ align })} />
            </Field>
            <Field label="Size (px)">
              <input className="be-input" type="number" min="16" max="40" value={block.size ?? 26} onChange={(e) => patch({ size: Number(e.target.value) })} />
            </Field>
          </div>
          <ColorField label="Color" value={block.color} fallback="#1f2937" onChange={(color) => patch({ color })} />
        </>
      );

    case 'text':
      return (
        <>
          {textWithTokens('text', 'Text', 7)}
          <div className="eb-inspector-row">
            <Field label="Align">
              <AlignSelect value={block.align} onChange={(align) => patch({ align })} />
            </Field>
            <Field label="Size (px)">
              <input className="be-input" type="number" min="10" max="24" value={block.size ?? 15} onChange={(e) => patch({ size: Number(e.target.value) })} />
            </Field>
          </div>
          <ColorField label="Color" value={block.color} fallback="#1f2937" onChange={(color) => patch({ color })} />
        </>
      );

    case 'image':
      return (
        <>
          {imageSrc('src', 'Image')}
          <Field label="Alt text">
            <input className="be-input" value={block.alt || ''} onChange={(e) => patch({ alt: e.target.value })} />
          </Field>
          <Field label="Caption (optional)">
            <input className="be-input" value={block.caption || ''} onChange={(e) => patch({ caption: e.target.value })} />
          </Field>
          <Field label="Link (optional)">
            <input className="be-input" value={block.href || ''} onChange={(e) => patch({ href: e.target.value })} placeholder="https://..." />
          </Field>
          <div className="eb-inspector-row">
            <Field label="Width (px)">
              <input className="be-input" type="number" min="100" max="600" value={block.width ?? 520} onChange={(e) => patch({ width: Number(e.target.value) })} />
            </Field>
            <Field label="Align">
              <AlignSelect value={block.align} onChange={(align) => patch({ align })} />
            </Field>
          </div>
        </>
      );

    case 'imageText':
      return (
        <>
          {imageSrc('src', 'Image')}
          <Field label="Alt text">
            <input className="be-input" value={block.alt || ''} onChange={(e) => patch({ alt: e.target.value })} />
          </Field>
          {textWithTokens('heading', 'Heading', 2)}
          {textWithTokens('text', 'Text', 5)}
          <div className="eb-inspector-row">
            <Field label="Image position">
              <select className="be-select" value={block.imagePosition || 'left'} onChange={(e) => patch({ imagePosition: e.target.value })}>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Link (optional)">
              <input className="be-input" value={block.href || ''} onChange={(e) => patch({ href: e.target.value })} placeholder="https://..." />
            </Field>
          </div>
        </>
      );

    case 'gallery': {
      const images = Array.isArray(block.images) ? block.images : [];
      const updateImage = (index, value) => {
        const next = images.map((img, i) => (i === index ? { ...img, ...value } : img));
        patch({ images: next });
      };
      const removeImage = (index) => patch({ images: images.filter((_, i) => i !== index) });
      return (
        <>
          {images.map((img, index) => (
            <div key={index} className="eb-panel" style={{ boxShadow: 'none', marginBottom: 10 }}>
              <div className="eb-panel-title">
                <span>Image {index + 1}</span>
                <button type="button" className="be-link-btn be-danger-link" onClick={() => removeImage(index)}>Remove</button>
              </div>
              <ImageField
                label="Image"
                value={img.src || ''}
                uploading={uploading}
                onSrcChange={(src) => updateImage(index, { src })}
                onUpload={(file) => onUpload(file, (url) => updateImage(index, { src: url }))}
              />
              <Field label="Caption (optional)">
                <input className="be-input" value={img.caption || ''} onChange={(e) => updateImage(index, { caption: e.target.value })} />
              </Field>
              <Field label="Link (optional)">
                <input className="be-input" value={img.href || ''} onChange={(e) => updateImage(index, { href: e.target.value })} placeholder="https://..." />
              </Field>
            </div>
          ))}
          {images.length < 6 ? (
            <button type="button" className="be-link-btn" onClick={() => patch({ images: [...images, { src: '', alt: '', caption: '', href: '' }] })}>
              + Add image
            </button>
          ) : null}
        </>
      );
    }

    case 'button':
      return (
        <>
          <Field label="Button label">
            <input className="be-input" value={block.label || ''} onChange={(e) => patch({ label: e.target.value })} />
          </Field>
          <Field label="Link URL">
            <input className="be-input" value={block.url || ''} onChange={(e) => patch({ url: e.target.value })} placeholder="https://..." />
          </Field>
          <div className="eb-inspector-row">
            <ColorField label="Button color" value={block.backgroundColor} fallback="#0f766e" onChange={(backgroundColor) => patch({ backgroundColor })} />
            <ColorField label="Text color" value={block.textColor} fallback="#ffffff" onChange={(textColor) => patch({ textColor })} />
          </div>
          <div className="eb-inspector-row">
            <Field label="Align">
              <AlignSelect value={block.align} onChange={(align) => patch({ align })} />
            </Field>
            <Field label="Radius (px)">
              <input className="be-input" type="number" min="0" max="40" value={block.radius ?? 8} onChange={(e) => patch({ radius: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="eb-inspector-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={block.fullWidth === true} onChange={(e) => patch({ fullWidth: e.target.checked })} />
            <span style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>Full width button</span>
          </label>
        </>
      );

    case 'social': {
      const items = Array.isArray(block.items) ? block.items : [];
      const updateItem = (index, value) => {
        const next = items.map((item, i) => (i === index ? { ...item, ...value } : item));
        patch({ items: next });
      };
      return (
        <>
          {items.map((item, index) => (
            <div key={index} className="eb-panel" style={{ boxShadow: 'none', marginBottom: 10 }}>
              <div className="eb-panel-title">
                <span>Link {index + 1}</span>
                <button type="button" className="be-link-btn be-danger-link" onClick={() => patch({ items: items.filter((_, i) => i !== index) })}>Remove</button>
              </div>
              <div className="eb-inspector-row">
                <Field label="Platform">
                  <select
                    className="be-select"
                    value={item.platform || 'facebook'}
                    onChange={(e) => {
                      const platform = e.target.value;
                      const label = SOCIAL_PLATFORMS.find((p) => p.value === platform)?.label || '';
                      updateItem(index, { platform, label });
                    }}
                  >
                    {SOCIAL_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Label">
                  <input className="be-input" value={item.label || ''} onChange={(e) => updateItem(index, { label: e.target.value })} />
                </Field>
              </div>
              <Field label="URL">
                <input className="be-input" value={item.url || ''} onChange={(e) => updateItem(index, { url: e.target.value })} placeholder="https://..." />
              </Field>
            </div>
          ))}
          <button type="button" className="be-link-btn" onClick={() => patch({ items: [...items, { platform: 'facebook', label: 'Facebook', url: '' }] })}>
            + Add social link
          </button>
        </>
      );
    }

    case 'divider':
      return <ColorField label="Line color" value={block.color} fallback="#e2e8f0" onChange={(color) => patch({ color })} />;

    case 'spacer':
      return (
        <Field label="Height (px)">
          <input className="be-input" type="number" min="4" max="120" value={block.height ?? 24} onChange={(e) => patch({ height: Number(e.target.value) })} />
        </Field>
      );

    case 'footer':
      return (
        <>
          {textWithTokens('text', 'Footer text', 3)}
          <div className="eb-inspector-row">
            <Field label="Align">
              <AlignSelect value={block.align} onChange={(align) => patch({ align })} />
            </Field>
            <Field label="Size (px)">
              <input className="be-input" type="number" min="9" max="16" value={block.size ?? 11.5} onChange={(e) => patch({ size: Number(e.target.value) })} />
            </Field>
          </div>
          <ColorField label="Color" value={block.color} fallback="#6b7280" onChange={(color) => patch({ color })} />
        </>
      );

    default:
      return <div className="eb-empty-note">This block has no settings.</div>;
  }
}
