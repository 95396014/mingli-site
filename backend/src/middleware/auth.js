const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, is_admin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn: '30d' }
  )
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: '未登录' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const db = req.db
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub)
    if (!user) return res.status(401).json({ error: '用户不存在' })
    const today = new Date().toISOString().slice(0, 10)
    if (user.free_daily_date !== today) {
      db.prepare('UPDATE users SET free_daily_used = 0, free_daily_date = ? WHERE id = ?').run(today, user.id)
      user.free_daily_used = 0
      user.free_daily_date = today
    }
    if (user.is_vip && user.vip_expire_at && user.vip_expire_at < Date.now()) {
      db.prepare('UPDATE users SET is_vip = 0, vip_expire_at = NULL WHERE id = ?').run(user.id)
      user.is_vip = 0
    }
    req.user = user
    next()
  } catch (e) {
    console.error('[auth]', e.message)
    return res.status(401).json({ error: '登录已过期' })
  }
}

function requireVip(req, res, next) {
  if (!req.user.is_vip && !req.user.is_admin) return res.status(403).json({ error: '需要会员权限' })
  next()
}
function requireAdmin(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: '需要管理员权限' })
  next()
}
function sanitizeUser(u) {
  const { password, ...rest } = u
  return rest
}

module.exports = { signToken, authMiddleware, requireVip, requireAdmin, sanitizeUser }
