/**
 * 心跳保活脚本 —— 防止 Supabase 数据库因 1 周无活动被暂停
 *
 * 原理：每 6 小时 ping 一次后端 /api/health 接口，
 * 后端收到请求会触发一次数据库查询（健康检查），
 * 让 Supabase 认为项目处于活跃状态，不会被自动暂停。
 *
 * 部署方式（三选一）：
 *
 * 方式 1：Koyeb 后端内置定时器（推荐）
 *   后端 app.js 会自动启动 setInterval，无需额外部署
 *   如果 Koyeb 服务地址已确定，设置 SELF_URL 环境变量即可
 *
 * 方式 2：cron-job.org 免费定时（推荐）
 *   1. 注册 https://cron-job.org
 *   2. 创建 cron job，URL 填: https://你的koyeb域名/api/health
 *   3. 频率选: 每 6 小时
 *   4. 不用写代码，零成本
 *
 * 方式 3：本地/VPS cron
 *   crontab -e
 *   0 */6 * * * curl -s https://你的koyeb域名/api/health > /dev/null
 */

const https = require('https')
const http = require('http')

const TARGET = process.env.SELF_URL || ''
const INTERVAL = 6 * 60 * 60 * 1000 // 6 小时

function ping(url) {
  if (!url) {
    console.log('[keepalive] SELF_URL 未设置，跳过')
    return
  }
  const client = url.startsWith('https') ? https : http
  const req = client.get(url, (res) => {
    console.log(`[keepalive] ping ${url} → ${res.statusCode}`)
  })
  req.on('error', (e) => {
    console.error(`[keepalive] ping 失败: ${e.message}`)
  })
  req.setTimeout(10000, () => {
    req.destroy()
    console.log('[keepalive] 超时，已跳过')
  })
}

// 立即 ping 一次
ping(TARGET + '/api/health')

// 定时 ping
setInterval(() => {
  ping(TARGET + '/api/health')
}, INTERVAL)

console.log(`[keepalive] 心跳保活已启动，间隔 ${INTERVAL / 3600000} 小时，目标: ${TARGET || '(未配置)'}`)
