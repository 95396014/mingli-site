const express = require('express')
const bcrypt = require('bcryptjs')
const { sanitizeUser } = require('../middleware/auth.js')

const router = express.Router()

router.get('/stats', (req, res) => {
  const db = req.db
  const getC = (sql, ...a) => db.prepare(sql).get(...a)?.c || 0
  const users = getC('SELECT COUNT(*) AS c FROM users')
  const vip = getC('SELECT COUNT(*) AS c FROM users WHERE is_vip = 1')
  const admins = getC('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1')
  const orders = getC('SELECT COUNT(*) AS c FROM orders')
  const revenue = getC("SELECT COALESCE(SUM(amount),0) AS c FROM orders WHERE status='paid'")
  const aiCalls = getC('SELECT COUNT(*) AS c FROM ai_logs')
  res.json({ stats: { users, vip, admins, orders, revenue, aiCalls } })
})

router.get('/users', (req, res) => {
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
  const list = db.prepare(`SELECT * FROM users${whereSQL} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, +size, +off)
  const total = db.prepare(`SELECT COUNT(*) AS c FROM users${whereSQL}`).get(...args).c
  res.json({ list: list.map(sanitizeUser), total, page: +page, size: +size })
})

// 1) 添加用户（可直接设置成管理员/VIP/默认额度）
router.post('/users/create', (req, res) => {
  const { username, password, nickname, phone, is_vip = 0, is_admin = 0, ai_credits = 0, vip_days = 0 } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: '用户名与密码必填' })
  if (username.length < 3) return res.status(400).json({ error: '用户名至少 3 位' })
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' })
  const db = req.db
  const exist = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exist) return res.status(400).json({ error: '用户名已存在' })
  const now = Date.now()
  const hash = bcrypt.hashSync(password, 10)
  const expire = (+is_vip && +vip_days > 0) ? now + +vip_days * 86400000 : (+is_vip ? now + 30*86400000 : null)
  const info = db.prepare(`INSERT INTO users (username,password,nickname,phone,is_vip,vip_expire_at,is_admin,ai_credits,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(username, hash, nickname || username, phone || null, +is_vip?1:0, expire, +is_admin?1:0, +ai_credits||0, now, now)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
  res.json({ ok: true, user: sanitizeUser(user) })
})

// 2) 管理员编辑指定用户：昵称/手机/额度/VIP到期/管理员角色/密码
router.post('/users/:id/update', (req, res) => {
  const id = +req.params.id
  const db = req.db
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
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
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...args)
  res.json({ ok: true, user: sanitizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) })
})

// 3) 管理员直接给用户开会员（可自定义天数、是否叠加、赠送多少额度）
router.post('/users/:id/add-vip', (req, res) => {
  const id = +req.params.id
  const db = req.db
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!u) return res.status(404).json({ error: '用户不存在' })
  const { days = 30, credits = 0, stack = 1 } = req.body || {}
  const now = Date.now()
  const base = (+stack && u.is_vip && u.vip_expire_at && u.vip_expire_at > now) ? u.vip_expire_at : now
  const expire = base + Math.max(0, +days) * 86400000
  db.prepare('UPDATE users SET is_vip=1, vip_expire_at=?, ai_credits=ai_credits+?, updated_at=? WHERE id=?')
    .run(expire, +credits||0, now, id)
  res.json({ ok: true, vip_expire_at: expire })
})

// 4) 删除/取消会员（2 种语义分开：会员到期归零 vs 删除用户）
router.post('/users/:id/remove-vip', (req, res) => {
  const id = +req.params.id
  req.db.prepare('UPDATE users SET is_vip=0, vip_expire_at=NULL, updated_at=? WHERE id=?').run(Date.now(), id)
  res.json({ ok: true })
})

router.delete('/users/:id', (req, res) => {
  const id = +req.params.id
  if (id === req.user.id) return res.status(400).json({ error: '不能删除当前登录的管理员自己' })
  const db = req.db
  const u = db.prepare('SELECT username, is_admin FROM users WHERE id = ?').get(id)
  if (!u) return res.status(404).json({ error: '用户不存在' })
  // 保护：防止误删最后一名管理员
  if (u.is_admin) {
    const left = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND id <> ?').get(id).c
    if (left === 0) return res.status(400).json({ error: '这是最后一位管理员，为避免锁死后台，请先新增另一名管理员再删除。' })
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  db.prepare('DELETE FROM orders WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM ai_logs WHERE user_id = ?').run(id)
  res.json({ ok: true, removed: { id, username: u.username } })
})

// 保留原有 grant-credits / toggle-vip（向后兼容），功能更细的接口已在上面
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
