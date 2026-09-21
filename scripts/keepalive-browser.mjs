// 心跳保活（真实浏览器版）
// 原因：SnapDeploy 容器域名被 Cloudflare 人机验证保护（cf-mitigated: challenge），
// 普通 curl 请求会被 403 拦截、根本到不了容器。真实 Chromium 能执行验证 JS 自动通过，
// 从而让请求到达容器，实现：① 容器不被休眠 ② Supabase 数据库保持活跃。
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

try {
  console.log('[keepalive] 打开:', TARGET)
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 })

  // 最多等 50 秒，轮询验证是否通过（通过后 /api/health 返回 {"ok":true...}）
  let ok = false
  for (let i = 0; i < 25; i++) {
    const body = (await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).trim()
    const title = await page.title().catch(() => '')

    if (body.includes('"ok"') || body.includes('"ok":true')) {
      ok = true
      console.log('[keepalive] ✅ 已通过验证并到达容器，响应:', body.slice(0, 120))
      break
    }

    // 极少数情况下出现可点击的 Turnstile 复选框，尝试点一下
    if (title.includes('moment') || body.includes('challenge')) {
      const frames = page.frames()
      for (const f of frames) {
        try {
          const cb = f.locator('input[type="checkbox"]').first()
          if (await cb.isVisible({ timeout: 1000 }).catch(() => false)) {
            await cb.click({ timeout: 2000 })
            console.log('[keepalive] 点击了验证复选框')
          }
        } catch {}
      }
    }

    await sleep(2000)
  }

  if (!ok) {
    const t = await page.title().catch(() => '')
    console.error('[keepalive] ❌ 超时未通过验证，最终页面标题:', t)
    process.exit(1)
  }
} catch (e) {
  console.error('[keepalive] ❌ 访问异常:', e.message)
  process.exit(1)
} finally {
  await browser.close()
}
