// SQLite + sql.js 初始化（数据文件存 data/mingli.db，配合 Railway Volume 挂载可持久化）
const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

let _db = null
// Railway Volume 默认挂载在 /data；未挂载时 fallback 到 src/data 本地目录
const DB_DIR = process.env.DB_DIR || (require('fs').existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'))
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'mingli.db')

function ensureDir() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true })
    }
  } catch (e) { console.warn('[db] 无法创建目录:', e.message) }
}

function getDB() { return _db }

function save() {
  if (!_db) return
  try {
    ensureDir()
    const data = _db.export()
    const buf = Buffer.from(data)
    fs.writeFileSync(DB_PATH, buf)
  } catch (e) {
    console.error('[db] 保存数据库失败，可能 Volume 未挂载或路径不可写（重启后会丢失！）:', e.message)
  }
}

async function initDB() {
  if (_db) return _db

  ensureDir()
  const SQL = await initSqlJs()

  // 如果已存在数据库文件则读取
  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH)
      _db = new SQL.Database(fileBuffer)
      console.log(`[db] 已从文件加载数据库：${DB_PATH}`)
    } catch (e) {
      console.error('[db] 加载数据库文件失败，重建：', e.message)
      _db = new SQL.Database()
    }
  } else {
    _db = new SQL.Database()
    console.log('[db] 创建新数据库')
  }

  // 自动持久化：每 3 秒或进程退出时保存
  let pendingSave = false
  const originalRun = _db.run.bind(_db)
  _db.run = (...args) => {
    const r = originalRun(...args)
    if (!pendingSave) {
      pendingSave = true
      setTimeout(() => { pendingSave = false; save() }, 3000)
    }
    return r
  }

  const prepareOrig = _db.prepare.bind(_db)
  _db.prepare = function(sql) {
    const stmt = prepareOrig(sql)
    const runOrig = stmt.run.bind(stmt)
    stmt.run = function(...args) {
      const r = runOrig(...args)
      if (!pendingSave) {
        pendingSave = true
        setTimeout(() => { pendingSave = false; save() }, 3000)
      }
      return r
    }
    return stmt
  }

  process.on('SIGTERM', () => { try { save() } catch(e){} process.exit(0) })
  process.on('SIGINT',  () => { try { save() } catch(e){} process.exit(0) })
  process.on('beforeExit', () => { try { save() } catch(e){} })

  await ensureSchema()
  return _db
}

async function ensureSchema() {
  _db.run(`CREATE TABLE IF NOT EXISTS users (
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
  _db.run(`CREATE TABLE IF NOT EXISTS orders (
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
  _db.run(`CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    prompt TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`)

  // 迁移补列
  try { _db.run('ALTER TABLE orders ADD COLUMN transaction_id TEXT') } catch (e) { /* 列已存在 */ }
  try { _db.run('ALTER TABLE orders ADD COLUMN code_url TEXT') } catch (e) { /* 列已存在 */ }
  try { _db.run('ALTER TABLE orders ADD COLUMN updated_at INTEGER') } catch (e) { /* 列已存在 */ }

  // 初始化管理员
  const adminName = process.env.ADMIN_USERNAME
  const adminPwd = process.env.ADMIN_PASSWORD
  if (adminName && adminPwd) {
    const exist = _db.prepare('SELECT id FROM users WHERE username = ?').get(adminName)
    const now = Date.now()
    const hash = bcrypt.hashSync(adminPwd, 10)
    if (!exist) {
      _db.prepare(`INSERT INTO users (username,password,nickname,is_vip,is_admin,ai_credits,created_at,updated_at) VALUES (?,?,?,1,1,9999,?,?)`).run(adminName, hash, '超级管理员', now, now)
      console.log(`[init] 管理员账号已创建: ${adminName}`)
    } else {
      _db.prepare(`UPDATE users SET password=?, is_admin=1, is_vip=1, ai_credits=9999, nickname='超级管理员', updated_at=? WHERE username=?`).run(hash, now, adminName)
      console.log(`[init] 管理员账号已同步: ${adminName}`)
    }
  } else {
    // 安全降级：检测旧默认 admin/admin123
    const row = _db.prepare('SELECT id, username, password, is_admin FROM users WHERE username = ?').get('admin')
    if (row && bcrypt.compareSync('admin123', row.password)) {
      const now = Date.now()
      _db.prepare('UPDATE users SET is_admin=0, is_vip=0, ai_credits=3, updated_at=? WHERE id=?').run(now, row.id)
      console.log('[init-security] 检测到旧默认 admin/admin123，已降级')
    }
  }

  save()
  console.log('[db] SQLite 数据库初始化完成，存储位置：', DB_PATH)
}

module.exports = { initDB, getDB, save, DB_PATH, DB_DIR }
