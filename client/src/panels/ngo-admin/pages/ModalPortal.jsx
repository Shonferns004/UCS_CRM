import { createPortal } from 'react-dom';

// Render dialogs at document.body so a transformed/overflowing panel ancestor
// can never become their containing block. The panel class is kept on the
// portal wrapper so the scoped .panel-ngo-admin modal tokens still apply.
export default function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="panel-ngo-admin modal-portal-root">{children}</div>,
    document.body,
  );
}
