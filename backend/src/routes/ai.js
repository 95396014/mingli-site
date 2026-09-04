const express = require('express')
const axios = require('axios')

const router = express.Router()

// 动态构建系统 prompt，注入当前真实时间信息
function buildSystemPrompt(type, ctx /* { nowISO, currYear, currYr, next5, currDateCN, currMonth } */) {
  const { nowISO, currYear, currYr, next5, currDateCN, currMonth } = ctx
  if (type === 'bazi') {
    return `你是一位拥有30年实战经验的资深八字命理师，风格参考古籍《三命通会》《滴天髓》《穷通宝鉴》《子平真诠》，兼通现代格局派与旺衰派、盲派命理，能精准断八字。

## 时间基准（必须严格遵守，严禁写其他年份）
- 解读时的真实当前日期：${currDateCN}（公历 ${nowISO.slice(0,10)}）
- 当前公历年：${currYear} 年
- 当前农历干支年：${currYr}
- 用户口中的"今年"= ${currYear}（${currYr}）
- "近5年"= ${next5}（共5年，每年都要具体展开）
- "未来3-5年"= 从 ${currYear} 起算，而非其他年份

## 重要提示
- 排盘数据中的 gender 字段表示性别（男/女），大运方向已按性别正确排盘
- 乾造（男命）与坤造（女命）的分析重点不同：
  - **乾造（男命）**：以财星为妻星、官杀为事业、食伤为子女、印星为母亲、比劫为兄弟
  - **坤造（女命）**：以官杀为夫星、食伤为子女、财星为父亲、印星为母亲、比劫为姐妹
  - 女命需重点分析：夫星旺衰、婚姻宫吉凶、子女缘、婆媳关系（印星 vs 财星）
  - 男命需重点分析：妻星旺衰、婚姻宫吉凶、事业财运、子女缘

## 分析框架（必须按此结构输出）

### 一、命局总论
- **日主旺衰判定**：详细分析得令/失令、得地/失地、得助/失助，给出具体分数和判断依据
- **格局类型**：正格/从格/专旺/假从等，引用经典依据
- **五行旺衰**：逐五行分析强弱，指出过旺过弱的五行
- **用神喜忌**：明确列出用神、喜神、忌神、仇神，说明选取理由

### 二、详细命理分析
- **性格特征**：从天干、地支藏干、十神组合多角度分析性格，至少300字
- **事业分析**：事业方向、适合行业、职业发展路径、贵人方向，至少200字
- **财运专题**（核心重点，至少400字）：
  - **财运格局**：正财/偏财格局判断、财星旺衰、有无财库
  - **正财运**：工资收入、固定收益的走势，哪些年份正财旺
  - **偏财运**：投资、理财、副业、偏财的机遇，哪些年份偏财旺
  - **求财方式**：适合的求财途径（工薪/投资/经商/技术/艺术等）
  - **破财风险**：哪些年份易破财、原因是什么、如何防范
  - **财运高峰期**：指出未来3-5年财运最好的年份（以 ${currYear} 年为起点）
- **感情婚姻**（需结合性别分析）：
  - 乾造（男）：正财为妻、偏财为情人/父亲，分析妻星旺衰、婚姻宫、感情走势
  - 坤造（女）：正官为夫、七杀为情人/压力，分析夫星旺衰、婚姻宫、感情走势
  - 择偶偏好、婚姻走势、注意事项，至少300字
- **六亲关系**：父母、兄弟姐妹、子女的关系和运势
- **健康提示**：根据五行强弱指出需要注意的身体部位

### 三、大运流年分析
- **当前大运详解**：
  - 大运干支、起运年龄、起止年份
  - 大运天干与原局天干的生克关系
  - 大运地支与原局地支的刑冲合害关系
  - 大运对用神、忌神的影响
  - 本步大运的核心吉凶特征，至少200字
- **近5年逐年运势（${next5}）**：
  - 每年的干支、与原局的关系
  - 该年在事业、财运、感情、健康方面的具体变化
  - 该年的关键事件和注意事项
  - 每年至少150字，合计至少750字
- **关键转折点**：指出从 ${currYear} 年起算 5 年内最重要的转折年份和事件

## 输出要求
1. 所有判断必须有八字依据（指明是哪个天干/地支/藏干支撑该结论）
2. 语气平和但肯定，不模棱两可
3. 严禁使用"仅供娱乐""仅供参考"等免责用语
4. 使用 Markdown 格式，层级清晰，总字数 **1800-2800字**
5. 大运流年部分必须详细具体，逐年分析，给出明确的吉凶判断
6. **财运专题是核心重点**，必须详细展开，用具体年份和事件说明
7. **严禁把当前公历年写成 ${currYear - 2} 或其他年份**，必须以 ${currYear} 年作为基准
8. **五行分值严格引用排盘数据**：任何提到五行分数、得分的地方，**必须一字不差地使用下面 user 消息中【五行分值权威数据】段落给出的 wxScore 值（木火土金水顺序保留 1 位小数），绝对禁止自己重新累加或估计**`
  }

  if (type === 'meihua') {
    return `你是一位精通梅花易数的资深占卜师，传承邵雍邵康节一脉，旁参《周易》《易经》十翼，擅长以体用生克、旺相休囚、互变综错断事，断语精准，应期如神。

## 时间基准（必须严格遵守）
- 起卦/解读时的真实当前日期：${currDateCN}（公历 ${nowISO.slice(0,10)}）
- 当前公历年：${currYear} 年
- 当前农历干支年：${currYr}
- 应期推算一律以公历 ${currYear} 年和 ${currMonth} 月为基准

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
- **近应期**：近期（30天内，即 ${next5.slice(0,4)} 年内）的应期，精确到日期或时段
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

  return ''
}

// 公历年 → 干支年（简化版，按立春分割）
function ganzhiYear(year /* number */, month /* 1-12 */, day /* 1-31 */) {
  // 立春一般在 2/3 或 2/4；2/4 前算上一年
  const lunarYear = (month < 2 || (month === 2 && day < 4)) ? year - 1 : year
  const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
  const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
  const gi = ((lunarYear - 4) % 10 + 10) % 10
  const zi = ((lunarYear - 4) % 12 + 12) % 12
  return GAN[gi] + ZHI[zi]
}

function canUseAi(user) {
  // 管理员永远可以用
  if (user.is_admin) return { ok: true, type: 'admin' }

  const now = Date.now()
  const isActiveVip = user.is_vip && user.vip_expire_at && user.vip_expire_at > now
  const credits = Number(user.ai_credits) || 0
  const used = Number(user.free_daily_used) || 0
  const DAILY_LIMIT = 3

  // 会员优先享受每天 3 次（用完再走 credits）
  if (isActiveVip && used < DAILY_LIMIT) {
    return { ok: true, type: 'vip_daily', dailyLimit: DAILY_LIMIT, used }
  }
  // 有单次额度的，不管是不是会员都能扣
  if (credits > 0) {
    return { ok: true, type: 'paid', credits }
  }
  // 会员但今天 3 次用完 + 没买过单次额度 → 不让用
  if (isActiveVip) {
    return { ok: false, reason: `今日会员 3 次额度已用完，请明天再来，或购买「单次额度 ¥36」继续解读。` }
  }
  // 非会员 + 没买过单次额度 → 完全不让用，引导付费
  return {
    ok: false,
    reason: '您还没有开通会员或购买单次额度。请前往会员中心：7天会员 ¥166 / 月会员 ¥600 / 年会员 ¥5200 / 单次额度 ¥36'
  }
}

router.post('/interpret', async (req, res) => {
  const { type, payload, question } = req.body || {}
  const validTypes = ['bazi', 'meihua']
  if (!validTypes.includes(type)) return res.status(400).json({ error: '未知类型' })
  if (!payload) return res.status(400).json({ error: '缺少排盘数据' })
  const db = req.db
  const auth = canUseAi(req.user)
  if (!auth.ok) return res.status(402).json({ error: auth.reason })

  // 构建时间上下文：始终使用服务器真实时间
  const now = new Date()
  const currYear = now.getFullYear()
  const currMonth = now.getMonth() + 1
  const currDay = now.getDate()
  const nowISO = now.toISOString()
  const currYr = ganzhiYear(currYear, currMonth, currDay)
  const next5Arr = Array.from({length: 5}, (_, i) => currYear + i)
  const next5 = `${next5Arr[0]}-${next5Arr[next5Arr.length - 1]}`
  const currDateCN = `${currYear}年${currMonth}月${currDay}日（${currYr}年）`
  const timeCtx = { nowISO, currYear, currYr, next5, currDateCN, currMonth }
  const systemPrompt = buildSystemPrompt(type, timeCtx)

  // 八字类型：单独把前端算好的五行分值/旺衰单独高亮，防止 AI 读 JSON 时自己重算一遍和 UI 展示不一致
  const wxAuthBlock = type === 'bazi' && payload && payload.wxScore
    ? `\n【五行分值权威数据 - 写五行相关段落必须严格引用此表，不得重算】\n` +
      ['木','火','土','金','水'].map(k => `- ${k}：${Number(payload.wxScore[k]||0).toFixed(1)} 分`).join('\n') +
      (payload.wxPercent ? '\n占比：' + ['木','火','土','金','水'].map(k => `${k}${Math.round((payload.wxPercent[k]||0)*100)}%`).join(' / ') : '') +
      (payload.wangLevel ? `\n日主旺衰判定：${payload.wangLevel}（得令 ${Number(payload.deLingScore||0).toFixed(1)} / 得地 ${Number(payload.deDiScore||0).toFixed(1)} / 得助 ${Number(payload.deZhuScore||0).toFixed(1)} / 合计 ${Number(payload.totalWangScore||0).toFixed(1)}）` : '') +
      (payload.yongShen?.yong ? `\n用神：${payload.yongShen.yong.join('、')}  喜神：${payload.yongShen.xi.join('、')}  忌神：${payload.yongShen.ji.join('、')}` : '') +
      `\n四柱：${payload.pillars?.map(p=>p.ganzhi).join(' · ') || ''}\n`
    : ''

  const userPrompt =
`【用户求问】${question || '请基于排盘信息综合解读'}
【排盘数据（JSON）】
${JSON.stringify(payload, null, 2)}
${wxAuthBlock}
【重要时间锚点 - 必须以此为准】
解读时的真实当前日期：${currDateCN}
"今年"特指：${currYear} 年（${currYr}）
近5年逐年分析范围：${next5}`

  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions'
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  console.log('[deepseek] config:', {
    hasKey: !!apiKey,
    keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'NOT_SET',
    apiUrl,
    model
  })

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
      console.log('[deepseek] calling API...', { model, messageCount: 2 })
      const { data } = await axios.post(apiUrl, {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        stream: false
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 55000
      })
      content = data.choices?.[0]?.message?.content?.trim() || '(空响应)'
      tokens = data.usage?.total_tokens || 0
      console.log('[deepseek] success:', { tokens })
    } catch (e) {
      console.error('[deepseek] err:', {
        message: e.message,
        status: e.response?.status,
        data: e.response?.data,
        code: e.code
      })
      const errData = e.response?.data
      const errMsg = (typeof errData === 'object' && errData?.error)
        ? (errData.error.message || errData.error)
        : (errData?.message || e.message || '未知错误')
      const errStatus = e.response?.status
      
      const isNetworkError = !e.response && (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || e.code === 'ENOTFOUND')
      const errType = isNetworkError ? '网络超时' : (errStatus ? `服务异常(${errStatus})` : '未知异常')
      
      console.warn('[deepseek] AI异常，回退到演示模式:', { errType, errMsg, errStatus })
      content =
`⚠️ AI 服务暂时不可用（${errType}）。

错误详情：${errMsg}

可能原因：
1. 网络连接超时
2. API Key 认证失败或余额不足
3. 请求过于频繁，请稍后再试
4. AI 服务暂时不可用

系统已自动为您生成排盘数据概览：
类型：${type}
月令旺衰：${JSON.stringify(payload.wangLevel || '')}
体用关系：${JSON.stringify(payload.shiShenCount || '')}

请稍后重试，或联系管理员检查 AI 服务配置。`
    }
  }

  // 安全扣次和日志（包裹在 try-catch 中，防止数据库故障导致 502）
  const tsNow = Date.now()
  try {
    if (auth.type === 'vip_daily') {
      await db.prepare('UPDATE users SET free_daily_used = free_daily_used + 1, updated_at = ? WHERE id = ?').run(tsNow, req.user.id)
    } else if (auth.type === 'paid') {
      await db.prepare('UPDATE users SET ai_credits = MAX(0, ai_credits - 1), updated_at = ? WHERE id = ?').run(tsNow, req.user.id)
    }
    // admin 类型不扣次
    await db.prepare('INSERT INTO ai_logs (user_id,type,prompt,tokens_used,created_at) VALUES (?,?,?,?,?)')
      .run(req.user.id, type, JSON.stringify({ question }).slice(0, 500), tokens, tsNow)
  } catch (dbErr) {
    console.error('[deepseek] 数据库操作失败（不影响返回内容）:', dbErr.message)
  }

  // 查询最新额度
  let remain = 0
  let aiCredits = 0
  let freeUsed = 0
  let dailyLimit = 3
  try {
    const updated = await db.prepare('SELECT ai_credits, free_daily_used, is_vip, vip_expire_at FROM users WHERE id = ?').get(req.user.id) || {}
    aiCredits = Number(updated.ai_credits) || 0
    freeUsed = Number(updated.free_daily_used) || 0
    const now = Date.now()
    const isActiveVip = updated.is_vip && updated.vip_expire_at && Number(updated.vip_expire_at) > now
    if (auth.type === 'admin') {
      remain = 9999
    } else if (auth.type === 'vip_daily') {
      remain = Math.max(0, dailyLimit - freeUsed) + aiCredits
    } else {
      remain = Math.max(0, aiCredits)
    }
  } catch {
    remain = auth.type === 'admin' ? 9999 : Math.max(0, Number(req.user.ai_credits) || 0)
    aiCredits = Number(req.user.ai_credits) || 0
    freeUsed = Number(req.user.free_daily_used) || 0
  }

  res.json({
    content, tokens, remain, authType: auth.type,
    aiCredits, freeUsed, dailyLimit
  })
})

router.get('/quota', (req, res) => {
  const info = canUseAi(req.user)
  const now = Date.now()
  const isActiveVip = req.user.is_vip && req.user.vip_expire_at && req.user.vip_expire_at > now
  res.json({
    isVip: !!isActiveVip,
    isAdmin: !!req.user.is_admin,
    authType: info.type,
    dailyLimit: 3,
    dailyUsed: Number(req.user.free_daily_used) || 0,
    dailyRemain: isActiveVip ? Math.max(0, 3 - (Number(req.user.free_daily_used) || 0)) : 0,
    aiCredits: Number(req.user.ai_credits) || 0,
    vipExpireAt: req.user.is_vip && req.user.vip_expire_at ? Number(req.user.vip_expire_at) : null,
    // 前端显示时可直接用
    canUse: info.ok,
    reason: info.reason || ''
  })
})

module.exports = router
