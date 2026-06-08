// api/btv-matches.js
// Liest gecachten Spielstand aus Supabase (befüllt von GitHub Actions)
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=15");

  const { data } = await sb.from("settings")
    .select("value").eq("key", "btv_match_cache").single();

  if (!data?.value) {
    return res.json({ match: null, message: "Noch keine Daten – GitHub Action noch nicht gelaufen" });
  }

  let match;
  try { match = JSON.parse(data.value); }
  catch (_) { match = null; }

  res.json({ match });
};
