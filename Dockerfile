# ---- 阶段 1：构建前端 ----
FROM node:18-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 阶段 2：安装后端依赖 ----
FROM node:18-slim AS backend-builder

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --production --no-audit --no-fund

# ---- 阶段 3：运行时镜像 ----
FROM node:18-slim AS runner

WORKDIR /app

# 拷贝后端依赖 + 源码
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/

# 拷贝前端构建产物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 拷贝根 package.json（启动脚本在这）
COPY package.json ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Koyeb 会自动注入 PORT

EXPOSE 8080

CMD ["node", "backend/src/app.js"]
