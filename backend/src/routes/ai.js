const express = require('express')
const axios = require('axios')

const router = express.Router()

const FREE_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || '0')

const SYSTEM_PROMPTS = {
  bazi: `你是一位拥有30年实战经验的资深八字命理师，风格参考古籍《三命通会》《滴天髓》《穷通宝鉴》《子平真诠》，兼通现代格局派与旺衰派、盲派命理，能精准断八字。

## 分析框架（必须按此结构输出）

### 一、命局总论
- **日主旺衰判定**：详细分析得令/失令、得地/失地、得助/失助，给出具体分数和判断依据
- **格局类型**：正格/从格/专旺/假从等，引用经典依据
- **五行旺衰**：逐五行分析强弱，指出过旺过弱的五行
- **用神喜忌**：明确列出用神、喜神、忌神、仇神，说明选取理由

### 二、详细命理分析
- **性格特征**：从天干、地支藏干、十神组合多角度分析性格，至少300字
- **事业财运**：分析事业方向、适合行业、财运格局、求财方式，至少300字
- **感情婚姻**：分析感情类型、择偶偏好、婚姻走势、注意事项，至少300字
- **六亲关系**：父母、兄弟姐妹、子女的关系和运势
- **健康提示**：根据五行强弱指出需要注意的身体部位

### 三、大运流年分析
- **当前大运详解**：
  - 大运干支、起运年龄、起止年份
  - 大运天干与原局天干的生克关系
  - 大运地支与原局地支的刑冲合害关系
  - 大运对用神、忌神的影响
  - 本步大运的核心吉凶特征，至少200字
- **近5年逐年运势（2024-2028）**：
  - 每年的干支、与原局的关系
  - 该年在事业、财运、感情、健康方面的具体变化
  - 该年的关键事件和注意事项
  - 每年至少150字，合计至少750字
- **关键转折点**：指出5年内最重要的转折年份和事件

## 输出要求
1. 所有判断必须有八字依据（指明是哪个天干/地支/藏干支撑该结论）
2. 语气平和但肯定，不模棱两可
3. 严禁使用"仅供娱乐""仅供参考"等免责用语
4. 使用 Markdown 格式，层级清晰，总字数 **1500-2500字**
5. 大运流年部分必须详细具体，逐年分析，给出明确的吉凶判断`,
  meihua: `你是一位精通梅花易数的资深占卜师，传承邵雍邵康节一脉，旁参《周易》《易经》十翼，擅长以体用生克、旺相休囚、互变综错断事，断语精准，应期如神。

## 分析框架（必须按此结构输出）

### 一、起卦信息
- **本卦**：卦名、卦义、核心含义
- **互卦**：过程演变、中间环节、事态发展
- **变卦**：最终结局、结果指向、未来走势
- **动爻**：动爻位置、爻辞释义、变化含义

### 二、体用分析
- **体卦分析**：体卦五行、旺衰状态、得月令与否、生克情况
- **用卦分析**：用卦五行、与体卦关系、对所问事项的影响
- **互卦对体用的影响**：互卦如何反映过程中的体用变化
- **变卦对体用的影响**：变卦如何预示最终的体用格局

### 三、吉凶判断
- **综合吉凶**：大吉/吉/平/小凶/凶
- **判断依据**：详述体用生克、旺相休囚、卦辞爻辞的综合判断
- **关键提示**：引用相关卦辞爻辞，做通俗易懂的白话释义

### 四、应期推算
- **近应期**：近期（30天内）的应期，精确到日期或时段
- **远应期**：远期（3个月/半年/1年）的应期
- **应期依据**：动爻数、变卦卦序、月令节气综合推算

### 五、具体建议
- **当下行动**：现在应该做什么、怎么做
- **避坑指南**：需要避免的陷阱和错误
- **有利时机**：什么时候行动最为有利
- **增强方法**：如何增强成功率或化解不利因素

## 输出要求
1. 必须引用具体的卦辞、爻辞原文，用引号括起来，并做白话翻译
2. 断语要具体明确，避免模棱两可
3. 严禁使用"仅供娱乐""仅供参考"等免责用语
4. 使用 Markdown 格式，层级清晰，总字数 **800-1500字**
5. 针对所问事项给出具体可操作的建议，不要空泛`
}

function canUseAi(user) {
  if (user.is_admin) return { ok: true, type: 'admin' }
  const credits = Number(user.ai_credits) || 0
  // VIP 用户或已购买次数的普通用户：按 ai_credits 扣减
  if (credits > 0) {
    return { ok: true, type: user.is_vip ? 'vip' : 'paid', credits }
  }
  // 免费用户：默认 0 次（不允许免费使用）；可通过环境变量 FREE_DAILY_LIMIT 开放少量体验
  if ((user.free_daily_used || 0) >= FREE_LIMIT) {
    if (FREE_LIMIT === 0) {
      return { ok: false, reason: 'AI 深度解读额度不足，请联系管理员开通使用权限。' }
    }
    return { ok: false, reason: `免费体验每日限 ${FREE_LIMIT} 次，今日已用完。请联系管理员开通更多额度。` }
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
      const errMsg = e.response?.data?.error?.message || e.message
      const isAuthError = errMsg.includes('Authentication') || errMsg.includes('invalid') || errMsg.includes('Unauthorized')
      if (isAuthError) {
        console.warn('[deepseek] API Key 认证失败，回退到演示模式')
        content =
`⚠️ AI 服务当前为演示模式（API Key 认证失败或未配置）。

请在后端 .env 中设置有效的 DEEPSEEK_API_KEY 后重启服务，
即可启用真实 AI 大师深度解读。

以下为你传入的排盘数据概览：
类型：${type}
月令旺衰：${JSON.stringify(payload.wangLevel || '')}
体用关系：${JSON.stringify(payload.shiShenCount || '')}`
      } else {
        return res.status(502).json({ error: 'AI 服务异常：' + errMsg })
      }
    }
  }

  // AI 调用成功后扣次
  const now = Date.now()
  if (auth.type === 'free') {
    await db.prepare('UPDATE users SET free_daily_used = free_daily_used + 1, updated_at = ? WHERE id = ?').run(now, req.user.id)
  } else if (auth.type === 'vip' || auth.type === 'paid') {
    await db.prepare('UPDATE users SET ai_credits = MAX(0, ai_credits - 1), updated_at = ? WHERE id = ?').run(now, req.user.id)
  }
  await db.prepare('INSERT INTO ai_logs (user_id,type,prompt,tokens_used,created_at) VALUES (?,?,?,?,?)')
    .run(req.user.id, type, JSON.stringify({ question, payloadType: type }).slice(0, 500), tokens, now)

  // 重新从 DB 拉一下额度，保证返回给前端是最新的
  const updated = await db.prepare('SELECT ai_credits, free_daily_used FROM users WHERE id = ?').get(req.user.id) || {}
  const remain =
    auth.type === 'free' ? Math.max(0, FREE_LIMIT - (((req.user.free_daily_used||0) + 1))) :
    (auth.type === 'admin' ? 9999 : Math.max(0, Number(updated.ai_credits)||0))

  res.json({
    content, tokens, remain, authType: auth.type,
    aiCredits: Number(updated.ai_credits)||0,
    freeUsed: Number(updated.free_daily_used)||0,
  })
})

router.get('/quota', (req, res) => {
  const info = canUseAi(req.user)
  res.json({
    freeDailyLimit: FREE_LIMIT,
    // vipDailyLimit 已取消，会员改为按 ai_credits 总额度扣减，不再每日重置
    vipDailyLimit: null,
    freeEnabled: FREE_LIMIT > 0,
    freeUsed: req.user.free_daily_used || 0,
    freeRemain: Math.max(0, FREE_LIMIT - (req.user.free_daily_used || 0)),
    isVip: !!req.user.is_vip,
    isAdmin: !!req.user.is_admin,
    authType: info.type,
    aiCredits: req.user.ai_credits || 0
  })
})

module.exports = router
