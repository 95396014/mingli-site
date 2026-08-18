require('dotenv').config()
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

;(async () => {
  await initDB()

  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use(dbMiddleware)

  app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

  // 公开：会员套餐列表
  const VIP_PLANS = [
    { id: 'month', name: '月度会员', price: 266, days: 30, credits: 0, desc: '每日 50 次 AI 深度解读 · 全功能开放' },
    { id: 'quarter', name: '季度会员', price: 688, days: 90, credits: 200, desc: '每日 50 次 AI 深度解读 · 赠 200 次额外额度' },
    { id: 'year', name: '年度会员', price: 1888, days: 365, credits: 500, desc: '每日 50 次 AI 深度解读 · 赠 500 次额外额度 · 优先客服' },
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

  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`[mingli] 后端已启动: http://localhost:${PORT}`)
  })
})()
