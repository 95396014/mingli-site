const express = require('express')
const bcrypt = require('bcryptjs')
const { signToken, sanitizeUser, authMiddleware } = require('../middleware/auth.js')

const router = express.Router()

router.post('/register', async (req, res) => {
  const { username, password, nickname, phone } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' })
  if (username.length < 3) return res.status(400).json({ error: '用户名至少3位' })
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' })
  // 手机号必填：国内手机号 11 位，1 开头
  if (!phone) return res.status(400).json({ error: '手机号必填，方便后续联系' })
  if (!/^1[3-9]\d{9}$/.test(String(phone).trim())) return res.status(400).json({ error: '手机号格式不正确（应为 11 位 1 开头）' })
  const db = req.db
  const exist = await db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exist) return res.status(400).json({ error: '用户名已存在' })
  const existPhone = await db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)
  if (existPhone) return res.status(400).json({ error: '该手机号已被注册' })
  const now = Date.now()
  const hash = bcrypt.hashSync(password, 10)
  const info = await db.prepare(`INSERT INTO users (username,password,nickname,phone,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
    .run(username, hash, nickname || username, phone.trim(), now, now)
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
  res.json({ user: sanitizeUser(user), token: signToken(user) })
})

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' })
  const db = req.db
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user) return res.status(400).json({ error: '用户名或密码错误' })
  const ok = bcrypt.compareSync(password, user.password)
  if (!ok) return res.status(400).json({ error: '用户名或密码错误' })
  await db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(Date.now(), user.id)
  res.json({ user: sanitizeUser(user), token: signToken(user) })
})

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: sanitizeUser(req.user) })
})

/**
 * 当前登录用户修改自己的资料：昵称、手机号、密码（密码需要验证旧密码）
 */
router.post('/update-profile', authMiddleware, async (req, res) => {
  const db = req.db
  const { nickname, phone, oldPassword, newPassword } = req.body || {}
  const id = req.user.id
  const now = Date.now()
  const fields = []
  const args = []

  if (typeof nickname !== 'undefined') {
    const nick = String(nickname || '').trim() || req.user.username
    if (nick.length > 24) return res.status(400).json({ error: '昵称最长 24 字' })
    fields.push('nickname=?'); args.push(nick)
  }

  if (typeof phone !== 'undefined' && phone !== null) {
    const p = String(phone || '').trim()
    if (!p) return res.status(400).json({ error: '手机号不能为空' })
    if (!/^1[3-9]\d{9}$/.test(p)) return res.status(400).json({ error: '手机号格式不正确（应为 11 位 1 开头）' })
    // 手机号唯一性：排除自己
    const dup = await db.prepare('SELECT id FROM users WHERE phone = ? AND id <> ?').get(p, id)
    if (dup) return res.status(400).json({ error: '该手机号已被其他账号使用' })
    fields.push('phone=?'); args.push(p)
  }

  if (typeof newPassword !== 'undefined' && newPassword !== '') {
    if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少 6 位' })
    // 验证旧密码
    const u = await db.prepare('SELECT password FROM users WHERE id = ?').get(id)
    if (!u || !bcrypt.compareSync(oldPassword || '', u.password || '')) {
      return res.status(400).json({ error: '原密码错误' })
    }
    fields.push('password=?'); args.push(bcrypt.hashSync(newPassword, 10))
  }

  if (!fields.length) return res.json({ ok: true, user: sanitizeUser(req.user), updated: 0 })

  fields.push('updated_at=?'); args.push(now, id)
  await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...args)

  const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  res.json({ ok: true, user: sanitizeUser(updated), updated: 1 })
})

module.exports = router
