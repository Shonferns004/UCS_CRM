import { useState, useEffect } from 'react'
import { fetchNotifs } from '../store'
import { useUcs } from '../../../store'

export default function Notifications() {
  const { user } = useUcs()
  const [notifs, setNotifs] = useState([])

  useEffect(() => {
    if (!user?.id) return
    fetchNotifs(user.id).then(setNotifs).catch(() => {})
  }, [user?.id])

  return (
    <div className="card">
      <div className="card-head"><h3>Notifications & Reminders</h3></div>
      <div className="card-pad" style={{padding:0}}>
        {notifs.length === 0 && <div style={{textAlign:'center',padding:40,color:'var(--ink-soft)'}}>No notifications</div>}
        <div style={{display:'flex',flexDirection:'column'}}>
          {notifs.map(n => (
            <div key={n.id} style={{
              display:'flex',gap:12,padding:'12px 18px',borderBottom:'1px solid var(--line)',
              background:n.read_at ? 'transparent' : 'var(--sage-soft)',cursor:'pointer'
            }}>
              <div style={{width:8,height:8,borderRadius:'50%',background:n.read_at ? 'var(--line)' : 'var(--sage)',marginTop:6,flexShrink:0}} />
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{n.title}</div>
                <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>{n.body}</div>
                <div style={{fontSize:11,color:'var(--ink-soft)',marginTop:4,opacity:.6}}>{n.created_at?.slice(0,16).replace('T',' ')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
