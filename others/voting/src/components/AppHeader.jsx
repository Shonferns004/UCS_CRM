import { LogOut } from '../icons'

/**
 * The navy bar every screen shares. Signed-out it shows only the brand; signed
 * in it also carries the voter's name and department on the right, plus the
 * Sign out control.
 */
export default function AppHeader({ user, onSignOut, right }) {
  return (
    <header className="shell-bar">
      <div className="shell-bar-brand">
        <span className="shell-mark" aria-hidden="true">
          U
        </span>
        <span className="shell-bar-titles">
          <span className="shell-bar-title">Award Ceremony Voting</span>
          <span className="shell-bar-sub">Every vote is anonymous</span>
        </span>
      </div>

      {user ? (
        <div className="shell-bar-right">
          <span className="shell-who">
            <span className="shell-who-name">{user.name || user.login_id}</span>
            <span className="shell-who-dept">{user.department || '—'}</span>
          </span>
          {onSignOut ? (
            // The label is hidden by CSS on narrow screens, so the button needs
            // its own accessible name to stay announced.
            <button className="shell-signout" onClick={onSignOut} aria-label="Sign out">
              <LogOut size={15} aria-hidden="true" focusable="false" />
              <span>Sign out</span>
            </button>
          ) : null}
        </div>
      ) : (
        right
      )}
    </header>
  )
}
