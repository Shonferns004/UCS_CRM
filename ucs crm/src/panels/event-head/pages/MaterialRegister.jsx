import { useState, useEffect } from 'react'
import { MATERIAL_TYPES, fetchMaterials, createMaterial, updateMaterial } from '../store'

export default function MaterialRegister() {
  const [materials, setMaterials] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editMat, setEditMat] = useState(null)
  const [form, setForm] = useState({ name:'', opening_stock:0, received:0, issued:0, cost:0, warehouse:'', donor:'' })

  useEffect(() => { fetchMaterials().then(setMaterials).catch(() => {}) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const data = { ...form, balance: +form.opening_stock + +form.received - +form.issued }
    if (editMat) {
      await updateMaterial(editMat.id, data).then(() => { setMaterials(materials.map(m => m.id === editMat.id ? {...m,...data} : m)); setShowForm(false); setEditMat(null) }).catch(() => {})
    } else {
      await createMaterial(data).then((res) => { setMaterials([...materials, res]); setShowForm(false) }).catch(() => {})
    }
  }

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h3 style={{fontSize:16}}>Distribution Material Register</h3>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditMat(null); setForm({name:'',opening_stock:0,received:0,issued:0,cost:0,warehouse:'',donor:''}); setShowForm(true) }}>+ Add Material</button>
      </div>
      {showForm && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-head"><h3>{editMat ? 'Edit' : 'Add'} Material</h3></div>
          <div className="card-pad">
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="field"><label>Material</label>
                  <select value={form.name} onChange={e => setForm({...form,name:e.target.value})} required>
                    <option value="">Select</option>{MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field"><label>Opening Stock</label><input type="number" value={form.opening_stock} onChange={e => setForm({...form,opening_stock:+e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="field"><label>Received</label><input type="number" value={form.received} onChange={e => setForm({...form,received:+e.target.value})} /></div>
                <div className="field"><label>Issued</label><input type="number" value={form.issued} onChange={e => setForm({...form,issued:+e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="field"><label>Cost</label><input type="number" value={form.cost} onChange={e => setForm({...form,cost:+e.target.value})} /></div>
                <div className="field"><label>Warehouse</label><input value={form.warehouse} onChange={e => setForm({...form,warehouse:e.target.value})} /></div>
              </div>
              <div className="field"><label>Donor</label><input value={form.donor} onChange={e => setForm({...form,donor:e.target.value})} /></div>
              <div style={{marginTop:12,display:'flex',gap:8}}>
                <button type="submit" className="btn btn-primary btn-sm">Save</button>
                <button type="button" className="btn btn-sm" onClick={() => { setShowForm(false); setEditMat(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-pad" style={{padding:0}}>
          <table>
            <thead><tr><th>Material</th><th>Opening</th><th>Received</th><th>Issued</th><th>Balance</th><th>Cost</th><th>Warehouse</th><th>Donor</th></tr></thead>
            <tbody>
              {materials.length === 0 && <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--ink-soft)'}}>No materials registered</td></tr>}
              {materials.map(m => (
                <tr key={m.id} style={{cursor:'pointer'}} onClick={() => { setForm(m); setEditMat(m); setShowForm(true) }}>
                  <td style={{fontWeight:500}}>{m.name}</td>
                  <td>{m.opening_stock}</td><td>{m.received}</td><td>{m.issued}</td>
                  <td style={{fontWeight:600,color:(m.balance ?? m.opening_stock - m.issued) < 10 ? '#B5603A' : 'inherit'}}>{m.balance ?? m.opening_stock - m.issued}</td>
                  <td>₹{m.cost?.toLocaleString()}</td><td>{m.warehouse}</td><td>{m.donor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
