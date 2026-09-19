import { useState } from 'react';

export default function ConfirmDialog({ confirm, onClose }) {
  const [input, setInput] = useState('');
  if (!confirm) return null;
  const enabled = input.trim() === confirm.phrase;
  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(false); }}>
      <div className="w-[560px] max-w-[92vw] bg-surface-card border border-border-subtle rounded-lg p-lg">
        <h3 className="font-headline-md text-headline-md font-bold text-on-surface mb-2">{confirm.title}</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant mb-3">{confirm.desc}</p>
        {confirm.sql && (
          <div className="bg-background-deep border border-border-subtle rounded px-3 py-2.5 font-code-snippet text-code-snippet text-error max-h-[180px] overflow-auto whitespace-pre-wrap mb-3">{confirm.sql}</div>
        )}
        <input
          type="text"
          value={input}
          placeholder={confirm.inputPlaceholder || `Type "${confirm.phrase}" to confirm`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && enabled) onClose(true); }}
          autoFocus
          className="w-full bg-surface-container border border-border-subtle text-on-surface font-body-sm text-body-sm rounded px-3 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 mb-3.5"
        />
        <div className="flex justify-end gap-2.5">
          <button
            onClick={() => onClose(false)}
            className="px-3.5 py-2 rounded border border-border-subtle bg-surface-container text-on-surface font-body-sm text-body-sm hover:border-primary hover:text-primary transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            onClick={() => onClose(true)}
            disabled={!enabled}
            className="px-3.5 py-2 rounded border border-error bg-error text-on-error font-body-sm text-body-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
