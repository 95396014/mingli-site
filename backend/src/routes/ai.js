const express = require('express')
const axios = require('axios')

const router = express.Router()

const FREE_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || '3')
const VIP_LIMIT = parseInt(process.env.VIP_DAILY_LIMIT || '50')

const SYSTEM_PROMPTS = {
  bazi: `你是一位拥有30年实战经验的资深八字命理师，风格参考古籍《三命通会》《滴天髓》《穷通宝鉴》，兼通现代格局派与旺衰派。
输出要求：
1. 基于给定的四柱（含天干、地支、藏干、十神、纳音、五行统计）与大运数据，进行严谨分析。
2. 先判断日主旺衰（得令、得地、得助三方面分别打分），再定格局（正格/从格），后取用神、喜神、忌神。
3. 依次给出：①性格简评 ②事业财运 ③感情婚姻 ④健康提示 ⑤近3年大运流年提点。
4. 语气平和肯定，避免模棱两可，关键判断给出依据；不要说"仅供娱乐"这类免责话。
5. 使用 Markdown 分段，标题加粗，段落清晰，总字数 500-800。`,
  meihua: `你是一位精通梅花易数的资深占卜师，传承邵雍邵康节一脉，擅长以体用生克、旺相休囚、互变综错断事。
输出要求：
1. 基于给定的本卦、互卦、变卦、动爻位置、体用卦所属五行与月令旺衰进行推演。
2. 先明体用，再论生克比和，结合互卦（过程）与变卦（结局）给出吉凶层次：大吉/吉/平/小凶/凶，并附明确依据。
3. 给出所占事项的应期（近者日辰、远者年月）与避坑建议。
4. 引用卦辞爻辞时，用引号括起来，并做白话释义。
5. 用 Markdown 分段，结构清晰，字数 400-700，不写娱乐免责。`
}

function canUseAi(user) {
  if (user.is_admin) return { ok: true, type: 'admin' }
  if (user.is_vip) return { ok: true, type: 'vip', limit: VIP_LIMIT }
  if ((user.free_daily_used || 0) >= FREE_LIMIT) {
    return { ok: false, reason: `免费用户每日限 ${FREE_LIMIT} 次，今日已用完。开通会员解锁 ${VIP_LIMIT} 次/日。` }
  }
  return { ok: true, type: 'free', limit: FREE_LIMIT, used: user.free_daily_used || 0 }
}

router.post('/interpret', async (req, res) => {
  const { type, payload, question } = req.body || {}
  if (!SYSTEM_PROMPTS[type]) return res.status(400).json({ error: '未知类型' })
  if (!payload) return res.status(400).json({ error: '缺少排盘数据' })
  const db = req.db
  const auth = canUseAi(req.user)
  if (!auth.ok) return res.status(402).json({ error: auth.reason })

  const userPrompt =
`【用户求问】${question || '请基于排盘信息综合解读'}
【排盘数据（JSON）】
${JSON.stringify(payload, null, 2)}`

  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions'
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  let content = ''
  let tokens = 0

  if (!apiKey) {
    content =
`⚠️ 未配置 DEEPSEEK_API_KEY，当前为演示模式。

部署提示：
1. 在 backend/.env 中填入 DEEPSEEK_API_KEY=sk-xxxx
2. 重启后端即可启用真实 AI 大师解读。

以下为你传入的数据概览（请核对排盘参数正确）：
类型：${type}
月令旺衰体：${JSON.stringify(payload.tiWangShuai || payload.wangLevel || '')}
体用关系：${JSON.stringify(payload.relation || payload.shiShenCount || '')}`
  } else {
    try {
      const { data } = await axios.post(apiUrl, {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[type] },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        stream: false
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 90000
      })
      content = data.choices?.[0]?.message?.content?.trim() || '(空响应)'
      tokens = data.usage?.total_tokens || 0
    } catch (e) {
      console.error('[deepseek] err:', e.message, e.response?.data)
      return res.status(502).json({ error: 'AI 服务异常：' + (e.response?.data?.error?.message || e.message) })
    }
  }

  const now = Date.now()
  if (auth.type === 'free') {
    db.prepare('UPDATE users SET free_daily_used = free_daily_used + 1, updated_at = ? WHERE id = ?').run(now, req.user.id)
  }
  db.prepare('INSERT INTO ai_logs (user_id,type,prompt,tokens_used,created_at) VALUES (?,?,?,?,?)')
    .run(req.user.id, type, JSON.stringify({ question, payloadType: type }).slice(0, 500), tokens, now)

  const remain = auth.type === 'free'
    ? Math.max(0, FREE_LIMIT - ((req.user.free_daily_used || 0) + 1))
    : auth.type === 'vip' ? VIP_LIMIT : 9999

  res.json({ content, tokens, remain, authType: auth.type })
})

router.get('/quota', (req, res) => {
  const info = canUseAi(req.user)
  res.json({
    freeDailyLimit: FREE_LIMIT,
    vipDailyLimit: VIP_LIMIT,
    freeUsed: req.user.free_daily_used || 0,
    freeRemain: Math.max(0, FREE_LIMIT - (req.user.free_daily_used || 0)),
    isVip: !!req.user.is_vip,
    isAdmin: !!req.user.is_admin,
    authType: info.type,
    aiCredits: req.user.ai_credits || 0
  })
})

module.exports = router
