import { useState } from 'react';
import Icon from './Icon.jsx';
import { ENV_PRESETS } from '../lib/api.js';

const ENV_ORDER = ['production', 'development', 'custom'];

export default function Header({ status, onToggleRunner, envConfig, onChangeEnv }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(envConfig.custom || '');
  const active = envConfig.env && ENV_PRESETS[envConfig.env] ? envConfig.env : null;
  const activeLabel = active ? ENV_PRESETS[active].label : 'No target';
  const isProd = active === 'production';

  const pick = (e) => {
    if (e === 'custom') {
      const v = custom.trim();
      onChangeEnv('custom', v ? v : undefined);
    } else {
      onChangeEnv(e);
    }
    setOpen(false);
  };

  return (
    <header className="h-16 w-full sticky top-0 z-10 bg-surface dark:bg-background border-b border-border-subtle flex justify-between items-center px-lg flex-shrink-0">
      <div className="flex items-center gap-lg">
        <span className="font-headline-md text-headline-md font-bold text-on-surface">Data Browser</span>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full border border-border-subtle">
          <div className={`w-2 h-2 rounded-full animate-pulse ${status.ok ? 'bg-primary' : 'bg-error'}`}></div>
          <span className="font-body-sm text-body-sm text-on-surface-variant">{status.msg}</span>
        </div>
      </div>
      <nav className="hidden md:flex gap-lg h-full items-end font-body-md text-body-md">
        <a className="text-primary font-semibold border-b-2 border-primary pb-4 cursor-pointer" href="#">Explorer</a>
        <a className="text-on-surface-variant pb-4 hover:text-primary transition-colors cursor-pointer" href="#">History</a>
        <a className="text-on-surface-variant pb-4 hover:text-primary transition-colors cursor-pointer" href="#">Logs</a>
      </nav>
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center gap-2 py-1.5 px-3 rounded border text-body-sm font-body-sm font-semibold cursor-pointer transition-colors ${
              isProd
                ? 'bg-error/10 text-error border-error/50'
                : active
                  ? 'bg-primary-container text-on-primary-fixed-variant border-transparent hover:bg-primary-fixed'
                  : 'bg-surface-container text-on-surface-variant border-border-subtle'
            }`}
          >
            <span className="font-label-sm uppercase tracking-wide opacity-80">Target</span>
            <span>{activeLabel}</span>
            <Icon name="expand_more" size={16} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border-subtle bg-surface shadow-2xl p-2 z-20">
              <div className="px-2 py-1 font-body-sm text-body-sm text-on-surface-variant">Database environment</div>
              {ENV_ORDER.map((k) => (
                <button
                  key={k}
                  onClick={() => pick(k)}
                  className={`w-full text-left px-2 py-2 rounded text-body-sm text-body-sm hover:bg-surface-container cursor-pointer flex items-center justify-between ${
                    active === k ? 'bg-surface-container text-primary font-semibold' : 'text-on-surface'
                  }`}
                >
                  <span>{ENV_PRESETS[k].label}</span>
                  {active === k && <Icon name="check" size={16} />}
                </button>
              ))}
              <div className="px-2 pt-2 mt-1 border-t border-border-subtle">
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1" htmlFor="custom-api-base">
                  Custom API base
                </label>
                <input
                  id="custom-api-base"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="http://localhost:5000"
                  className="w-full px-2 py-1.5 rounded border border-border-subtle bg-surface-container-lowest text-body-sm text-body-sm text-on-surface font-body-sm"
                />
                <button
                  onClick={() => pick('custom')}
                  className="mt-2 w-full px-2 py-1.5 rounded bg-primary-container text-on-primary-fixed-variant hover:bg-primary-fixed text-body-sm text-body-sm font-semibold cursor-pointer"
                >
                  Use custom
                </button>
              </div>
              {isProd && (
                <div className="px-2 pt-2 mt-1 border-t border-border-subtle text-body-sm text-body-sm text-error">
                  Production target — writes affect live data.
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onToggleRunner}
          className="bg-primary-container text-on-primary-fixed-variant hover:bg-primary-fixed transition-colors py-1.5 px-4 rounded font-body-sm text-body-sm font-semibold hidden md:block cursor-pointer">
          Run Query
        </button>
        <button className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full hover:bg-surface-container-low cursor-pointer">
          <Icon name="notifications" />
        </button>
        <button className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full hover:bg-surface-container-low cursor-pointer">
          <Icon name="account_circle" />
        </button>
      </div>
    </header>
  );
}
