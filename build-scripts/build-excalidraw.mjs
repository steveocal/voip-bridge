// Bundles the Jot sketchpad (React + ReactDOM + @excalidraw/excalidraw) into
// public/excalidraw/ as a single-entry, code-split ESM bundle served from our
// own origin. See build-scripts/excalidraw-entry.js for why: loading these
// straight from an ESM CDN fans out into 100+ separate cross-origin requests
// (duplicate transitive deps) and takes 10-20s — unusable for a live tool.
//
// Run after bumping the @excalidraw/excalidraw / react / react-dom versions
// in package.json: `npm run build:excalidraw`.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

await build({
  entryPoints: [join(root, "build-scripts/excalidraw-entry.js")],
  bundle: true,
  minify: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "empty" },
  chunkNames: "chunks/[name]-[hash]",
  entryNames: "excalidraw.entry",
  outdir: join(root, "public/excalidraw"),
});

console.log("Built public/excalidraw/ — remember to also copy the CSS:");
console.log("  cp node_modules/@excalidraw/excalidraw/dist/prod/index.css public/excalidraw/excalidraw.css");
