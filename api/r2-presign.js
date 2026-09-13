// api/r2-presign.js
// Erzeugt eine kurzlebige Presigned-URL, mit der der Browser eine Datei
// direkt zu Cloudflare R2 hochladen kann (kein Datei-Upload ueber diese Funktion).
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { r2, requireUser } = require("./_r2");

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT_BY_TYPE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: "Nicht angemeldet" });

  const { contentType, folder } = req.body || {};
  if (!ALLOWED_TYPES.includes(contentType)) {
    return res.status(400).json({ error: "Nicht unterstuetzter Dateityp" });
  }
  // folder wird vom Client vorgegeben (z.B. "club-photos", "vm"), aber auf
  // ein sicheres Muster beschraenkt, damit niemand aus dem Bucket "ausbrechen" kann.
  const safeFolder = /^[a-zA-Z0-9_-]+$/.test(folder || "") ? folder : "misc";

  const key = `${safeFolder}/${randomId()}.${EXT_BY_TYPE[contentType]}`;

  const uploadUrl = await getSignedUrl(
    r2,
    // Jeder Key ist zufaellig und wird nie ueberschrieben (neues Foto = neuer
    // Key) -> darf beliebig lange im Browser-Cache bleiben. Das haelt die
    // Kiosk-Rotation, die dieselben Fotos alle paar Sekunden neu anzeigt,
    // aus dem Netz und damit aus der Egress-Abrechnung.
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { expiresIn: 300 }
  );

  const publicUrl = `${process.env.R2_PUBLIC_BASE_URL}/${key}`;

  res.json({ uploadUrl, publicUrl, key });
};
