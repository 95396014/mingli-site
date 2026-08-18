// 统一给所有请求挂 db 对象，避免每个路由单独 await
const { getDB, initDB } = require('../models/init.js')

module.exports = async function dbMiddleware(req, res, next) {
  try {
    req.db = req.app.locals.db || (req.app.locals.db = await getDB() || await initDB())
    next()
  } catch (e) {
    console.error('[db-middleware] err', e)
    res.status(500).json({ error: '数据库初始化失败' })
  }
}
