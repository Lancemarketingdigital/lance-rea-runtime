# REA MCP runtime for Lance Marketing Digital

Minimal, standalone deployment of the open-source [REA](https://github.com/morluto/rea) project on a free Docker web service.

This repository contains **no credentials, no client documents, and no source code from the private RAUL platform**. All operational endpoints require `REA_PUBLIC_MODE=required` and a secret `REA_PUBLIC_API_KEY` with 32+ characters. The `/health` endpoint is publicly reachable for infrastructure health checks.

Runtime: Node.js 24, `rea-agents@6.8.0`, MCP available at `POST /mcp` behind Bearer authentication. REA analysis runs in an ephemeral container. The free web service can sleep when idle.

Config:
- `PORT` assigned by host
- `REA_PUBLIC_MODE=required`
- `REA_PUBLIC_API_KEY` generated securely and set as an environment secret (never commit)
- `REA_MCP_OUTPUT_SCHEMA_PROFILE=full`

Use only with code/software you own or are authorized to analyze. No guaranteed uptime, storage persistence, or 100% availability on free hosting.
