// api/btv-spiele.js
// Liest gecachte Spiele aus Supabase (befüllt von GitHub Actions)
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { data } = await sb.from("settings")
    .select("value").eq("key", "btv_spiele_cache").single();

  if (!data?.value) {
    return res.json({ spiele: [], message: "Noch keine Daten – GitHub Action noch nicht gelaufen" });
  }

  let spiele;
  try { spiele = JSON.parse(data.value); }
  catch (_) { spiele = []; }

  res.json({ spiele });
};
