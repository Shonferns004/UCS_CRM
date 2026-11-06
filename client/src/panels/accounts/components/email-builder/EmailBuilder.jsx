import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../../api/auth';
import BuilderCanvas from './BuilderCanvas';
import BlockInspector from './BlockInspector';
import PreviewPane from './PreviewPane';
import { BLOCK_MENU, createBlock, createDefaultDesign, DEFAULT_SETTINGS } from './blocks';
import './emailBuilder.css';

const SAMPLE = { name: 'Sample Donor', email: 'donor@example.com' };

function designFromTemplate(template) {
  const design = createDefaultDesign();
  const body = String(template?.body || '').trim();
  design.blocks = [
    createBlock('logo'),
    { ...createBlock('heading'), text: template?.name || template?.subject || 'Email template' },
    { ...createBlock('text'), text: body || 'Write your message here.' },
    createBlock('button'),
    createBlock('footer'),
  ];
  return design;
}

export default function EmailBuilder({ templateId, onSaved, onCancel }) {
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [design, setDesign] = useState(() => createDefaultDesign());
  const [selectedId, setSelectedId] = useState(null);
  const [device, setDevice] = useState('desktop');
  const [sample, setSample] = useState(SAMPLE);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!templateId) {
        const fresh = createDefaultDesign();
        setEditingId(null);
        setDesign(fresh);
        setSelectedId(fresh.blocks[0]?.id || null);
        setName('');
        setSubject('');
        return;
      }
      setLoadingTemplate(true);
      setError(null);
      try {
        const template = await apiGet(`/accounts/bulk-email/templates/${templateId}`);
        if (cancelled) return;
        const nextDesign = template?.design && Array.isArray(template.design.blocks)
          ? { ...createDefaultDesign(), ...template.design, settings: { ...DEFAULT_SETTINGS, ...(template.design.settings || {}) } }
          : designFromTemplate(template);
        setEditingId(String(template.id));
        setName(template.name || '');
        setSubject(template.subject || '');
        setDesign(nextDesign);
        setSelectedId(nextDesign.blocks[0]?.id || null);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load the template.');
      } finally {
        if (!cancelled) setLoadingTemplate(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [templateId]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const result = await apiPost('/accounts/bulk-email/templates/preview', {
          design,
          name: sample.name,
          email: sample.email,
        });
        setPreviewHtml(result?.html || '');
      } catch (err) {
        setPreviewError(err?.message || 'Could not render the preview.');
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [design, sample.name, sample.email]);

  const selectedBlock = useMemo(
    () => design.blocks.find((block) => block.id === selectedId) || null,
    [design.blocks, selectedId],
  );

  const updateDesign = useCallback((updater) => {
    setDesign((current) => updater(current));
  }, []);

  const updateSettings = (patch) => {
    updateDesign((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  };

  const insertBlock = (type, index) => {
    const block = createBlock(type);
    setDesign((current) => {
      const blocks = [...current.blocks];
      const at = Math.max(0, Math.min(blocks.length, index ?? blocks.length));
      blocks.splice(at, 0, block);
      return { ...current, blocks };
    });
    setSelectedId(block.id);
  };

  const moveBlock = (id, finalIndex) => {
    setDesign((current) => {
      const from = current.blocks.findIndex((block) => block.id === id);
      if (from < 0) return current;
      const blocks = [...current.blocks];
      const [block] = blocks.splice(from, 1);
      const at = Math.max(0, Math.min(blocks.length, finalIndex));
      blocks.splice(at, 0, block);
      return { ...current, blocks };
    });
  };

  const duplicateBlock = (id) => {
    setDesign((current) => {
      const index = current.blocks.findIndex((block) => block.id === id);
      if (index < 0) return current;
      const clone = { ...current.blocks[index], id: createBlock(current.blocks[index].type).id };
      if (Array.isArray(clone.images)) clone.images = clone.images.map((img) => ({ ...img }));
      if (Array.isArray(clone.items)) clone.items = clone.items.map((item) => ({ ...item }));
      const blocks = [...current.blocks];
      blocks.splice(index + 1, 0, clone);
      return { ...current, blocks };
    });
  };

  const deleteBlock = (id) => {
    setDesign((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const uploadImage = async (file, apply) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await apiPost('/accounts/bulk-email/assets', form);
      if (!result?.url) throw new Error('Upload did not return an image URL');
      apply(result.url);
    } catch (err) {
      setError(err?.message || 'Could not upload the image.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) { setError('Template name is required.'); return; }
    if (!subject.trim()) { setError('Template subject is required.'); return; }
    if (!design.blocks.length) { setError('Add at least one block to the email.'); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), subject: subject.trim(), design };
      const saved = editingId
        ? await apiPut(`/accounts/bulk-email/templates/${editingId}`, payload)
        : await apiPost('/accounts/bulk-email/templates', payload);
      if (saved?.id) setEditingId(String(saved.id));
      onSaved?.(saved);
    } catch (err) {
      setError(err?.message || 'Could not save the template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="eb-builder">
      <div className="eb-builder-toolbar">
        <label className="be-field eb-grow" style={{ marginBottom: 0 }}>
          <span>Template name</span>
          <input className="be-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Donor Newsletter" />
        </label>
        <label className="be-field eb-grow" style={{ marginBottom: 0 }}>
          <span>Subject</span>
          <input className="be-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject line" />
        </label>
        <div className="eb-actions">
          {onCancel ? <button type="button" className="be-link-btn" onClick={onCancel}>Cancel</button> : null}
          <button type="button" className="be-btn-small" onClick={save} disabled={saving || loadingTemplate}>
            {saving ? 'Saving...' : editingId ? 'Update template' : 'Save template'}
          </button>
        </div>
      </div>

      {error ? <div className="be-alert">{error}</div> : null}

      {loadingTemplate ? (
        <div className="eb-panel"><div className="eb-empty-note">Loading template...</div></div>
      ) : (
        <div className="eb-builder-grid">
          <div>
            <section className="eb-panel">
              <h3 className="eb-panel-title">Add blocks</h3>
              <div className="eb-palette">
                {BLOCK_MENU.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className="eb-palette-btn"
                    draggable
                    onDragStart={(event) => {
                      const payload = JSON.stringify({ kind: 'palette', type: item.type });
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData('application/x-email-block', payload);
                      event.dataTransfer.setData('text/plain', payload);
                    }}
                    onClick={() => insertBlock(item.type, design.blocks.length)}
                  >
                    {item.label}
                    <small>{item.hint}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="eb-panel">
              <h3 className="eb-panel-title">Template style</h3>
              <div className="eb-settings-grid">
                <label className="eb-inspector-field">
                  <span>Page background</span>
                  <input type="color" value={design.settings.backgroundColor || DEFAULT_SETTINGS.backgroundColor} onChange={(e) => updateSettings({ backgroundColor: e.target.value })} />
                </label>
                <label className="eb-inspector-field">
                  <span>Content background</span>
                  <input type="color" value={design.settings.contentBackground || DEFAULT_SETTINGS.contentBackground} onChange={(e) => updateSettings({ contentBackground: e.target.value })} />
                </label>
                <label className="eb-inspector-field">
                  <span>Text color</span>
                  <input type="color" value={design.settings.textColor || DEFAULT_SETTINGS.textColor} onChange={(e) => updateSettings({ textColor: e.target.value })} />
                </label>
                <label className="eb-inspector-field">
                  <span>Link color</span>
                  <input type="color" value={design.settings.linkColor || DEFAULT_SETTINGS.linkColor} onChange={(e) => updateSettings({ linkColor: e.target.value })} />
                </label>
                <label className="eb-inspector-field eb-span-2">
                  <span>Content width (px)</span>
                  <input
                    className="be-input"
                    type="number"
                    min="320"
                    max="720"
                    value={design.settings.width || 600}
                    onChange={(e) => updateSettings({ width: Number(e.target.value) })}
                  />
                </label>
                <label className="eb-inspector-field eb-span-2">
                  <span>Font family</span>
                  <select className="be-select" value={design.settings.fontFamily || DEFAULT_SETTINGS.fontFamily} onChange={(e) => updateSettings({ fontFamily: e.target.value })}>
                    <option value="'Segoe UI', Arial, Helvetica, sans-serif">System sans-serif</option>
                    <option value="Arial, Helvetica, sans-serif">Arial</option>
                    <option value="Georgia, 'Times New Roman', serif">Georgia serif</option>
                    <option value="Tahoma, Verdana, sans-serif">Tahoma / Verdana</option>
                  </select>
                </label>
              </div>
            </section>
          </div>

          <BuilderCanvas
            blocks={design.blocks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onInsert={insertBlock}
            onMove={moveBlock}
            onDuplicate={duplicateBlock}
            onDelete={deleteBlock}
          />

          <div>
            <section className="eb-panel">
              <h3 className="eb-panel-title">
                <span>{selectedBlock ? 'Block settings' : 'Block settings'}</span>
                {selectedBlock ? <span style={{ textTransform: 'none', letterSpacing: 0 }}>{selectedBlock.type}</span> : null}
              </h3>
              <BlockInspector
                block={selectedBlock}
                onChange={(next) => {
                  updateDesign((current) => ({
                    ...current,
                    blocks: current.blocks.map((block) => (block.id === next.id ? next : block)),
                  }));
                }}
                onUpload={uploadImage}
                uploading={uploading}
              />
            </section>

            <PreviewPane
              html={previewHtml}
              loading={previewLoading}
              error={previewError}
              device={device}
              onDeviceChange={setDevice}
              sample={sample}
              onSampleChange={setSample}
            />
          </div>
        </div>
      )}
    </div>
  );
}
