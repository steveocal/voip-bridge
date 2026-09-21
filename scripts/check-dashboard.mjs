// Renders the dashboard exactly as the worker serves it and syntax-checks its
// inline <script>s. Runs automatically before `npm run deploy` (predeploy):
// dashboard.ts is one big template literal, so tsc can't see JS errors inside
// it, and a single stray brace once took the whole UI down in production.
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const out = join(mkdtempSync(join(tmpdir(), "dash-")), "dash.cjs");
buildSync({ entryPoints: ["src/dashboard.ts"], bundle: true, format: "cjs", platform: "node", outfile: out, logLevel: "error" });
const html = await createRequire(import.meta.url)(out).serveDashboard().text();

const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
let bad = 0;
scripts.forEach((code, i) => {
  try { new vm.Script(code, { filename: `dashboard-script-${i}.js` }); }
  catch (e) { bad++; console.error(`dashboard script ${i}: ${e.name}: ${e.message}`); }
});
if (!scripts.length) { console.error("no inline scripts found - check regex"); process.exit(1); }
if (bad) { console.error(`\n${bad} dashboard script(s) failed to parse - not deploying.`); process.exit(1); }
console.log(`dashboard OK (${scripts.length} inline script(s) parse cleanly)`);
