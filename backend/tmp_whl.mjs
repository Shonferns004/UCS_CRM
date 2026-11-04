import db from './src/config/db.js';
(async () => {
  const { data } = await db.from('whatsapp_webhook_logs').select('event_type,processed,account_project,created_at').order('created_at',{ascending:false}).limit(10);
  for (const r of data||[]) console.log(r.created_at, r.event_type, r.processed, r.account_project);
  const { count } = await db.from('whatsapp_webhook_logs').select('*',{count:'exact',head:true});
  console.log('total logs:', count);
  process.exit(0);
})();
