import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const TABLE_EVENTS = {
  attendance: 'attendance',
  leaves: 'leaves',
  loans: 'loans',
  notifications: 'notifications',
  attendance_corrections: 'corrections',
}

let channel = null
let activeWorkerId = null

export function subscribeWorker(workerId, onEvent) {
  if (channel && activeWorkerId === workerId) {
    return () => {
      supabase.removeChannel(channel)
      channel = null
      activeWorkerId = null
    }
  }

  if (channel) {
    supabase.removeChannel(channel)
  }

  activeWorkerId = workerId
  channel = supabase.channel(`live_${workerId}`)

  for (const [table, event] of Object.entries(TABLE_EVENTS)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `worker_id=eq.${workerId}` },
      (payload) => {
        if (!payload.new || payload.new.worker_id === workerId) {
          onEvent(event)
        }
      }
    )
  }

  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('Supabase realtime channel status:', status, err)
    }
  })

  return () => {
    if (channel) {
      supabase.removeChannel(channel)
    }
    channel = null
    activeWorkerId = null
  }
}
