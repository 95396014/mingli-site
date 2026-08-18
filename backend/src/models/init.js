// sql.js 同步 wrapper，模拟 better-sqlite3 API（prepare/get/run/all）
// 避免原生依赖编译失败问题，使用 WASM 版 SQLite，数据自动落盘
const path = require('path')
const fs = require('fs')
let _SQL = null
let _db = null
let _dbFile = null

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }

async function initDatabase(dbFilePath) {
  if (_db) return _db
  _dbFile = dbFilePath
  ensureDir(path.dirname(dbFilePath))
  if (!_SQL) {
    const initSqlJs = require('sql.js')
    // 1.x 版本异步加载 WASM
    _SQL = await initSqlJs({
      locateFile: file => path.join(path.dirname(require.resolve('sql.js')), file)
    })
  }
  if (fs.existsSync(dbFilePath)) {
    const buf = fs.readFileSync(dbFilePath)
    _db = new _SQL.Database(buf)
  } else {
    _db = new _SQL.Database()
  }
  // 装饰：添加 prepare() 方法，模拟 better-sqlite3 的 API
  decorate(_db)
  // 自动持久化：每 5 秒 & 进程退出
  let dirty = false
  const origRun = _db.run.bind(_db)
  _db.run = function(...a) { const r = origRun(...a); dirty = true; return r }
  setInterval(() => { if (dirty) { save(); dirty = false } }, 5000)
  for (const s of ['exit','SIGTERM','SIGINT']) process.on(s, () => save())
  return _db
}

function save() {
  if (!_db || !_dbFile) return
  try {
    const data = _db.export()
    fs.writeFileSync(_dbFile, Buffer.from(data))
  } catch(e) { console.error('[db] save fail', e.message) }
}

function decorate(db) {
  // sql.js 绑定参数支持 $@? 占位符；为避免接口差异，统一用 numbered $1,$2... 重写
  function toNumberedParams(sql, params) {
    // 如果 params 已是数组，原 SQL 中 ? 会被 sql.js 按序处理
    return { sql, params }
  }
  db.prepare = function(sql) {
    return {
      run: (...args) => {
        const params = flattenArgs(args)
        db.run(sql, Array.isArray(params) ? params : Object.values(params))
        const row = db.exec('SELECT last_insert_rowid() AS id, changes() AS c')[0]?.values?.[0]
        return { lastInsertRowid: row?.[0], changes: row?.[1] ?? 1 }
      },
      get: (...args) => {
        const params = flattenArgs(args)
        const p = Array.isArray(params) ? params : Object.values(params)
        const res = db.exec(sql, p)
        if (!res.length || !res[0].values.length) return undefined
        const cols = res[0].columns
        const first = res[0].values[0]
        const o = {}; cols.forEach((c,i)=>o[c]=first[i])
        return o
      },
      all: (...args) => {
        const params = flattenArgs(args)
        const p = Array.isArray(params) ? params : Object.values(params)
        const res = db.exec(sql, p)
        if (!res.length) return []
        const cols = res[0].columns
        return res[0].values.map(row => {
          const o = {}; cols.forEach((c,i)=>o[c]=row[i]); return o
        })
      }
    }
  }
}

function flattenArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0]
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) return args[0]
  return args
}

let dbPromise = null
function getDB() { return dbPromise }

function initDB() {
  if (!dbPromise) {
    const DB_PATH = path.join(__dirname, '../data/mingli.db')
    dbPromise = (async () => {
      const db = await initDatabase(DB_PATH)
      // 建表
      db.run(`CREATE TABLE IF NOT EXISTS users (
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
      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        plan_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        pay_method TEXT,
        paid_at INTEGER,
        created_at INTEGER NOT NULL
      )`)
      db.run(`CREATE TABLE IF NOT EXISTS ai_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT,
        tokens_used INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )`)

      // 初始化管理员
      const adminName = process.env.ADMIN_USERNAME || 'admin'
      const adminPwd = process.env.ADMIN_PASSWORD || 'admin123'
      const bcrypt = require('bcryptjs')
      const exist = db.prepare('SELECT id FROM users WHERE username = ?').get(adminName)
      if (!exist) {
        const now = Date.now()
        const hash = bcrypt.hashSync(adminPwd, 10)
        db.prepare(`INSERT INTO users (username,password,nickname,is_vip,is_admin,ai_credits,created_at,updated_at)
          VALUES (?,?,?,1,1,9999,?,?)`).run(adminName, hash, '超级管理员', now, now)
        console.log(`[init] 管理员已创建: ${adminName} / ${adminPwd}`)
      }
      save()
      return db
    })()
  }
  return dbPromise
}

// 将 init 包装成同步 API 导出：用户调用 initDB()，async 初始化完成后 db 对象可用
// 为了让业务代码保持同步风格，在各 route 里 await getDB() 一次，之后 db.prepare 即可用
module.exports = { initDB, getDB }
