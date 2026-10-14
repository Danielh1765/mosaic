// Vercel entry point for the public demo.
// Vercel's disk is read-only except /tmp, so each instance copies the demo pages
// into /tmp and runs the normal Mosaic server on that copy. Edits reset when the instance restarts.
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_COPY = "/tmp/mosaic-demo";

if (!existsSync(DEMO_COPY)) cpSync(path.join(ROOT, "demo-workspace"), DEMO_COPY, { recursive: true });
process.env.MOSAIC_WORKSPACE = DEMO_COPY;

const { handleRequest } = await import("../server.mjs");

export default handleRequest;
