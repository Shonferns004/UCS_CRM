import db from './src/config/db.js';
(async () => {
  const { data } = await db.from('whatsapp_webhook_logs').select('payload').eq('event_type','messages').order('created_at',{ascending:false}).limit(1);
  const p = data?.[0]?.payload;
  console.log(JSON.stringify(p?.entry?.[0]?.changes?.[0]?.value?.statuses));
  process.exit(0);
})();
