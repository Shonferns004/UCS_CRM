import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Copy, FileText, Filter, Loader2, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { type MessageTemplate, type TemplatePayload } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import {
  useCreateTemplateMutation,
  useDeleteTemplateMutation,
  useUpdateTemplateMutation,
} from '../hooks/queries';
import { useAllNgoTemplates, useNgoTemplates } from '../hooks/useNgoTemplates';
import { openwaAssignmentsApi } from '../services/crmAssignments';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { copyToClipboard } from '../utils/clipboard';
import { captionLength } from '../utils/bulkMedia';
import { API_BASE } from '../../../../../lib/apiBase';
import './Templates.css';

type TemplateMediaType = 'text' | 'image' | 'video' | 'audio' | 'document';

const TEMPLATE_TYPES: TemplateMediaType[] = ['text', 'image', 'video', 'audio', 'document'];

type TemplateForm = {
  name: string;
  header: string;
  body: string;
  footer: string;
  messageType: TemplateMediaType;
  mediaUrl: string;
  mediaFilename: string;
};

const emptyForm: TemplateForm = {
  name: '',
  header: '',
  body: '',
  footer: '',
  messageType: 'text',
  mediaUrl: '',
  mediaFilename: '',
};

// The gateway's renderer pattern (PLACEHOLDER_PATTERN in src/common/utils/template-render.ts), kept verbatim: a send
// fills the legacy single-brace `{key}` form as well as `{{key}}`, so the list and the preview read both. Only the
// double-brace form is advertised.
export const PLACEHOLDER_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}|\{(\w+)\}/g;

/** The variables a send fills, each once, with the form it is written in: `{{key}}`, or `{key}` for the legacy form. */
function extractPlaceholders(template: TemplateForm | MessageTemplate): Array<{ key: string; token: string }> {
  const source = [template.header, template.body, template.footer].filter(Boolean).join('\n');
  const tokens = new Map<string, string>();
  for (const [, doubleKey, singleKey] of source.matchAll(PLACEHOLDER_PATTERN)) {
    const key = doubleKey ?? singleKey;
    if (!tokens.has(key)) tokens.set(key, doubleKey !== undefined ? `{{${key}}}` : `{${key}}`);
  }
  return [...tokens.keys()].sort().map(key => ({ key, token: tokens.get(key)! }));
}

function toPayload(form: TemplateForm): TemplatePayload {
  return {
    name: form.name.trim(),
    header: form.header.trim() || null,
    body: form.body.trim(),
    footer: form.footer.trim() || null,
    messageType: form.messageType,
    mediaUrl: form.mediaUrl.trim() || null,
    mediaFilename: form.mediaFilename.trim() || null,
  };
}

// The gateway's limits (template.dto.ts), past which a production gateway answers a bare "Bad Request" naming no field.
// The name is counted in code points, the other fields the way class-validator's MaxLength counts them.
const NAME_MAX_LENGTH = 100;
const BODY_MAX_LENGTH = 4096;
const HEADER_FOOTER_MAX_LENGTH = 1024;

// A preview value the operator gave for this placeholder. The gateway fills only own properties, so a placeholder named
// like an inherited member (constructor, toString, __proto__) must not read that member.
const ownValue = (values: Record<string, string>, key: string): string | undefined =>
  Object.hasOwn(values, key) ? values[key] : undefined;

function renderPreview(template: TemplateForm, values: Record<string, string>) {
  return (
    [template.header, template.body, template.footer]
      .filter(Boolean)
      .join('\n\n')
      // An unfilled placeholder stays as written, as the gateway leaves it.
      .replace(
        PLACEHOLDER_PATTERN,
        (match, doubleKey: string | undefined, singleKey: string | undefined) =>
          ownValue(values, doubleKey ?? singleKey!) || match,
      )
  );
}

export function Templates() {
  const { t } = useTranslation();
  useDocumentTitle(t('templates.title'));
  const { canWrite } = useRole();

  // A template belongs to an NGO, not to one phone number: the library can be built
  // before any WhatsApp session exists, and every session later assigned to the NGO
  // reads the same set.
  const ngoQuery = useQuery({
    queryKey: ['openwa-ngos'],
    queryFn: openwaAssignmentsApi.meta,
    staleTime: 60_000,
  });
  const ngos = ngoQuery.data?.ngos || [];
  const ngosFailed = ngoQuery.isError && ngos.length === 0;
  // '' means the "All NGOs" filter; a non-empty id narrows the library to one NGO.
  const [selectedNgoId, setSelectedNgoId] = useState('');
  // The NGO a new template is written for. Kept separately from the filter: with "All" selected the
  // library shows every NGO while the editor still needs one target.
  const [targetNgoId, setTargetNgoId] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const specificTemplates = useNgoTemplates(selectedNgoId);
  const allTemplates = useAllNgoTemplates(selectedNgoId ? [] : ngos.map(ngo => ngo.id));
  const {
    templates,
    isLoading: loadingTemplates,
    error: templatesError,
    refetch: refetchTemplates,
  } = selectedNgoId ? specificTemplates : allTemplates;
  const targetNgo = ngos.find(ngo => ngo.id === targetNgoId);

  const [form, setForm] = useState<TemplateForm>(emptyForm);
  // The draft on screen now, read by a save that resolves after the operator may have moved on.
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  // Bumped whenever the editor starts another draft (new, opened or NGO switched), unlike edits to the same one.
  const draftRef = useRef(0);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const toast = useToast();
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState('');
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateTemplateMutation();
  const updateMutation = useUpdateTemplateMutation();
  const deleteMutation = useDeleteTemplateMutation();
  const placeholders = useMemo(() => extractPlaceholders(form), [form]);
  const preview = useMemo(() => renderPreview(form, previewValues), [form, previewValues]);
  const filteredTemplates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter(template =>
      [template.name, template.header, template.body, template.footer]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(query)),
    );
  }, [searchTerm, templates]);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  // Measured on what a save sends (trimmed), each with its gateway limit.
  const sent = toPayload(form);
  const limits = {
    name: [[...sent.name].length, NAME_MAX_LENGTH],
    header: [captionLength(sent.header ?? ''), HEADER_FOOTER_MAX_LENGTH],
    body: [captionLength(sent.body), BODY_MAX_LENGTH],
    footer: [captionLength(sent.footer ?? ''), HEADER_FOOTER_MAX_LENGTH],
  } as const;
  const overLimit = Object.values(limits).some(([count, max]) => count > max);
  const isMediaTemplate = form.messageType !== 'text';
  const mediaUrlValue = form.mediaUrl.trim();
  const mediaUrlInvalid = isMediaTemplate && !!mediaUrlValue && !/^https?:\/\//i.test(mediaUrlValue);
  const mediaUrlMissing = isMediaTemplate && !mediaUrlValue;
  // URLs written in the footer are plain text in the message; WhatsApp autolinks them.
  const footerLinks = useMemo(
    () => (form.footer.match(/https?:\/\/[^\s,;]+/gi) || []).slice(0, 3),
    [form.footer],
  );
  const limitHint = ([count, max]: readonly [number, number]) => (
    <span className="field-error" role="status">
      {count > max ? t('common.fieldTooLong', { max, count }) : ''}
    </span>
  );
  // The row whose update is in flight: the list shows its pre-save values until the update settles, and
  // reopening it then would load them into the editor to be saved back. Every other row is current.
  const updatingId = updateMutation.isPending ? updateMutation.variables?.id : undefined;

  // Keep the create target valid as the NGO list loads or changes. The filter itself defaults to
  // All, so nothing is forced into selectedNgoId here.
  useEffect(() => {
    setTargetNgoId(current => (ngos.some(ngo => ngo.id === current) ? current : ngos[0]?.id ?? ''));
  }, [ngos]);

  // A filter id whose NGO disappeared falls back to All; the draft resets as an NGO switch did.
  useEffect(() => {
    if (!selectedNgoId) return;
    if (ngos.some(ngo => ngo.id === selectedNgoId)) return;
    setSelectedNgoId('');
    setFilterOpen(false);
    draftRef.current += 1;
    setForm(emptyForm);
    setEditingTemplate(null);
    setPreviewValues({});
  }, [selectedNgoId, ngos]);

  // Close the filter menu on an outside click or Escape.
  useEffect(() => {
    if (!filterOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setFilterOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filterOpen]);

  useEffect(() => {
    // Built as own entries: an assignment to `__proto__` would set the prototype instead of a value.
    setPreviewValues(current => Object.fromEntries(placeholders.map(({ key }) => [key, ownValue(current, key) || ''])));
  }, [placeholders]);

  const resetForm = () => {
    draftRef.current += 1;
    setForm(emptyForm);
    setEditingTemplate(null);
    setPreviewValues({});
  };

  const openEdit = (template: MessageTemplate) => {
    draftRef.current += 1;
    setEditingTemplate(template);
    setTargetNgoId(template.ngoId || ngos[0]?.id || '');
    setForm({
      name: template.name,
      header: template.header || '',
      body: template.body,
      footer: template.footer || '',
      messageType: (template.messageType as TemplateMediaType) || 'text',
      mediaUrl: template.mediaUrl || '',
      mediaFilename: template.mediaFilename || '',
    });
    // An explicit smooth ignores the CSS scroll-behavior, so the preference is asked for here.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const uploadTemplateMedia = async (file: File | null) => {
    if (!file) return;
    setMediaUploading(true);
    setMediaUploadError('');
    try {
      const token = localStorage.getItem('ucs_token');
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE}/upload-template-media`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || `Upload failed (HTTP ${response.status})`);
      if (!data?.fileName) throw new Error('Upload did not return a file name');
      // Stored on this backend's uploads volume, so the URL is the CRM host, not S3.
      const root = API_BASE.replace(/\/api\/?$/, '');
      const mediaUrl = `${root}/uploads/templates/${encodeURIComponent(data.fileName)}`;
      setForm(current => ({ ...current, mediaUrl, mediaFilename: file.name }));
    } catch (err) {
      setMediaUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setMediaUploading(false);
    }
  };

  const handleSave = async () => {
    const saveNgoId = editingTemplate?.ngoId || targetNgoId;
    if (!saveNgoId || !form.name.trim() || !form.body.trim()) return;
    if (isMediaTemplate && (!mediaUrlValue || mediaUrlInvalid)) return;
    const savedForm = form;
    const draft = draftRef.current;

    try {
      let saved: MessageTemplate;
      if (editingTemplate) {
        const result = await updateMutation.mutateAsync({
          ngoId: editingTemplate.ngoId || saveNgoId,
          id: editingTemplate.id,
          data: toPayload(form),
        });
        saved = result.template;
        toast.success(t('templates.toasts.updated'));
      } else {
        const result = await createMutation.mutateAsync({
          ngoId: saveNgoId,
          data: toPayload(form),
        });
        saved = result.template;
        toast.success(t('templates.toasts.created'));
      }
      void refetchTemplates();
      // Edits typed into this draft while the save was in flight stay on screen; point them at the saved
      // row so the next save updates it (a second create would fail the unique name check) and the
      // editor header reflects the stored name.
      if (draftRef.current === draft && formRef.current !== savedForm) setEditingTemplate(saved);
      // Every edit, template switch and NGO switch replaces the form object, so a save that
      // resolves after any of them must leave the newer draft alone.
      if (formRef.current === savedForm) resetForm();
    } catch (err) {
      toast.error(
        t(editingTemplate ? 'templates.toasts.updateFailed' : 'templates.toasts.createFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const draft = draftRef.current;
    try {
      await deleteMutation.mutateAsync({
        ngoId: deleteTarget.ngoId || targetNgoId,
        id: deleteTarget.id,
      });
      void refetchTemplates();
      toast.success(t('templates.toasts.deleted'));
      if (draftRef.current === draft && editingTemplate?.id === deleteTarget.id) resetForm();
      setDeleteTarget(current => (current === deleteTarget ? null : current));
    } catch (err) {
      toast.error(
        t('templates.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      );
    }
  };

  const copyName = async (name: string) => {
    if (await copyToClipboard(name)) {
      toast.success(t('templates.toasts.copied'));
    }
  };

  if (ngoQuery.isLoading) {
    return (
      <div className="templates-page templates-loading">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="templates-page">
      <PageHeader
        title={t('templates.title')}
        subtitle={t('templates.subtitleNgo', 'Create reusable message templates for each NGO')}
      />

      {ngosFailed ? (
        <div className="templates-empty-page" role="alert">
          <AlertCircle size={48} strokeWidth={1} />
          <h3>{t('dashboard.loadError')}</h3>
          <p>{ngoQuery.error?.message}</p>
        </div>
      ) : ngos.length === 0 ? (
        <div className="templates-empty-page">
          <FileText size={48} strokeWidth={1} />
          <h3>{t('templates.empty.noSessionsTitle')}</h3>
          <p>{t('templates.empty.noSessionsDesc')}</p>
        </div>
      ) : (
        <div className="templates-workspace">
          <aside className="templates-library">
            <div className="templates-library-header">
              <div>
                <h2>{t('templates.savedTitle')}</h2>
                <span>{t('templates.count', { count: templates.length })}</span>
              </div>
              <div className="templates-library-actions">
                <button
                  type="button"
                  className="btn-primary templates-new-btn"
                  onClick={resetForm}
                  disabled={!canWrite}
                  title={t('templates.newTemplate')}
                  aria-label={t('templates.newTemplate')}
                >
                  <Plus size={14} />
                </button>
                <div className="templates-filter" ref={filterRef}>
                  <button
                    type="button"
                    className={`icon-btn templates-filter-btn ${selectedNgoId ? 'active' : ''}`}
                    title="Filter by NGO"
                    aria-label="Filter by NGO"
                    aria-haspopup="menu"
                    aria-expanded={filterOpen}
                    onClick={() => setFilterOpen(open => !open)}
                  >
                    <Filter size={14} />
                  </button>
                  {filterOpen && (
                    <div className="templates-filter-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={!selectedNgoId ? 'active' : ''}
                        onClick={() => {
                          setSelectedNgoId('');
                          setFilterOpen(false);
                          resetForm();
                        }}
                      >
                        All NGOs
                      </button>
                      {ngos.map(ngo => (
                        <button
                          key={ngo.id}
                          type="button"
                          role="menuitem"
                          className={selectedNgoId === ngo.id ? 'active' : ''}
                          onClick={() => {
                            setSelectedNgoId(ngo.id);
                            setTargetNgoId(ngo.id);
                            setFilterOpen(false);
                            resetForm();
                          }}
                        >
                          {ngo.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="templates-search">
              <Search size={16} />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder={t('common.search')}
              />
            </div>

            {/* No NGO selected yet means the first-NGO effect has not run: the read is still to start. */}
            {loadingTemplates ? (
              <div className="templates-loading-inline">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : (templatesError || !canWrite) && templates.length === 0 ? (
              // A failed read is not an empty library: a key below operator is refused here (the route is
              // OPERATOR-only, so it is never sent), and a gateway error would otherwise read as "no templates
              // saved". The 403 branch stays for a key whose role the page took for a writer's.
              <div className="templates-empty-list" role="alert">
                <AlertCircle size={40} strokeWidth={1} />
                {!canWrite || (templatesError as { status?: number } | null)?.status === 403 ? (
                  <>
                    <h3>{t('templates.empty.forbiddenTitle')}</h3>
                    <p>{t('templates.empty.forbiddenDesc')}</p>
                  </>
                ) : (
                  <>
                    <h3>{t('templates.empty.loadErrorTitle')}</h3>
                    <p>{templatesError?.message}</p>
                  </>
                )}
              </div>
            ) : templates.length === 0 ? (
              <div className="templates-empty-list">
                <FileText size={40} strokeWidth={1} />
                <h3>{t('templates.empty.title')}</h3>
                <p>{t('templates.empty.description')}</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="templates-empty-list compact">
                <Search size={32} strokeWidth={1.5} />
                <h3>{t('templates.empty.noMatch', 'No templates match your search.')}</h3>
              </div>
            ) : (
              <div className="template-list" role="list">
                {filteredTemplates.map(template => {
                  const templatePlaceholders = extractPlaceholders(template);
                  const isSelected = editingTemplate?.id === template.id;
                  return (
                    <div
                      key={template.id}
                      className={`template-list-row ${canWrite ? 'deletable' : ''}`}
                      role="listitem"
                    >
                      <button
                        className={`template-list-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => openEdit(template)}
                        disabled={template.id === updatingId}
                        type="button"
                      >
                        {!selectedNgoId && (
                          <span className="template-list-ngo">
                            {ngos.find(ngo => ngo.id === template.ngoId)?.name || '—'}
                          </span>
                        )}
                        <span className="template-list-title">{template.name}</span>
                        <span className="template-list-body">{template.body}</span>
                        <span className="template-list-meta">
                          {templatePlaceholders.length > 0
                            ? templatePlaceholders.map(({ token }) => token).join(' ')
                            : t('templates.noPlaceholders')}
                        </span>
                      </button>
                      {canWrite && (
                        <button
                          className="icon-btn danger template-list-delete"
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                          onClick={() => setDeleteTarget({ ...template })}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="template-editor">
            <div className="template-editor-header">
              <div>
                <h2>{editingTemplate ? t('templates.editTitle') : t('templates.createTitle')}</h2>
                {editingTemplate && (
                  <p>
                    {t('templates.sessionHint', {
                      name:
                        ngos.find(ngo => ngo.id === editingTemplate.ngoId)?.name ||
                        targetNgo?.name ||
                        '',
                    })}
                  </p>
                )}
              </div>
              <div className="template-header-actions">
                {editingTemplate && (
                  <button
                    className="icon-btn"
                    title={t('templates.actions.copyName')}
                    onClick={() => void copyName(editingTemplate.name)}
                    type="button"
                  >
                    <Copy size={16} />
                  </button>
                )}
                {editingTemplate && canWrite && (
                  <button
                    className="icon-btn danger"
                    title={t('common.delete')}
                    onClick={() => setDeleteTarget({ ...editingTemplate })}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="template-form">
              {!editingTemplate && (
                <div className="form-group">
                  <label htmlFor="tpl-ngo">{t('templates.targetNgo', 'NGO')}</label>
                  <select
                    id="tpl-ngo"
                    value={targetNgoId}
                    onChange={event => setTargetNgoId(event.target.value)}
                    disabled={!canWrite}
                  >
                    {ngos.map(ngo => (
                      <option key={ngo.id} value={ngo.id}>
                        {ngo.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="tpl-1">{t('common.name')}</label>
                <input
                  id="tpl-1"
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  placeholder={t('templates.namePlaceholder')}
                  disabled={!canWrite}
                />
                {limitHint(limits.name)}
              </div>

              <div className="form-group">
                <span className="group-label" id="tpl-type-label">{t('templates.messageType', 'Message type')}</span>
                <div className="toggle-group toggle-group-wrap" role="group" aria-labelledby="tpl-type-label">
                  {TEMPLATE_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={form.messageType === type}
                      className={form.messageType === type ? 'active' : ''}
                      onClick={() => setForm({ ...form, messageType: type })}
                      disabled={!canWrite}
                    >
                      {t(`messageTester.types.${type}`, type)}
                    </button>
                  ))}
                </div>
              </div>

              {isMediaTemplate && (
                <>
                  <div className="form-group">
                    <label>{t('templates.mediaFile', 'Media file')}</label>
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept={
                        form.messageType === 'image'
                          ? 'image/*'
                          : form.messageType === 'video'
                            ? 'video/*'
                            : form.messageType === 'audio'
                              ? 'audio/*'
                              : undefined
                      }
                      style={{ display: 'none' }}
                      onChange={event => void uploadTemplateMedia(event.target.files?.[0] ?? null)}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="browse-btn"
                        onClick={() => mediaInputRef.current?.click()}
                        disabled={!canWrite || mediaUploading}
                      >
                        {mediaUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {form.mediaUrl ? t('templates.replaceFile', 'Replace file') : t('templates.uploadFile', 'Upload file')}
                      </button>
                      {form.mediaUrl && (
                        <>
                          <span className="hint" style={{ margin: 0 }}>{form.mediaFilename || 'Uploaded file'}</span>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => setForm(current => ({ ...current, mediaUrl: '', mediaFilename: '' }))}
                            title={t('common.remove', 'Remove')}
                            aria-label={t('common.remove', 'Remove')}
                            disabled={!canWrite || mediaUploading}
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                    {!form.mediaUrl && (
                      <span className="hint">
                        {t('templates.mediaUploadHint', 'Upload the file to attach to this template.')}
                      </span>
                    )}
                    {mediaUrlMissing && (
                      <span className="field-error" role="status">
                        {t('templates.mediaUrlRequired', 'Please upload a media file for this message type.')}
                      </span>
                    )}
                    {mediaUploadError && (
                      <span className="field-error" role="status">{mediaUploadError}</span>
                    )}
                  </div>
                  {form.messageType === 'document' && (
                    <div className="form-group">
                      <label htmlFor="tpl-media-name">{t('templates.mediaFilename', 'File name (optional)')}</label>
                      <input
                        id="tpl-media-name"
                        value={form.mediaFilename}
                        onChange={event => setForm({ ...form, mediaFilename: event.target.value })}
                        placeholder="receipt.pdf"
                        disabled={!canWrite}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="template-message-fields">
                <div className="form-group">
                  <label htmlFor="tpl-2">{t('templates.header')}</label>
                  <input
                    id="tpl-2"
                    value={form.header}
                    onChange={event => setForm({ ...form, header: event.target.value })}
                    placeholder={t('templates.headerPlaceholder')}
                    disabled={!canWrite}
                  />
                  {limitHint(limits.header)}
                </div>

                <div className="form-group body-field">
                  <label htmlFor="tpl-3">{t('templates.body')}</label>
                  <textarea
                    id="tpl-3"
                    value={form.body}
                    onChange={event => setForm({ ...form, body: event.target.value })}
                    placeholder={t('templates.bodyPlaceholder')}
                    rows={10}
                    disabled={!canWrite}
                  />
                  {limitHint(limits.body)}
                </div>

                <div className="form-group">
                  <label htmlFor="tpl-4">{t('templates.footer')}</label>
                  <input
                    id="tpl-4"
                    value={form.footer}
                    onChange={event => setForm({ ...form, footer: event.target.value })}
                    placeholder={t('templates.footerPlaceholder')}
                    disabled={!canWrite}
                  />
                  {limitHint(limits.footer)}
                  <span className="hint">
                    {t('templates.footerLinkHint', 'Paste a link (https://…) in the footer — WhatsApp makes it clickable.')}
                  </span>
                </div>
              </div>

              <div className="template-editor-actions">
                <button className="btn-secondary" onClick={resetForm} disabled={isSaving} type="button">
                  {t('common.cancel')}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={
                    !canWrite || isSaving || !targetNgoId || !form.name.trim() || !form.body.trim() || overLimit ||
                    mediaUrlMissing || mediaUrlInvalid
                  }
                  type="button"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                  {canWrite
                    ? t(editingTemplate ? 'templates.saveChanges' : 'templates.createTemplate')
                    : t('templates.viewOnly')}
                </button>
              </div>
            </div>
          </section>

          <aside className="template-preview">
            <div className="template-preview-header">
              <h2>{t('templates.previewTitle')}</h2>
              <span>{placeholders.length}</span>
            </div>
            <div className="template-preview-message">
              <pre>{preview || t('templates.previewEmpty')}</pre>
              {footerLinks.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {footerLinks.map((url, index) => (
                    <a
                      key={`${url}-${index}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-block',
                        padding: '6px 12px',
                        borderRadius: 8,
                        background: '#25D366',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        textDecoration: 'none',
                      }}
                    >
                      {url}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="template-variable-panel">
              {placeholders.length > 0 ? (
                <div className="placeholder-list">
                  {placeholders.map(({ key, token }) => (
                    <label key={key}>
                      <span>{token}</span>
                      <input
                        value={ownValue(previewValues, key) || ''}
                        onChange={event => setPreviewValues({ ...previewValues, [key]: event.target.value })}
                        placeholder={t('templates.previewValuePlaceholder')}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="template-muted">{t('templates.noPlaceholders')}</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title={t('templates.deleteTitle')}
          className="modal-sm"
          closeLabel={t('common.close')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>{t('templates.deleteConfirm', { name: deleteTarget.name })}</p>
        </Modal>
      )}
    </div>
  );
}
