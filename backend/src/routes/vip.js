const express = require('express')

const router = express.Router()

const PLANS = [
  { id: 'month', name: '月度会员', price: 266, days: 30, credits: 300, desc: '300 次 AI 深度解读 · 30 天会员特权 · 全功能开放' },
  { id: 'quarter', name: '季度会员', price: 688, days: 90, credits: 1100, desc: '1100 次 AI 深度解读（含赠送 200 次）· 90 天会员特权' },
  { id: 'year', name: '年度会员', price: 1888, days: 365, credits: 5000, desc: '5000 次 AI 深度解读（含赠送 1000 次）· 365 天会员特权 · 优先客服' },
  { id: 'per_use', name: '单次 AI 解读', price: 98, days: 0, credits: 1, desc: '无需会员，即时到账，永久有效' },
]
module.exports.PLANS = PLANS

router.get('/plans', (req, res) => {
  res.json({ plans: PLANS })
})

router.post('/order/create', (req, res) => {
  const db = req.db
  const { planId, method = 'demo' } = req.body || {}
  const plan = PLANS.find(p => p.id === planId)
  if (!plan) return res.status(400).json({ error: '套餐不存在' })
  const now = Date.now()
  const orderNo = 'ML' + now.toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')

  const insertResult = db.prepare(`INSERT INTO orders (order_no,user_id,plan_id,plan_name,amount,status,created_at) VALUES (?,?,?,?,?,'pending',?)`)
    .run(orderNo, req.user.id, plan.id, plan.name, Math.round(plan.price * 100), now)
  const orderId = insertResult.lastInsertRowid

  if (method === 'wxpay') {
    let pay
    try { pay = require('../config/pay') } catch (e) {
      console.error('[wxpay] load pay.js failed:', e.message)
      setTimeout(() => fulfillOrder(db, orderNo), 5000)
      return res.json({
        orderNo, plan, orderId,
        amount: plan.price,
        payInfo: { method: 'demo', tip: '微信支付模块加载失败，演示模式5秒到账' }
      })
    }
    const cfgCheck = pay.checkWxpayConfig()
    if (!cfgCheck.ok) {
      console.warn('[wxpay] 配置不完整，降级为演示模式：', cfgCheck.reason)
      setTimeout(() => fulfillOrder(db, orderNo), 5000)
      return res.json({
        orderNo, plan, orderId,
        amount: plan.price,
        payInfo: { method: 'demo', tip: `⚠️ 微信支付未配置完成（${cfgCheck.reason}），当前为演示模式，5 秒后自动到账。` }
      })
    }

    // 立即用异步 Promise 发起 Native 下单，不阻塞当前响应
    ;(async () => {
      try {
        const result = await pay.createNativeOrder({
          description: plan.name,
          out_trade_no: orderNo,
          amount: plan.price * 100
        })

        const code_url = result.code_url
        if (code_url) {
          db.prepare('UPDATE orders SET pay_method = ?, code_url = ?, updated_at = ? WHERE id = ?')
            .run('wxpay', code_url, Date.now(), orderId)
        }
      } catch (err) {
        console.error('[wxpay] Native 下单失败：', err.response?.data || err.message)
        db.prepare("UPDATE orders SET status='cancelled', updated_at = ? WHERE id = ?").run(Date.now(), orderId)
      }
    })()

    // 3 秒内未下单成功则 fallback demo
    setTimeout(() => {
      const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
      if (o && !o.code_url && o.status === 'pending') {
        setTimeout(() => fulfillOrder(db, orderNo), 5000)
      }
    }, 3200)

    const code_url = null
    const qr_url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=`
    res.json({
      orderNo, plan, orderId,
      amount: plan.price,
      payInfo: {
        method: 'wxpay',
        tip: '请用微信扫描下方二维码完成支付（或稍后等待演示模式自动到账）',
        qr_url,
        code_url
      }
    })
  } else {
    setTimeout(() => fulfillOrder(db, orderNo), 5000)
    res.json({
      orderNo, plan, orderId,
      amount: plan.price,
      payInfo: { method: 'demo', tip: '演示模式：5秒后订单自动支付成功并开通权限。' }
    })
  }
})

function fulfillOrder(db, orderNo) {
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo)
  if (!order || order.status === 'paid') return
  const plan = PLANS.find(p => p.id === order.plan_id)
  if (!plan) return
  const now = Date.now()
  db.prepare("UPDATE orders SET status='paid', paid_at=?, pay_method=COALESCE(pay_method, 'demo') WHERE id=?").run(now, order.id)
  if (plan.days > 0) {
    const user = db.prepare('SELECT is_vip, vip_expire_at FROM users WHERE id = ?').get(order.user_id)
    const base = (user.is_vip && user.vip_expire_at > now) ? user.vip_expire_at : now
    const expire = base + plan.days * 86400000
    db.prepare('UPDATE users SET is_vip = 1, vip_expire_at = ?, ai_credits = ai_credits + ?, updated_at = ? WHERE id = ?')
      .run(expire, plan.credits || 0, now, order.user_id)
  } else if (plan.credits > 0) {
    db.prepare('UPDATE users SET ai_credits = ai_credits + ?, updated_at = ? WHERE id = ?')
      .run(plan.credits, now, order.user_id)
  }
  console.log(`[order] ${orderNo} 已到账，uid=${order.user_id}`)
}

router.post('/wxpay-notify', express.raw({ type: 'application/json' }), async (req, res) => {
  const db = req.db
  let pay
  try { pay = require('../config/pay') } catch (e) {
    console.error('[wxpay] load pay.js failed:', e.message)
    return res.json({ code: 'FAIL', message: '支付模块加载失败' })
  }
  try {
    const bodyStr = req.body.toString()
    let body
    try { body = JSON.parse(bodyStr) } catch { body = {} }

    const verified = pay.verifyWxpaySignature(req.headers, bodyStr)
    if (!verified) {
      console.error('[wxpay] 回调签名验证失败')
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

    const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(out_trade_no)
    if (!order) {
      console.error('[wxpay] 回调订单不存在：', out_trade_no)
      return res.json({ code: 'FAIL', message: '订单不存在' })
    }

    if (order.status === 'paid') {
      return res.json({ code: 'SUCCESS', message: '成功' })
    }

    if (transaction_id) {
      db.prepare("UPDATE orders SET transaction_id = ? WHERE order_no = ?").run(transaction_id, out_trade_no)
    }

    fulfillOrder(db, out_trade_no)
    console.log(`[wxpay] Native 支付成功，订单 ${out_trade_no} 已到账`)
    res.json({ code: 'SUCCESS', message: '成功' })
  } catch (err) {
    console.error('[wxpay] 回调处理异常：', err.message)
    res.json({ code: 'FAIL', message: err.message })
  }
})

router.get('/order/:no', (req, res) => {
  const order = req.db.prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ?').get(req.params.no, req.user.id)
  if (!order) return res.status(404).json({ error: '订单不存在' })
  res.json({ order })
})

router.get('/orders', (req, res) => {
  const list = req.db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id)
  res.json({ list })
})

module.exports = router
