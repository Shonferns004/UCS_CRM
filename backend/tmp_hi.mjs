import db from './src/config/db.js';
(async () => {
  const { data } = await db.from('messages').select('id,status,wa_message_id,body_text').ilike('body_text','%hi%').order('created_at',{ascending:false}).limit(10);
  for (const m of data||[]) console.log(m.status, m.wa_message_id, (m.body_text||'').slice(0,30));
  process.exit(0);
})();
