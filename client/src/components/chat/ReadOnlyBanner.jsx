import { LockIcon } from './chatIcons'

/**
 * Screen 03 — read-only banner.
 *
 * Rendered whenever the composer is hidden. There are now two distinct
 * audiences, and they need different wording:
 *
 *   1. a genuinely read-only role (HR, Recruiter, Developer, Event Head) in
 *      any room — they cannot post anywhere;
 *   2. a writer, such as FRO, sitting in an admins-only group — they can post
 *      everywhere else, so telling them "only Super Admin and Accounts can
 *      post" would be both wrong and confusing.
 *
 * Callers pass `reason` for case 2; the default covers case 1.
 */
export default function ReadOnlyBanner({ reason }) {
  return (
    <div className="chat-readonly" role="status">
      <span className="chat-readonly-icon">
        <LockIcon size={16} />
      </span>
      <span>{reason || (
        <>
          <strong>Read-only.</strong> Only Super Admin, Accounts, Admin and FRO can
          post messages.
        </>
      )}</span>
    </div>
  )
}
