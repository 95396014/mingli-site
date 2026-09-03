const express = require('express')
const bcrypt = require('bcryptjs')
const { sanitizeUser } = require('../middleware/auth.js')

const router = express.Router()

router.get('/stats', async (req, res) => {
  const db = req.db
  const users = (await db.prepare('SELECT COUNT(*) AS c FROM users').get())?.c || 0
  const vip = (await db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_vip = 1').get())?.c || 0
  const admins = (await db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get())?.c || 0
  const orders = (await db.prepare('SELECT COUNT(*) AS c FROM orders').get())?.c || 0
  const revenue = (await db.prepare("SELECT COALESCE(SUM(amount),0) AS c FROM orders WHERE status='paid'").get())?.c || 0
  const aiCalls = (await db.prepare('SELECT COUNT(*) AS c FROM ai_logs').get())?.c || 0
  res.json({ stats: { users, vip, admins, orders, revenue, aiCalls } })
})

router.get('/users', async (req, res) => {
  const { page = 1, size = 20, keyword = '', role = '' } = req.query
  const db = req.db
  const off = (page - 1) * size
  const where = []
  const args = []
  if (keyword) {
    const kw = `%${keyword}%`
    where.push('(username LIKE ? OR nickname LIKE ? OR phone LIKE ?)')
    args.push(kw, kw, kw)
  }
  if (role === 'admin') where.push('is_admin = 1')
  if (role === 'vip') where.push('is_vip = 1')
  if (role === 'normal') where.push('is_admin = 0 AND is_vip = 0')
  const whereSQL = where.length ? ' WHERE ' + where.join(' AND ') : ''
  const list = await db.prepare(`SELECT * FROM users${whereSQL} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, +size, +off)
  const total = (await db.prepare(`SELECT COUNT(*) AS c FROM users${whereSQL}`).get(...args)).c
  res.json({ list: list.map(sanitizeUser), total, page: +page, size: +size })
})

// 1) 添加用户
router.post('/users/create', async (req, res) => {
  const { username, password, nickname, phone, is_vip = 0, is_admin = 0, ai_credits = 0, vip_days = 0 } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: '用户名与密码必填' })
  if (username.length < 3) return res.status(400).json({ error: '用户名至少 3 位' })
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' })
  const db = req.db
  const exist = await db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exist) return res.status(400).json({ error: '用户名已存在' })
  const now = Date.now()
  const hash = bcrypt.hashSync(password, 10)
  const expire = (+is_vip && +vip_days > 0) ? now + +vip_days * 86400000 : (+is_vip ? now + 30*86400000 : null)
  const info = await db.prepare(`INSERT INTO users (username,password,nickname,phone,is_vip,vip_expire_at,is_admin,ai_credits,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(username, hash, nickname || username, phone || null, +is_vip?1:0, expire, +is_admin?1:0, +ai_credits||0, now, now)
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
  res.json({ ok: true, user: sanitizeUser(user) })
})

// 2) 编辑用户
router.post('/users/:id/update', async (req, res) => {
  const id = +req.params.id
  const db = req.db
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) return res.status(404).json({ error: '用户不存在' })
  const { nickname, phone, ai_credits, is_admin, is_vip, vip_expire_at, password } = req.body || {}
  const fields = []
  const args = []
  if (typeof nickname !== 'undefined') { fields.push('nickname=?'); args.push(nickname) }
  if (typeof phone !== 'undefined')    { fields.push('phone=?'); args.push(phone === '' ? null : phone) }
  if (typeof ai_credits !== 'undefined') { fields.push('ai_credits=?'); args.push(+ai_credits||0) }
  if (typeof is_admin !== 'undefined')   { fields.push('is_admin=?'); args.push(+is_admin?1:0) }
  if (typeof is_vip !== 'undefined')     { fields.push('is_vip=?');   args.push(+is_vip?1:0) }
  if (typeof vip_expire_at !== 'undefined') {
    fields.push('vip_expire_at=?')
    args.push(vip_expire_at ? +vip_expire_at : null)
  }
  if (password && password.length >= 6) {
    fields.push('password=?')
    args.push(bcrypt.hashSync(password, 10))
  }
  if (!fields.length) return res.json({ ok: true, updated: 0 })
  fields.push('updated_at=?'); args.push(Date.now())
  args.push(id)
  await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...args)
  res.json({ ok: true, user: sanitizeUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(id)) })
})

// 3) 加会员
router.post('/users/:id/add-vip', async (req, res) => {
  const id = +req.params.id
  const db = req.db
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!u) return res.status(404).json({ error: '用户不存在' })
  const { days = 30, credits = 0, stack = 1 } = req.body || {}
  const now = Date.now()
  const base = (+stack && u.is_vip && u.vip_expire_at && u.vip_expire_at > now) ? u.vip_expire_at : now
  const expire = base + Math.max(0, +days) * 86400000
  await db.prepare('UPDATE users SET is_vip=1, vip_expire_at=?, ai_credits=ai_credits+?, updated_at=? WHERE id=?')
    .run(expire, +credits||0, now, id)
  res.json({ ok: true, vip_expire_at: expire })
})

// 4) 取消会员
router.post('/users/:id/remove-vip', async (req, res) => {
  await req.db.prepare('UPDATE users SET is_vip=0, vip_expire_at=NULL, updated_at=? WHERE id=?').run(Date.now(), +req.params.id)
  res.json({ ok: true })
})

router.delete('/users/:id', async (req, res) => {
  const id = +req.params.id
  if (id === req.user.id) return res.status(400).json({ error: '不能删除当前登录的管理员自己' })
  const db = req.db
  const u = await db.prepare('SELECT username, is_admin FROM users WHERE id = ?').get(id)
  if (!u) return res.status(404).json({ error: '用户不存在' })
  if (u.is_admin) {
    const left = (await db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND id <> ?').get(id)).c
    if (left === 0) return res.status(400).json({ error: '这是最后一位管理员，为避免锁死后台，请先新增另一名管理员再删除。' })
  }
  await db.prepare('DELETE FROM users WHERE id = ?').run(id)
  await db.prepare('DELETE FROM orders WHERE user_id = ?').run(id)
  await db.prepare('DELETE FROM ai_logs WHERE user_id = ?').run(id)
  res.json({ ok: true, removed: { id, username: u.username } })
})

// 向后兼容
router.post('/users/:id/toggle-vip', async (req, res) => {
  const db = req.db
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').get(+req.params.id)
  if (!u) return res.status(404).json({ error: '用户不存在' })
  const nextVip = u.is_vip ? 0 : 1
  const expire = nextVip ? Date.now() + 30 * 86400000 : null
  await db.prepare('UPDATE users SET is_vip = ?, vip_expire_at = ?, updated_at = ? WHERE id = ?')
    .run(nextVip, expire, Date.now(), u.id)
  res.json({ ok: true })
})

router.post('/users/:id/grant-credits', async (req, res) => {
  const { credits = 0 } = req.body
  await req.db.prepare('UPDATE users SET ai_credits = ai_credits + ?, updated_at = ? WHERE id = ?')
    .run(+credits, Date.now(), +req.params.id)
  res.json({ ok: true })
})

router.get('/orders', async (req, res) => {
  const db = req.db
  const { page = 1, size = 20, status = '' } = req.query
  const off = (page - 1) * size
  let list, total
  if (status) {
    list = await db.prepare(`SELECT orders.*, users.username FROM orders LEFT JOIN users ON users.id = orders.user_id WHERE orders.status = ? ORDER BY orders.id DESC LIMIT ? OFFSET ?`).all(status, +size, +off)
    total = (await db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE status = ?`).get(status)).c
  } else {
    list = await db.prepare(`SELECT orders.*, users.username FROM orders LEFT JOIN users ON users.id = orders.user_id ORDER BY orders.id DESC LIMIT ? OFFSET ?`).all(+size, +off)
    total = (await db.prepare(`SELECT COUNT(*) AS c FROM orders`).get()).c
  }
  // PostgreSQL pg 驱动把 BIGINT 返回成字符串，前端 dayjs 会解析错误（导致 1791 年），这里统一转 Number
  const normalized = list.map(o => ({
    ...o,
    created_at: o.created_at != null ? Number(o.created_at) : null,
    updated_at: o.updated_at != null ? Number(o.updated_at) : null,
    paid_at:    o.paid_at    != null ? Number(o.paid_at)    : null,
  }))
  res.json({ list: normalized, total, page: +page, size: +size })
})

router.get('/ai-logs', async (req, res) => {
  const db = req.db
  const { page = 1, size = 20 } = req.query
  const off = (page - 1) * size
  const list = await db.prepare(`SELECT ai_logs.*, users.username FROM ai_logs LEFT JOIN users ON users.id = ai_logs.user_id ORDER BY ai_logs.id DESC LIMIT ? OFFSET ?`).all(+size, +off)
  const total = (await db.prepare('SELECT COUNT(*) AS c FROM ai_logs').get()).c
  // PostgreSQL 的 pg 驱动会把 BIGINT 作为字符串返回，前端 dayjs 解析会出错
  const normalized = list.map(l => ({
    ...l,
    created_at: l.created_at != null ? Number(l.created_at) : null
  }))
  res.json({ list: normalized, total, page: +page, size: +size })
})

module.exports = router
