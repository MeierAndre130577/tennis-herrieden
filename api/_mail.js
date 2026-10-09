// api/_mail.js
// Gemeinsamer Mail-Versand über Resend. Der Unterstrich im Dateinamen sorgt
// dafür, dass Vercel daraus keinen eigenen Endpunkt macht.
const RESEND_URL = "https://api.resend.com";

function from() {
  return process.env.RESEND_FROM || "Tennis Herrieden <no-reply@tennis-herrieden.de>";
}

function requireKey() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY ist nicht konfiguriert");
  return process.env.RESEND_API_KEY;
}

async function resend(path, body) {
  const r = await fetch(`${RESEND_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

// Eine Mail an eine Adresse.
function sendMail({ to, subject, text }) {
  return resend("/emails", { from: from(), to, subject, text });
}

// Viele Einzelmails (jede Person sieht nur sich selbst als Empfänger).
// Resend nimmt höchstens 100 Mails pro Batch-Aufruf.
async function sendBatch(messages) {
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ from: from(), ...m }));
    await resend("/emails/batch", chunk);
    sent += chunk.length;
  }
  return sent;
}

// Hinweis am Ende jeder Mitglieder-Mail: sagt, warum man sie bekommt und wie man sie abschaltet.
const MEMBER_FOOTER =
  "\n\n--\nDu erhältst diese Mail, weil du in der Tennis-Herrieden-App E-Mail-Benachrichtigungen aktiviert hast.\n" +
  "Abschalten: In der App unten rechts auf dein Profil-Symbol tippen und „E-Mail-Benachrichtigungen“ ausschalten.";

module.exports = { sendMail, sendBatch, MEMBER_FOOTER };
