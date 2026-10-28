FROM node:24.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates procps tini && rm -rf /var/lib/apt/lists/*
RUN npm install --global --ignore-scripts --no-audit --no-fund rea-agents@6.8.0
WORKDIR /app
COPY gateway.mjs /app/gateway.mjs
RUN mkdir -p /workspace/uploads && chown -R node:node /workspace
USER node
ENV PORT=10000
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node", "/app/gateway.mjs"]
