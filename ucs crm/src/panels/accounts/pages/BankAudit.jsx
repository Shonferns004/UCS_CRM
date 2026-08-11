import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';
import { useRealtime } from '../../../hooks/useRealtime';
import Toast from '../components/Toast';
import DonorPicker from '../components/DonorPicker';
import { ModernDateInput } from '../components/ModernDateInput';
import { ModernMonthDateInput } from '../components/ModernMonthDateInput';
import { ModernTimeInput } from '../components/ModernTimeInput';
import RightPanel from '../components/RightPanel';
import Pagination from '../components/Pagination';
import { downloadSinglePDF } from '../services/pdfGenerator';
import ReceiptTemplateManncar from '../components/ReceiptTemplateManncar';
import ReceiptTemplateAshray from '../components/ReceiptTemplateAshray';
import ReceiptTemplateBeingSevak from '../components/ReceiptTemplateBeingSevak';

const curr = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const C = ['#5B6B4E','#B5603A','#C08A2E','#4F6472','#7A5C7E','#88693D','#2E7D6F','#9B59B6'];
const NGO_LABELS = { bsct:'Being Sevak', maan:'Mann Care', aflf:'Ashray' };
const EMPTY_FM={src_id:'',amount:'',payment_id:'',check_id:'',transaction_date:'',remarks:'',payer_name:'',donor_name:'',payment_time:'',project_id:'bsct',donor_mobile:'',donor_email:'',donor_pan:'',donor_address_1:'',donor_address_2:'',donor_city:'',donor_pin_code:'',agent_name:'',log_id:'',donor_id:'',_lead_amount:null};

const NGO_MAP = {
  bsct: { label: 'Being Sevak', comp: ReceiptTemplateBeingSevak },
  maan: { label: 'Mann Care', comp: ReceiptTemplateManncar },
  aflf: { label: 'Ashray', comp: ReceiptTemplateAshray },
};
function getNgoSettings(project) {
  const saved = localStorage.getItem('receipt_template_settings');
  const defaults = NGO_MAP[project] || NGO_MAP.bsct;
  if (!saved) return defaults;
  try {
    const overrides = JSON.parse(saved);
    const o = overrides[project];
    if (!o) return defaults;
    return { label: defaults.label, comp: NGO_MAP[o.receiptDesign]?.comp || defaults.comp };
  } catch { return defaults }
}
function entryToDonor(e) {
  return {
    'Donor Name': e.payer_name || e.donor_name || 'Unknown',
    'Receipt No.': e.receipt_no || 'N/A',
    'Receipt Date': e.transaction_date || e.receipt_date || '',
    'Amount': e.amount,
    'Payment ID No.': e.payment_id || '',
    'PAN No.': e.donor_pan || '',
    'Email ID': e.donor_email || '',
    'Address 1': e.donor_address_1 || '',
    'Address 2': e.donor_address_2 || '',
    'City': e.donor_city || '',
    'State': '',
    'Pincode': e.donor_pin_code || '',
    'Mode of Payment (MOP)': 'Bank',
    'Donor Bank Name': e.bank_name || '',
    'Account Of': 'Corpus',
    'Project': e.project_id || 'bsct',
  };
}

function currentMonthIST(){
  const d=new Date(Date.now()+5.5*60*60*1000);
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
}
const fmtTime = t => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ap = h >= 12 ? 'PM' : 'AM';
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap;
};
function monthBounds(ym){
  const [y,m]=ym.split('-').map(Number);
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return {from:ym+'-01',to:ym+'-'+String(last).padStart(2,'0')};
}

function Sk({h=14,w='100%'}){return <div style={{height:h,width:typeof w==='number'?w:w,borderRadius:6,background:'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)',backgroundSize:'200% 100%',animation:'sk-shimmer 1.4s infinite'}}/>}
function SkStat(){return <div style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',display:'flex',alignItems:'center',gap:12}}><div className="sk" style={{width:40,height:40,borderRadius:10,flexShrink:0}}/><div><Sk h={20} w={100}/><div style={{height:4}}/><Sk h={12} w={60}/></div></div>}

function Tab({a,on,ic,ch}){return <button onClick={on} style={{padding:'10px 18px',fontSize:13,fontWeight:a?700:500,border:'none',background:a?'#fff':'transparent',cursor:'pointer',color:a?'var(--sage)':'#6b7280',borderBottom:a?'2px solid var(--sage)':'2px solid transparent',marginBottom:-2,display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',transition:'all .15s'}}>{ic}{ch}</button>}

function Btn({s,on,ch,dis,ic,fg='#fff',bg='var(--sage)'}){return <button className="btn btn-sm" onClick={on} disabled={dis} style={{background:bg,color:fg,border:'none',display:'inline-flex',alignItems:'center',gap:4,fontSize:12,opacity:dis?.5:1}}>{ic}{ch}</button>}

// ─── Lead (Log) Picker ────────────────────────────────────
function LeadPicker({ value, locked, onPick, onClear }){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState('');
  const [leads,setLeads]=useState([]);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState('');
  const boxRef=useRef(null);

  const search=useCallback((term)=>{
    setLoading(true);setErr('');
    apiGet('/accounts/bank-audit/leads'+(term?'?q='+encodeURIComponent(term):''))
      .then(setLeads)
      .catch(e=>{setErr(e.message||'Failed to load leads');setLeads([])})
      .finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    if(!open||locked)return;
    const t=setTimeout(()=>search(q),250);
    return ()=>clearTimeout(t);
  },[open,locked,q,search]);

  useEffect(()=>{
    const onDoc=(ev)=>{if(boxRef.current&&!boxRef.current.contains(ev.target))setOpen(false)};
    document.addEventListener('mousedown',onDoc);
    return ()=>document.removeEventListener('mousedown',onDoc);
  },[]);

  if(value){
    return <div style={{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',borderRadius:8,border:'1.5px solid #d1d5db',background:'#f3f4f6',fontSize:12,color:'#374151',minWidth:0}}>
      <span style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{locked?`Linked to Lead #${value}`:`Lead #${value}`}</span>
      {locked?<span style={{color:'#9ca3af',flexShrink:0}}>· locked</span>:<button type="button" onClick={onClear} style={{marginLeft:'auto',flexShrink:0,border:'1px solid #fecaca',background:'#fff',color:'#dc2626',borderRadius:6,padding:'2px 8px',cursor:'pointer',fontSize:11}}>Clear</button>}
    </div>;
  }

  return <div ref={boxRef} style={{position:'relative'}}>
    <input className="field-input" placeholder="Search pending lead (donor / mobile / FRO)..." value={q}
      onChange={e=>{setQ(e.target.value);setOpen(true)}}
      onFocus={()=>setOpen(true)}
      style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'}}/>
    {open&&<div style={{position:'absolute',zIndex:40,top:'calc(100% + 4px)',left:0,right:0,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',maxHeight:260,overflowY:'auto'}}>
      {loading?<div style={{padding:14,fontSize:12,color:'#9ca3af'}}>Searching...</div>
        :err?<div style={{padding:14,fontSize:12,color:'#dc2626'}}>{err}</div>
        :leads.length===0?<div style={{padding:14,fontSize:12,color:'#9ca3af'}}>No pending leads found</div>
        :leads.map(l=><button key={l.log_id} type="button" onClick={()=>{onPick(l);setOpen(false);setQ('')}}
          style={{display:'block',width:'100%',textAlign:'left',padding:'9px 12px',border:'none',borderBottom:'1px solid #f3f4f6',background:'#fff',cursor:'pointer',fontSize:12}}
          onMouseOver={e=>e.currentTarget.style.background='#f9fafb'} onMouseOut={e=>e.currentTarget.style.background='#fff'}>
          <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
            <span style={{fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.donor_name||'Unknown'}</span>
            <span style={{fontWeight:700,color:'var(--sage)',whiteSpace:'nowrap'}}>{curr(l.amount||0)}</span>
          </div>
          <div style={{color:'#6b7280',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {l.donor_mobile||'\u2014'} · {l.agent_name||'No FRO'} · #{l.log_id}
          </div>
        </button>)}
    </div>}
  </div>;
}

// ─── Agent (FRO) Picker ───────────────────────────────────
function AgentPicker({ value, workers, onChange }){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState('');
  const boxRef=useRef(null);

  const froSet=new Set(workers.filter(w=>String(w.department||'').toLowerCase()==='fro').map(w=>w.name));
  const base=[...workers].sort((a,b)=>(froSet.has(b.name)?1:0)-(froSet.has(a.name)?1:0));
  const kw=q.trim().toLowerCase();
  const list=kw?base.filter(w=>(w.name||'').toLowerCase().includes(kw)||(w.login_id||'').toLowerCase().includes(kw)):base;
  const fromLead=!!value&&!workers.some(w=>w.name===value);

  useEffect(()=>{
    const onDoc=(ev)=>{if(boxRef.current&&!boxRef.current.contains(ev.target))setOpen(false)};
    document.addEventListener('mousedown',onDoc);
    return ()=>document.removeEventListener('mousedown',onDoc);
  },[]);

  if(value){
    return <div style={{display:'flex',alignItems:'center',gap:6,padding:'9px 12px',borderRadius:8,border:'1.5px solid #d1d5db',background:'#f3f4f6',fontSize:13,color:'#374151',minWidth:0}}>
      <span style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{value}</span>
      {fromLead&&<span style={{color:'#9ca3af',flexShrink:0,fontSize:11}}>(lead)</span>}
      <button type="button" onClick={()=>onChange('')} style={{marginLeft:'auto',flexShrink:0,border:'1px solid #fecaca',background:'#fff',color:'#dc2626',borderRadius:6,padding:'2px 8px',cursor:'pointer',fontSize:11}}>Clear</button>
    </div>;
  }

  return <div ref={boxRef} style={{position:'relative'}}>
    <input className="field-input" placeholder="Search agent / FRO by name or login..." value={q}
      onChange={e=>{setQ(e.target.value);setOpen(true)}}
      onFocus={()=>setOpen(true)}
      style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'}}/>
    {open&&<div style={{position:'absolute',zIndex:40,top:'calc(100% + 4px)',left:0,right:0,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',maxHeight:220,overflowY:'auto'}}>
      {list.length===0?<div style={{padding:14,fontSize:12,color:'#9ca3af'}}>No FROs found</div>
        :<>
          <button type="button" onClick={()=>{onChange('');setOpen(false);setQ('')}}
            style={{display:'block',width:'100%',textAlign:'left',padding:'9px 12px',border:'none',borderBottom:'1px solid #f3f4f6',background:'#fff',cursor:'pointer',fontSize:12,color:'#6b7280'}}
            onMouseOver={e=>e.currentTarget.style.background='#f9fafb'} onMouseOut={e=>e.currentTarget.style.background='#fff'}>None</button>
          {list.map(w=><button key={w.id} type="button" onClick={()=>{onChange(w.name);setOpen(false);setQ('')}}
            style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',width:'100%',textAlign:'left',padding:'9px 12px',border:'none',borderBottom:'1px solid #f3f4f6',background:'#fff',cursor:'pointer',fontSize:12}}
            onMouseOver={e=>e.currentTarget.style.background='#f9fafb'} onMouseOut={e=>e.currentTarget.style.background='#fff'}>
            <span style={{fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.name}</span>
            <span style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
              {froSet.has(w.name)&&<span style={{fontSize:9,fontWeight:700,letterSpacing:'.4px',padding:'2px 6px',borderRadius:4,background:'#dcfce7',color:'#166534'}}>FRO</span>}
              {w.login_id&&<span style={{color:'#9ca3af'}}>{w.login_id}</span>}
            </span>
          </button>)}
        </>}
    </div>}
  </div>;
}

// ─── Audit Stat Cards ──────────────────────────────────────
export function AuditStatCards({sources=[],summary={},loading=false,suspense=null,suspenseNgo='',setSuspenseNgo=null}){
  return <div className="stats-grid">
    {loading?Array.from({length:Math.max(sources.length||4,4)},(_,i)=><SkStat key={i}/>):<>
      {sources.filter(s=>s.is_active!==false).map((s,i)=><div key={s.id} style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:40,height:40,borderRadius:10,background:C[i%C.length]+'18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C[i%C.length]} strokeWidth="2" strokeLinecap="round"><polygon points="12 2 2 7 2 9 22 9 22 7 12 2"/><rect x="4" y="11" width="3" height="7"/><rect x="10.5" y="11" width="3" height="7"/><rect x="17" y="11" width="3" height="7"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
        </div>
        <div><div style={{fontSize:20,fontWeight:700,color:C[i%C.length],lineHeight:1.2}}>{curr(summary[s.name]||0)}</div><div style={{fontSize:12,color:'#6b7280',marginTop:1}}>{s.name}</div></div>
      </div>)}
      {suspense!=null&&<div style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',minWidth:260}}>
        <div style={{width:40,height:40,borderRadius:10,background:'#B5603A18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B5603A" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div style={{flex:1,minWidth:150}}><div style={{fontSize:20,fontWeight:700,color:'#B5603A',lineHeight:1.2}}>{curr(suspense.amount||0)}</div><div style={{fontSize:12,color:'#6b7280',marginTop:1}}>Suspense · {suspense.count||0} open</div>
          {setSuspenseNgo&&<div style={{display:'flex',gap:4,marginTop:8,flexWrap:'wrap'}}>
            {[['','All'],['bsct','BSCT'],['aflf','AFLF'],['maan','MANN']].map(([v,l])=>
              <button key={v||'all'} onClick={()=>setSuspenseNgo(v)} style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:5,border:'none',cursor:'pointer',background:suspenseNgo===v?'#B5603A':'#FDE7DB',color:suspenseNgo===v?'#fff':'#B5603A',transition:'background .12s'}}>{l}</button>
            )}
          </div>}
        </div>
      </div>}
    </>}
  </div>;
}

// ─── Entries (Bank Audit Core) ─────────────────────────────
function EntrySection({loading,entries,sources,summary,error,statusTab,setStatusTab,selDate,setSelDate,selDay,setSelDay,doLoad,ngoFilter,setNgoFilter,srcFilter,setSrcFilter,showAdd,setShowAdd,showSrc,setShowSrc,form,setForm,editEntry,setEditEntry,saving,handleAdd,handleEdit,handleDelete,handleAddSrc,handleDelSrc,openEdit,sn,setSn,getSrcName,filtered,SvgX,onOpen,onAutoMatch,am}){
  const PAGE_SIZE=20;
  const[pg,setPg]=useState(1);
  const visible=srcFilter?filtered.filter(e=>e.source_id===Number(srcFilter)):filtered;
  const pageCount=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
  const pageItems=visible.slice((pg-1)*PAGE_SIZE,pg*PAGE_SIZE);
  useEffect(()=>{setPg(1)},[statusTab,selDate,selDay,srcFilter,ngoFilter]);
  useEffect(()=>{if(pg>pageCount)setPg(pageCount)},[pageCount,pg]);
  return <div>
    {error&&<div style={{display:'flex',alignItems:'center',gap:6,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:13,color:'#991b1b'}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>{error}
    </div>}
    <div className="card" style={{marginBottom:14,borderRadius:10}}>
      <div style={{display:'flex',gap:8,padding:'10px 14px',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:12,color:'#6b7280'}}>Month / Date</span>
          <ModernMonthDateInput
            value={selDay || selDate}
            max={new Date()}
            placeholder="Pick month or date..."
            style={{width:160}}
            onChange={v=>{
              if(!v){setSelDate('');setSelDay('');doLoad('',statusTab);return}
              if(v.length===10){setSelDay(v);setSelDate('');doLoad('',statusTab,v)}
              else{setSelDate(v);setSelDay('');doLoad(v,statusTab)}
            }}
          />
          {(selDate||selDay)&&<Btn on={()=>{setSelDate('');setSelDay('');doLoad('',statusTab)}} ch="All Dates" bg="transparent" fg="#6b7280" style={{fontSize:11,padding:'2px 6px'}}/>}
        </div>
        <select value={ngoFilter} onChange={e=>setNgoFilter(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db'}}>
          <option value="">All NGOs</option><option value="bsct">Being Sevak</option><option value="maan">Mann Care</option><option value="aflf">Ashray</option>
        </select>
        <select value={srcFilter} onChange={e=>setSrcFilter(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db'}}>
          <option value="">All Sources</option>
          {sources.filter(s=>s.is_active!==false).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Btn on={()=>doLoad(selDate,statusTab)} ic={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.4-3.4L23 10M1 14l5.1 4.4A9 9 0 0 0 20.5 15"/></svg>} ch="Refresh"/>
        <Btn on={()=>onAutoMatch()} dis={am} ic={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>} ch={am?'Matching...':'Auto-Match'} bg="#2563eb"/>
        <Btn on={()=>{setForm({...EMPTY_FM});setShowAdd(true)}} ch="Add Entry" bg="var(--sage)" style={{marginLeft:'auto'}}/>
        <Btn on={()=>{setSn('');setShowSrc(true)}} ch="Sources" bg="transparent" fg="#374151" style={{border:'1px solid #d1d5db'}}/>
      </div>
    </div>
    <div className="entry-scroll">
      <div className="entry-grid">
        {loading ? Array.from({length:5}).map((_,i)=>
          <div key={i} className="entry-card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div className="sk" style={{width:'45%',height:12,borderRadius:3}}/><div className="sk" style={{width:60,height:14,borderRadius:3}}/></div>
            <div className="sk" style={{width:'40%',height:10,borderRadius:3,marginTop:6}}/>
            <div className="sk" style={{width:64,height:20,borderRadius:6,marginTop:12}}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}><div className="sk" style={{width:'80%',height:10,borderRadius:3}}/><div className="sk" style={{width:'70%',height:10,borderRadius:3}}/></div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10,borderTop:'1px solid #f3f4f6',paddingTop:10}}><div className="sk" style={{width:70,height:10,borderRadius:3}}/><div className="sk" style={{width:80,height:20,borderRadius:4}}/></div>
          </div>
        ) : visible.length===0 ? (
          <div className="entry-card-empty">No entries yet</div>
        ) : pageItems.map((e,idx)=>
        <div key={e.id||idx} className="entry-card" style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',background:e.kind==='suspense'?'#fffaf5':undefined,cursor:'pointer'}} onClick={()=>onOpen(e)}>
          <div style={{minWidth:96}}>
            <div style={{fontWeight:600,color:'#111827',fontSize:12}}>{e.transaction_date||'\u2014'}</div>
            {e.payment_time && <div style={{fontSize:10,color:'#9ca3af',fontWeight:500}}>{fmtTime(e.payment_time)}</div>}
            <div style={{marginTop:2,minHeight:12,display:'flex',alignItems:'center',gap:4}}>
              {e.receipt_no
                ? <><span style={{fontFamily:'monospace',fontSize:10,color:e.kind==='suspense'?'#B5603A':'var(--sage)'}}>#{e.receipt_no}</span>
                    {e.kind!=='suspense'&&<span className="pill pill-gray" style={{fontSize:8,padding:'2px 6px'}}>{e.bank_audit_sources?.name||getSrcName(e.source_id)}</span>}
                  </>
                : <span className="pill pill-gray" style={{fontSize:8,padding:'2px 6px'}}>{e.bank_audit_sources?.name||getSrcName(e.source_id)}</span>}
            </div>
          </div>
          <div style={{fontSize:16,fontWeight:700,color:e.kind==='suspense'?'#B5603A':'var(--sage)',whiteSpace:'nowrap'}}>{curr(e.amount)}</div>
          <div style={{minWidth:96}}>
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.4px',color:'#9ca3af'}}>{e.payment_id ? 'Payment ID' : 'Check ID'}</div>
            <div style={{fontFamily:'monospace',fontSize:11,color:'#6b7280',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:130}}>{e.payment_id || e.check_id || '\u2014'}</div>
          </div>
          <div style={{flex:1,minWidth:100}}>
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.4px',color:'#9ca3af'}}>Name</div>
            <div style={{fontSize:11,color:'#374151',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.payer_name||'\u2014'}</div>
          </div>
          {e.match_status==='matched'&&<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:8,fontWeight:700,letterSpacing:'.4px',padding:'3px 8px',borderRadius:4,background:e.match_source==='manual'?'#fef3c7':'#dcfce7',color:e.match_source==='manual'?'#92400e':'#166534',whiteSpace:'nowrap'}}>{e.match_source==='manual'?'MATCHED MANUALLY':'MATCHED'}{e.match_donor?`\u00B7 ${e.match_donor}`:''}</span>}
          {e.match_status==='confirmed'&&<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:8,fontWeight:700,letterSpacing:'.4px',padding:'3px 8px',borderRadius:4,background:'#e8f0e4',color:'#5B6B4E',whiteSpace:'nowrap'}}>CONFIRMED</span>}
          <button title="View Receipt" onClick={e=>{e.stopPropagation();onViewReceipt(e)}} style={{width:28,height:28,borderRadius:8,border:'1px solid #d1d5db',background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#1d6f42',flexShrink:0,transition:'all .15s'}} onMouseOver={e=>{e.currentTarget.style.background='#f0fdf4';e.currentTarget.style.borderColor='#86efac'}} onMouseOut={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#d1d5db'}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4c9d0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="9 18 15 12 9 6" /></svg>
        </div>
      )}
      </div>
    </div>
    <Pagination page={pg} setPage={setPg} totalItems={visible.length} pageSize={PAGE_SIZE} />
  </div>;
}

// ─── Main ──────────────────────────────────────────────────
export default function BankAudit({embedded,onSummary}){
  const[e,setE]=useState([]);const[sr,setSr]=useState([]);const[su,setSu]=useState({});const[ld,setLd]=useState(true);
  const[st,setSt]=useState('unverified');const[sd,setSd]=useState(currentMonthIST());const[dd,setDd]=useState('');const[sf,setSf]=useState('');const[nf,setNf]=useState('');const[snf,setSnf]=useState('');
  const[sa,setSa]=useState(false);const[se,setSe]=useState(null);const[ss,setSs]=useState(false);
  const[fm,setFm]=useState({...EMPTY_FM});
  const[sv,setSv]=useState(false);const[snn,setSnn]=useState('');const[er,setEr]=useState('');
  const[fer,setFer]=useState('');const[dci,setDci]=useState(null);const[to,setTo]=useState({msg:'',type:'success',vis:false});
  const[dt,setDt]=useState(null);const[cm,setCm]=useState(false);const[am,setAm]=useState(false);
  const[rp,setRp]=useState(null);const[dl,setDl]=useState(false);const receiptRef=useRef(null);
  const[wr,setWr]=useState([]);
  const srRef=useRef(st);useEffect(()=>{srRef.current=st},[st]);
  const orRef=useRef(onSummary);orRef.current=onSummary;

  useEffect(()=>{if((sa||se)&&wr.length===0){Promise.allSettled([apiGet('/workers?status=all'),apiGet('/auth/fro-workers')]).then(([a,b])=>{
    const bList=(b.status==='fulfilled'&&b.value)?(Array.isArray(b.value)?b.value:(b.value.workers||[])):[];
    const list=[...(a.status==='fulfilled'&&Array.isArray(a.value)?a.value:[]),...bList];
    const seen=new Set();const merged=list.filter(w=>{const n=(w.name||'').trim();if(!n||seen.has(n.toLowerCase()))return false;seen.add(n.toLowerCase());return true});
    setWr(merged);
  })}},[sa,se,wr.length]);

  async function load(dt,stv,day){
    const s=stv||srRef.current;setLd(true);setEr('');
    try{
      const p=new URLSearchParams();
      if(day){p.set('date_from',day);p.set('date_to',day)}
      else if(dt){const b=monthBounds(dt);p.set('date_from',b.from);p.set('date_to',b.to)}
      p.set('status',s);
      const q=p.toString();
      const res=await Promise.allSettled([apiGet('/accounts/bank-audit/entries?'+q),apiGet('/accounts/bank-audit/sources'),apiGet('/accounts/bank-audit/summary?'+q)]);
      if(res[0].status==='fulfilled')setE(res[0].value);else{console.error(res[0].reason);setEr('Failed: '+res[0].reason.message)}
      if(res[1].status==='fulfilled')setSr(res[1].value);if(res[2].status==='fulfilled')setSu(res[2].value);
    }catch(err){console.error(err);setEr(err.message)}finally{setLd(false)}
  }
  useEffect(()=>{load(sd,st,dd)},[sd,dd,st]);
  useRealtime('bank_audit_entries',{event:'*',onInsert:()=>load(sd,srRef.current,dd),onUpdate:()=>load(sd,srRef.current,dd),onDelete:()=>load(sd,srRef.current,dd)});
  useRealtime('receipts',{event:'*',onInsert:()=>load(sd,srRef.current,dd),onUpdate:()=>load(sd,srRef.current,dd),onDelete:()=>load(sd,srRef.current,dd)});

  const ngoKw={bsct:['bsct','beingsevak','being sevak','sevak'],maan:['maan','mann','manncar','mann care'],aflf:['aflf','ashray']};
  const matchesNgo=(entry,code)=>{const src=(entry.bank_audit_sources?.name||'').toLowerCase();const rem=(entry.remarks||'').toLowerCase();const prj=(entry.project_id||'').toLowerCase();const kw=ngoKw[code]||[];return kw.some(k=>src.includes(k)||rem.includes(k)||prj.includes(k))};

  const suspense=useMemo(()=>{
    const rows=e.filter(x=>x.kind==='suspense'&&(!snf||matchesNgo(x,snf)));
    return {count:rows.length,amount:rows.reduce((s,r)=>s+Number(r.amount||0),0)};
  },[e,snf]);
  useEffect(()=>{if(embedded&&orRef.current)orRef.current({sources:sr,summary:su,suspense,loading:ld,suspenseNgo:snf,setSuspenseNgo:setSnf})},[sr,su,ld,embedded,suspense,snf]);

  const fe=e.filter(en=>!nf||matchesNgo(en,nf));
  const getSrc=i=>{const s=sr.find(s=>s.id===i);return s?s.name:'Unknown'};

  const addEntry=async()=>{setFer('');if(!fm.src_id||!fm.amount||!fm.transaction_date){setFer('Source, amount, and date are required');return};if(Number(fm.amount)<=0){setFer('Amount must be greater than zero');return};setSv(true);try{await apiPost('/accounts/bank-audit/entries',{source_id:fm.src_id,amount:fm.amount,payment_id:fm.payment_id,check_id:fm.check_id,transaction_date:fm.transaction_date,remarks:fm.remarks,payer_name:fm.payer_name,payment_time:fm.payment_time,project_id:fm.project_id||'bsct',donor_mobile:fm.donor_mobile,donor_email:fm.donor_email,donor_pan:fm.donor_pan,donor_address_1:fm.donor_address_1,donor_address_2:fm.donor_address_2,donor_city:fm.donor_city,donor_pin_code:fm.donor_pin_code,agent_name:fm.agent_name,log_id:fm.log_id||null});setSa(false);setFm({...EMPTY_FM});load(sd,st)}catch(e){alert(e.message)}finally{setSv(false)}};
  const editEntry=async()=>{if(!se)return;if(Number(fm.amount)<=0){setFer('Amount must be greater than zero');return};setFer('');setSv(true);try{
    if(se.kind==='suspense'){
      await apiPut('/accounts/bank-audit/suspense/'+se.receipt_id,{donor_name:fm.donor_name||fm.payer_name||null,donor_mobile:fm.donor_mobile||se.donor_mobile||null,amount:fm.amount,receipt_date:fm.transaction_date,payment_id:fm.payment_id||null,project_id:fm.project_id||'bsct',agent_name:fm.agent_name,log_id:fm.log_id||null});
    }else{
      await apiPut('/accounts/bank-audit/entries/'+se.id,fm);
    }
    setSe(null);setFm({...EMPTY_FM});setDt(null);setFer('');load(sd,st)}catch(e){alert(e.message)}finally{setSv(false)}};
  const delEntry=async()=>{if(!dci)return;try{
    if(dci.kind==='suspense'){await apiDelete('/accounts/bank-audit/suspense/'+dci.receipt_id)}
    else{await apiDelete('/accounts/bank-audit/entries/'+dci.id)}
    setDci(null);setTo({msg:'Entry deleted successfully',type:'success',vis:true});load(sd,st)}catch(e){alert(e.message)}};
  const addSrc=async()=>{if(!snn)return;try{await apiPost('/accounts/bank-audit/sources',{name:snn});setSnn('');setSr(await apiGet('/accounts/bank-audit/sources'))}catch(e){alert(e.message)}};
  const delSrc=async(id)=>{if(!confirm('Delete?'))return;try{await apiDelete('/accounts/bank-audit/sources/'+id);setSr(await apiGet('/accounts/bank-audit/sources'))}catch(e){alert(e.message)}};
  const openE=(entry)=>{const aName=entry.agent_name&&entry.agent_name!=='Suspense'?entry.agent_name:'';if(entry.kind==='suspense'){setFm({...EMPTY_FM,src_id:'',amount:entry.amount,payment_id:entry.payment_id||'',transaction_date:entry.transaction_date,remarks:entry.remarks||'',payer_name:entry.payer_name||'',donor_name:entry.donor_name||entry.payer_name||'',project_id:entry.project_id||'bsct',donor_mobile:entry.donor_mobile||'',agent_name:aName,log_id:entry.log_id||'',donor_id:entry.donor_id||''});setSe(entry);return}setFm({src_id:entry.source_id,amount:entry.amount,payment_id:entry.payment_id||'',check_id:entry.check_id||'',transaction_date:entry.transaction_date,remarks:entry.remarks||'',payer_name:entry.payer_name||'',donor_name:entry.donor_name||entry.payer_name||'',payment_time:entry.payment_time||'',project_id:entry.project_id||'bsct',donor_mobile:entry.donor_mobile||'',donor_email:entry.donor_email||'',donor_pan:entry.donor_pan||'',donor_address_1:entry.donor_address_1||'',donor_address_2:entry.donor_address_2||'',donor_city:entry.donor_city||'',donor_pin_code:entry.donor_pin_code||'',agent_name:aName,log_id:entry.log_id||'',donor_id:entry.donor_id||'',_lead_amount:entry.log_id?Number(entry.lead_amount||0):null});setSe(entry);if(entry.match_lead&&!entry.log_id)pickLead(entry.match_lead)};
  const orNa=(v,fallback)=>v||fallback||'NA';
  const pickLead=(l)=>{setFm(p=>({...p,log_id:l.log_id,donor_id:l.donor_id||'',payer_name:l.donor_name||p.payer_name,donor_name:l.donor_name||p.donor_name,donor_mobile:orNa(l.donor_mobile,p.donor_mobile),donor_email:orNa(l.donor_email,p.donor_email),donor_pan:orNa(l.donor_pan,p.donor_pan),donor_address_1:orNa(l.donor_address_1,p.donor_address_1),donor_address_2:orNa(l.donor_address_2,p.donor_address_2),donor_city:orNa(l.donor_city,p.donor_city),donor_pin_code:orNa(l.donor_pin_code,p.donor_pin_code),project_id:l.donor_project||p.project_id,agent_name:l.agent_name||p.agent_name,_lead_amount:Number(l.amount||0)}));};
  const clearLead=()=>setFm(p=>({...p,log_id:'',donor_id:'',donor_name:'',donor_mobile:'',donor_email:'',donor_pan:'',donor_address_1:'',donor_address_2:'',donor_city:'',donor_pin_code:'',_lead_amount:null}));
  const confirmMatch=async(entry)=>{setCm(true);try{await apiPost('/accounts/bank-audit/entries/'+entry.id+'/confirm-match');setDt(null);setTo({msg:'Match confirmed and credited',type:'success',vis:true});load(sd,st)}catch(e){alert(e.message)}finally{setCm(false)}};
  const clearMatch=async(entry)=>{setCm(true);try{await apiPost('/accounts/bank-audit/entries/'+entry.id+'/clear-match');setDt(null);setTo({msg:'Match cleared',type:'success',vis:true});load(sd,st)}catch(e){alert(e.message)}finally{setCm(false)}};
  const runAutoMatch=async()=>{setAm(true);try{const r=await apiPost('/accounts/bank-audit/auto-match');setTo({msg:r.matched?`Auto-match found ${r.matched} suggestion${r.matched===1?'':'s'}`:'Auto-match found no new matches',type:'success',vis:true});load(sd,st)}catch(e){alert(e.message)}finally{setAm(false)}};
  const handleDownloadReceipt=async()=>{setDl(true);try{await downloadSinglePDF(receiptRef.current,entryToDonor(rp),rp.project_id||'bsct')}catch(e){alert('Failed to download PDF: '+e.message)}setDl(false)};
  const handlePrintReceipt=()=>{const pw=window.open('','_blank');if(!pw){alert('Please allow pop-ups to print');return}pw.document.write(`<html><head><title>Donation Receipt</title><style>body{font-family:Arial,sans-serif;padding:20px}@media print{body{padding:0}}</style></head><body>${receiptRef.current.innerHTML}</body></html>`);pw.document.close();pw.focus();setTimeout(()=>pw.print(),500)};
  const SvgX=()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

  return <div>
    {!embedded&&<div style={{marginBottom:16}}><AuditStatCards sources={sr} summary={su} loading={ld} suspense={suspense} suspenseNgo={snf} setSuspenseNgo={setSnf}/></div>}

    {/* Pending / History sub-tabs */}
    <div style={{marginBottom:16,borderRadius:10,overflow:'hidden',border:'1px solid #e5e7eb',background:'#fff'}}>
      <div style={{display:'flex',background:'#fff',borderBottom:'1px solid #f3f4f6'}}>
        <Tab a={st==='unverified'} on={()=>setSt('unverified')} ch="Pending"/>
        <Tab a={st==='verified'} on={()=>setSt('verified')} ch="History"/>
      </div>
    </div>

    <EntrySection
      loading={ld} entries={e} sources={sr} summary={su} error={er}
      statusTab={st} setStatusTab={setSt}
      selDate={sd} setSelDate={setSd} selDay={dd} setSelDay={setDd} doLoad={load}
      ngoFilter={nf} setNgoFilter={setNf} srcFilter={sf} setSrcFilter={setSf}
      showAdd={sa} setShowAdd={setSa} showSrc={ss} setShowSrc={setSs}
      form={fm} setForm={setFm} editEntry={se} setEditEntry={setSe}
      saving={sv} handleAdd={addEntry} handleEdit={editEntry} handleDelete={setDci}
      handleAddSrc={addSrc} handleDelSrc={delSrc} openEdit={openE}
      sn={snn} setSn={setSnn} getSrcName={getSrc} filtered={fe} SvgX={SvgX} onOpen={setDt}
      onAutoMatch={runAutoMatch} am={am} confirmMatch={confirmMatch} clearMatch={clearMatch} cm={cm}
      onViewReceipt={setRp}
    />

    {/* Add/Edit Modal */}
    {(sa||se)&&(()=>{const isEdit=!!se;return <div className="modal-overlay" onClick={()=>{isEdit?setSe(null):setSa(false);setFer('')}}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:760,borderRadius:14,overflow:'hidden'}}>
      <div style={{padding:'16px 20px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f9fafb'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:isEdit?'#2563eb18':'var(--sage-light, #e8f0e4)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isEdit?'#2563eb':'var(--sage)'} strokeWidth="2" strokeLinecap="round">{isEdit?<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}</svg>
          </div>
          <div>
            <h3 style={{fontSize:15,fontWeight:700,margin:0,color:'#111827'}}>{isEdit?'Edit Entry':'New Bank Entry'}</h3>
            <p style={{fontSize:11,color:'#9ca3af',margin:0}}>{isEdit?(se.kind==='suspense'?'Update suspense receipt details':'Update entry details'):'Record a new transaction'}</p>
          </div>
        </div>
        <button onClick={()=>{isEdit?setSe(null):setSa(false);setFer('')}} style={{width:30,height:30,borderRadius:8,border:'none',background:'#f3f4f6',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#6b7280',transition:'all .15s'}} onMouseOver={e=>{e.currentTarget.style.background='#e5e7eb';e.currentTarget.style.color='#374151'}} onMouseOut={e=>{e.currentTarget.style.background='#f3f4f6';e.currentTarget.style.color='#6b7280'}}><SvgX/></button>
      </div>
      <div className="modal-body" style={{padding:'16px 20px',maxHeight:'75vh',overflowY:'auto'}}>
        {fer&&<div style={{marginBottom:14,padding:'10px 14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,fontSize:12,color:'#991b1b',display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:20,height:20,borderRadius:'50%',background:'#dc262618',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>{fer}
        </div>}

        <DonorPicker onPick={d=>setFm(p=>({...p,payer_name:d.name||p.payer_name,donor_name:d.name||p.donor_name,donor_mobile:d.mobile_number||p.donor_mobile,donor_email:d.email||p.donor_email,donor_pan:d.pan_number||p.donor_pan,donor_address_1:d.address_1||p.donor_address_1,donor_address_2:d.address_2||p.donor_address_2,donor_city:d.city||p.donor_city,donor_pin_code:d.pin_code||p.donor_pin_code}))} prefill={isEdit?(fm.donor_mobile||fm.donor_name||''):''}/>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#9ca3af',marginBottom:10}}>Transaction Details</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Source <span style={{color:'#dc2626'}}>*</span></span>
              <select className="field-input" value={fm.src_id} disabled={isEdit&&se.kind==='suspense'} onChange={e=>{setFm(p=>({...p,src_id:e.target.value}));if(fer)setFer('')}} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,background:isEdit&&se.kind==='suspense'?'#f3f4f6':'#fff',transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}>
                <option value="">Select source...</option>
                {sr.filter(s=>s.is_active!==false).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Amount (₹) <span style={{color:'#dc2626'}}>*</span></span>
              <input className="field-input" type="number" min="0.01" step="0.01" placeholder="0.00" value={fm.amount} onChange={e=>{setFm(p=>({...p,amount:e.target.value}));if(fer)setFer('')}} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
            </label>
          </div>
          <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4,marginTop:12}}>
            <span>NGO</span>
            <select className="field-input" value={fm.project_id||'bsct'} onChange={e=>{setFm(p=>({...p,project_id:e.target.value}));if(fer)setFer('')}} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,background:'#fff',transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}>
              {Object.entries(NGO_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#9ca3af',marginBottom:10}}>Date & Time</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Transaction Date <span style={{color:'#dc2626'}}>*</span></span>
              <ModernDateInput value={fm.transaction_date} max={new Date(Date.now()+5.5*60*60*1000)} onChange={d=>{setFm(p=>({...p,transaction_date:d}));if(fer)setFer('')}} />
            </label>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Payment Time</span>
              <ModernTimeInput value={fm.payment_time} onChange={d=>setFm(p=>({...p,payment_time:d}))} placeholder="Select time" />
            </label>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#9ca3af',marginBottom:10}}>Agent & Lead Link</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,alignItems:'start'}}>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Agent (FRO) <span style={{color:'#9ca3af',fontWeight:400}}>— optional</span></span>
              <AgentPicker value={fm.agent_name||''} workers={wr} onChange={n=>setFm(p=>({...p,agent_name:n}))}/>
            </label>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Log / Lead Verification <span style={{color:'#9ca3af',fontWeight:400}}>— optional</span></span>
              <LeadPicker value={fm.log_id} locked={!!(se&&se.kind!=='suspense'&&se.log_id)} onPick={pickLead} onClear={clearLead}/>
            </label>
          </div>
          {fm.log_id&&fm._lead_amount!=null&&fm.amount!==''&&Number(fm.amount)!==Number(fm._lead_amount)&&
            <div style={{marginTop:10,padding:'8px 12px',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,fontSize:12,color:'#92400e',display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:16,height:16,borderRadius:'50%',background:'#f59e0b',color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>!</span>
              <span>Amount <strong>{curr(fm.amount)}</strong> differs from the linked lead <strong>{curr(fm._lead_amount)}</strong></span>
            </div>}
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#9ca3af',marginBottom:10}}>Additional Info</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Payer Name</span>
              <input className="field-input" placeholder="e.g. Ravi Kumar" value={fm.payer_name} onChange={e=>setFm(p=>({...p,payer_name:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
            </label>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Payment ID</span>
              <input className="field-input" placeholder="e.g. pay_xxx" value={fm.payment_id} onChange={e=>setFm(p=>({...p,payment_id:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
            </label>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Check ID</span>
              <input className="field-input" placeholder="e.g. chk_xxx" value={fm.check_id} onChange={e=>setFm(p=>({...p,check_id:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
            </label>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Remarks</span>
              <input className="field-input" placeholder="Optional note..." value={fm.remarks} onChange={e=>setFm(p=>({...p,remarks:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
            </label>
          </div>
        </div>


      </div>
      <div style={{padding:'14px 20px',borderTop:'1px solid #f3f4f6',display:'flex',gap:10,justifyContent:'flex-end',background:'#fafafa',borderRadius:'0 0 14px 14px'}}>
        <button className="btn btn-sm" onClick={()=>{isEdit?setSe(null):setSa(false);setFer('')}} style={{padding:'8px 18px',borderRadius:8,fontSize:12,fontWeight:600}}>Cancel</button>
        <button className="btn btn-sm" onClick={isEdit?editEntry:addEntry} disabled={sv} style={{padding:'8px 20px',borderRadius:8,fontSize:12,fontWeight:600,background:isEdit?'#2563eb':'var(--sage)',color:'#fff',border:'none',display:'inline-flex',alignItems:'center',gap:6,opacity:sv?.6:1,transition:'all .15s'}}>
          {sv?(isEdit?'Saving...':'Adding...'):isEdit?'Save Changes':'Add Entry'}
        </button>
      </div>
    </div></div>})()}

    {/* Sources Modal */}
    {ss&&<div className="modal-overlay" onClick={()=>setSs(false)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420,borderRadius:12}}>
      <div className="modal-head"><h3 style={{fontSize:16,fontWeight:700}}>Manage Sources</h3><button className="btn btn-sm btn-icon" onClick={()=>setSs(false)} style={{padding:4}}><SvgX/></button></div>
      <div className="modal-body" style={{padding:20}}>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <input className="field-input" value={snn} onChange={e=>setSnn(e.target.value)} placeholder="New source name" onKeyDown={e=>e.key==='Enter'&&addSrc()}/>
          <button className="btn btn-primary btn-sm" onClick={addSrc}>Add</button>
        </div>
        {sr.map(s=><div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #f3f4f6',fontSize:13}}>
          <span>{s.name}</span>
          <button className="btn btn-sm" onClick={()=>delSrc(s.id)} style={{fontSize:11,padding:'2px 8px',color:'#dc2626',background:'none',border:'1px solid #fecaca',borderRadius:6}}>Delete</button>
        </div>)}
      </div>
    </div></div>}

    {/* Delete Confirmation Modal */}
    {dci&&<div className="modal-overlay" onClick={()=>setDci(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400,borderRadius:12}}>
      <div className="modal-head"><h3 style={{fontSize:16,fontWeight:700}}>Delete Entry</h3><button className="btn btn-sm btn-icon" onClick={()=>setDci(null)} style={{padding:4}}><SvgX/></button></div>
      <div className="modal-body" style={{padding:20,textAlign:'center'}}>
        <div style={{width:48,height:48,borderRadius:'50%',background:'#fef2f2',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </div>
        <p style={{fontSize:14,fontWeight:600,color:'#111827',margin:'0 0 6px'}}>Are you sure you want to delete this entry?</p>
        <p style={{fontSize:12,color:'#6b7280',margin:0}}>This action cannot be undone.</p>
        <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:18}}>
          <button className="btn btn-sm" onClick={()=>setDci(null)} style={{padding:'6px 18px'}}>Cancel</button>
          <button className="btn btn-sm" onClick={delEntry} style={{padding:'6px 18px',background:'#dc2626',color:'#fff',border:'none'}}>Delete</button>
        </div>
      </div>
    </div></div>}

    {/* Entry Detail Drawer */}
    {dt&&<RightPanel open={!!dt} onClose={()=>setDt(null)} topOffset={72} title={dt.kind==='suspense'?'Suspense Receipt':'Entry Details'} subtitle={dt.transaction_date||''} accent={dt.kind==='suspense'?'#B5603A':'var(--sage)'}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{fontSize:24,fontWeight:700,color:dt.kind==='suspense'?'#B5603A':'var(--sage)'}}>{curr(dt.amount)}</div>
        {dt.kind==='suspense'
          ? <span style={{fontSize:8,padding:'2px 6px',borderRadius:3,background:'#FDE7DB',color:'#B5603A',fontWeight:700,letterSpacing:'.4px'}}>SUSPENSE</span>
          : <span className="pill pill-gray" style={{fontSize:8,padding:'2px 6px'}}>{dt.bank_audit_sources?.name||getSrc(dt.source_id)}</span>}
      </div>
      <div className="card">
        <div className="card-pad" style={{padding:0}}>
          <div className="info-grid">
            <div><div className="label">Transaction Date</div><div className="value">{dt.transaction_date||'\u2014'}</div></div>
            {dt.receipt_no&&<div><div className="label">Receipt No</div><div className="value-mono">#{dt.receipt_no}</div></div>}
            <div><div className="label">Payment ID</div><div className="value-mono">{dt.payment_id||'\u2014'}</div></div>
            <div><div className="label">Check ID</div><div className="value-mono">{dt.check_id||'\u2014'}</div></div>
            <div><div className="label">Payer Name</div><div className="value">{dt.payer_name||'\u2014'}</div></div>
            <div><div className="label">NGO</div><div className="value">{NGO_LABELS[dt.project_id]||dt.project_id||'\u2014'}</div></div>
            <div style={{gridColumn:'1 / -1'}}><div className="label">Remarks</div><div className="value" style={{whiteSpace:'pre-wrap'}}>{dt.remarks||'\u2014'}</div></div>
          </div>
        </div>
      </div>
      {dt.match_status==='matched'&&dt.matched_lead_log_id&&<div className="card" style={{marginTop:12,border:'1px solid #86efac',background:'#f0fdf4'}}>
        <div className="card-pad" style={{padding:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.6px',color:'#166534'}}>{dt.match_source==='manual'?'MATCHED MANUALLY':'SUGGESTED MATCH'}</div>
            {dt.match_source!=='manual'&&<span style={{fontSize:10,fontWeight:700,color:'#166534',background:'#dcfce7',padding:'2px 8px',borderRadius:6}}>Score {dt.match_score}</span>}
          </div>
          <div className="info-grid">
            <div><div className="label">Donor</div><div className="value">{dt.match_donor||'\u2014'}</div></div>
            <div><div className="label">FRO</div><div className="value">{dt.match_fro||'\u2014'}</div></div>
          </div>
        </div>
      </div>}
      <div style={{position:'sticky',bottom:-18,margin:'16px -18px -18px',padding:'12px 18px',background:'rgba(255,255,255,.97)',borderTop:'1px solid #e5e7eb',boxShadow:'0 -2px 12px rgba(0,0,0,.06)'}}>
        {(dt.receipt_id||dt.receipt_no)&&<div style={{display:'flex',gap:10,marginBottom:10}}>
          <button className="btn btn-sm" style={{flex:1,background:'#1d6f42',color:'#fff',border:'none'}} onClick={()=>{setRp(dt);setDt(null)}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:-2,marginRight:4}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            View Receipt
          </button>
        </div>}
        {dt.kind==='suspense'
          ? <>
              <div style={{display:'flex',gap:10}}>
                <button className="btn btn-sm" style={{flex:1,background:'#e5e7eb',color:'#374151',border:'none'}} onClick={()=>openE(dt)}>{'\u270E'} Edit</button>
                <button className="btn btn-sm" style={{flex:1,background:'#fef2f2',color:'#dc2626',border:'none'}} onClick={()=>{setDci(dt);setDt(null)}}>{'\u2715'} Delete</button>
              </div>
            </>
          : <>
              {st==='unverified'&&dt.match_status==='matched'&&<div style={{display:'flex',gap:10,marginBottom:10}}>
                <button className="btn btn-sm" style={{flex:1,background:'var(--sage)',color:'#fff',border:'none'}} disabled={cm} onClick={()=>confirmMatch(dt)}>Confirm Match</button>
                <button className="btn btn-sm" style={{flex:1,background:'#f3f4f6',color:'#6b7280',border:'none'}} disabled={cm} onClick={()=>clearMatch(dt)}>Clear</button>
              </div>}
              <div style={{display:'flex',gap:10}}>
                <button className="btn btn-sm" style={{flex:1,background:'#e5e7eb',color:'#374151',border:'none'}} onClick={()=>openE(dt)}>{'\u270E'} Edit</button>
                <button className="btn btn-sm" style={{flex:1,background:'#fef2f2',color:'#dc2626',border:'none'}} onClick={()=>{setDci(dt);setDt(null)}}>{'\u2715'} Delete</button>
              </div>
            </>}
      </div>
    </RightPanel>}

    {/* Receipt Preview Modal */}
    {rp&&(()=>{const donor=entryToDonor(rp);const ngo=donor['Project']||'bsct';const tpl=getNgoSettings(ngo);const Comp=tpl.comp;return <div className="modal-overlay" onClick={()=>setRp(null)} style={{zIndex:1000}}>
      <div className="modal" style={{width:'95%',maxWidth:1060,height:'95vh',display:'flex',flexDirection:'column'}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header" style={{flexShrink:0}}>
          <h3 style={{fontSize:15}}>{donor['Donor Name']} — {tpl.label}</h3>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="btn btn-primary btn-sm" onClick={handleDownloadReceipt} disabled={dl}>{dl?'Generating...':'Download PDF'}</button>
            <button className="btn btn-sm" onClick={handlePrintReceipt}>Print</button>
            <button className="btn btn-sm" onClick={()=>setRp(null)}>Close</button>
          </div>
        </div>
        <div className="modal-body" style={{flex:1,overflow:'auto',padding:20,display:'flex',justifyContent:'center'}}>
          <div ref={receiptRef} data-receipt style={{display:'inline-block',transform:'scale(0.7)',transformOrigin:'top center'}}>
            <Comp donor={donor} project={ngo} />
          </div>
        </div>
      </div>
    </div>})()}

    <Toast message={to.msg} type={to.type} visible={to.vis} onClose={()=>setTo(p=>({...p,vis:false}))}/>
  </div>;
}
