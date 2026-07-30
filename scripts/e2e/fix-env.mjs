// One-shot: rewrite FIREBASE_SERVICE_ACCOUNT_KEY in .env.local from Vercel's
// broken-locally encoding into a single-quoted minified JSON that both dotenv
// and the app's JSON.parse accept. Backs up the original first. TEMPORARY.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV = join(REPO, ".env.local");
const BAK = join(REPO, ".env.local.vercel-backup");

const raw = readFileSync(ENV, "utf8");
const lines = raw.split(/\r?\n/);
const idx = lines.findIndex((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_KEY="));
if (idx === -1) throw new Error("key not found");

const val = lines[idx].slice("FIREBASE_SERVICE_ACCOUNT_KEY=".length);
// Extract every "key":"value" pair; values carry literal \n which we turn into
// real newlines so JSON.stringify re-emits them as proper \n escapes.
const obj = {};
for (const m of val.matchAll(/"([a-z_0-9]+)":\s*"([^"]*)"/g)) {
  obj[m[1]] = m[2].replace(/\\n/g, "\n");
}
if (!obj.private_key || !obj.client_email || !obj.project_id) {
  throw new Error("extraction incomplete: " + Object.keys(obj).join(","));
}
// Sanity: this must now be valid JSON.
const minified = JSON.stringify(obj);
JSON.parse(minified); // throws if bad

if (!existsSync(BAK)) copyFileSync(ENV, BAK);
lines[idx] = `FIREBASE_SERVICE_ACCOUNT_KEY='${minified}'`;
writeFileSync(ENV, lines.join("\n"), "utf8");
console.log(`Rewrote SA key (${Object.keys(obj).length} fields). Backup at .env.local.vercel-backup`);
