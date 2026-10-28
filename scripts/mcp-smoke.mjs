import assert from "node:assert/strict";

const base = process.env.REA_TEST_URL || "http://127.0.0.1:18081";
const token = process.env.REA_TEST_API_KEY || "";
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 18000);
try {
  const response = await fetch(base + "/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer " + token,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "lance-rea-smoke", version: "1.0.0" },
      },
    }),
    signal: controller.signal,
  });
  assert.equal(response.status, 200, "MCP initialize HTTP status " + response.status);
  const text = await response.text();
  assert.ok(text.includes('"result"') || text.includes("event: message"), "MCP initialize returned no result");
  console.log("Authenticated MCP initialize: PASS");
} finally {
  clearTimeout(timeout);
  controller.abort();
}
