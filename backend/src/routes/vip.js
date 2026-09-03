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
  const { planId, method = 'demo' } = req.body || {}
  const plan = PLANS.find(p => p.id === planId)
  if (!plan) return res.status(400).json({ error: '套餐不存在' })

  const now = Date.now()
  const orderNo = 'ML' + now.toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')

  const insertResult = await db.prepare(
    `INSERT INTO orders (order_no,user_id,plan_id,plan_name,amount,status,created_at) VALUES (?,?,?,?,?,'pending',?)`
  ).run(orderNo, req.user.id, plan.id, plan.name, Math.round(plan.price * 100), now)
  const orderId = insertResult.lastInsertRowid

  // 支付宝当面付分支
  if (method === 'alipay') {
    let alipay
    try { alipay = require('../config/alipay') } catch (e) {
      console.error('[alipay] load alipay.js failed:', e.message)
      setTimeout(() => require('../utils/fulfillOrder')(db, orderNo), 5000)
      return res.json({
        orderNo, plan, orderId, amount: plan.price,
        payInfo: { method: 'demo', tip: '支付宝模块加载失败，演示模式 5 秒到账' }
      })
    }
    const cfg = alipay.checkAlipayConfig()
    if (!cfg.ok) {
      console.warn('[alipay] 配置不完整，降级演示：', cfg.reason)
      setTimeout(() => require('../utils/fulfillOrder')(db, orderNo), 5000)
      return res.json({
        orderNo, plan, orderId, amount: plan.price,
        payInfo: { method: 'demo', tip: `⚠️ 支付宝未配置完成（${cfg.reason}），当前为演示模式，5 秒后自动到账。` }
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
  }

  // 微信 Native 支付分支
  if (method === 'wxpay') {
    let pay
    try { pay = require('../config/pay') } catch (e) {
      console.error('[wxpay] load pay.js failed:', e.message)
      setTimeout(() => require('../utils/fulfillOrder')(db, orderNo), 5000)
      return res.json({
        orderNo, plan, orderId, amount: plan.price,
        payInfo: { method: 'demo', tip: '微信支付模块加载失败，演示模式5秒到账' }
      })
    }
    const cfgCheck = pay.checkWxpayConfig()
    if (!cfgCheck.ok) {
      console.warn('[wxpay] 配置不完整，降级为演示模式：', cfgCheck.reason)
      setTimeout(() => require('../utils/fulfillOrder')(db, orderNo), 5000)
      return res.json({
        orderNo, plan, orderId, amount: plan.price,
        payInfo: { method: 'demo', tip: `⚠️ 微信支付未配置完成（${cfgCheck.reason}），当前为演示模式，5 秒后自动到账。` }
      })
    }

    // 立即用异步 Promise 发起 Native 下单
    ;(async () => {
      try {
        const result = await pay.createNativeOrder({
          description: plan.name,
          out_trade_no: orderNo,
          amount: plan.price * 100
        })
        const code_url = result.code_url
        if (code_url) {
          await db.prepare('UPDATE orders SET pay_method=?, code_url=?, updated_at=? WHERE id=?')
            .run('wxpay', code_url, Date.now(), orderId)
        }
      } catch (err) {
        console.error('[wxpay] Native 下单失败：', err.response?.data || err.message)
        await db.prepare("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?").run(Date.now(), orderId)
      }
    })()

    // 3 秒后未拿到 code_url 就降级 demo
    setTimeout(async () => {
      const o = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
      if (o && !o.code_url && o.status === 'pending') {
        setTimeout(() => require('../utils/fulfillOrder')(db, orderNo), 5000)
      }
    }, 3200)

    return res.json({
      orderNo, plan, orderId, amount: plan.price,
      payInfo: {
        method: 'wxpay',
        tip: '请用微信扫描下方二维码完成支付（或稍后等待演示模式自动到账）',
        qr_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=',
        code_url: null
      }
    })
  }

  // demo 模式兜底
  setTimeout(() => require('../utils/fulfillOrder')(db, orderNo), 5000)
  return res.json({
    orderNo, plan, orderId, amount: plan.price,
    payInfo: { method: 'demo', tip: '演示模式：5秒后订单自动支付成功并开通权限。' }
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
