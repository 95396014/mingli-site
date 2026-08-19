// Turso (libSQL) 数据库连接 — 数据存云端，重新部署不丢失
const { createClient } = require('@libsql/client')
const bcrypt = require('bcryptjs')

let _client = null
let dbPromise = null

function getDB() { return dbPromise }

function flattenArgs(args) {
  if (args.length === 0) return []
  if (args.length === 1 && Array.isArray(args[0])) return args[0]
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Buffer.isBuffer(args[0])) return args[0]
  return Array.from(args)
}

// 包装 Turso client，模拟 better-sqlite3 的 prepare().run/get/all API（异步版）
function wrapClient(client) {
  return {
    prepare(sql) {
      return {
        async run(...args) {
          const params = flattenArgs(args)
          const result = await client.execute({ sql, args: params })
          return {
            lastInsertRowid: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : null,
            changes: result.rowsAffected ?? 1
          }
        },
        async get(...args) {
          const params = flattenArgs(args)
          const result = await client.execute({ sql, args: params })
          return result.rows[0] || undefined
        },
        async all(...args) {
          const params = flattenArgs(args)
          const result = await client.execute({ sql, args: params })
          return result.rows
        }
      }
    },
    async run(sql, ...args) {
      const params = args.length ? flattenArgs(args) : []
      await client.execute({ sql, args: params })
    }
  }
}

function initDB() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const url = process.env.TURSO_URL || process.env.DATABASE_URL
      if (!url) {
        throw new Error('[db] 缺少 TURSO_URL 环境变量。请在 Railway Variables 中设置 Turso 数据库连接地址（libsql://xxx.turso.io）和 TURSO_TOKEN 认证令牌。')
      }
      const authToken = process.env.TURSO_TOKEN || process.env.DATABASE_TOKEN
      console.log('[db] 连接 Turso:', url.replace(/\/\/.*@/, '//***@'))
      _client = createClient({ url, authToken })

      // 建表
      await _client.execute(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nickname TEXT,
        phone TEXT,
        is_vip INTEGER DEFAULT 0,
        vip_expire_at INTEGER,
        is_admin INTEGER DEFAULT 0,
        ai_credits INTEGER DEFAULT 0,
        free_daily_used INTEGER DEFAULT 0,
        free_daily_date TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`)
      await _client.execute(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        plan_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        pay_method TEXT,
        transaction_id TEXT,
        code_url TEXT,
        paid_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )`)
      await _client.execute(`CREATE TABLE IF NOT EXISTS ai_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT,
        tokens_used INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )`)

      // 迁移：兼容旧数据库
      try { await _client.execute('ALTER TABLE orders ADD COLUMN transaction_id TEXT') } catch (e) { /* 已存在 */ }
      try { await _client.execute('ALTER TABLE orders ADD COLUMN code_url TEXT') } catch (e) { /* 已存在 */ }
      try { await _client.execute('ALTER TABLE orders ADD COLUMN updated_at INTEGER') } catch (e) { /* 已存在 */ }

      // 初始化管理员
      const adminName = process.env.ADMIN_USERNAME
      const adminPwd = process.env.ADMIN_PASSWORD
      if (adminName && adminPwd) {
        const exist = await _client.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [adminName] })
        const now = Date.now()
        const hash = bcrypt.hashSync(adminPwd, 10)
        if (exist.rows.length === 0) {
          await _client.execute({ sql: `INSERT INTO users (username,password,nickname,is_vip,is_admin,ai_credits,created_at,updated_at) VALUES (?,?,?,1,1,9999,?,?)`, args: [adminName, hash, '超级管理员', now, now] })
          console.log(`[init] 管理员账号已创建: ${adminName}`)
        } else {
          await _client.execute({ sql: `UPDATE users SET password=?, is_admin=1, is_vip=1, ai_credits=9999, nickname='超级管理员', updated_at=? WHERE username=?`, args: [hash, now, adminName] })
          console.log(`[init] 管理员账号已同步: ${adminName}`)
        }
      } else {
        // 安全降级：检测旧默认 admin/admin123
        const oldAdmin = await _client.execute({ sql: 'SELECT id, username, password, is_admin FROM users WHERE username = ?', args: ['admin'] })
        if (oldAdmin.rows.length > 0) {
          const row = oldAdmin.rows[0]
          const isOldDefault = bcrypt.compareSync('admin123', row.password)
          if (isOldDefault) {
            const now = Date.now()
            await _client.execute({ sql: 'UPDATE users SET is_admin=0, is_vip=0, ai_credits=3, updated_at=? WHERE id=?', args: [now, row.id] })
            console.log('[init-security] 检测到旧默认 admin/admin123，已降级')
          }
        }
      }

      console.log('[db] Turso 数据库初始化完成')
      return wrapClient(_client)
    })()
  }
  return dbPromise
}

module.exports = { initDB, getDB }
