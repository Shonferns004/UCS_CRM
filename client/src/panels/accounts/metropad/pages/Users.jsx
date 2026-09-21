import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useApi from '../hooks/useApi.js';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import usePagination from '../hooks/usePagination.js';
import useDebounce from '../hooks/useDebounce.js';
import * as userService from '../services/user.service.js';
import { getErrorMessage, formatDate } from '../utils/formatters.js';
import { ROLES } from '../utils/constants.js';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ErrorState from '../components/ErrorState.jsx';

const emptyForm = { name: '', email: '', role: 'VIEWER', password: '' };

function Users({ compact = false }) {
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();
  const { page, setPage, limit, setLimit, reset } = usePagination();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [pwdTarget, setPwdTarget] = useState(null);
  const [pwdForm, setPwdForm] = useState({ password: '' });
  const [pwdErrors, setPwdErrors] = useState({});
  const [pwdSaving, setPwdSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (compact) return;
    reset();
  }, [debouncedSearch, reset, compact]);

  const params = useMemo(() => {
    const p = { page, limit };
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [debouncedSearch, page, limit]);

  const { data: usersData, loading, error, refetch } = useApi(
    () => (compact ? Promise.resolve(null) : userService.getAll(params)),
    [JSON.stringify(params), compact]
  );

  const meta = usersData?.meta || {};
  const totalPages = meta.totalPages ?? meta.total_pages ?? 1;
  const totalItems = meta.totalItems ?? meta.total ?? 0;

  const rows = (usersData?.users || []).filter((u) => u.email !== 'admin@metro.com');
  const shownTotal = Math.max(0, totalItems - ((usersData?.users || []).length - rows.length));

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'search') setSearch(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearch('');
  }, []);

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: (val) => <StatusBadge status={val} size="sm" /> },
    { key: 'is_active', label: 'Status', render: (val) => <StatusBadge status={val ? 'ACTIVE' : 'INACTIVE'} size="sm" /> },
    { key: 'created_at', label: 'Created', render: (val) => formatDate(val) || '—' },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
          >
            Edit
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={(e) => { e.stopPropagation(); openPasswordModal(row); }}
          >
            Reset Password
          </button>
          {row.id !== currentUser?.id && (
            <button
              className="btn btn-outline btn-sm danger"
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  const openAddModal = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditTarget(row);
    setForm({
      name: row.name || '',
      email: row.email || '',
      role: row.role || 'VIEWER',
      password: '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const openPasswordModal = (row) => {
    setPwdTarget(row);
    setPwdForm({ password: '' });
    setPwdErrors({});
  };

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email';
    if (!form.role) errors.role = 'Please select a role';

    if (!editTarget && !form.password) {
      errors.password = 'Password is required';
    } else if (form.password && form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      };
      if (!editTarget) {
        payload.password = form.password;
        await userService.create(payload);
        addToast('User created successfully', 'success');
      } else {
        await userService.update(editTarget.id, payload);
        addToast('User updated successfully', 'success');
      }
      setModalOpen(false);
      refetch();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const validatePassword = () => {
    const errors = {};
    if (!pwdForm.password) errors.password = 'New password is required';
    else if (pwdForm.password.length < 8) errors.password = 'Password must be at least 8 characters';
    setPwdErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleResetPassword = async () => {
    if (!pwdTarget || !validatePassword()) return;
    setPwdSaving(true);
    try {
      await userService.resetPassword(pwdTarget.id, { password: pwdForm.password });
      addToast('Password reset successfully', 'success');
      setPwdTarget(null);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await userService.remove(deleteTarget.id);
      addToast('User deleted successfully', 'success');
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const filters = [
    { key: 'search', type: 'search', value: search, label: 'Search users by name or email...' },
  ];

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Users</h1>
        </div>
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page">
      {compact ? (
        <div className="users-compact-toolbar">
          <button className="btn btn-primary" onClick={openAddModal}>
            Add User
          </button>
        </div>
      ) : (
        <div className="page-header">
          <h1 className="page-title">Users</h1>
          <button className="btn btn-primary" onClick={openAddModal}>
            Add User
          </button>
        </div>
      )}

      {!compact && (
        <div style={{ marginBottom: '16px' }}>
          <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." style={{ maxWidth: '320px' }} />
        </div>
      )}

      {!compact && (
        <>
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            emptyMessage="No users found"
            pagination={{
              currentPage: page,
              totalPages,
              totalItems: shownTotal,
              limit,
              onLimitChange: setLimit,
            }}
            onPageChange={setPage}
          />
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit User' : 'Add User'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              type="text"
              className="form-input"
              value={form.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              placeholder="Enter full name"
            />
            {formErrors.name && <span className="form-error">{formErrors.name}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={form.email}
              onChange={(e) => handleFormChange('email', e.target.value)}
              placeholder="user@example.com"
            />
            {formErrors.email && <span className="form-error">{formErrors.email}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select
              className="form-select"
              value={form.role}
              onChange={(e) => handleFormChange('role', e.target.value)}
            >
              <option value="">Select a role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {formErrors.role && <span className="form-error">{formErrors.role}</span>}
          </div>
          {!editTarget && (
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={form.password}
                onChange={(e) => handleFormChange('password', e.target.value)}
                placeholder="Minimum 8 characters"
              />
              {formErrors.password && <span className="form-error">{formErrors.password}</span>}
            </div>
          )}
        </form>
      </Modal>

      {!compact && (
        <>
          <Modal
            isOpen={!!pwdTarget}
            onClose={() => setPwdTarget(null)}
            title={`Reset Password — ${pwdTarget?.name || ''}`}
            size="sm"
            footer={
              <>
                <button className="btn btn-secondary" onClick={() => setPwdTarget(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleResetPassword}
                  disabled={pwdSaving || !pwdForm.password}
                >
                  {pwdSaving ? 'Saving...' : 'Reset Password'}
                </button>
              </>
            }
          >
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                value={pwdForm.password}
                onChange={(e) => setPwdForm({ password: e.target.value })}
                placeholder="Minimum 8 characters"
              />
              {pwdErrors.password && <span className="form-error">{pwdErrors.password}</span>}
            </div>
          </Modal>

          <ConfirmDialog
            isOpen={!!deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            title="Delete User"
            message={`Are you sure you want to delete user "${deleteTarget?.name}"? This action cannot be undone.`}
            confirmLabel={deleting ? 'Deleting...' : 'Delete'}
            confirmVariant="danger"
          />
        </>
      )}
    </div>
  );
}

export default Users;