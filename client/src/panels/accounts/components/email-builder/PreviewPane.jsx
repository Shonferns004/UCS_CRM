export default function PreviewPane({
  html,
  loading,
  error,
  device,
  onDeviceChange,
  sample,
  onSampleChange,
}) {
  const bytes = html ? new TextEncoder().encode(html).length : 0;
  const kb = bytes ? (bytes / 1024).toFixed(1) : '0';
  const heavy = bytes > 102 * 1024;

  return (
    <aside className="eb-preview-card">
      <div className="eb-preview-head">
        <strong>Live preview</strong>
        <div className="eb-device-toggle">
          <button type="button" className={device === 'desktop' ? 'is-active' : ''} onClick={() => onDeviceChange('desktop')}>Desktop</button>
          <button type="button" className={device === 'mobile' ? 'is-active' : ''} onClick={() => onDeviceChange('mobile')}>Mobile</button>
        </div>
      </div>

      <div className="eb-preview-sample">
        <input
          className="be-input"
          value={sample.name}
          onChange={(e) => onSampleChange({ ...sample, name: e.target.value })}
          placeholder="Sample name"
          aria-label="Sample name"
        />
        <input
          className="be-input"
          value={sample.email}
          onChange={(e) => onSampleChange({ ...sample, email: e.target.value })}
          placeholder="Sample email"
          aria-label="Sample email"
        />
      </div>

      {error ? <div className="be-alert">{error}</div> : null}

      <div className="eb-preview-frame-wrap">
        {html ? (
          <iframe
            className={`eb-preview-frame is-${device}`}
            title="Email preview"
            srcDoc={html}
            sandbox=""
          />
        ) : (
          <div className="eb-empty-note">{loading ? 'Rendering preview...' : 'Add a block to see the preview.'}</div>
        )}
      </div>

      <div className="eb-preview-meta">
        {loading ? 'Rendering...' : `HTML size: ${kb} KB`}
        {heavy ? ' — Getting close to Gmail’s 102 KB clipping limit.' : ''}
      </div>
    </aside>
  );
}
