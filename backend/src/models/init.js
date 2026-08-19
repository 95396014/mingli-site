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

      // 初始化管理员：安全策略
      // 1) 仅当环境变量显式设置 ADMIN_USERNAME + ADMIN_PASSWORD 时，才自动创建/重置管理员账号。
      // 2) 如果 Railway/Vercel 没有配置这两个变量，就不创建默认 admin/admin123，
      //    避免公开部署后被别人用默认弱密码登录后台。
      // 3) 生产日志永远不打印密码明文，只打印用户名。
      const adminName = process.env.ADMIN_USERNAME
      const adminPwd = process.env.ADMIN_PASSWORD
      const bcrypt = require('bcryptjs')
      if (adminName && adminPwd) {
        const exist = db.prepare('SELECT id FROM users WHERE username = ?').get(adminName)
        const now = Date.now()
        const hash = bcrypt.hashSync(adminPwd, 10)
        if (!exist) {
          db.prepare(`INSERT INTO users (username,password,nickname,is_vip,is_admin,ai_credits,created_at,updated_at)
            VALUES (?,?,?,1,1,9999,?,?)`).run(adminName, hash, '超级管理员', now, now)
          console.log(`[init] 管理员账号已创建: ${adminName} (密码从环境变量读取，已加密入库，不写入日志)`)
        } else {
          // 环境变量里给了最新密码：允许通过重启 + 更新环境变量，静默刷新数据库里的旧密码 hash
          db.prepare(`UPDATE users SET password=?, is_admin=1, is_vip=1, ai_credits=9999, nickname='超级管理员', updated_at=? WHERE username=?`)
            .run(hash, now, adminName)
          console.log(`[init] 管理员账号已同步最新密码: ${adminName}`)
        }
      } else {
        // 未显式设置环境变量：不创建默认管理员。
        // 但有一个非常关键的安全升级：
        // 如果 DB 里已经残留了旧版本自动生成的 admin / admin123（因为之前铁路上的 DB 持久化还在），
        // 必须把这个账号的 is_admin 立即降级为 0，避免别人用公开弱密码爆破后台。
        const bcrypt = require('bcryptjs')
        const oldAdminRow = db.prepare('SELECT id,username,password,is_admin FROM users WHERE username = ?').get('admin')
        if (oldAdminRow) {
          const isOldDefault = bcrypt.compareSync('admin123', oldAdminRow.password)
          if (isOldDefault) {
            const now = Date.now()
            db.prepare(`UPDATE users SET is_admin=0, is_vip=0, ai_credits=3, updated_at=? WHERE id=?`).run(now, oldAdminRow.id)
            console.log('[init-security] ⚠️  检测到数据库里存在历史遗留 admin / admin123 弱密码管理员！')
            console.log('[init-security]    → 已自动将该账号 is_admin 降级为 0，并取消 VIP 与高额 credits。')
            console.log('[init-security]    → 如需启用后台管理员，请在 Railway Variables 中显式设置：')
            console.log('[init-security]         ADMIN_USERNAME = 你自定义的管理员用户名（例如 laoban / mingli_admin）')
            console.log('[init-security]         ADMIN_PASSWORD = 至少 10 位的强密码（字母+数字+符号）')
            console.log('[init-security]      然后 Apply Changes → Redeploy，新管理员将自动创建并加密入库。')
          } else {
            console.log('[init] ⚠️  已检测到数据库里有用户名为 admin 的账号，但密码不是旧默认 admin123，保留现状。')
          }
        } else {
          const cnt = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get()
          if (!cnt || cnt.c === 0) {
            console.log('[init] ⚠️  未检测到 ADMIN_USERNAME/ADMIN_PASSWORD 环境变量，且数据库里没有任何管理员。')
            console.log('[init]    → 请在托管平台（Railway Variables / Vercel Env）显式设置这两个变量后重启服务，再创建管理员账号。')
            console.log('[init]    → 为避免公开站点被弱密码爆破，不再使用默认 admin/admin123。')
          }
        }
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
