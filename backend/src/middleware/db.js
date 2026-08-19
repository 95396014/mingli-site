// 统一给所有请求挂 db 对象。initDB 返回 Promise，Turso 异步/SQLite 同步都兼容。
const { initDB } = require('../models/init.js')

module.exports = async function dbMiddleware(req, res, next) {
  try {
    if (!req.app.locals.db) {
      req.app.locals.db = await initDB()
    }
    req.db = req.app.locals.db
    next()
  } catch (e) {
    console.error('[db-middleware] err:', e.message)
    res.status(500).json({ error: '数据库初始化失败: ' + e.message })
  }
}
