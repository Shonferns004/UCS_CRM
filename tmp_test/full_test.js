const fs = require('fs');
const src = fs.readFileSync('C:\\Users\\Administrator\\Desktop\\attendance\\UCS_CRM\\client\\src\\panels\\beneficiaries\\pages\\ImportMembers.jsx','utf8');
// extract COLUMNS array
const m = src.match(/const COLUMNS = (\[[\s\S]*?\n\])/);
if(!m){ console.log('no COLUMNS'); process.exit(1); }
const COLUMNS = eval(m[1]);
console.log('num columns', COLUMNS.length);

const XLSX = require('xlsx');
const wb = XLSX.readFile('C:\\Users\\Administrator\\Desktop\\attendance\\UCS_CRM\\tmp_test\\sample.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const range = XLSX.utils.decode_range(ws['!ref']);
const readCell = (r,c) => { const cell = ws[XLSX.utils.encode_cell({r,c})]; if(!cell||cell.v==null) return ''; return String(cell.t==='n'?cell.v:(cell.w??cell.v)).trim(); };
const rowValues = (r) => { const out=[]; for(let c=range.s.c;c<=range.e.c;c++) out.push(readCell(r,c)); return out; };
const headers = rowValues(0);

const normHeader = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const wordBoundary = (text, alias) => { try { return new RegExp('(^|\\s)'+alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\s|$)').test(' '+text+' '); } catch { return text.includes(alias); } };
function matchColumns(headers){
  const map={}; const normalized=headers.map((h,i)=>({i,n:normHeader(h)})); const taken=new Set();
  for(const col of COLUMNS){
    const aliases=[...col.aliases].sort((a,b)=>b.length-a.length);
    let hit=normalized.find(h=>!taken.has(h.i)&&aliases.includes(h.n));
    if(!hit){ for(const alias of aliases){ hit=normalized.find(h=>!taken.has(h.i)&&(h.n===alias||wordBoundary(h.n,alias))); if(hit) break; } }
    if(hit&&!taken.has(hit.i)){ taken.add(hit.i); map[col.key]=hit.i; }
  }
  return map;
}
const colMap = matchColumns(headers);
console.log('colMap:', JSON.stringify(colMap));
console.log('full_name:', colMap.full_name, '->', headers[colMap.full_name]);
// Now build records like readSheet
let headerRow=0;
const records=[];
for(let r=headerRow+1;r<=range.e.r;r++){
  const values=rowValues(r);
  if(!values.some(Boolean)) continue;
  const row={_rowNumber:r+1};
  for(const col of COLUMNS) row[col.key]=colMap[col.key]===undefined?'':values[colMap[col.key]];
  if(!COLUMNS.some(c=>row[c.key]!=='')) continue;
  // location build
  if(!row.location){
    const parts=[row.address,row.area,row.city,row.district,row.state,row.pincode].map(v=>String(v??'').trim()).filter(Boolean);
    const uniq=[]; for(const p of parts){ if(!uniq.some(u=>u.toLowerCase()===p.toLowerCase())) uniq.push(p); }
    row.location=uniq.join(', ');
  }
  row._valid=!!row.full_name;
  records.push(row);
}
console.log('records:', records.length);
if(records.length) console.log(JSON.stringify(records[0]).slice(0,500));