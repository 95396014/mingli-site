const express = require('express')
const { sanitizeUser } = require('../middleware/auth.js')

const router = express.Router()

router.get('/stats', (req, res) => {
  const db = req.db
  const getC = (sql, ...a) => db.prepare(sql).get(...a)?.c || 0
  const users = getC('SELECT COUNT(*) AS c FROM users')
  const vip = getC('SELECT COUNT(*) AS c FROM users WHERE is_vip = 1')
  const orders = getC('SELECT COUNT(*) AS c FROM orders')
  const revenue = getC("SELECT COALESCE(SUM(amount),0) AS c FROM orders WHERE status='paid'")
  const aiCalls = getC('SELECT COUNT(*) AS c FROM ai_logs')
  res.json({ stats: { users, vip, orders, revenue, aiCalls } })
})

router.get('/users', (req, res) => {
  const { page = 1, size = 20, keyword = '' } = req.query
  const db = req.db
  const off = (page - 1) * size
  let list, total
  if (keyword) {
    const kw = `%${keyword}%`
    list = db.prepare(`SELECT * FROM users WHERE username LIKE ? OR nickname LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?`).all(kw, kw, +size, +off)
    total = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE username LIKE ? OR nickname LIKE ?`).get(kw, kw).c
  } else {
    list = db.prepare(`SELECT * FROM users ORDER BY id DESC LIMIT ? OFFSET ?`).all(+size, +off)
    total = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c
  }
  res.json({ list: list.map(sanitizeUser), total, page: +page, size: +size })
})

router.post('/users/:id/toggle-vip', (req, res) => {
  const db = req.db
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(+req.params.id)
  if (!u) return res.status(404).json({ error: '用户不存在' })
  const nextVip = u.is_vip ? 0 : 1
  const expire = nextVip ? Date.now() + 30 * 86400000 : null
  db.prepare('UPDATE users SET is_vip = ?, vip_expire_at = ?, updated_at = ? WHERE id = ?')
    .run(nextVip, expire, Date.now(), u.id)
  res.json({ ok: true })
})

router.post('/users/:id/grant-credits', (req, res) => {
  const { credits = 0 } = req.body
  req.db.prepare('UPDATE users SET ai_credits = ai_credits + ?, updated_at = ? WHERE id = ?')
    .run(+credits, Date.now(), +req.params.id)
  res.json({ ok: true })
})

router.get('/orders', (req, res) => {
  const db = req.db
  const { page = 1, size = 20, status = '' } = req.query
  const off = (page - 1) * size
  let list, total
  if (status) {
    list = db.prepare(`SELECT orders.*, users.username FROM orders LEFT JOIN users ON users.id = orders.user_id WHERE orders.status = ? ORDER BY orders.id DESC LIMIT ? OFFSET ?`).all(status, +size, +off)
    total = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE status = ?`).get(status).c
  } else {
    list = db.prepare(`SELECT orders.*, users.username FROM orders LEFT JOIN users ON users.id = orders.user_id ORDER BY orders.id DESC LIMIT ? OFFSET ?`).all(+size, +off)
    total = db.prepare(`SELECT COUNT(*) AS c FROM orders`).get().c
  }
  res.json({ list, total, page: +page, size: +size })
})

router.get('/ai-logs', (req, res) => {
  const db = req.db
  const { page = 1, size = 20 } = req.query
  const off = (page - 1) * size
  const list = db.prepare(`SELECT ai_logs.*, users.username FROM ai_logs LEFT JOIN users ON users.id = ai_logs.user_id ORDER BY ai_logs.id DESC LIMIT ? OFFSET ?`).all(+size, +off)
  const total = db.prepare('SELECT COUNT(*) AS c FROM ai_logs').get().c
  res.json({ list, total, page: +page, size: +size })
})

module.exports = router
