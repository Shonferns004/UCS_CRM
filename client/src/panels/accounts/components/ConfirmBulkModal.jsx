export default function ConfirmBulkModal({ visible, donorCount, projectName, onConfirm, onCancel }) {
  if (!visible) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => {}}>
      <div className="modal" style={{ maxWidth: 420, width: '90%' }}>
        <div className="modal-header">
          <h3 style={{ display:'flex', alignItems:'center', gap:8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
            Confirm Bulk Send
          </h3>
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <p style={{ fontSize:14, marginBottom:12 }}>
            You are about to send donation receipts to <strong>{donorCount} donors</strong> via WhatsApp using the <strong>{projectName}</strong> template.
          </p>
          <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:12, fontSize:12, color:'#92400e', marginBottom:16 }}>
            This action cannot be undone once started. Sending will be done in batches of 10 at a time.
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0' }}>
              <span style={{ color:'#6b7280' }}>Project:</span>
              <span style={{ fontWeight:600 }}>{projectName}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0' }}>
              <span style={{ color:'#6b7280' }}>Recipients:</span>
              <span style={{ fontWeight:600 }}>{donorCount} donors</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0' }}>
              <span style={{ color:'#6b7280' }}>Batch size:</span>
              <span style={{ fontWeight:600 }}>10 at a time</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary btn-sm" style={{ background:'#059669' }} onClick={onConfirm}>Yes, Send</button>
          </div>
        </div>
      </div>
    </div>
  )
}
