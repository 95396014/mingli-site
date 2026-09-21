// 心跳保活（真实浏览器版）
// 背景：SnapDeploy 免费容器 15 分钟无访问会休眠。休眠后直接请求会被拦截页挡住
// （curl 得到 403 "Just a moment"；真实浏览器看到 "Container is Sleeping" 冷启动页），
// 冷启动约需 45 秒，期间平台会自动刷新/跳转，容器就绪后才返回真实内容。
// 因此用真实 Chromium 访问，并给足冷启动时间（最多 120 秒）、主动轮询刷新，
// 实现：① 唤醒并保活容器 ② 顺带保持 Supabase 数据库活跃。
import { chromium } from 'playwright'

const TARGET = process.env.KEEPALIVE_URL ||
  'https://5860bazi-1676c.containers.snapdeploy.app/api/health'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
})

const ctx = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  locale: 'zh-CN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
})

const page = await ctx.newPage()

// 总预算 120 秒（冷启动 ~45 秒，留足余量）
const deadline = Date.now() + 120000
let ok = false
let lastHint = ''

try {
  while (Date.now() < deadline) {
    try {
      await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (e) {
      // 跳转/刷新途中可能抛超时，忽略后继续重试
      console.log('[keepalive] goto 提示:', e.message.slice(0, 80))
    }

    await sleep(3000)

    const body = (await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).trim()
    const title = (await page.title().catch(() => '')).trim()
    lastHint = title || body.slice(0, 80)

    // 容器已就绪：/api/health 返回 {"ok":true,...}
    if (body.includes('"ok"')) {
      ok = true
      console.log('[keepalive] ✅ 容器已就绪，响应:', body.slice(0, 120))
      break
    }

    // 仍在休眠/冷启动/验证中，打印状态后等待平台自动刷新；并主动 reload 兜底
    const sleeping = /sleep|waking|starting|cold|moment|验证|启动|稍候/i.test(body + ' ' + title)
    console.log(`[keepalive] 等待中…（${sleeping ? '冷启动/验证页' : '未知页'}）当前标题: "${title}"`)
    await sleep(7000)
    if (sleeping) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    }
  }

  if (!ok) {
    console.error('[keepalive] ❌ 120 秒内未等到容器就绪，最后状态:', lastHint)
    process.exit(1)
  }
} catch (e) {
  console.error('[keepalive] ❌ 访问异常:', e.message)
  process.exit(1)
} finally {
  await browser.close()
}
