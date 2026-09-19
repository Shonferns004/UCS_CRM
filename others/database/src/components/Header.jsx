import Icon from './Icon.jsx';

export default function Header({ status, onToggleRunner }) {
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
