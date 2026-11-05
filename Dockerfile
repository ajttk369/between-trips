FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs ./
COPY travel-domain.mjs supabase-api.mjs runtime.mjs ./
COPY supabase ./supabase
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=4310 DATA_DIR=/app/data
EXPOSE 4310
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
