// 统一给所有请求挂 db 对象。initDB 内部失败会自动重试、永不 reject，
// 但数据库长时间不可用时请求不能无限挂起，所以这里最多等 6 秒，超时给 503。
const { initDB } = require('../models/init.js')

const READY_TIMEOUT_MS = 6000

function waitWithTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('DB_NOT_READY')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

module.exports = async function dbMiddleware(req, res, next) {
  try {
    if (!req.app.locals.db) {
      req.app.locals.db = await waitWithTimeout(initDB(), READY_TIMEOUT_MS)
    }
    req.db = req.app.locals.db
    next()
  } catch (e) {
    if (e && e.message === 'DB_NOT_READY') {
      return res.status(503).json({ error: '数据库暂时不可用，请稍后重试' })
    }
    console.error('[db-middleware] err:', e.message)
    res.status(500).json({ error: '数据库初始化失败: ' + e.message })
  }
}
