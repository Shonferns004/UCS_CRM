import db from './src/config/db.js';
(async () => {
  const { data } = await db.from('whatsapp_webhook_logs').select('created_at,event_type,account_project').order('created_at',{ascending:false}).limit(1);
  console.log('latest webhook:', JSON.stringify(data));
  process.exit(0);
})();
