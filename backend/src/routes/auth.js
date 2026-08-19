const express = require('express')
const bcrypt = require('bcryptjs')
const { signToken, sanitizeUser, authMiddleware } = require('../middleware/auth.js')

const router = express.Router()

router.post('/register', async (req, res) => {
  const { username, password, nickname, phone } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' })
  if (username.length < 3) return res.status(400).json({ error: '用户名至少3位' })
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' })
  const db = req.db
  const exist = await db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exist) return res.status(400).json({ error: '用户名已存在' })
  const now = Date.now()
  const hash = bcrypt.hashSync(password, 10)
  const info = await db.prepare(`INSERT INTO users (username,password,nickname,phone,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
    .run(username, hash, nickname || username, phone || null, now, now)
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

module.exports = router
