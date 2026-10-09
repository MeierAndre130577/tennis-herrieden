// api/btv-dispatch.js
// Startet den GitHub-Workflow btv-fetch.yml. Das GitHub-Token liegt nur als
// Vercel-Umgebungsvariable GITHUB_DISPATCH_TOKEN vor, nie im Browser/in der DB.
// Nur fuer eingeloggte Admins.
const { createClient } = require("@supabase/supabase-js");

const REPO = "MeierAndre130577/tennis-herrieden";
const WORKFLOW = "btv-fetch.yml";
const ALLOWED_INPUTS = ["teams_only", "players_only", "players_group_id", "players_team_name", "players_config_name"];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Nicht angemeldet" });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Nicht angemeldet" });

  const { data: profile } = await sb.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return res.status(403).json({ error: "Nur fuer Admins" });

  if (!process.env.GITHUB_DISPATCH_TOKEN) {
    return res.status(500).json({ error: "GITHUB_DISPATCH_TOKEN ist nicht konfiguriert" });
  }

  const inputs = {};
  for (const k of ALLOWED_INPUTS) {
    const v = (req.body?.inputs || {})[k];
    if (typeof v === "string") inputs[k] = v.slice(0, 200);
  }

  const ghRes = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", ...(Object.keys(inputs).length ? { inputs } : {}) }),
  });

  if (ghRes.status === 204) return res.status(204).end();
  const text = await ghRes.text();
  return res.status(ghRes.status).send(text);
};
