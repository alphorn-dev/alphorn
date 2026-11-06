// Adds the files worker.mjs needs at runtime to .next/standalone, the same way
// `output: "standalone"` does for server.js. Lets the Docker image ship only
// traced node_modules instead of the full production install.
import nft from "next/dist/compiled/@vercel/nft/index.js";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".next/standalone");

const { fileList } = await nft.nodeFileTrace(["worker.mjs"], { base: root });

for (const rel of fileList) {
  const src = path.join(root, rel);
  const dest = path.join(out, rel);
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // pnpm layout: keep symlinks as symlinks so resolution matches node_modules.
  if (fs.lstatSync(src).isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(src), dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log(`trace-worker: ${fileList.size} files`);
