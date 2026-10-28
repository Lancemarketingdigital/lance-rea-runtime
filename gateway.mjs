import { createServer, request as sendHttp } from "node:http";
import { connect } from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";

const DIR = "/workspace/uploads";
const UPLOAD_LIMIT = 10 * 1024 * 1024;
const REQUIRE_PUBLIC_KEY = process.env.REA_PUBLIC_MODE === "required";
const PUBLIC_API_KEY = process.env.REA_PUBLIC_API_KEY || "";
if (REQUIRE_PUBLIC_KEY && PUBLIC_API_KEY.length < 32) {
  process.stderr.write("[REA] PUBLIC_API_KEY_NOT_CONFIGURED: unauthenticated endpoints disabled\n");
}
function isAuthorized(req) {
  if (!REQUIRE_PUBLIC_KEY) return true; // Cloudflare Worker handles authentication in private-container mode.
  if (PUBLIC_API_KEY.length < 32) return false;
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  if (!supplied || supplied.length > 4096) return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(PUBLIC_API_KEY).digest();
  return timingSafeEqual(a, b);
}
mkdirSync(DIR, { recursive: true });
const rea = spawn("rea", ["mcp", "--http", "--host", "127.0.0.1", "--port", "8765"], {
  stdio: ["ignore", "ignore", "pipe"],
  env: { ...process.env, REA_MCP_OUTPUT_SCHEMA_PROFILE: "full" }
});
rea.stderr.on("data", data => process.stderr.write("[REA] " + String(data).slice(0, 1200)));
rea.on("error", error => process.stderr.write("[REA start] " + error.message + "\n"));
rea.on("exit", (code, signal) => process.stderr.write("[REA exit] " + String(code ?? signal) + "\n"));
process.on("SIGTERM", () => { rea.kill("SIGTERM"); process.exit(0); });
process.on("SIGINT", () => { rea.kill("SIGINT"); process.exit(0); });

const isReady = () => new Promise(resolve => {
  const socket = connect(8765, "127.0.0.1");
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
  socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
});
function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}
function sanitize(header) {
  return (basename(String(header || "arquivo.bin").replace(/\\/g, "/"))
    .replace(/[^A-Za-z0-9._-]/g, "_").slice(-100) || "arquivo.bin");
}
async function upload(req, res) {
  const dest = join(DIR, randomUUID() + "-" + sanitize(req.headers["x-filename"]));
  const stream = createWriteStream(dest, { flags: "wx", mode: 0o600 });
  let total = 0, oversize = false;
  try {
    for await (const piece of req) {
      total += piece.length;
      if (total > UPLOAD_LIMIT) { oversize = true; break; }
      if (!stream.write(piece)) await new Promise(resolve => stream.once("drain", resolve));
    }
    stream.end();
    await new Promise((resolve, reject) => {
      stream.once("finish", resolve);
      stream.once("error", reject);
    });
    if (!total || oversize) {
      unlinkSync(dest);
      return json(res, oversize ? 413 : 400, { error: oversize ? "upload_too_large" : "empty_upload" });
    }
    return json(res, 201, { ok: true, path: dest, bytes: total, ephemeral: true });
  } catch {
    stream.destroy();
    try { unlinkSync(dest); } catch { /* no artifact */ }
    return json(res, 500, { error: "upload_failed" });
  }
}
createServer(async (req, res) => {
  const path = new URL(req.url || "/", "http://container").pathname;
  if (path === "/health" && req.method === "GET") {
    const ok = await isReady();
    return json(res, ok ? 200 : 503, { ok });
  }
  if (REQUIRE_PUBLIC_KEY && !isAuthorized(req)) return json(res, PUBLIC_API_KEY.length < 32 ? 503 : 401, { error: "unauthorized" });
  if (path === "/artifacts" && req.method === "POST") return upload(req, res);
  if (path !== "/mcp") return json(res, 404, { error: "not_found" });
  if (!await isReady()) return json(res, 503, { error: "rea_not_ready" });
  const headers = { ...req.headers, host: "127.0.0.1:8765" };
  delete headers.origin; // Origin and Bearer already checked by Cloudflare Worker.
  delete headers.authorization;
  const upstream = sendHttp({
    hostname: "127.0.0.1", port: 8765, path: "/mcp", method: req.method, headers
  }, response => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) json(res, 502, { error: "rea_unavailable" });
    else res.end();
  });
  req.pipe(upstream);
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
