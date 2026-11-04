import db from './src/config/db.js';
(async () => {
  const { data } = await db.from('messages').select('id,status,wa_message_id,failure_reason').eq('id','d37f2f71-fa5b-4632-9619-3407aa94e0e3').maybeSingle();
  console.log(JSON.stringify(data));
  process.exit(0);
})();
