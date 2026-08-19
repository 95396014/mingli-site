// Turso (libSQL) 云端数据库 + 本地 SQLite 双重模式
// - 若设置了 TURSO_URL 环境变量 => 用 Turso，数据永久云端保存（推荐！）
// - 否则 => 用本地 sql.js，数据存文件（适合开发模式，部署后易丢失）
const bcrypt = require('bcryptjs')

// ==================== 模式检测 ====================
const TURSO_URL = process.env.TURSO_URL || process.env.DATABASE_URL
const USE_TURSO = !!TURSO_URL
const TURSO_TOKEN = process.env.TURSO_TOKEN || process.env.DATABASE_TOKEN

let _dbPromise = null
let _dbSync = null

// ==================== Turso 异步版包装 ====================
function wrapTurso(client) {
  return {
    _async: true,
    prepare(sql) {
      return {
        async run(...args) {
          const params = normalizeArgs(args)
          const r = await client.execute({ sql, args: params })
          return {
            lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
            changes: r.rowsAffected ?? 1
          }
        },
        async get(...args) {
          const params = normalizeArgs(args)
          const r = await client.execute({ sql, args: params })
          return r.rows[0] || undefined
        },
        async all(...args) {
          const params = normalizeArgs(args)
          const r = await client.execute({ sql, args: params })
          return r.rows
        }
      }
    },
    async run(sql, ...args) {
      await client.execute({ sql, args: normalizeArgs(args) })
    }
  }
}

function normalizeArgs(args) {
  if (args.length === 0) return []
  if (args.length === 1 && Array.isArray(args[0])) return args[0]
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Buffer.isBuffer(args[0])) return args[0]
  return Array.from(args)
}

// ==================== sql.js 同步版包装（带持久化） ====================
let saveTimer = null
function scheduleSave(saveFn) {
  if (saveTimer) return
  saveTimer = setTimeout(() => { saveTimer = null; saveFn() }, 3000)
}

async function initSQLiteLocal() {
  const initSqlJs = require('sql.js')
  const fs = require('fs')
  const path = require('path')
  const DB_DIR = process.env.DB_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'))
  const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'mingli.db')

  try { if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true }) } catch(e) {}

  const SQL = await initSqlJs()
  let db
  if (fs.existsSync(DB_PATH)) {
    try { db = new SQL.Database(fs.readFileSync(DB_PATH)) }
    catch(e) { console.warn('[db-local] 文件损坏，重建:', e.message); db = new SQL.Database() }
  } else {
    db = new SQL.Database()
  }

  const save = () => {
    try {
      const buf = Buffer.from(db.export())
      fs.writeFileSync(DB_PATH, buf)
    } catch (e) {
      console.error('[db-local] 保存失败（未挂载Volume时重启会丢失！）:', e.message)
    }
  }

  const runOrig = db.run.bind(db)
  db.run = (...args) => { const r = runOrig(...args); scheduleSave(save); return r }
  const prepOrig = db.prepare.bind(db)
  db.prepare = function(sql) {
    const stmt = prepOrig(sql)
    const runSt = stmt.run.bind(stmt)
    stmt.run = (...a) => { const r = runSt(...a); scheduleSave(save); return r }
    return stmt
  }

  process.on('SIGTERM', () => { try { save() } catch {} process.exit(0) })
  process.on('SIGINT',  () => { try { save() } catch {} process.exit(0) })
  process.on('beforeExit', () => { try { save() } catch {} })

  return { db, save, DB_PATH }
}

// ==================== 初始化入口 ====================
async function initDB() {
  if (USE_TURSO) {
    if (_dbPromise) return _dbPromise
    _dbPromise = (async () => {
      const { createClient } = require('@libsql/client')
      console.log('[db] 使用 Turso 云端数据库:', TURSO_URL.replace(/\/\/.*@/, '//***@'))
      const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
      const wdb = wrapTurso(client)
      await ensureSchema(wdb)
      await ensureAdmin(wdb)
      console.log('[db] ✅ Turso 初始化完成，数据永久保存')
      return wdb
    })()
    return _dbPromise
  } else {
    if (_dbSync) return _dbSync
    const { db, save, DB_PATH } = await initSQLiteLocal()
    _dbSync = db
    await ensureSchema(db)
    await ensureAdmin(db)
    save()
    console.log('[db] ⚠️  使用本地 SQLite（非持久化），存储位置:', DB_PATH)
    console.log('[db] 建议配置 TURSO_URL/TURSO_TOKEN 切换到云端持久化数据库，避免重新部署丢失数据。')
    return _dbSync
  }
}

function getDB() {
  return USE_TURSO ? null : _dbSync
}

// ==================== 通用 Schema & Admin ====================
async function ensureSchema(db) {
  const async = !!db._async
  const exec = (sql) => async ? db.run(sql) : db.run(sql)

  await exec(`CREATE TABLE IF NOT EXISTS users (
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
  await exec(`CREATE TABLE IF NOT EXISTS orders (
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
  await exec(`CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    prompt TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`)

  const safeAlter = async (sql) => {
    try { await exec(sql) } catch (_) {}
  }
  await safeAlter('ALTER TABLE orders ADD COLUMN transaction_id TEXT')
  await safeAlter('ALTER TABLE orders ADD COLUMN code_url TEXT')
  await safeAlter('ALTER TABLE orders ADD COLUMN updated_at INTEGER')
}

async function ensureAdmin(db) {
  const async = !!db._async
  const prep = (sql) => db.prepare(sql)
  const adminName = process.env.ADMIN_USERNAME
  const adminPwd = process.env.ADMIN_PASSWORD

  if (adminName && adminPwd) {
    const exist = async
      ? await prep('SELECT id FROM users WHERE username = ?').get(adminName)
      : prep('SELECT id FROM users WHERE username = ?').get(adminName)
    const now = Date.now()
    const hash = bcrypt.hashSync(adminPwd, 10)
    if (!exist) {
      await prep(`INSERT INTO users (username,password,nickname,is_vip,is_admin,ai_credits,created_at,updated_at) VALUES (?,?,?,1,1,9999,?,?)`)
        .run(adminName, hash, '超级管理员', now, now)
      console.log(`[init] 管理员账号已创建: ${adminName}`)
    } else {
      await prep(`UPDATE users SET password=?, is_admin=1, is_vip=1, ai_credits=9999, nickname='超级管理员', updated_at=? WHERE username=?`)
        .run(hash, now, adminName)
      console.log(`[init] 管理员账号已同步: ${adminName}`)
    }
  } else {
    const row = async
      ? await prep('SELECT id, username, password, is_admin FROM users WHERE username = ?').get('admin')
      : prep('SELECT id, username, password, is_admin FROM users WHERE username = ?').get('admin')
    if (row && bcrypt.compareSync('admin123', row.password)) {
      const now = Date.now()
      await prep('UPDATE users SET is_admin=0, is_vip=0, ai_credits=3, updated_at=? WHERE id=?').run(now, row.id)
      console.log('[init-security] 检测到旧默认 admin/admin123，已降级')
    }
  }
}

module.exports = { initDB, getDB, USE_TURSO }
