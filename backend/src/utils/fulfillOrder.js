/**
 * 订单履约工具：给任何支付通道的成功回调共用
 * 传入 db（已初始化的统一 db 接口）和 orderNo，幂等地完成订单 → 发放会员/额度
 */
const { PLANS } = require('../routes/vip.js')

async function fulfillOrder(db, orderNo) {
  const order = await db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo)
  if (!order) {
    console.error('[fulfill] 订单不存在：', orderNo)
    return { ok: false, reason: 'order_not_found' }
  }
  if (order.status === 'paid') {
    console.log(`[fulfill] 订单 ${orderNo} 已经支付过，跳过`)
    return { ok: true, alreadyPaid: true }
  }
  const plan = PLANS.find(p => p.id === order.plan_id)
  if (!plan) return { ok: false, reason: 'plan_not_found' }

  const now = Date.now()
  await db.prepare("UPDATE orders SET status='paid', paid_at=?, pay_method=COALESCE(pay_method, 'unknown'), updated_at=? WHERE id=?")
    .run(now, now, order.id)

  if (plan.days > 0) {
    const user = await db.prepare('SELECT is_vip, vip_expire_at FROM users WHERE id = ?').get(order.user_id)
    const base = (user.is_vip && user.vip_expire_at && user.vip_expire_at > now) ? user.vip_expire_at : now
    const expire = base + plan.days * 86400000
    await db.prepare('UPDATE users SET is_vip = 1, vip_expire_at = ?, ai_credits = ai_credits + ?, updated_at = ? WHERE id = ?')
      .run(expire, plan.credits || 0, now, order.user_id)
  } else if (plan.credits > 0) {
    await db.prepare('UPDATE users SET ai_credits = ai_credits + ?, updated_at = ? WHERE id = ?')
      .run(plan.credits, now, order.user_id)
  }
  console.log(`[fulfill] ✅ 订单 ${orderNo} 已到账，uid=${order.user_id}`)
  return { ok: true }
}

module.exports = fulfillOrder
