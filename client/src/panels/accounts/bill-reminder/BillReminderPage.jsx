import { useUcs } from '../../../store'
import { AuthProvider } from './store'
import ReminderPanel from './ReminderPanel'
import './reminder.css'

export default function BillReminderPage() {
  const { user } = useUcs()
  return (
    <AuthProvider initialUser={user}>
      <ReminderPanel />
    </AuthProvider>
  )
}