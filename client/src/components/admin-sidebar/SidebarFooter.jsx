import { CircleHelp, LogOut, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUcs } from '../../store'

const initialsOf = (name) => String(name || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0])
  .join('')
  .toUpperCase()

/**
 * Bottom of the CRM sidebar. Panels that pass `onSettings` get a user avatar
 * and a Settings action in place of Help; the rest keep Help as before.
 */
export default function SidebarFooter({ helpTo, onNavigate, onSettings, user }) {
  const { logout, user: sessionUser } = useUcs()
  const navigate = useNavigate()
  const account = user || sessionUser

  const goHelp = () => {
    onNavigate?.()
    if (helpTo) navigate(helpTo)
  }
  const goSettings = () => {
    onNavigate?.()
    onSettings?.()
  }

  return (
    <div className="sb-footer">
      {onSettings ? (
        <button type="button" className="snav-item sb-foot-link" onClick={goSettings} aria-label="Settings">
          <span className="ico"><Settings size={18} /></span>
          <span className="sb-item-body"><span className="sb-item-label">Settings</span></span>
        </button>
      ) : helpTo ? (
        <button type="button" className="snav-item sb-foot-link" onClick={goHelp} aria-label="Help">
          <span className="ico"><CircleHelp size={18} /></span>
          <span className="sb-item-body"><span className="sb-item-label">Help</span></span>
        </button>
      ) : null}
      <button type="button" className="snav-item sb-foot-link" onClick={logout} aria-label="Log out">
        <span className="ico"><LogOut size={18} /></span>
        <span className="sb-item-body"><span className="sb-item-label">Log out</span></span>
      </button>
      {account && (
        <div className="sb-user">
          <span className="sb-avatar" aria-hidden="true">{initialsOf(account.name) || '?'}</span>
          <span className="sb-item-body">
            <span className="sb-item-label">{String(account.name || 'Signed in').trim().split(/\s+/)[0]}</span>
          </span>
        </div>
      )}
    </div>
  )
}
