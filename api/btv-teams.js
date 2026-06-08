// api/btv-teams.js
// Liest gecachte Teams aus Supabase (befüllt von GitHub Actions)
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { data } = await sb.from("settings")
    .select("value").eq("key", "btv_teams_cache").single();

  if (!data?.value) {
    return res.json({ teams: [], message: "Noch keine Daten – GitHub Action noch nicht gelaufen" });
  }

  let teams;
  try { teams = JSON.parse(data.value); }
  catch (_) { teams = []; }

  res.json({ teams });
};
