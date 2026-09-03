const express = require('express')
const cors = require('cors')
const path = require('path')
const crypto = require('crypto')
const qs = require('querystring')
const { initDB } = require('./models/init.js')
const dbMiddleware = require('./middleware/db.js')
const authRoutes = require('./routes/auth.js')
const aiRoutes = require('./routes/ai.js')
const vipRoutes = require('./routes/vip.js')
const adminRoutes = require('./routes/admin.js')
const fulfillOrder = require('./utils/fulfillOrder.js')
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
    { id: 'week',   name: '7天会员',   price: 166,  days: 7,   credits: 0,   desc: '会员期内每天 3 次 AI 深度解读' },
    { id: 'month',  name: '月会员',     price: 600,  days: 30,  credits: 0,   desc: '会员期内每天 3 次 AI 深度解读 · 30 天会员特权' },
    { id: 'year',   name: '年会员',     price: 5200, days: 365, credits: 0,   desc: '会员期内每天 3 次 AI 深度解读 · 365 天会员特权 · 优先客服' },
    { id: 'per_use',name: '单次额度',   price: 36,   days: 0,   credits: 1,   desc: '无需会员，购买 1 次额度永久有效' },
  ]
  app.get('/api/vip/plans', (req, res) => res.json({ plans: VIP_PLANS }))

  // 无需鉴权：认证相关
  app.use('/api/auth', authRoutes)

  // ====== 公开支付回调路由（必须在 authMiddleware 之前挂载！否则第三方回调会被 401 拦截）======
  const publicPayRouter = express.Router()
  // 让回调路由也能访问到 req.db（订单查询/履约需要）
  publicPayRouter.use(dbMiddleware)

  // 支付宝异步回调（application/x-www-form-urlencoded）
  publicPayRouter.post('/alipay-notify', express.urlencoded({ extended: true }), async (req, res) => {
    const alipay = require('./config/alipay')
    try {
      const params = { ...req.body }
      // 验签
      if (!alipay.verifyNotify(params)) {
        console.error('[alipay-notify] 验签失败，原始参数:', JSON.stringify(params).slice(0, 300))
        return res.send('fail')
      }
      const out_trade_no = params.out_trade_no
      const trade_status = params.trade_status
      const trade_no = params.trade_no

      console.log(`[alipay-notify] 订单=${out_trade_no} status=${trade_status} alipay_trade_no=${trade_no}`)

      if (!out_trade_no) return res.send('fail')
      if (trade_status !== 'TRADE_SUCCESS' && trade_status !== 'TRADE_FINISHED') {
        // 其它状态（WAIT_BUYER_PAY 等）直接回 success，支付宝不会再重试
        return res.send('success')
      }

      const order = await req.db.prepare('SELECT * FROM orders WHERE order_no = ?').get(out_trade_no)
      if (!order) {
        console.error('[alipay-notify] 订单不存在：', out_trade_no)
        return res.send('fail')
      }
      if (order.status === 'paid') return res.send('success')

      if (trade_no) {
        await req.db.prepare("UPDATE orders SET transaction_id = ?, updated_at = ? WHERE order_no = ?")
          .run(trade_no, Date.now(), out_trade_no)
      }
      await fulfillOrder(req.db, out_trade_no)
      res.send('success')
    } catch (err) {
      console.error('[alipay-notify] 处理异常：', err.message)
      res.send('fail')
    }
  })

  // 微信 Native 异步回调（application/json，兼容 express.json 和 express.raw）
  publicPayRouter.post('/wxpay-notify', express.raw({ type: ['application/json', '*/*'] }), async (req, res) => {
    const pay = require('./config/pay')
    try {
      const bodyStr = req.body ? (typeof req.body === 'string' ? req.body : String(req.body)) : ''
      let body
      try { body = JSON.parse(bodyStr) } catch { body = {} }

      const verified = pay.verifyWxpaySignature(req.headers, bodyStr)
      if (!verified) {
        console.error('[wxpay-notify] 验签失败')
        return res.json({ code: 'FAIL', message: '签名验证失败' })
      }

      let out_trade_no, transaction_id, trade_state
      if (body.resource && body.resource.ciphertext) {
        const decrypted = pay.decryptResource(body.resource)
        out_trade_no = decrypted.out_trade_no
        transaction_id = decrypted.transaction_id
        trade_state = decrypted.trade_state
      } else {
        out_trade_no = body.out_trade_no
        transaction_id = body.transaction_id
        trade_state = body.trade_state
      }

      if (!out_trade_no) return res.json({ code: 'FAIL', message: '缺少订单号' })
      if (trade_state !== 'SUCCESS' && trade_state !== 'REFUND') {
        return res.json({ code: 'SUCCESS', message: '成功' })
      }

      const order = await req.db.prepare('SELECT * FROM orders WHERE order_no = ?').get(out_trade_no)
      if (!order) {
        console.error('[wxpay-notify] 订单不存在：', out_trade_no)
        return res.json({ code: 'FAIL', message: '订单不存在' })
      }
      if (order.status === 'paid') return res.json({ code: 'SUCCESS', message: '成功' })

      if (transaction_id) {
        await req.db.prepare("UPDATE orders SET transaction_id = ?, updated_at = ? WHERE order_no = ?")
          .run(transaction_id, Date.now(), out_trade_no)
      }
      await fulfillOrder(req.db, out_trade_no)
      console.log(`[wxpay-notify] ✅ 订单 ${out_trade_no} 已到账`)
      res.json({ code: 'SUCCESS', message: '成功' })
    } catch (err) {
      console.error('[wxpay-notify] 回调处理异常：', err.message)
      res.json({ code: 'FAIL', message: err.message })
    }
  })

  // 挂载到 /api/vip 路径前缀下，Express 先挂载先匹配 → 不会落到后面带 authMiddleware 的那条
  app.use('/api/vip', publicPayRouter)

  // ====== 需鉴权 ======
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
    try {
      const al = require('./config/alipay').getDebugSummary()
      console.log(`[mingli] 支付宝配置: appId=${al.appIdSet ? '✓***'+al.appIdTail : '未配置'} 私钥=${al.privateKeySet ? '✓' : '✗'} 公钥=${al.publicKeySet ? '✓' : '✗'} notify=${al.notifyUrlSet ? al.gateway : '未配置'}`)
    } catch {}
  })
})()
