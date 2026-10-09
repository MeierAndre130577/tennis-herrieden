// api/send-member-mail.js
// Schickt eine Mail an alle Mitglieder, die in der App "E-Mail-Benachrichtigungen"
// angehakt haben. Nur für eingeloggte Admins. Die Empfängerliste kommt aus der
// DB-Funktion get_mail_recipients() (prüft selbst, ob der Aufrufer Admin ist),
// deshalb braucht dieser Endpunkt keinen Service-Key.
//
// Body: { subject, text, dryRun? }  –  dryRun:true zählt nur die Empfänger.
const { createClient } = require("@supabase/supabase-js");
const { sendBatch, MEMBER_FOOTER } = require("./_mail");

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
  if (profile?.role !== "admin") return res.status(403).json({ error: "Nur für Admins" });

  const { subject, text, dryRun } = req.body || {};
  if (!dryRun) {
    if (typeof subject !== "string" || !subject.trim() || subject.length > 200) {
      return res.status(400).json({ error: "Betreff fehlt oder ist zu lang" });
    }
    if (typeof text !== "string" || !text.trim() || text.length > 10000) {
      return res.status(400).json({ error: "Text fehlt oder ist zu lang" });
    }
  }

  const { data: recipients, error: recErr } = await sb.rpc("get_mail_recipients");
  if (recErr) return res.status(500).json({ error: recErr.message });
  const list = (recipients || []).filter((r) => r.email);

  if (dryRun) return res.status(200).json({ recipients: list.length });
  if (!list.length) return res.status(200).json({ sent: 0 });

  try {
    const sent = await sendBatch(
      list.map((r) => ({ to: r.email, subject: subject.trim(), text: text.trim() + MEMBER_FOOTER }))
    );
    return res.status(200).json({ sent });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
