import { useState, useEffect } from 'react'
import { ASSET_TYPES, fetchAssets, createAsset, updateAsset, deleteAsset } from '../store'

export default function AssetRegister() {
  const [assets, setAssets] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editAsset, setEditAsset] = useState(null)
  const [form, setForm] = useState({ name:'', quantity:1, purchase_cost:0, condition:'Good', location:'' })

  useEffect(() => { fetchAssets().then(setAssets).catch(() => {}) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (editAsset) {
      await updateAsset(editAsset.id, form).then(() => { setAssets(assets.map(a => a.id === editAsset.id ? {...a,...form} : a)); setShowForm(false); setEditAsset(null) }).catch(() => {})
    } else {
      await createAsset(form).then((res) => { setAssets([...assets, res]); setShowForm(false) }).catch(() => {})
    }
  }

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h3 style={{fontSize:16}}>Asset Register</h3>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditAsset(null); setForm({name:'',quantity:1,purchase_cost:0,condition:'Good',location:''}); setShowForm(true) }}>+ Add Asset</button>
      </div>
      {showForm && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-head"><h3>{editAsset ? 'Edit' : 'Add'} Asset</h3></div>
          <div className="card-pad">
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="field"><label>Asset Name</label>
                  <select value={form.name} onChange={e => setForm({...form,name:e.target.value})} required>
                    <option value="">Select</option>{ASSET_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="field"><label>Quantity</label><input type="number" value={form.quantity} onChange={e => setForm({...form,quantity:+e.target.value})} min={1} /></div>
              </div>
              <div className="form-row">
                <div className="field"><label>Purchase Cost</label><input type="number" value={form.purchase_cost} onChange={e => setForm({...form,purchase_cost:+e.target.value})} /></div>
                <div className="field"><label>Condition</label>
                  <select value={form.condition} onChange={e => setForm({...form,condition:e.target.value})}>
                    <option value="Good">Good</option><option value="Fair">Fair</option><option value="Damaged">Damaged</option><option value="Under Repair">Under Repair</option>
                  </select>
                </div>
              </div>
              <div className="field"><label>Location</label><input value={form.location} onChange={e => setForm({...form,location:e.target.value})} /></div>
              <div style={{marginTop:12,display:'flex',gap:8}}>
                <button type="submit" className="btn btn-primary btn-sm">Save</button>
                <button type="button" className="btn btn-sm" onClick={() => { setShowForm(false); setEditAsset(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-pad" style={{padding:0}}>
          <table>
            <thead><tr><th>Asset</th><th>Qty</th><th>Available</th><th>Issued</th><th>Damaged</th><th>Condition</th><th>Cost</th><th>Location</th></tr></thead>
            <tbody>
              {assets.length === 0 && <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--ink-soft)'}}>No assets registered</td></tr>}
              {assets.map(a => (
                <tr key={a.id} style={{cursor:'pointer'}} onClick={() => { setForm(a); setEditAsset(a); setShowForm(true) }}>
                  <td style={{fontWeight:500}}>{a.name}</td>
                  <td>{a.quantity}</td>
                  <td>{a.available_qty ?? a.quantity}</td>
                  <td>{a.issued_qty ?? 0}</td>
                  <td>{a.damaged_qty ?? 0}</td>
                  <td><span className={`pill pill-${a.condition === 'Good' ? 'green' : a.condition === 'Damaged' ? 'red' : 'yellow'}`}>{a.condition}</span></td>
                  <td>₹{a.purchase_cost?.toLocaleString()}</td>
                  <td>{a.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
