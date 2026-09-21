// 心跳保活（真实浏览器 · 诊断增强版）
// 策略：
//  1) 先访问根路径 /，让 Chromium 完成 Cloudflare 的 JS 验证、拿到 cf_clearance Cookie；
//  2) 同一浏览器上下文带着 Cookie 再访问 /api/health；
//  3) 总等待 ~150 秒，覆盖容器 ~45 秒冷启动；
//  4) 若最终仍失败，把页面截图和 HTML 存到 debug/ 目录，由 workflow 上传为 artifact，便于排查。
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.KEEPALIVE_BASE ||
  'https://5860bazi-1676c.containers.snapdeploy.app'
const HEALTH = BASE + '/api/health'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
fs.mkdirSync('debug', { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox',
         '--disable-blink-features=AutomationControlled',
         '--disable-dev-shm-usage']
})
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  locale: 'zh-CN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
})
const page = await ctx.newPage()

const dump = async (tag) => {
  try {
    await page.screenshot({ path: `debug/${tag}.png`, fullPage: true, timeout: 10000 })
    const html = await page.content().catch(() => '')
    fs.writeFileSync(`debug/${tag}.html`, html.slice(0, 200000))
    console.log(`[keepalive] 已保存诊断文件 debug/${tag}.png / .html`)
  } catch (e) { console.log('[keepalive] 保存诊断失败:', e.message) }
}

const deadline = Date.now() + 150000
let ok = false
let phase = 1

try {
  // 阶段 1：打开首页过验证（循环刷新直到不再是验证/休眠页）
  while (Date.now() < deadline && !ok) {
    const url = phase === 1 ? BASE : HEALTH
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (e) {
      console.log('[keepalive] goto:', e.message.slice(0, 70))
    }
    await sleep(4000)

    const body = (await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).trim()
    const title = (await page.title().catch(() => '')).trim()

    if (body.includes('"ok"')) {
      ok = true
      console.log('[keepalive] ✅ 成功，健康检查响应:', body.slice(0, 120))
      break
    }

    const blocked = /moment|sleep|waking|starting|cold|challenge|验证|稍候|启动|just a moment/i.test(body + ' ' + title)
    console.log(`[keepalive][阶段${phase}] 未就绪 | blocked=${blocked} | 标题="${title}" | 内容="${body.slice(0, 90)}"`)

    // 首页过了验证就切到接口；否则继续刷新同一个
    if (!blocked && phase === 1) {
      console.log('[keepalive] 首页已无拦截，切换到 /api/health')
      phase = 2
    }
    await sleep(8000)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  }

  if (!ok) {
    await dump('failed')
    console.error('[keepalive] ❌ 150 秒内未成功，已保存诊断快照')
    process.exit(1)
  }
} catch (e) {
  await dump('error')
  console.error('[keepalive] ❌ 异常:', e.message)
  process.exit(1)
} finally {
  await browser.close()
}
