import { useState, useEffect, useRef, useMemo } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/auth';
import { useRealtime } from '../../../hooks/useRealtime';
import Toast from '../components/Toast';
import DonorPicker from '../components/DonorPicker';
import { TimePicker } from '../../fro/components/TimePicker';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import RightPanel from '../components/RightPanel';
import Pagination from '../components/Pagination';

const curr = n => n != null ? '\u20B9' + Number(n).toLocaleString('en-IN') : '\u20B90';
const C = ['#5B6B4E','#B5603A','#C08A2E','#4F6472','#7A5C7E','#88693D','#2E7D6F','#9B59B6'];
const NGO_LABELS = { bsct:'Being Sevak', maan:'Mann Care', aflf:'Ashray' };
const EMPTY_FM={src_id:'',amount:'',payment_id:'',check_id:'',transaction_date:'',remarks:'',payer_name:'',payment_time:'',project_id:'bsct',donor_mobile:'',donor_email:'',donor_pan:'',donor_address_1:'',donor_address_2:'',donor_city:'',donor_pin_code:''};

function currentMonthIST(){
  const d=new Date(Date.now()+5.5*60*60*1000);
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
}
function monthBounds(ym){
  const [y,m]=ym.split('-').map(Number);
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return {from:ym+'-01',to:ym+'-'+String(last).padStart(2,'0')};
}

function Sk({h=14,w='100%'}){return <div style={{height:h,width:typeof w==='number'?w:w,borderRadius:6,background:'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)',backgroundSize:'200% 100%',animation:'sk-shimmer 1.4s infinite'}}/>}
function SkStat(){return <div style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',display:'flex',alignItems:'center',gap:12}}><div className="sk" style={{width:40,height:40,borderRadius:10,flexShrink:0}}/><div><Sk h={20} w={100}/><div style={{height:4}}/><Sk h={12} w={60}/></div></div>}

function Tab({a,on,ic,ch}){return <button onClick={on} style={{padding:'10px 18px',fontSize:13,fontWeight:a?700:500,border:'none',background:a?'#fff':'transparent',cursor:'pointer',color:a?'var(--sage)':'#6b7280',borderBottom:a?'2px solid var(--sage)':'2px solid transparent',marginBottom:-2,display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',transition:'all .15s'}}>{ic}{ch}</button>}

function Btn({s,on,ch,dis,ic,fg='#fff',bg='var(--sage)'}){return <button className="btn btn-sm" onClick={on} disabled={dis} style={{background:bg,color:fg,border:'none',display:'inline-flex',alignItems:'center',gap:4,fontSize:12,opacity:dis?.5:1}}>{ic}{ch}</button>}

// ─── Audit Stat Cards ──────────────────────────────────────
export function AuditStatCards({sources=[],summary={},loading=false,suspense=null}){
  return <div className="stats-grid">
    {loading?Array.from({length:Math.max(sources.length||4,4)},(_,i)=><SkStat key={i}/>):<>
      {sources.filter(s=>s.is_active!==false).map((s,i)=><div key={s.id} style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:40,height:40,borderRadius:10,background:C[i%C.length]+'18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C[i%C.length]} strokeWidth="2" strokeLinecap="round"><polygon points="12 2 2 7 2 9 22 9 22 7 12 2"/><rect x="4" y="11" width="3" height="7"/><rect x="10.5" y="11" width="3" height="7"/><rect x="17" y="11" width="3" height="7"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
        </div>
        <div><div style={{fontSize:20,fontWeight:700,color:C[i%C.length],lineHeight:1.2}}>{curr(summary[s.name]||0)}</div><div style={{fontSize:12,color:'#6b7280',marginTop:1}}>{s.name}</div></div>
      </div>)}
      {suspense!=null&&<div style={{background:'#fff',borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:40,height:40,borderRadius:10,background:'#B5603A18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B5603A" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div><div style={{fontSize:20,fontWeight:700,color:'#B5603A',lineHeight:1.2}}>{curr(suspense.amount||0)}</div><div style={{fontSize:12,color:'#6b7280',marginTop:1}}>Suspense Receipts · {suspense.count||0} open</div></div>
      </div>}
    </>}
  </div>;
}

// ─── Entries (Bank Audit Core) ─────────────────────────────
function EntrySection({loading,entries,sources,summary,error,statusTab,setStatusTab,selDate,setSelDate,doLoad,ngoFilter,setNgoFilter,srcFilter,setSrcFilter,showAdd,setShowAdd,showSrc,setShowSrc,form,setForm,editEntry,setEditEntry,saving,handleAdd,handleEdit,handleDelete,handleAddSrc,handleDelSrc,openEdit,sn,setSn,getSrcName,filtered,SvgX,onOpen,onAutoMatch,am}){
  const PAGE_SIZE=20;
  const[pg,setPg]=useState(1);
  const visible=srcFilter?filtered.filter(e=>e.source_id===Number(srcFilter)):filtered;
  const pageCount=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
  const pageItems=visible.slice((pg-1)*PAGE_SIZE,pg*PAGE_SIZE);
  useEffect(()=>{setPg(1)},[statusTab,selDate,srcFilter,ngoFilter]);
  useEffect(()=>{if(pg>pageCount)setPg(pageCount)},[pageCount,pg]);
  return <div>
    {error&&<div style={{display:'flex',alignItems:'center',gap:6,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:13,color:'#991b1b'}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>{error}
    </div>}
    <div className="card" style={{marginBottom:14,borderRadius:10}}>
      <div style={{display:'flex',gap:8,padding:'10px 14px',flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          {selDate?<span style={{fontSize:12}}>Month</span>:<span style={{fontSize:12,fontWeight:600,color:'var(--sage)'}}>All Dates</span>}
          <DatePicker
            selected={selDate?new Date(selDate+'-01T00:00:00'):null}
            onChange={date=>{const ym=date?date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0'):'';setSelDate(ym);doLoad(ym,statusTab)}}
            dateFormat="MMM yyyy"
            showMonthYearPicker
            maxDate={new Date()}
            placeholderText="Pick month..."
            calendarClassName="bank-audit-cal"
            customInput={<input style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',width:130,cursor:'pointer'}}/>}
          />
          {selDate&&<Btn on={()=>{setSelDate('');doLoad('',statusTab)}} ch="Clear" bg="transparent" fg="#6b7280" style={{fontSize:11,padding:'2px 6px'}}/>}
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
          {e.match_status==='matched'&&<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:8,fontWeight:700,letterSpacing:'.4px',padding:'3px 8px',borderRadius:4,background:'#dcfce7',color:'#166534',whiteSpace:'nowrap'}}>MATCHED{e.match_donor?`\u00B7 ${e.match_donor}`:''}</span>}
          {e.match_status==='confirmed'&&<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:8,fontWeight:700,letterSpacing:'.4px',padding:'3px 8px',borderRadius:4,background:'#e8f0e4',color:'#5B6B4E',whiteSpace:'nowrap'}}>CONFIRMED</span>}
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
  const[st,setSt]=useState('unverified');const[sd,setSd]=useState(currentMonthIST());const[sf,setSf]=useState('');const[nf,setNf]=useState('');
  const[sa,setSa]=useState(false);const[se,setSe]=useState(null);const[ss,setSs]=useState(false);
  const[fm,setFm]=useState({...EMPTY_FM});
  const[sv,setSv]=useState(false);const[snn,setSnn]=useState('');const[er,setEr]=useState('');
  const[fer,setFer]=useState('');const[dci,setDci]=useState(null);const[to,setTo]=useState({msg:'',type:'success',vis:false});
  const[dt,setDt]=useState(null);const[cm,setCm]=useState(false);const[am,setAm]=useState(false);const[fd,setFd]=useState(false);
  const srRef=useRef(st);useEffect(()=>{srRef.current=st},[st]);
  const orRef=useRef(onSummary);orRef.current=onSummary;

  async function load(dt,stv){
    const s=stv||srRef.current;setLd(true);setEr('');
    try{
      const p=new URLSearchParams();if(dt){const b=monthBounds(dt);p.set('date_from',b.from);p.set('date_to',b.to)}p.set('status',s);
      const q=p.toString();
      const res=await Promise.allSettled([apiGet('/accounts/bank-audit/entries?'+q),apiGet('/accounts/bank-audit/sources'),apiGet('/accounts/bank-audit/summary?'+q)]);
      if(res[0].status==='fulfilled')setE(res[0].value);else{console.error(res[0].reason);setEr('Failed: '+res[0].reason.message)}
      if(res[1].status==='fulfilled')setSr(res[1].value);if(res[2].status==='fulfilled')setSu(res[2].value);
    }catch(err){console.error(err);setEr(err.message)}finally{setLd(false)}
  }
  useEffect(()=>{load(sd,st)},[sd, st]);
  useRealtime('bank_audit_entries',{event:'*',onInsert:()=>load(sd,srRef.current),onUpdate:()=>load(sd,srRef.current),onDelete:()=>load(sd,srRef.current)});
  useRealtime('receipts',{event:'*',onInsert:()=>load(sd,srRef.current),onUpdate:()=>load(sd,srRef.current),onDelete:()=>load(sd,srRef.current)});

  const suspense=useMemo(()=>{
    const rows=e.filter(x=>x.kind==='suspense');
    return {count:rows.length,amount:rows.reduce((s,r)=>s+Number(r.amount||0),0)};
  },[e]);
  useEffect(()=>{if(embedded&&orRef.current)orRef.current({sources:sr,summary:su,suspense,loading:ld})},[sr,su,ld,embedded,suspense]);

  const ngoKw={bsct:['bsct','beingsevak','being sevak','sevak'],maan:['maan','mann','manncar','mann care'],aflf:['aflf','ashray']};
  const fe=nf?e.filter(e=>{const src=(e.bank_audit_sources?.name||'').toLowerCase();const rem=(e.remarks||'').toLowerCase();const prj=(e.project_id||'').toLowerCase();const kw=ngoKw[nf]||[];return kw.some(k=>src.includes(k)||rem.includes(k)||prj.includes(k))}):e;
  const getSrc=i=>{const s=sr.find(s=>s.id===i);return s?s.name:'Unknown'};

  const addEntry=async()=>{setFer('');if(!fm.src_id||!fm.amount||!fm.transaction_date){setFer('Source, amount, and date are required');return};if(Number(fm.amount)<=0){setFer('Amount must be greater than zero');return};setSv(true);try{await apiPost('/accounts/bank-audit/entries',{source_id:fm.src_id,amount:fm.amount,payment_id:fm.payment_id,check_id:fm.check_id,transaction_date:fm.transaction_date,remarks:fm.remarks,payer_name:fm.payer_name,payment_time:fm.payment_time,project_id:fm.project_id||'bsct',donor_mobile:fm.donor_mobile,donor_email:fm.donor_email,donor_pan:fm.donor_pan,donor_address_1:fm.donor_address_1,donor_address_2:fm.donor_address_2,donor_city:fm.donor_city,donor_pin_code:fm.donor_pin_code});setSa(false);setFm({...EMPTY_FM});load(sd,st)}catch(e){alert(e.message)}finally{setSv(false)}};
  const editEntry=async()=>{if(!se)return;if(Number(fm.amount)<=0){setFer('Amount must be greater than zero');return};setFer('');setSv(true);try{await apiPut('/accounts/bank-audit/entries/'+se.id,fm);setSe(null);setFm({...EMPTY_FM});setFer('');load(sd,st)}catch(e){alert(e.message)}finally{setSv(false)}};
  const delEntry=async()=>{if(!dci)return;try{await apiDelete('/accounts/bank-audit/entries/'+dci);setDci(null);setTo({msg:'Entry deleted successfully',type:'success',vis:true});load(sd,st)}catch(e){alert(e.message)}};
  const addSrc=async()=>{if(!snn)return;try{await apiPost('/accounts/bank-audit/sources',{name:snn});setSnn('');setSr(await apiGet('/accounts/bank-audit/sources'))}catch(e){alert(e.message)}};
  const delSrc=async(id)=>{if(!confirm('Delete?'))return;try{await apiDelete('/accounts/bank-audit/sources/'+id);setSr(await apiGet('/accounts/bank-audit/sources'))}catch(e){alert(e.message)}};
  const openE=(entry)=>{setFm({src_id:entry.source_id,amount:entry.amount,payment_id:entry.payment_id||'',check_id:entry.check_id||'',transaction_date:entry.transaction_date,remarks:entry.remarks||'',payer_name:entry.payer_name||'',payment_time:entry.payment_time||'',project_id:entry.project_id||'bsct',donor_mobile:entry.donor_profiles?.mobile_number||'',donor_email:entry.donor_profiles?.email||'',donor_pan:entry.donor_profiles?.pan_number||'',donor_address_1:entry.donor_profiles?.address_1||'',donor_address_2:entry.donor_profiles?.address_2||'',donor_city:entry.donor_profiles?.city||'',donor_pin_code:entry.donor_profiles?.pin_code||''});setSe(entry)};
  const confirmMatch=async(entry)=>{setCm(true);try{await apiPost('/accounts/bank-audit/entries/'+entry.id+'/confirm-match');setDt(null);setTo({msg:'Match confirmed and credited',type:'success',vis:true});load(sd,st)}catch(e){alert(e.message)}finally{setCm(false)}};
  const clearMatch=async(entry)=>{setCm(true);try{await apiPost('/accounts/bank-audit/entries/'+entry.id+'/clear-match');setDt(null);setTo({msg:'Match cleared',type:'success',vis:true});load(sd,st)}catch(e){alert(e.message)}finally{setCm(false)}};
  const runAutoMatch=async()=>{setAm(true);try{const r=await apiPost('/accounts/bank-audit/auto-match');setTo({msg:r.matched?`Auto-match found ${r.matched} suggestion${r.matched===1?'':'s'}`:'Auto-match found no new matches',type:'success',vis:true});load(sd,st)}catch(e){alert(e.message)}finally{setAm(false)}};
  const SvgX=()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

  return <div>
    <style>{`
      .bank-audit-cal{font-family:inherit!important;font-size:13px!important;border:1px solid #e5e7eb!important;border-radius:10px!important;box-shadow:0 4px 20px rgba(0,0,0,.08)!important}
      .bank-audit-cal .react-datepicker__header{background:#f0fdf4!important;border-bottom:1px solid #dcfce7!important;border-radius:10px 10px 0 0!important;padding-top:10px!important}
      .bank-audit-cal .react-datepicker__current-month{font-weight:600!important;color:#166534!important;font-size:14px!important}
      .bank-audit-cal .react-datepicker__day-name{color:#6b7280!important;font-weight:500!important;font-size:11px!important;width:32px!important}
      .bank-audit-cal .react-datepicker__day{width:32px!important;height:32px!important;line-height:32px!important;border-radius:8px!important;margin:1px!important;color:#374151!important}
      .bank-audit-cal .react-datepicker__day:hover{background:#dcfce7!important;border-radius:8px!important}
      .bank-audit-cal .react-datepicker__day--selected,.bank-audit-cal .react-datepicker__day--keyboard-selected{background:#166534!important;color:#fff!important;border-radius:8px!important}
      .bank-audit-cal .react-datepicker__day--today{font-weight:700!important;color:#166534!important;background:#f0fdf4!important}
      .bank-audit-cal .react-datepicker__navigation{top:10px!important}
      .bank-audit-cal .react-datepicker__year-select,.bank-audit-cal .react-datepicker__month-select{padding:2px 6px!important;font-size:13px!important;border:1px solid #d1d5db!important;border-radius:4px!important;background:#fff!important;color:#166534!important;font-weight:600!important;cursor:pointer!important;outline:none!important}
      .bank-audit-cal .react-datepicker__close-icon::after{background:#9ca3af!important;font-size:14px!important;height:16px!important;width:16px!important}
      .bank-audit-cal .react-datepicker__triangle{display:none!important}
      .bank-audit-cal .react-datepicker__time-list-item{font-size:13px!important;padding:6px 12px!important}
      .bank-audit-cal .react-datepicker__time-list-item--selected{background:#166534!important;color:#fff}
      .bank-audit-cal .react-datepicker__time-list-item:hover{background:#dcfce7!important}
      .react-datepicker__popper{z-index:3000!important}
    `}</style>
    {!embedded&&<div style={{marginBottom:16}}><AuditStatCards sources={sr} summary={su} loading={ld} suspense={suspense}/></div>}

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
      selDate={sd} setSelDate={setSd} doLoad={load}
      ngoFilter={nf} setNgoFilter={setNf} srcFilter={sf} setSrcFilter={setSf}
      showAdd={sa} setShowAdd={setSa} showSrc={ss} setShowSrc={setSs}
      form={fm} setForm={setFm} editEntry={se} setEditEntry={setSe}
      saving={sv} handleAdd={addEntry} handleEdit={editEntry} handleDelete={setDci}
      handleAddSrc={addSrc} handleDelSrc={delSrc} openEdit={openE}
      sn={snn} setSn={setSnn} getSrcName={getSrc} filtered={fe} SvgX={SvgX} onOpen={setDt}
      onAutoMatch={runAutoMatch} am={am} confirmMatch={confirmMatch} clearMatch={clearMatch} cm={cm}
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
            <p style={{fontSize:11,color:'#9ca3af',margin:0}}>{isEdit?'Update entry details':'Record a new transaction'}</p>
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

        <DonorPicker onPick={d=>setFm(p=>({...p,payer_name:d.name||p.payer_name,donor_mobile:d.mobile_number||p.donor_mobile,donor_email:d.email||p.donor_email,donor_pan:d.pan_number||p.donor_pan,donor_address_1:d.address_1||p.donor_address_1,donor_address_2:d.address_2||p.donor_address_2,donor_city:d.city||p.donor_city,donor_pin_code:d.pin_code||p.donor_pin_code}))}/>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#9ca3af',marginBottom:10}}>Transaction Details</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Source <span style={{color:'#dc2626'}}>*</span></span>
              <select className="field-input" value={fm.src_id} onChange={e=>{setFm(p=>({...p,src_id:e.target.value}));if(fer)setFer('')}} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,background:'#fff',transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}>
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
              <DatePicker
                selected={fm.transaction_date ? new Date(fm.transaction_date + 'T00:00:00') : null}
                onChange={date=>{const ds=date?date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'):'';setFm(p=>({...p,transaction_date:ds}));if(fer)setFer('')}}
                dateFormat="dd MMM yyyy"
                placeholderText="Pick a date..."
                maxDate={new Date()}
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                className="field-input"
                wrapperStyle={{width:'100%'}}
                calendarClassName="bank-audit-cal"
                portalId="root"
                customInput={<input style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>}
              />
            </label>
            <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
              <span>Payment Time</span>
              <TimePicker value={fm.payment_time} onChange={e=>setFm(p=>({...p,payment_time:e.target.value}))} placeholder="Select time" />
            </label>
          </div>
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

        <div style={{marginBottom:16,border:'1px solid #e5e7eb',borderRadius:10,overflow:'hidden'}}>
          <button type="button" onClick={()=>setFd(!fd)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'10px 14px',background:fd?'#f9fafb':'#fff',border:'none',cursor:'pointer',textAlign:'left'}}>
            <span style={{display:'flex',alignItems:'center',gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#374151'}}>Donor Details</span>
              <span style={{fontSize:10,color:'#9ca3af'}}>Address, PAN, phone — optional</span>
            </span>
            <span style={{fontSize:10,color:'#6b7280',display:'inline-flex',alignItems:'center',gap:4}}>{fd?'Hide':'Add'}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{transform:fd?'rotate(180deg)':'none',transition:'transform .15s'}}><polyline points="18 15 12 9 6 15"/></svg></span>
          </button>
          {fd&&<div style={{padding:'14px',borderTop:'1px solid #e5e7eb',background:'#fafafa'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
                <span>Mobile Number</span>
                <input className="field-input" placeholder="10-digit mobile" value={fm.donor_mobile} onChange={e=>setFm(p=>({...p,donor_mobile:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
              </label>
              <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
                <span>Email</span>
                <input className="field-input" placeholder="email@example.com" value={fm.donor_email} onChange={e=>setFm(p=>({...p,donor_email:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
              </label>
              <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
                <span>PAN Number</span>
                <input className="field-input" placeholder="ABCDE1234F" value={fm.donor_pan} onChange={e=>setFm(p=>({...p,donor_pan:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
              </label>
              <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
                <span>PIN Code</span>
                <input className="field-input" placeholder="6-digit PIN" value={fm.donor_pin_code} onChange={e=>setFm(p=>({...p,donor_pin_code:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
              </label>
              <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
                <span>Address Line 1</span>
                <input className="field-input" placeholder="House / street" value={fm.donor_address_1} onChange={e=>setFm(p=>({...p,donor_address_1:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
              </label>
              <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
                <span>Address Line 2</span>
                <input className="field-input" placeholder="Area / landmark" value={fm.donor_address_2} onChange={e=>setFm(p=>({...p,donor_address_2:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
              </label>
              <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'flex',flexDirection:'column',gap:4}}>
                <span>City</span>
                <input className="field-input" placeholder="City" value={fm.donor_city} onChange={e=>setFm(p=>({...p,donor_city:e.target.value}))} style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid #e5e7eb',fontSize:13,transition:'border-color .15s',outline:'none'}} onFocus={e=>e.target.style.borderColor='var(--sage)'} onBlur={e=>e.target.style.borderColor='#e5e7eb'}/>
              </label>
            </div>
          </div>}
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
    {dt&&<RightPanel open={!!dt} onClose={()=>setDt(null)} title={dt.kind==='suspense'?'Suspense Receipt':'Entry Details'} subtitle={dt.transaction_date||''} accent={dt.kind==='suspense'?'#B5603A':'var(--sage)'}>
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
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.6px',color:'#166534'}}>SUGGESTED MATCH</div>
            <span style={{fontSize:10,fontWeight:700,color:'#166534',background:'#dcfce7',padding:'2px 8px',borderRadius:6}}>Score {dt.match_score}</span>
          </div>
          <div className="info-grid">
            <div><div className="label">Donor</div><div className="value">{dt.match_donor||'\u2014'}</div></div>
            <div><div className="label">FRO</div><div className="value">{dt.match_fro||'\u2014'}</div></div>
          </div>
        </div>
      </div>}
      <div style={{position:'sticky',bottom:-18,margin:'16px -18px -18px',padding:'12px 18px',background:'rgba(255,255,255,.97)',borderTop:'1px solid #e5e7eb',boxShadow:'0 -2px 12px rgba(0,0,0,.06)'}}>
        {dt.kind==='suspense'
          ? <div style={{textAlign:'center',fontSize:11,color:'#d8b4a0'}}>Read-only — claim from your Suspense panel</div>
          : st==='unverified'
            ? <>
              {dt.match_status==='matched'&&<div style={{display:'flex',gap:10,marginBottom:10}}>
                <button className="btn btn-sm" style={{flex:1,background:'var(--sage)',color:'#fff',border:'none'}} disabled={cm} onClick={()=>confirmMatch(dt)}>Confirm Match</button>
                <button className="btn btn-sm" style={{flex:1,background:'#f3f4f6',color:'#6b7280',border:'none'}} disabled={cm} onClick={()=>clearMatch(dt)}>Clear</button>
              </div>}
              <div style={{display:'flex',gap:10}}>
                <button className="btn btn-sm" style={{flex:1,background:'#e5e7eb',color:'#374151',border:'none'}} onClick={()=>{const e=dt;setDt(null);openEdit(e)}}>{'\u270E'} Edit</button>
                <button className="btn btn-sm" style={{flex:1,background:'#fef2f2',color:'#dc2626',border:'none'}} onClick={()=>{setDci(dt.id);setDt(null)}}>{'\u2715'} Delete</button>
              </div>
            </>
            : null}
      </div>
    </RightPanel>}

    <Toast message={to.msg} type={to.type} visible={to.vis} onClose={()=>setTo(p=>({...p,vis:false}))}/>
  </div>;
}
