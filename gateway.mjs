import { createServer, request as sendHttp } from "node:http";
import { connect } from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";

const DIR = "/workspace/uploads";
const UPLOAD_LIMIT = 10 * 1024 * 1024;
const REQUIRE_PUBLIC_KEY = true; // Public Render runtime: fail closed even if environment is incomplete.
const PUBLIC_API_KEY = process.env.REA_PUBLIC_API_KEY || "";
if (REQUIRE_PUBLIC_KEY && PUBLIC_API_KEY.length < 32) {
  process.stderr.write("[REA] PUBLIC_API_KEY_NOT_CONFIGURED: unauthenticated endpoints disabled\n");
}
function isAuthorized(req) {
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
  if (path === "/" && req.method === "GET") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    return res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>REA Cloud | Lance Marketing Digital</title><style>body{font:16px system-ui;background:#0b0b10;color:#f6f4fa;max-width:760px;margin:12vh auto;padding:24px}main{border:1px solid #393145;border-radius:16px;padding:32px}h1{color:#c4a9ff}p{line-height:1.7}code{color:#93d1cb}</style></head><body><main><h1>REA Cloud</h1><p>Motor de engenharia reversa da Lance Marketing Digital. O servidor MCP está disponível somente para clientes autenticados.</p><p>Rota de integração: <code>/mcp</code></p><p>Acesso administrativo e análises são coordenados pelo RAUL JARVIS.</p></main></body></html>');
  }
  if (path === "/health" && req.method === "GET") {
    const ok = await isReady();
    return json(res, ok ? 200 : 503, { ok });
  }
  if (REQUIRE_PUBLIC_KEY && !isAuthorized(req)) return json(res, PUBLIC_API_KEY.length < 32 ? 503 : 401, { error: "unauthorized" });
  if (path === "/artifacts" && req.method === "POST") {
    if (process.env.REA_ALLOW_UPLOADS !== "enabled") return json(res, 403, { error: "uploads_disabled_until_workspace_isolation" });
    return upload(req, res);
  }
  if (path !== "/mcp") return json(res, 404, { error: "not_found" });
  if (!await isReady()) return json(res, 503, { error: "rea_not_ready" });
  const headers = { ...req.headers, host: "127.0.0.1:8765" };
  delete headers.cookie;
  delete headers["cf-access-jwt-assertion"];
  delete headers["cf-access-authenticated-user-email"];
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
