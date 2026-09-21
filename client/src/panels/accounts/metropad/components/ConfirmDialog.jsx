import React from 'react';
import Modal from './Modal';

function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
}) {
  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>
        Cancel
      </button>
      <button
        className={`btn btn-${confirmVariant}`}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={footer}
    >
      <div className="confirm-dialog">
        <div className={`confirm-icon ${confirmVariant === 'danger' ? 'danger' : 'warning'}`}>
          {confirmVariant === 'danger' ? '🗑️' : '⚠️'}
        </div>
        <p className="confirm-message">{message}</p>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
