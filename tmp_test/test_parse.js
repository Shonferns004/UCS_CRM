const XLSX = require('xlsx');
const wb = XLSX.readFile('C:\\Users\\Administrator\\Desktop\\attendance\\UCS_CRM\\tmp_test\\sample.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const range = XLSX.utils.decode_range(ws['!ref']);
const readCell = (r,c) => { const cell = ws[XLSX.utils.encode_cell({r,c})]; if(!cell||cell.v==null) return ''; return String(cell.t==='n'?cell.v:(cell.w??cell.v)).trim(); };
const rowValues = (r) => { const out=[]; for(let c=range.s.c;c<=range.e.c;c++) out.push(readCell(r,c)); return out; };
const headers = rowValues(0);
console.log('headers count', headers.length);
console.log(JSON.stringify(headers.filter(Boolean).slice(0,6)));
// normHeader
const normHeader = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const COLUMNS = [
 {key:'full_name',aliases:['member name','membername','name of member','beneficiary name','full name','fullname','name','applicant name','applicant','naam','mamber name','benificiary name']},
 {key:'mobile',aliases:['number','mobile number','mobilenumber','mobile no','mobileno','mobile','mob no','mob','phone number','phonenumber','phone no','phoneno','phone','contact number','contactno','contact no','contact','cell','cell no','cellno','primary mobile','primary number','mob number']},
];
// full alias list from file would be better; but test full_name + mobile
const allAliases = {
 full_name:['member name','membername','name of member','beneficiary name','full name','fullname','name','applicant name','applicant','naam','mamber name','benificiary name'],
 mobile:['number','mobile number','mobilenumber','mobile no','mobileno','mobile','mob no','mob','phone number','phonenumber','phone no','phoneno','phone','contact number','contactno','contact no','contact','cell','cell no','cellno','primary mobile','primary number','mob number'],
};
const wordBoundary = (text, alias) => { try { return new RegExp('(^|\\s)'+alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\s|$)').test(' '+text+' '); } catch { return text.includes(alias); } };
function matchColumns(headers){
  const map={}; const normalized=headers.map((h,i)=>({i,n:normHeader(h)})); const taken=new Set();
  for(const key of Object.keys(allAliases)){
    const aliases=[...allAliases[key]].sort((a,b)=>b.length-a.length);
    let hit=normalized.find(h=>!taken.has(h.i)&&aliases.includes(h.n));
    if(!hit){ for(const alias of aliases){ hit=normalized.find(h=>!taken.has(h.i)&&(h.n===alias||wordBoundary(h.n,alias))); if(hit) break; } }
    if(hit&&!taken.has(hit.i)){ taken.add(hit.i); map[key]=hit.i; }
  }
  return map;
}
const colMap = matchColumns(headers);
console.log('colMap', JSON.stringify(colMap));
console.log('full_name idx', colMap.full_name, '->', headers[colMap.full_name]);