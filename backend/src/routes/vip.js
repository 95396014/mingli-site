const express = require('express')

const router = express.Router()

const PLANS = [
  { id: 'week',    name: '7天会员',   price: 166,  days: 7,   credits: 0,   desc: '会员期内每天 3 次 AI 深度解读' },
  { id: 'month',   name: '月会员',     price: 600,  days: 30,  credits: 0,   desc: '会员期内每天 3 次 AI 深度解读 · 30 天会员特权' },
  { id: 'year',    name: '年会员',     price: 5200, days: 365, credits: 0,   desc: '会员期内每天 3 次 AI 深度解读 · 365 天会员特权 · 优先客服' },
  { id: 'per_use', name: '单次额度',   price: 36,   days: 0,   credits: 1,   desc: '无需会员，购买 1 次额度永久有效' },
]
module.exports.PLANS = PLANS

router.get('/plans', (req, res) => {
  res.json({ plans: PLANS })
})

router.post('/order/create', async (req, res) => {
  const db = req.db
  const { planId } = req.body || {}
  const plan = PLANS.find(p => p.id === planId)
  if (!plan) return res.status(400).json({ error: '套餐不存在' })

  const now = Date.now()
  const orderNo = 'ML' + now.toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')

  const insertResult = await db.prepare(
    `INSERT INTO orders (order_no,user_id,plan_id,plan_name,amount,status,created_at) VALUES (?,?,?,?,?,'pending',?)`
  ).run(orderNo, req.user.id, plan.id, plan.name, Math.round(plan.price * 100), now)
  const orderId = insertResult.lastInsertRowid

  let alipay
  try { alipay = require('../config/alipay') } catch (e) {
    console.error('[alipay] load alipay.js failed:', e.message)
    return res.status(500).json({ error: '支付宝模块加载失败' })
  }
  const cfg = alipay.checkAlipayConfig()
  if (!cfg.ok) {
    console.warn('[alipay] 配置不完整：', cfg.reason)
    await db.prepare("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?").run(Date.now(), orderId)
    return res.status(500).json({
      error: `支付宝未配置完成（${cfg.reason}），请联系管理员配置 ALIPAY_* 环境变量。`
    })
  }

  let qr_code = null
  try {
    const { qr_code: qr } = await alipay.createPrecreate({
      out_trade_no: orderNo,
      total_amount: plan.price,
      subject: plan.name
    })
    qr_code = qr
    await db.prepare('UPDATE orders SET pay_method=?, code_url=?, updated_at=? WHERE id=?')
      .run('alipay', qr_code, Date.now(), orderId)
  } catch (err) {
    console.error('[alipay] precreate 下单失败：', err.message)
    await db.prepare("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?")
      .run(Date.now(), orderId)
    return res.status(502).json({ error: `支付宝下单失败：${err.message}` })
  }

  return res.json({
    orderNo, plan, orderId, amount: plan.price,
    payInfo: {
      method: 'alipay',
      tip: '请用支付宝 App 扫描下方二维码完成支付（5 分钟内有效）',
      qr_code
    }
  })
})

// 注意：微信 / 支付宝的异步回调路由不再放在这里 —— 因为它们不带 JWT，
// 必须挂在 authMiddleware 之前（见 app.js 的公开支付回调路由）。

router.get('/order/:no', async (req, res) => {
  const order = await req.db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(req.params.no, req.user.id)
  if (!order) return res.status(404).json({ error: '订单不存在' })
  res.json({ order })
})

router.get('/orders', async (req, res) => {
  const list = await req.db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id)
  res.json({ list })
})

module.exports = router
