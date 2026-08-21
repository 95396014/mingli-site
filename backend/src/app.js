const express = require('express')
const cors = require('cors')
const path = require('path')
const { initDB } = require('./models/init.js')
const dbMiddleware = require('./middleware/db.js')
const authRoutes = require('./routes/auth.js')
const aiRoutes = require('./routes/ai.js')
const vipRoutes = require('./routes/vip.js')
const adminRoutes = require('./routes/admin.js')
const { authMiddleware, requireVip, requireAdmin } = require('./middleware/auth.js')

// 尽量加载 .env（没有就不报错，Railway/Koyeb 直接传环境变量）
try { require('dotenv').config() } catch {}

;(async () => {
  await initDB()

  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use(dbMiddleware)

  // 全局错误保护：防止未捕获异常导致 Railway 返回 502
  app.use((err, req, res, next) => {
    console.error('[express] 未捕获错误:', err.message)
    res.status(500).json({ error: '服务器内部错误，请稍后重试' })
  })

  process.on('uncaughtException', (err) => {
    console.error('[node] 未捕获异常:', err.message)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[node] 未处理的 Promise 拒绝:', reason?.message || reason)
  })

  app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

  // 公开：会员套餐列表（价格与后端一致，避免前端显示价≠下单价）
  const VIP_PLANS = [
  { id: 'month', name: '月度会员', price: 266, days: 30, credits: 300, desc: '300 次 AI 深度解读 · 30 天会员特权 · 全功能开放' },
  { id: 'quarter', name: '季度会员', price: 688, days: 90, credits: 1100, desc: '1100 次 AI 深度解读（含赠送 200 次）· 90 天会员特权' },
  { id: 'year', name: '年度会员', price: 1888, days: 365, credits: 5000, desc: '5000 次 AI 深度解读（含赠送 1000 次）· 365 天会员特权 · 优先客服' },
  { id: 'per_use', name: '单次 AI 解读', price: 98, days: 0, credits: 1, desc: '无需会员，即时到账，永久有效' },
]
  app.get('/api/vip/plans', (req, res) => res.json({ plans: VIP_PLANS }))

  // 无需鉴权：认证相关
  app.use('/api/auth', authRoutes)

  // 需鉴权
  app.use('/api/ai', authMiddleware, aiRoutes)
  app.use('/api/vip', authMiddleware, vipRoutes)
  app.use('/api/admin', authMiddleware, requireAdmin, adminRoutes)

  const FRONT_DIST = path.join(__dirname, '../../frontend/dist')
  try {
    const fs = require('fs')
    if (fs.existsSync(FRONT_DIST)) {
      app.use(express.static(FRONT_DIST))
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next()
        res.sendFile(path.join(FRONT_DIST, 'index.html'))
      })
    }
  } catch {}

  // 兼容 Railway/Koyeb：它们常传 PORT=10000/3000/8080；Render 也是。
  const PORT = Number(process.env.PORT) || Number(process.env.DEV_PORT) || 3001
  // Host 必须监听 0.0.0.0 才能被托管平台的外部网关发现
  const HOST = process.env.HOST || '0.0.0.0'
  app.listen(PORT, HOST, () => {
    console.log(`[mingli] 后端已启动: http://${HOST}:${PORT}`)
  })
})()
