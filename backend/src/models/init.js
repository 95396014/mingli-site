// 数据库统一入口，支持 3 种模式（按环境变量自动选择，优先级从高到低）：
//   1) PostgreSQL: 设置了 DATABASE_URL 以 postgres:// / postgresql:// 开头  →  最推荐！Railway 一键添加
//   2) Turso libSQL: 设置了 TURSO_URL  (libsql://...)
//   3) 本地 SQLite（sql.js）: 无环境变量时，开发/降级使用
const bcrypt = require('bcryptjs')

// ==================== 数据库选择 ====================
let _dbPromise = null

function detectMode() {
  const dbu = process.env.DATABASE_URL
  if (dbu && /^postgres(ql)?:\/\//i.test(dbu)) return 'pg'
  if (process.env.TURSO_URL) return 'turso'
  return 'sqlite'
}

// ==================== 通用包装器 —— 所有模式返回统一 API ====================
// 返回 db = {
//   _async: true/false,
//   prepare(sql): { run(args), get(args), all(args) }   —— 统一带 await，结果 Promise
//   run(sql, args?)
// }
// 注意：为了兼容 SQL 方言差异，SQLite/PostgreSQL 的语法差异（AUTOINCREMENT, TEXT PK, IF NOT EXISTS 等）
//       会在 ensureSchema 中按模式处理。

// ---------- PostgreSQL 包装 ----------
function wrapPg(client) {
  const rewritePlaceholders = (sql) => {
    let idx = 0
    return sql.replace(/\?/g, () => { idx++; return '$' + idx })
  }
  // 给 INSERT 语句尾部追加 RETURNING id（如果没有）
  const fixInsertReturning = (sql) => {
    const isInsert = /^\s*INSERT\s+INTO\b/i.test(sql)
    if (isInsert && !/\bRETURNING\b/i.test(sql)) {
      return sql.trimEnd() + ' RETURNING id'
    }
    return sql
  }
  return {
    _async: true,
    prepare(sql) {
      return {
        async run(...args) {
          const params = norm(args)
          const rewritten = rewritePlaceholders(fixInsertReturning(sql))
          const result = await client.query(rewritten, params)
          return {
            lastInsertRowid: (result.rows && result.rows[0] && result.rows[0].id != null)
              ? Number(result.rows[0].id)
              : null,
            changes: result.rowCount ?? 0
          }
        },
        async get(...args) {
          const params = norm(args)
          const result = await client.query(rewritePlaceholders(sql), params)
          return result.rows[0] || undefined
        },
        async all(...args) {
          const params = norm(args)
          const result = await client.query(rewritePlaceholders(sql), params)
          return result.rows || []
        }
      }
    },
    async run(sql, ...args) {
      const params = norm(args)
      await client.query(rewritePlaceholders(sql), params)
    }
  }
}

// ---------- Turso 包装 ----------
function wrapTurso(client) {
  return {
    _async: true,
    prepare(sql) {
      return {
        async run(...args) {
          const params = norm(args)
          const r = await client.execute({ sql, args: params })
          return {
            lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
            changes: r.rowsAffected ?? 1
          }
        },
        async get(...args) {
          const params = norm(args)
          const r = await client.execute({ sql, args: params })
          return r.rows[0] || undefined
        },
        async all(...args) {
          const params = norm(args)
          const r = await client.execute({ sql, args: params })
          return r.rows
        }
      }
    },
    async run(sql, ...args) {
      await client.execute({ sql, args: norm(args) })
    }
  }
}

// ---------- SQLite 包装（同步持久化）----------
let saveTimer = null
function scheduleSave(saveFn) {
  if (saveTimer) return
  saveTimer = setTimeout(() => { saveTimer = null; saveFn() }, 3000)
}
async function wrapSQLiteLocal() {
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
    try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())) }
    catch (e) { console.error('[db-local] 保存失败（无Volume时重启会丢失！）:', e.message) }
  }
  const triggerSave = () => scheduleSave(save)

  process.on('SIGTERM', () => { try { save() } catch {} process.exit(0) })
  process.on('SIGINT',  () => { try { save() } catch {} process.exit(0) })
  process.on('beforeExit', () => { try { save() } catch {} })

  // ---- helpers ----
  // 把 args 扁平化: [arr] or [obj] or [a,b,c] -> [values array]
  const toValues = (args, sql = '') => {
    if (args.length === 0) return []
    if (args.length === 1) {
      const a = args[0]
      if (Array.isArray(a)) return a
      if (a && typeof a === 'object' && !Buffer.isBuffer(a)) {
        // 命名参数 { $name: v } — 直接传对象即可
        return a
      }
      return [a]
    }
    return Array.from(args)
  }

  const execObject = (sql, args) => {
    // 用 db.exec 风格处理 SELECT 类语句
    const results = db.exec(sql, args)
    if (!results || !results.length) return { columns: [], rows: [] }
    const { columns, values } = results[0]
    const rows = values.map(rowArr => {
      const o = {}
      columns.forEach((c, i) => { o[c] = rowArr[i] })
      return o
    })
    return { columns, rows }
  }

  const isSelect = (sql) => /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql.trim())

  const runMutating = (sql, args) => {
    db.run(sql, args)
    triggerSave()
    const lidR = db.exec('SELECT last_insert_rowid() AS id')
    const chgR = db.exec('SELECT changes() AS c')
    const lastInsertRowid = (lidR && lidR[0] && lidR[0].values && lidR[0].values[0]) ? Number(lidR[0].values[0][0]) : null
    const changes = (chgR && chgR[0] && chgR[0].values && chgR[0].values[0]) ? Number(chgR[0].values[0][0]) : 0
    return { lastInsertRowid, changes }
  }

  return {
    _async: false,
    prepare(sql) {
      return {
        run: (...a) => {
          const vals = toValues(a, sql)
          let result
          if (isSelect(sql)) {
            // SELECT: db.exec 可接受参数
            const res = execObject(sql, vals)
            result = { lastInsertRowid: null, changes: res.rows.length }
          } else {
            result = runMutating(sql, vals)
          }
          return Promise.resolve(result)
        },
        get: (...a) => {
          const vals = toValues(a, sql)
          // 用 stmt 的 step/getAsObject 方式，更直观
          const stmt = db.prepare(sql)
          try {
            stmt.bind(vals)
            if (stmt.step()) {
              const obj = stmt.getAsObject()
              return Promise.resolve(obj)
            }
            return Promise.resolve(undefined)
          } finally {
            stmt.free()
          }
        },
        all: (...a) => {
          const vals = toValues(a, sql)
          const rows = execObject(sql, vals).rows
          return Promise.resolve(rows)
        }
      }
    },
    run: (...a) => {
      const args = Array.from(a)
      const sql = args[0]
      const rest = args.slice(1)
      const vals = toValues(rest, sql)
      if (isSelect(sql)) execObject(sql, vals)
      else runMutating(sql, vals)
      return Promise.resolve()
    },
    _save: save,
    DB_PATH
  }
}

// ---------- 参数标准化 ----------
function norm(args) {
  if (args.length === 0) return []
  if (args.length === 1 && Array.isArray(args[0])) return args[0]
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Buffer.isBuffer(args[0])) return args[0]
  return Array.from(args)
}

// ==================== 初始化入口 ====================
async function initDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = (async () => {
    const mode = detectMode()

    if (mode === 'pg') {
      const { Pool } = require('pg')
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('railway.app')
          ? { rejectUnauthorized: false }
          : undefined
      })
      // 创建单 client 长连接池
      console.log('[db] 使用 PostgreSQL 云端数据库，数据永久保存')
      const wdb = wrapPg(pool)
      await ensureSchema(wdb, 'pg')
      await ensureAdmin(wdb)
      console.log('[db] ✅ PostgreSQL 初始化完成')
      return wdb
    }

    if (mode === 'turso') {
      const { createClient } = require('@libsql/client')
      const url = process.env.TURSO_URL
      console.log('[db] 使用 Turso 云端数据库:', url.replace(/\/\/.*@/, '//***@'))
      const client = createClient({ url, authToken: process.env.TURSO_TOKEN })
      const wdb = wrapTurso(client)
      await ensureSchema(wdb, 'turso')
      await ensureAdmin(wdb)
      console.log('[db] ✅ Turso 初始化完成，数据永久保存')
      return wdb
    }

    const wdb = await wrapSQLiteLocal()
    await ensureSchema(wdb, 'sqlite')
    await ensureAdmin(wdb)
    if (wdb._save) wdb._save()
    console.log('[db] ⚠️  使用本地 SQLite（非持久化），存储位置:', wdb.DB_PATH)
    console.log('[db] 强烈建议在 Railway「+ Add」中添加 PostgreSQL 服务，即可自动使用云端数据库（无需手动配置连接字符串）。')
    return wdb
  })()
  return _dbPromise
}

function getDB() { return null }

// ==================== Schema ====================
async function ensureSchema(db, mode) {
  const exec = async (sql) => { await db.run(sql) }

  if (mode === 'pg') {
    await exec(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      nickname VARCHAR(255),
      phone VARCHAR(64),
      is_vip INTEGER DEFAULT 0,
      vip_expire_at BIGINT,
      is_admin INTEGER DEFAULT 0,
      ai_credits INTEGER DEFAULT 0,
      free_daily_used INTEGER DEFAULT 0,
      free_daily_date VARCHAR(32),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`)
    await exec(`CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_no VARCHAR(64) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      plan_id VARCHAR(32) NOT NULL,
      plan_name VARCHAR(128) NOT NULL,
      amount INTEGER NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      pay_method VARCHAR(32),
      transaction_id VARCHAR(128),
      code_url VARCHAR(512),
      paid_at BIGINT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT
    )`)
    await exec(`CREATE TABLE IF NOT EXISTS ai_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type VARCHAR(32) NOT NULL,
      prompt TEXT,
      tokens_used INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL
    )`)
    const tryAdd = async (table, col, decl) => {
      try { await exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`) } catch (_) {}
    }
    await tryAdd('orders', 'transaction_id', 'VARCHAR(128)')
    await tryAdd('orders', 'code_url', 'VARCHAR(512)')
    await tryAdd('orders', 'updated_at', 'BIGINT')
  } else {
    // SQLite / Turso（SQLite 语法）
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
    const tryAdd = async (sql) => { try { await exec(sql) } catch(_) {} }
    await tryAdd('ALTER TABLE orders ADD COLUMN transaction_id TEXT')
    await tryAdd('ALTER TABLE orders ADD COLUMN code_url TEXT')
    await tryAdd('ALTER TABLE orders ADD COLUMN updated_at INTEGER')
  }
}

// ==================== 管理员初始化 ====================
async function ensureAdmin(db) {
  const prep = (sql) => db.prepare(sql)
  const adminName = process.env.ADMIN_USERNAME
  const adminPwd = process.env.ADMIN_PASSWORD

  if (adminName && adminPwd) {
    const exist = await prep('SELECT id FROM users WHERE username = ?').get(adminName)
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
    const row = await prep('SELECT id, username, password, is_admin FROM users WHERE username = ?').get('admin')
    if (row && row.password && bcrypt.compareSync('admin123', row.password)) {
      const now = Date.now()
      await prep('UPDATE users SET is_admin=0, is_vip=0, ai_credits=3, updated_at=? WHERE id=?').run(now, row.id)
      console.log('[init-security] 检测到旧默认 admin/admin123，已降级')
    }
  }
}

module.exports = { initDB, getDB, detectMode }
