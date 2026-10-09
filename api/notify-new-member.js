// api/notify-new-member.js
// Wird vom Supabase-Trigger "on_auth_user_created" aufgerufen (per pg_net),
// sobald sich jemand neu registriert. Schickt eine kurze Info-Mail an den
// Verein, damit eine neue Anmeldung nicht unbemerkt im Dashboard liegen bleibt.
const { sendMail } = require("./_mail");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = req.headers["x-webhook-secret"];
  if (!process.env.NEW_MEMBER_WEBHOOK_SECRET || secret !== process.env.NEW_MEMBER_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }

  const { name, email } = req.body || {};
  try {
    await sendMail({
      to: "tennis-herrieden@posteo.de",
      subject: `Neue Registrierung: ${name || email || "unbekannt"}`,
      text: `Ein neues Mitglied hat sich in der App registriert.\n\nName: ${name || "-"}\nE-Mail: ${email || "-"}\n\nBitte im Vereins-Dashboard freischalten/prüfen (Status "pending").`,
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
  return res.status(200).json({ ok: true });
};
