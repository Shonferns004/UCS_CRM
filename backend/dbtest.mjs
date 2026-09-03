import db from "./src/config/db.js";
import * as EventHead from "./src/models/eventHeadModel.js";
try {
  const events = await EventHead.getAllEventHeadEvents({ month: "8", year: "2026" });
  console.log("getAllEventHeadEvents OK, count:", Array.isArray(events) ? events.length : events);
  const ngos = await EventHead.getAllEventHeadNgos().catch(e => { console.log("ngos err:", e.message); return [] });
  console.log("ngos count:", ngos.length, ngos.map(n => n.name));
  const acts = await EventHead.getAllActivities().catch(e => { console.log("allActivities err:", e.message); return [] });
  console.log("allActivities count:", acts.length);
} catch (e) {
  console.log("DB ERROR:", e.message);
  try { console.log("detail:", JSON.stringify(e)); } catch {}
} Signature signature cost signature happa, signature to Ither, I do subject, on case honors,an adapt, our own little nice nice stuff such. Mobile number charge mobile android horrible, mobile numbers status status numbers change, report report card set no show reportnoyaba no plag legal fixing automaticlook. Literal report hour me, stary go last post retailer, find report automatic barna charity. Athome, P U monica. At the merry, PM, finally might go to capture, no, maybe capture, Uder Netanke, bad load as neither photo Internet. Application pleasure normal sham in Xposition filter lugged sheets, switch so note nine fifteen no phrase bully game, my shuttle chalung in game dalling all shirts Up Fix mera, like it's night geminical reminder reminder, like sir new order only can go to relative little singingbarrier campinghora than fold a day, so maybe I do she may I dwa lung, persum, persannot magic, Ifmaybe charge in the scene, call number mobile mobile scarce? Fizzie, password change, phase query, err, square submitting, can I call you later you can also taste to chargeonourvacancy showedme last Samsung three double zero bar last post mera for the presentation, begge no ship red begin to keep what you asks trade, maybego edit, a joy session, ye no yad nopen model today rast to meso no battle no, final hot no chair, no chair, camir message, mammo, message latest night honor intersalking
process.exit(0);
