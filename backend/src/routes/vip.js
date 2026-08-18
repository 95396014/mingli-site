const express = require('express')
const { v4: uuid } = require('uuid')

const router = express.Router()

const PLANS = [
  { id: 'month', name: '月度会员', price: 266, days: 30, credits: 0, desc: '每日 50 次 AI 深度解读 · 全功能开放' },
  { id: 'quarter', name: '季度会员', price: 688, days: 90, credits: 200, desc: '每日 50 次 AI 深度解读 · 赠 200 次额外额度' },
  { id: 'year', name: '年度会员', price: 1888, days: 365, credits: 500, desc: '每日 50 次 AI 深度解读 · 赠 500 次额外额度 · 优先客服' },
  { id: 'per_use', name: '单次 AI 解读', price: 98, days: 0, credits: 1, desc: '无需会员，即时到账，永久有效' },
]
module.exports.PLANS = PLANS

router.get('/plans', (req, res) => {
  res.json({ plans: PLANS })
})

router.post('/order/create', (req, res) => {
  const db = req.db
  const { planId } = req.body || {}
  const plan = PLANS.find(p => p.id === planId)
  if (!plan) return res.status(400).json({ error: '套餐不存在' })
  const now = Date.now()
  const orderNo = 'ML' + now.toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  db.prepare(`INSERT INTO orders (order_no,user_id,plan_id,plan_name,amount,status,created_at) VALUES (?,?,?,?,?,'pending',?)`)
    .run(orderNo, req.user.id, plan.id, plan.name, Math.round(plan.price * 100), now)
  // 演示环境自动到账
  setTimeout(() => fulfillOrder(db, orderNo), 5000)
  res.json({
    orderNo, plan,
    amount: plan.price,
    payInfo: { method: 'demo', tip: '演示模式：5秒后订单自动支付成功并开通权限。正式上线请接入微信/支付宝。' }
  })
})

function fulfillOrder(db, orderNo) {
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo)
  if (!order || order.status === 'paid') return
  const plan = PLANS.find(p => p.id === order.plan_id)
  if (!plan) return
  const now = Date.now()
  db.prepare("UPDATE orders SET status='paid', paid_at=?, pay_method='demo' WHERE id=?").run(now, order.id)
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
