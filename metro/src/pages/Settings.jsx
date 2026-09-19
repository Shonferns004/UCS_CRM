import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import useToast from '../hooks/useToast.js';
import * as importService from '../services/import.service.js';
import * as stockService from '../services/stock.service.js';
import { getErrorMessage, formatNumber } from '../utils/formatters.js';
import StatusBadge from '../components/StatusBadge.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

function Settings() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const [stockConfig, setStockConfig] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockForm, setStockForm] = useState({ initialStock: '', pricePerPad: '', lowStockThreshold: '' });
  const [stockErrors, setStockErrors] = useState({});

  useEffect(() => {
    let cancelled = false;
    setStockLoading(true);
    stockService
      .getConfig()
      .then((cfg) => {
        if (!cancelled) {
          setStockConfig(cfg);
          setStockForm({
            initialStock: cfg.initialStock ?? '',
            pricePerPad: cfg.pricePerPad ?? '',
            lowStockThreshold: cfg.lowStockThreshold ?? '',
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStockLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleStockChange = (key, value) => {
    setStockForm((prev) => ({ ...prev, [key]: value }));
    setStockErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleStockSave = async () => {
    const errors = {};
    const keys = { initialStock: 'initial_stock', pricePerPad: 'price_per_pad', lowStockThreshold: 'low_stock_threshold' };
    for (const [field, dbKey] of Object.entries(keys)) {
      const num = Number(stockForm[field]);
      if (stockForm[field] === '' || isNaN(num) || num < 0) {
        errors[field] = 'Must be a non-negative number';
      }
    }
    if (Object.keys(errors).length) {
      setStockErrors(errors);
      return;
    }
    setStockSaving(true);
    try {
      const updated = await stockService.updateConfig(keys);
      setStockConfig(updated);
      setStockForm({
        initialStock: updated.initialStock ?? '',
        pricePerPad: updated.pricePerPad ?? '',
        lowStockThreshold: updated.lowStockThreshold ?? '',
      });
      addToast('Stock settings updated successfully', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setStockSaving(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setValidationResult(null);
    }
  };

  const handleValidate = async () => {
    if (!selectedFile) return;
    setValidating(true);
    try {
      const result = await importService.validate(selectedFile);
      setValidationResult(result);
      if (result.valid && result.valid.length > 0) {
        addToast(`Validation passed: ${result.valid.length} valid rows`, 'success');
      }
      if (result.invalid && result.invalid.length > 0) {
        addToast(`${result.invalid.length} rows have errors`, 'warning');
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!validationResult?.valid) return;
    setImporting(true);
    try {
      const result = await importService.confirm(validationResult.valid);
      addToast(
        `Import complete: ${result.imported} imported, ${result.failed} failed`,
        result.failed > 0 ? 'warning' : 'success'
      );
      setValidationResult(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleResetFile = () => {
    setSelectedFile(null);
    setValidationResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  const validColumns = React.useMemo(() => {
    if (!validationResult?.valid || validationResult.valid.length === 0) return [];
    return Object.keys(validationResult.valid[0]).map((k) => ({
      key: k,
      label: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }, [validationResult]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '800px' }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Application</h2>
          </div>
          <div className="card-body">
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Application Name</span>
                <span className="info-value">MetroPad Care</span>
              </div>
              <div className="info-item">
                <span className="info-label">Version</span>
                <span className="info-value">0.1.0</span>
              </div>
              <div className="info-item">
                <span className="info-label">Database</span>
                <span className="info-value">Supabase / PostgreSQL</span>
              </div>
              <div className="info-item">
                <span className="info-label">Description</span>
                <span className="info-value">
                  Mumbai Metro Station Sanitary Pad Machine Monitoring &amp; Refill Management System
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Stock Master / Inventory Settings</h2>
            {stockLoading && <LoadingSpinner message="Loading..." />}
          </div>
          <div className="card-body">
            {!stockLoading && stockConfig && (
              <>
                <div className="info-grid" style={{ marginBottom: '1.25rem' }}>
                  <div className="info-item">
                    <span className="info-label">Initial Stock</span>
                    <span className="info-value">{formatNumber(stockConfig.initialStock)} pads</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Price Per Pad</span>
                    <span className="info-value">₹{formatNumber(stockConfig.pricePerPad)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Initial Stock Value</span>
                    <span className="info-value">
                      ₹{formatNumber((stockConfig.initialStock || 0) * (stockConfig.pricePerPad || 0))}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Low Stock Threshold</span>
                    <span className="info-value">{formatNumber(stockConfig.lowStockThreshold)} pads</span>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Initial Stock (pads)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      step="1"
                      value={stockForm.initialStock}
                      onChange={(e) => handleStockChange('initialStock', e.target.value)}
                    />
                    {stockErrors.initialStock && <span className="form-error">{stockErrors.initialStock}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Price Per Pad (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      step="0.01"
                      value={stockForm.pricePerPad}
                      onChange={(e) => handleStockChange('pricePerPad', e.target.value)}
                    />
                    {stockErrors.pricePerPad && <span className="form-error">{stockErrors.pricePerPad}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Low Stock Threshold (pads)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      step="1"
                      value={stockForm.lowStockThreshold}
                      onChange={(e) => handleStockChange('lowStockThreshold', e.target.value)}
                    />
                    {stockErrors.lowStockThreshold && <span className="form-error">{stockErrors.lowStockThreshold}</span>}
                  </div>
                </div>

                <div className="actions-bar" style={{ marginTop: '1rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={handleStockSave} disabled={stockSaving}>
                    {stockSaving ? 'Saving...' : 'Save Stock Settings'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">My Account</h2>
          </div>
          <div className="card-body">
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Name</span>
                <span className="info-value">{user?.name || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Email</span>
                <span className="info-value">{user?.email || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Role</span>
                <span className="info-value">
                  {user?.role ? <StatusBadge status={user.role} /> : '—'}
                </span>
              </div>
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <button className="btn btn-danger" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Import Data</h2>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Upload File</label>
              <input
                ref={fileInputRef}
                type="file"
                className="form-input"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.25rem' }}>
                Accepted formats: .xlsx, .xls, .csv
              </p>
            </div>

            <div className="actions-bar">
              <button
                className="btn btn-primary btn-sm"
                onClick={handleValidate}
                disabled={!selectedFile || validating}
              >
                {validating ? 'Validating...' : 'Validate File'}
              </button>
              {selectedFile && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleResetFile}
                  disabled={validating || importing}
                >
                  Clear
                </button>
              )}
            </div>

            {validating && <LoadingSpinner message="Validating file..." />}

            {validationResult && (
              <div style={{ marginTop: '1rem' }}>
                <div className="info-grid" style={{ marginBottom: '1rem' }}>
                  <div className="info-item">
                    <span className="info-label">Total Rows</span>
                    <span className="info-value">
                      {((validationResult.valid?.length || 0) + (validationResult.invalid?.length || 0))}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Valid Rows</span>
                    <span className="info-value" style={{ color: 'var(--success, #22c55e)' }}>
                      {validationResult.valid?.length || 0}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Invalid Rows</span>
                    <span className="info-value" style={{ color: 'var(--danger, #ef4444)' }}>
                      {validationResult.invalid?.length || 0}
                    </span>
                  </div>
                </div>

                {validationResult.valid && validationResult.valid.length > 0 && (
                  <div className="card" style={{ marginBottom: '1rem' }}>
                    <div className="card-header">
                      <h3 className="card-title">Valid Rows Preview</h3>
                    </div>
                    <DataTable
                      columns={validColumns}
                      data={validationResult.valid.slice(0, 10)}
                      emptyMessage="No valid rows"
                    />
                  </div>
                )}

                {validationResult.invalid && validationResult.invalid.length > 0 && (
                  <div className="card" style={{ marginBottom: '1rem' }}>
                    <div className="card-header">
                      <h3 className="card-title">Invalid Rows</h3>
                    </div>
                    <div className="card-body">
                      {validationResult.invalid.map((row, idx) => (
                        <div key={idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                          <span style={{ fontWeight: 500 }}>Row {idx + 1}:</span>{' '}
                          <span style={{ color: 'var(--danger, #ef4444)' }}>
                            {row.errors ? row.errors.join(', ') : row.error || JSON.stringify(row)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {validationResult.valid && validationResult.valid.length > 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmImport}
                    disabled={importing}
                  >
                    {importing ? 'Importing...' : `Confirm Import (${validationResult.valid.length})`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
