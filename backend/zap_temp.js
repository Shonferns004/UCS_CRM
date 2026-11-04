const fs = require('fs');
const p = 'src/controllers/froWhatsAppController.js';
let s = fs.readFileSync(p, 'utf8');
const a = s.indexOf('// TEMPORARY ACCESS');
if (a >= 0) {
  const r = s.indexOf('return res.json(Array.from(seen.values()));', a);
  const nl = s.indexOf('\n', r);
  s = s.slice(0, a - 4) + '    // Temporary access disabled for all FROs - only station mapping applies now.\n' + s.slice(nl + 1);
  fs.writeFileSync(p, s);
  console.log('done');
} else {
  console.log('no');
}
