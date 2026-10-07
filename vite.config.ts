import { createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * PDF.js decodes some images and colours with files it fetches when it needs them: JBIG2 and JPEG 2000 (what scanners
 * save pages as), ICC colour profiles, and the CMaps and standard fonts for text. They are served at /pdfjs/<folder>/
 * from the installed package while developing, and copied into the build.
 */
const PDFJS = join("node_modules", "pdfjs-dist");
const PDFJS_DIRS = ["wasm", "iccs", "cmaps", "standard_fonts"];
function pdfjsAssets(): Plugin {
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs/", (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? "").split("?")[0])).replace(/^[/\\]+/, "");
        if (!PDFJS_DIRS.includes(rel.split(/[/\\]/)[0])) return next();
        const file = join(PDFJS, rel);
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of PDFJS_DIRS) {
        for (const name of readdirSync(join(PDFJS, dir))) {
          this.emitFile({ type: "asset", fileName: `pdfjs/${dir}/${name}`, source: readFileSync(join(PDFJS, dir, name)) });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:5174" },
  },
});
