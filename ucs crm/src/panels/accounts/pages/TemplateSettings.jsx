import { useState, useEffect } from 'react'
import { apiGet } from '../api/auth'

const NGO_LIST = [
  { key: 'bsct', label: 'Being Sevak' },
  { key: 'maan', label: 'Mann Care' },
  { key: 'aflf', label: 'Ashray' },
]

const RECEIPT_DESIGNS = [
  { value: 'beingsevak', label: 'Being Sevak' },
  { value: 'manncar', label: 'Mann Care' },
  { value: 'ashray', label: 'Ashray' },
]

const DEFAULTS = {
  bsct: { receiptDesign: 'beingsevak', metaTemplate: 'bsct_receipt', metaLang: 'en_US' },
  maan: { receiptDesign: 'manncar', metaTemplate: 'mann_receipt', metaLang: 'en' },
  aflf: { receiptDesign: 'ashray', metaTemplate: 'aflf_receipt', metaLang: 'en' },
}

export default function TemplateSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('receipt_template_settings')
      return saved ? JSON.parse(saved) : { ...DEFAULTS }
    } catch { return { ...DEFAULTS } }
  })
  const [metaTemplates, setMetaTemplates] = useState([])
  const [savedToast, setSavedToast] = useState(false)

  useEffect(() => {
    apiGet('/whatsapp/templates').then(list => setMetaTemplates(list || [])).catch((err) => { console.error('API error:', err.message); })
  }, [])

  const update = (ngoKey, field, value) => {
    setSettings(prev => ({ ...prev, [ngoKey]: { ...prev[ngoKey], [field]: value } }))
  }

  const save = () => {
    localStorage.setItem('receipt_template_settings', JSON.stringify(settings))
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2000)
  }

  const reset = () => {
    setSettings({ ...DEFAULTS })
    localStorage.setItem('receipt_template_settings', JSON.stringify(DEFAULTS))
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2000)
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Template Settings</h3>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-sm" onClick={reset}>Reset to Defaults</button>
            <button className="btn btn-primary btn-sm" onClick={save}>Save Settings</button>
          </div>
        </div>
        <div className="card-pad">
          {savedToast && <p style={{ color:'#059669', fontSize:13, marginBottom:12 }}>Settings saved!</p>}
          {NGO_LIST.map(ngo => {
            const s = settings[ngo.key] || DEFAULTS[ngo.key]
            return (
              <div key={ngo.key} style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:16, marginBottom:12 }}>
                <h4 style={{ margin:'0 0 12px', fontSize:14, fontWeight:600 }}>{ngo.label}</h4>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                  <div>
                    <label style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', display:'block', marginBottom:4 }}>Receipt Design</label>
                    <select className="field-input" value={s.receiptDesign} onChange={e => update(ngo.key, 'receiptDesign', e.target.value)} style={{ width:180 }}>
                      {RECEIPT_DESIGNS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', display:'block', marginBottom:4 }}>Meta Template</label>
                    <select className="field-input" value={s.metaTemplate} onChange={e => update(ngo.key, 'metaTemplate', e.target.value)} style={{ width:200 }}>
                      {metaTemplates.length === 0 ? <option value={s.metaTemplate}>{s.metaTemplate}</option> : metaTemplates.map(t => <option key={t.name} value={t.name}>{t.name} ({t.language})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', display:'block', marginBottom:4 }}>Language Code</label>
                    <input className="field-input" value={s.metaLang} onChange={e => update(ngo.key, 'metaLang', e.target.value)} style={{ width:100 }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
