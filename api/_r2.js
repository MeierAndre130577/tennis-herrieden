// api/_r2.js
// Gemeinsamer R2-Client + Auth-Helfer fuer r2-presign.js und r2-delete.js
const { S3Client } = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const sbAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Prueft den Bearer-Token aus dem Authorization-Header gegen Supabase Auth.
// Gibt den User zurueck oder null, wenn nicht eingeloggt/ungueltig.
async function requireUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sbAuth.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

module.exports = { r2, requireUser };
