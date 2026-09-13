// api/r2-delete.js
// Loescht ein oder mehrere Objekte aus dem R2-Bucket. Erfordert nur eine
// gueltige Supabase-Session (kein Ownership-Check) -- gleiches, einfaches
// Vertrauensmodell wie vorher beim Supabase-Storage-Bucket "club-photos".
const { DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { r2, requireUser } = require("./_r2");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: "Nicht angemeldet" });

  const { keys } = req.body || {};
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 100) {
    return res.status(400).json({ error: "keys muss ein Array mit 1-100 Eintraegen sein" });
  }

  await r2.send(new DeleteObjectsCommand({
    Bucket: process.env.R2_BUCKET,
    Delete: { Objects: keys.map((Key) => ({ Key })) },
  }));

  res.json({ ok: true });
};
