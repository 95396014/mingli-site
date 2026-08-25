// 八字精准计算工具 - 基于 lunar-javascript
// 输出：四柱、藏干、十神、纳音、空亡、五行统计、旺衰、大运、流年
// 支持：公历/农历切换、夏令时开关、真太阳时（按经度修正）

import { Solar, Lunar } from 'lunar-javascript'

// ===== 基础常量 =====
export const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
export const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']

export const GAN_WUXING = { 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水' }
export const ZHI_WUXING = { 子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水' }
export const GAN_YINYANG = { 甲:1,乙:0,丙:1,丁:0,戊:1,己:0,庚:1,辛:0,壬:1,癸:0 }
export const ZHI_YINYANG = { 子:1,丑:0,寅:1,卯:0,辰:1,巳:0,午:1,未:0,申:1,酉:0,戌:1,亥:0 }

// 地支藏干（本气/中气/余气）
export const ZHI_CANGGAN = {
  子: [{ g:'癸', w:1.0 }],
  丑: [{ g:'己', w:0.6 },{ g:'癸', w:0.2 },{ g:'辛', w:0.2 }],
  寅: [{ g:'甲', w:0.6 },{ g:'丙', w:0.25 },{ g:'戊', w:0.15 }],
  卯: [{ g:'乙', w:1.0 }],
  辰: [{ g:'戊', w:0.6 },{ g:'乙', w:0.25 },{ g:'癸', w:0.15 }],
  巳: [{ g:'丙', w:0.6 },{ g:'戊', w:0.25 },{ g:'庚', w:0.15 }],
  午: [{ g:'丁', w:0.7 },{ g:'己', w:0.3 }],
  未: [{ g:'己', w:0.6 },{ g:'丁', w:0.25 },{ g:'乙', w:0.15 }],
  申: [{ g:'庚', w:0.6 },{ g:'壬', w:0.25 },{ g:'戊', w:0.15 }],
  酉: [{ g:'辛', w:1.0 }],
  戌: [{ g:'戊', w:0.6 },{ g:'辛', w:0.25 },{ g:'丁', w:0.15 }],
  亥: [{ g:'壬', w:0.7 },{ g:'甲', w:0.3 }],
}

// 纳音
export const NAYIN = {
  '甲子':'海中金','乙丑':'海中金','丙寅':'炉中火','丁卯':'炉中火','戊辰':'大林木','己巳':'大林木',
  '庚午':'路旁土','辛未':'路旁土','壬申':'剑锋金','癸酉':'剑锋金','甲戌':'山头火','乙亥':'山头火',
  '丙子':'涧下水','丁丑':'涧下水','戊寅':'城头土','己卯':'城头土','庚辰':'白蜡金','辛巳':'白蜡金',
  '壬午':'杨柳木','癸未':'杨柳木','甲申':'泉中水','乙酉':'泉中水','丙戌':'屋上土','丁亥':'屋上土',
  '戊子':'霹雳火','己丑':'霹雳火','庚寅':'松柏木','辛卯':'松柏木','壬辰':'长流水','癸巳':'长流水',
  '甲午':'沙中金','乙未':'沙中金','丙申':'山下火','丁酉':'山下火','戊戌':'平地木','己亥':'平地木',
  '庚子':'壁上土','辛丑':'壁上土','壬寅':'金箔金','癸卯':'金箔金','甲辰':'覆灯火','乙巳':'覆灯火',
  '丙午':'天河水','丁未':'天河水','戊申':'大驿土','己酉':'大驿土','庚戌':'钗钏金','辛亥':'钗钏金',
  '壬子':'桑柘木','癸丑':'桑柘木','甲寅':'大溪水','乙卯':'大溪水','丙辰':'沙中土','丁巳':'沙中土',
  '戊午':'天上火','己未':'天上火','庚申':'石榴木','辛酉':'石榴木','壬戌':'大海水','癸亥':'大海水'
}

// 十神：以日干为我
// 生我者印枭（异性正印，同性偏印）
// 我生者食伤（异性伤官，同性食神）
// 克我者官杀（异性正官，同性七杀）
// 我克者财星（异性正财，同性偏财）
// 同我者比劫（异性劫财，同性比肩）
const SHISHEN_TABLE = {
  '生我': { diff: '正印', same: '偏印' },
  '我生': { diff: '伤官', same: '食神' },
  '克我': { diff: '正官', same: '七杀' },
  '我克': { diff: '正财', same: '偏财' },
  '同我': { diff: '劫财', same: '比肩' }
}
const SHENG_KE = {
  '木': { sheng:'火', ke:'土', beSheng:'水', beKe:'金' },
  '火': { sheng:'土', ke:'金', beSheng:'木', beKe:'水' },
  '土': { sheng:'金', ke:'水', beSheng:'火', beKe:'木' },
  '金': { sheng:'水', ke:'木', beSheng:'土', beKe:'火' },
  '水': { sheng:'木', ke:'火', beSheng:'金', beKe:'土' },
}

export function shiShenOfGan(dayGan, targetGan) {
  const me = GAN_WUXING[dayGan]
  const ot = GAN_WUXING[targetGan]
  const meYY = GAN_YINYANG[dayGan]
  const otYY = GAN_YINYANG[targetGan]
  const same = meYY === otYY
  let rel
  if (me === ot) rel = '同我'
  else if (SHENG_KE[me].sheng === ot) rel = '我生'
  else if (SHENG_KE[me].ke === ot) rel = '我克'
  else if (SHENG_KE[me].beSheng === ot) rel = '生我'
  else if (SHENG_KE[me].beKe === ot) rel = '克我'
  return SHISHEN_TABLE[rel][same ? 'same' : 'diff']
}

// 空亡：日柱（或年柱）六甲旬空
// 六甲旬：甲子(戌亥空)、甲戌(申酉空)、甲申(午未空)、甲午(辰巳空)、甲辰(寅卯空)、甲寅(子丑空)
export function kongWangOf(gan, zhi) {
  const gIdx = GAN.indexOf(gan)
  const zIdx = ZHI.indexOf(zhi)
  // 旬首地支 = 日支 - 日干偏移 (因为旬首天干永远是甲=0，所以当前日干就是旬内偏移)
  const start = (zIdx - gIdx + 12) % 12 // 旬首地支
  const k1 = ZHI[(start + 10) % 12]
  const k2 = ZHI[(start + 11) % 12]
  return [k1, k2]
}

// 中国历史上实际执行过夏令时的时段（问真八字等主流排盘软件均按此规则）
// 来源：中华人民共和国 1986-1991 年夏季实行的北京夏令时（非 2000 年后的）
export const CN_DST_RANGES = [
  { start: '1986-05-04 02:00', end: '1986-09-14 02:00' },
  { start: '1987-04-12 02:00', end: '1987-09-13 02:00' },
  { start: '1988-04-17 02:00', end: '1988-09-11 02:00' },
  { start: '1989-04-16 02:00', end: '1989-09-17 02:00' },
  { start: '1990-04-15 02:00', end: '1990-09-16 02:00' },
  { start: '1991-04-21 02:00', end: '1991-09-15 02:00' },
]

export function withinChinaDst(ts /* Date 或 ms */) {
  const d = ts instanceof Date ? ts : new Date(ts)
  const t = d.getTime()
  for (const r of CN_DST_RANGES) {
    // 解析到本地时区 Date 再转 ms（输入输出均按本地无时区日期字面值）
    const [sd, st] = r.start.split(' ')
    const [ed, et] = r.end.split(' ')
    const [sy,smo,sda] = sd.split('-').map(Number)
    const [sh, smin]  = st.split(':').map(Number)
    const [ey,emo,eda] = ed.split('-').map(Number)
    const [eh, emin]  = et.split(':').map(Number)
    const s = new Date(sy, smo-1, sda, sh, smin).getTime()
    const e = new Date(ey, emo-1, eda, eh, emin).getTime()
    if (t >= s && t < e) return true
  }
  return false
}

// 月令：以节气定月支 -> lunar-javascript 已处理
export function calculateBazi({
  year, month, day, hour, minute = 0, second = 0, gender = 0,
  lng = 120, // 经度（真太阳时修正用）
  calendar = 'solar', // 'solar' 公历 / 'lunar' 农历
  lunarLeap = false, // 农历是否闰月（calendar=lunar 时生效）
  dstSwitch = 'auto', // 'auto' 自动识别中国夏令时; 'on' 强制加 1h; 'off' 关闭
  name = '', genderText = '', birthdayRemark = '', place = '',
}) {
  // ====== Step 1：按日历类型把输入先转成公历 Date（本地时间字面值） ======
  let d
  if (calendar === 'lunar') {
    // lunar-javascript 的 Lunar.fromYmd 支持农历 year/month/day + 闰月标识
    const lunar = Lunar.fromYmd(+year, +month, +day, !!lunarLeap ? +month : 0)
    const solar = lunar.getSolar()
    d = new Date(solar.getYear(), solar.getMonth()-1, solar.getDay(), +hour, +minute, +second || 0)
  } else {
    d = new Date(+year, +month - 1, +day, +hour, +minute, +second || 0)
  }

  // ====== Step 2：夏令时还原（用户填的是"当年时钟上显示的夏令时时间"，排盘要还原到标准时） ======
  let dstApplied = false
  let diffMin = 0
  if (dstSwitch === 'on') { diffMin = -60; dstApplied = true }
  else if (dstSwitch === 'auto' && withinChinaDst(d)) {
    diffMin = -60; dstApplied = true
  }
  if (diffMin) d.setMinutes(d.getMinutes() + diffMin)

  // ====== Step 3：真太阳时（经度修正）======
  // 中国统一时区东 8 区 = 东经 120°。每相差 1° = 地方时差 4 分钟
  const lngVal = Number(lng) || 120
  const tzAdjustMin = (lngVal - 120) * 4
  d.setMinutes(d.getMinutes() + tzAdjustMin)

  const solar = Solar.fromDate(d)
  const lunar = solar.getLunar()
  const ec = lunar.getEightChar()

  const yearGan = ec.getYearGan()
  const yearZhi = ec.getYearZhi()
  const monthGan = ec.getMonthGan()
  const monthZhi = ec.getMonthZhi()
  const dayGan = ec.getDayGan()
  const dayZhi = ec.getDayZhi()
  const timeGan = ec.getTimeGan()
  const timeZhi = ec.getTimeZhi()

  const pillars = [
    { key:'year', name:'年柱', gan:yearGan, zhi:yearZhi, ganzhi:yearGan+yearZhi },
    { key:'month', name:'月柱', gan:monthGan, zhi:monthZhi, ganzhi:monthGan+monthZhi },
    { key:'day', name:'日柱', gan:dayGan, zhi:dayZhi, ganzhi:dayGan+dayZhi },
    { key:'time', name:'时柱', gan:timeGan, zhi:timeZhi, ganzhi:timeGan+timeZhi },
  ]

  // 每柱：藏干、藏干十神、纳音、天干十神
  pillars.forEach(p => {
    p.naYin = NAYIN[p.ganzhi] || ''
    p.ganShiShen = (p.key === 'day') ? '日主' : shiShenOfGan(dayGan, p.gan)
    p.cangGan = (ZHI_CANGGAN[p.zhi] || []).map(c => ({
      gan: c.g, weight: c.w,
      shiShen: shiShenOfGan(dayGan, c.g),
      wuxing: GAN_WUXING[c.g]
    }))
    // 地支十神：本气藏干的十神
    const benQi = (ZHI_CANGGAN[p.zhi] || [])[0]
    p.zhiShiShen = benQi ? shiShenOfGan(dayGan, benQi.g) : ''
    p.zhiWX = ZHI_WUXING[p.zhi]
  })

  // 五行统计：天干1.0分，藏干按比例
  const wxScore = { 金:0, 木:0, 水:0, 火:0, 土:0 }
  const wxDetail = { 金:[], 木:[], 水:[], 火:[], 土:[] }
  pillars.forEach(p => {
    const gx = GAN_WUXING[p.gan]
    wxScore[gx] += 1.0
    wxDetail[gx].push(`${p.name}干 ${p.gan}`)
    p.cangGan.forEach(c => {
      const cx = GAN_WUXING[c.gan]
      wxScore[cx] += c.weight
      wxDetail[cx].push(`${p.name}藏 ${c.gan}(${(c.weight*100).toFixed(0)}%)`)
    })
  })
  const totalWX = Object.values(wxScore).reduce((a,b)=>a+b,0) || 1
  const wxPercent = {}
  Object.keys(wxScore).forEach(k => wxPercent[k] = wxScore[k] / totalWX)

  // 月令旺相休囚死（日主五行 vs 月支五行）
  const monthWX = ZHI_WUXING[monthZhi]
  const wangStatus = wangOf(dayGan, monthWX)

  // 日主旺衰打分（得令 / 得地 / 得助）
  const meWX = GAN_WUXING[dayGan]
  // 得令（月支为我或生我=得令；克我=失令；其他平）
  let deLingScore = 0
  if (SHENG_KE[meWX].beSheng === monthWX) deLingScore = 2
  else if (meWX === monthWX) deLingScore = 1.5
  else if (SHENG_KE[meWX].sheng === monthWX) deLingScore = -1
  else if (SHENG_KE[meWX].beKe === monthWX) deLingScore = -2
  // 得地：地支藏干中同类/生我者得分（除月令外）
  let deDiScore = 0
  pillars.forEach(p => {
    if (p.key === 'day') return
    p.cangGan.forEach(c => {
      if (GAN_WUXING[c.gan] === meWX) deDiScore += c.weight
      else if (SHENG_KE[meWX].beSheng === GAN_WUXING[c.gan]) deDiScore += c.weight * 0.6
    })
  })
  // 得助：其他天干有同类
  let deZhuScore = 0
  pillars.forEach(p => {
    if (p.key === 'day') return
    if (GAN_WUXING[p.gan] === meWX) deZhuScore += 1
    else if (SHENG_KE[meWX].beSheng === GAN_WUXING[p.gan]) deZhuScore += 0.5
  })
  const totalWangScore = deLingScore + deDiScore + deZhuScore
  let wangLevel = '中和'
  if (totalWangScore > 4.5) wangLevel = '偏旺'
  else if (totalWangScore > 2.5) wangLevel = '略旺'
  else if (totalWangScore > -1) wangLevel = '中和'
  else if (totalWangScore > -3) wangLevel = '略弱'
  else wangLevel = '偏弱'

  // 空亡：以日旬空为主，兼年旬
  const dayKong = kongWangOf(dayGan, dayZhi)
  const yearKong = kongWangOf(yearGan, yearZhi)

  // 十神分布计数
  const shiShenCount = { 比肩:0, 劫财:0, 食神:0, 伤官:0, 偏财:0, 正财:0, 七杀:0, 正官:0, 偏印:0, 正印:0 }
  pillars.forEach(p => {
    if (p.key !== 'day') shiShenCount[p.ganShiShen] = (shiShenCount[p.ganShiShen]||0) + 1
    p.cangGan.forEach(c => {
      shiShenCount[c.shiShen] = (shiShenCount[c.shiShen]||0) + c.weight
    })
  })

  // 格局：以月令为核心，看月令藏干 + 天干透出
  const gejuInfo = gejuOf(yearGan, monthGan, monthZhi, dayGan, timeGan, yearZhi, dayZhi, timeZhi)
  // 用神喜忌：基于日主旺衰做基础判断（简化版，够用）
  const yongShen = yongShenOf(wangLevel, meWX, monthWX, shiShenCount)

  // 大运 & 流年（手动计算，确保与传统排盘一致）
  const { qiYunAge, daYunList } = calculateDaYun({
    yearGan, monthGan, monthZhi, dayGan, gender, birthDate: d
  })
  const qiYunSui = Math.max(1, Math.round(qiYunAge))
  const qiYunYear = Math.round(d.getFullYear() + qiYunAge)
  const qiYunDate = `${qiYunYear} 年起运`

  // 华盖贵人
  const huaGai = getHuaGai(yearZhi, dayZhi, monthZhi)

  return {
    pillars, dayGan, dayZhi,
    // ====== 基础信息 ======
    meta: {
      name: name || '',
      genderText: genderText || (gender === 0 ? '乾造 · 男' : '坤造 · 女'),
      place: place || '',
      birthdayRemark: birthdayRemark || '',
      calendar,
      lunarLeap: !!lunarLeap,
      dstSwitch,
      dstApplied,
      lng: lngVal,
    },
    shengXiao: lunar.getYearShengXiao(),
    lunarStr: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}日`,
    solarStr: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,
    trueSolar: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
    tzAdjustMin: Math.round(tzAdjustMin),
    dstAdjustMin: dstApplied ? -60 : 0,
    gender: gender === 0 ? '男' : '女',
    wxScore, wxPercent, wxDetail,
    monthWX, wangStatus,
    deLingScore, deDiScore, deZhuScore, totalWangScore, wangLevel,
    dayKong, yearKong,
    shiShenCount,
    geju: gejuInfo, yongShen: yongShen,
    qiYunSui, qiYunDate,
    daYunList,
    huaGai,
    solarTerm: getSolarTermOfDate(d),
    nextSolarTerm: (() => {
      try {
        const nj = Solar.fromDate(d).getLunar().getNextJieQi?.()
        if (!nj) return ''
        if (typeof nj === 'string') return nj
        return nj.getName?.() || nj._p?.name || nj.toString?.() || ''
      } catch { return '' }
    })(),
    nextSolarTermDate: (() => {
      try {
        const nj = Solar.fromDate(d).getLunar().getNextJieQi?.()
        const s = nj?.getSolar?.()
        if (!s) return ''
        return `${s.getYear()}-${String(s.getMonth()).padStart(2,'0')}-${String(s.getDay()).padStart(2,'0')}`
      } catch { return '' }
    })()
  }
}

// 查找日期所属节气（取 <= 该日期最近的节气）
// 注：lunar-javascript 的 getJieQi() 仅在"当天正好是节气"时返回值，
// 其余日期需逐天向前回溯，最多回退 17 天（两个节气相隔约 15.2 天）。
export function getSolarTermOfDate(date) {
  // Step 1: 把输入标准化为 {year, month, day} 三个整数，避免跨 context 的 Date/ Solar instanceof 失效
  let y = 0, m = 0, day = 0
  try {
    if (date instanceof Date) {
      y = date.getFullYear(); m = date.getMonth() + 1; day = date.getDate()
    } else if (date && typeof date === 'object' && typeof date.getFullYear === 'function') {
      y = date.getFullYear(); m = date.getMonth() + 1; day = date.getDate()
    } else if (date && typeof date === 'object' && typeof date.getYear === 'function') {
      // 鸭子类型：lunar-javascript Solar 对象
      y = date.getYear(); m = date.getMonth(); day = date.getDay()
    } else if (typeof date === 'number' || typeof date === 'string') {
      const d = new Date(date)
      y = d.getFullYear(); m = d.getMonth() + 1; day = d.getDate()
    }
  } catch (_) { y = 0 }
  if (!y) return ''
  let s
  try { s = Solar.fromYmd(y, m, day) } catch (_) { return '' }
  // Step 2: 向前回溯找最近的节气
  for (let i = 0; i < 18; i++) {
    let lunar
    try { lunar = s.getLunar() } catch (_) { return '' }
    const jq = lunar.getJieQi?.()
    if (jq) {
      if (typeof jq === 'string') return jq
      if (jq.getName) return jq.getName()
      if (jq._p && jq._p.name) return jq._p.name
      return String(jq)
    }
    s = s.next(-1)
  }
  return ''
}

function wangOf(dayGan, monthWX) {
  const me = GAN_WUXING[dayGan]
  // 正确定义：旺(同我)、相(生我者)、休(我生者)、囚(克我者)、死(我克者)
  if (me === monthWX) return { label:'旺', note:'同我者旺，得令当值，气最盛' }
  if (SHENG_KE[me].beSheng === monthWX) return { label:'相', note:'生我者为相，次旺之气' }
  if (SHENG_KE[me].sheng === monthWX) return { label:'休', note:'我生者为休，气渐衰退' }
  if (SHENG_KE[me].beKe === monthWX) return { label:'囚', note:'克我者为囚，气被困厄' }
  if (SHENG_KE[me].ke === monthWX) return { label:'死', note:'我克者为死，气极衰竭' }
  return { label:'平', note:'平和' }
}

// 简易格局判断：以月令为核心 + 天干透出（子平真诠简化版）
// 返回 { main, detail, desc, allTouChu }
function gejuOf(yearGan, monthGan, monthZhi, dayGan, timeGan, yearZhi, dayZhi, timeZhi) {
  const cang = ZHI_CANGGAN[monthZhi] || []
  const tianGan = [ { who:'年', g:yearGan }, { who:'月', g:monthGan }, { who:'时', g:timeGan } ]

  // 收集所有地支藏干（用于检测透干）
  const allZhiCang = []
  const zhiList = [
    { name:'年支', zhi:yearZhi },
    { name:'月支', zhi:monthZhi },
    { name:'日支', zhi:dayZhi },
    { name:'时支', zhi:timeZhi }
  ]
  zhiList.forEach(z => {
    const cg = ZHI_CANGGAN[z.zhi] || []
    cg.forEach(c => {
      allZhiCang.push({ zhi:z.zhi, gan:c.g, weight:c.w, shiShen:shiShenOfGan(dayGan, c.g), src:z.name })
    })
  })

  // 获取所有天干的十神
  const tianGanShiShen = tianGan.map(tg => ({
    ...tg,
    shiShen: shiShenOfGan(dayGan, tg.g)
  }))

  // 检测哪些藏干十神在天干有透出
  const allTouChu = []
  const checkedShiShen = new Set()
  allZhiCang.forEach(c => {
    if (checkedShiShen.has(c.shiShen)) return
    const touGan = tianGanShiShen.filter(tg => tg.shiShen === c.shiShen)
    if (touGan.length > 0) {
      allTouChu.push({
        shiShen: c.shiShen,
        fromZhi: c.src,
        gan: c.gan,
        touGan: touGan.map(t => `${t.who}干${t.g}`)
      })
      checkedShiShen.add(c.shiShen)
    }
  })

  // 取月支本气十神作为主格局
  const benQi = cang[0]
  const mainSS = benQi ? shiShenOfGan(dayGan, benQi.g) : null
  // 月令本气是否透出天干
  const touTianGan = tianGan.filter(tg => shiShenOfGan(dayGan, tg.g) === mainSS)
  const main = mainSS ? `${mainSS}格` : '月令取格不明显'

  // 其它兼格
  const jian = []
  if (mainSS === '正官' || mainSS === '七杀') {
    const youYin = tianGan.some(tg => ['正印','偏印'].includes(shiShenOfGan(dayGan, tg.g)))
    if (youYin && mainSS === '七杀') jian.push('杀印相生')
    if (youYin && mainSS === '正官') jian.push('官印相生')
  }
  if ((mainSS === '食神' || mainSS === '伤官') && tianGan.some(tg => ['七杀','正官'].includes(shiShenOfGan(dayGan, tg.g)))) {
    jian.push('食伤制杀')
  }
  if (['偏财','正财'].includes(mainSS) && tianGan.some(tg => ['七杀','正官'].includes(shiShenOfGan(dayGan, tg.g)))) {
    jian.push('财生官杀')
  }
  if (['正印','偏印'].includes(mainSS) && tianGan.some(tg => ['食神','伤官'].includes(shiShenOfGan(dayGan, tg.g)))) {
    jian.push('枭神夺食（或印生食伤）')
  }

  // 官杀混杂检测
  const guanShaCount = tianGan.filter(tg => ['正官','七杀'].includes(shiShenOfGan(dayGan, tg.g))).length
  if (guanShaCount >= 2) jian.push('官杀混杂')

  // 双正官/双七杀检测
  const zhengGuanCount = tianGan.filter(tg => shiShenOfGan(dayGan, tg.g) === '正官').length
  const qiShaCount = tianGan.filter(tg => shiShenOfGan(dayGan, tg.g) === '七杀').length
  if (zhengGuanCount >= 2) jian.push('双正官透')
  if (qiShaCount >= 2) jian.push('双七杀透')

  let desc = ''
  desc += `月令月支【${monthZhi}】，本气藏干【${benQi?.g}】→ 取为 ${main}。`
  if (touTianGan.length) desc += ` 月令本气【${mainSS}】透于天干：${touTianGan.map(t=>t.who+'干'+t.g).join('、')}。`
  else desc += ` 月令本气未透，藏而不露。`
  if (allTouChu.length) {
    desc += ` 全盘透干：` + allTouChu.map(t => `${t.shiShen}(${t.fromZhi}${t.gan}→${t.touGan.join('、')})`).join('、') + '。'
  }
  if (jian.length) desc += ` 兼看：${jian.join(' / ')}。`

  return {
    main,
    sub: jian,
    detail: desc,
    isTouChu: touTianGan.length > 0,
    touChu: touTianGan,
    allTouChu
  }
}

// 用神喜忌：基于日主旺衰 + 月令
// 返回 { yong, xi, ji, note }
function yongShenOf(wangLevel, meWX, monthWX, shiShenCount) {
  // 同类=比劫；生我=印枭；我生=食伤；我克=财；克我=官杀
  let yong = [], xi = [], ji = []
  let note = ''
  if (wangLevel === '偏旺' || wangLevel === '略旺') {
    // 身旺：宜克（官杀）、泄（食伤）、耗（财）→ 此三者为用神/喜神；忌生扶（印比）
    yong = ['官杀（克身）']
    xi   = ['食伤（泄秀）', '财星（耗身）']
    ji   = ['比劫（帮身）', '印枭（生身）']
    note = `日主${meWX}${wangLevel}，当以克、泄、耗为先：首取官杀制身为用神，食伤泄秀、财星耗身皆为喜；忌再见比劫帮身、印枭生扶则更旺而失衡。`
  } else if (wangLevel === '偏弱' || wangLevel === '略弱') {
    // 身弱：宜生（印）、扶（比劫）→ 用神；忌克泄耗
    yong = ['印枭（生身）']
    xi   = ['比劫（帮身）']
    ji   = ['官杀（克身）', '食伤（泄身）', '财星（耗身）']
    note = `日主${meWX}${wangLevel}，当以生扶为先：首取印枭生身为用神，比劫帮身为喜；忌见官杀来克、食伤泄气、财星耗身，则雪上加霜。`
  } else {
    // 中和：一般取月令相关为用，或财官印俱全取清者
    yong = [monthWX ? `月令${monthWX}（顺势）` : '官杀 / 财星']
    xi   = ['财星（流通）', '印星（护身）']
    ji   = ['偏气过多 / 战克太烈']
    note = `日主${meWX}中和，无大过不及，宜取月令顺势而用；局中以流通平衡为贵，喜财官印相辅，忌偏气独旺或刑冲战克。`
  }
  // 调候：如果月支是冬夏，则水火既济优先（简单版）
  if (monthWX === '水' || monthWX === '火') {
    note += ` · 调候提示：生于${monthWX==='水'?'寒冬（水旺）':'盛夏（火旺）'}，以${monthWX==='水'?'火':'水'}调候为先，有时优先于扶抑。`
  }
  return { yong, xi, ji, note }
}

// 节气日期工具（给UI显示用）
export const SOLAR_TERMS = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至']

// 华盖贵人：年支+日支判断
// 申子辰→辰，寅午戌→戌，巳酉丑→丑，亥卯未→未
export const HUA_GAI_MAP = {
  '申子辰': '辰', '辰申子': '辰', '子辰申': '辰',
  '寅午戌': '戌', '午戌寅': '戌', '戌寅午': '戌',
  '巳酉丑': '丑', '酉丑巳': '丑', '丑巳酉': '丑',
  '亥卯未': '未', '卯未亥': '未', '未亥卯': '未'
}

// 生成大运列表（手动计算，确保与传统排盘一致）
export function calculateDaYun({ yearGan, monthGan, monthZhi, dayGan, gender, birthDate }) {
  // 传统规则：阳年男顺排，阳年女逆排；阴年男逆排，阴年女顺排
  // 甲丙戊庚壬为阳干，乙丁己辛癸为阴干
  const yangGans = ['甲','丙','戊','庚','壬']
  const isYangYear = yangGans.includes(yearGan)
  // gender: 0=男, 1=女
  // 阳男阴女 → 顺排
  // 阴男阳女 → 逆排
  const isShun = (isYangYear && gender === 0) || (!isYangYear && gender === 1)

  // 起运年龄：出生到最近节气的天数 / 3（3天=1岁，1天=4个月，1时辰=10天）
  // 顺排（阳男阴女）：出生到下一个节的时间差 ÷ 3
  // 逆排（阴男阳女）：出生到上一个节的时间差 ÷ 3
  let qiYunAge = 1
  try {
    const lunar = Solar.fromDate(birthDate).getLunar()
    const jq = lunar.getJieQi?.()
    const jqSolar = jq?.getSolar?.()
    const birthMs = birthDate.getTime()
    let diffMs = 0, diffDays = 0
    if (isShun) {
      // 顺排：出生到下一个节气
      const nextJq = lunar.getNextJieQi?.()
      if (nextJq) {
        const nextSolar = nextJq.getSolar()
        const ny = nextSolar.getYear(), nm = nextSolar.getMonth()-1, nd = nextSolar.getDay()
        const nh = nextSolar.getHour?.() || 0, nmin = nextSolar.getMinute?.() || 0
        const nextMs = new Date(ny, nm, nd, nh, nmin).getTime()
        diffMs = nextMs - birthMs
        diffDays = diffMs / (1000 * 60 * 60 * 24)
      }
    } else {
      // 逆排：出生到上一个节气
      if (jqSolar) {
        const jy = jqSolar.getYear(), jm = jqSolar.getMonth()-1, jd = jqSolar.getDay()
        const jh = jqSolar.getHour?.() || 0, jmin = jqSolar.getMinute?.() || 0
        const jqMs = new Date(jy, jm, jd, jh, jmin).getTime()
        diffMs = birthMs - jqMs
        diffDays = diffMs / (1000 * 60 * 60 * 24)
      }
    }
    if (diffDays > 0) {
      qiYunAge = diffDays / 3 // 3天 = 1岁
      if (qiYunAge < 0) qiYunAge = 1
    }
  } catch(e) { /* fallback */ }

  // 大运排列：从月柱开始，顺排取下一个干支，逆排取上一个干支
  const ganIdx = GAN.indexOf(monthGan)
  const zhiIdx = ZHI.indexOf(monthZhi)

  const daYunList = []
  let curGanIdx, curZhiIdx
  if (isShun) {
    curGanIdx = (ganIdx + 1) % 10
    curZhiIdx = (zhiIdx + 1) % 12
  } else {
    curGanIdx = (ganIdx - 1 + 10) % 10
    curZhiIdx = (zhiIdx - 1 + 12) % 12
  }

  for (let i = 0; i < 10; i++) {
    const gz = GAN[curGanIdx] + ZHI[curZhiIdx]
    const startAge = Math.max(1, Math.round(qiYunAge + i * 10))
    const endAge = startAge + 9

    // 计算流年
    const startYear = Math.round(birthDate.getFullYear() + qiYunAge + i * 10)
    const liuNian = []
    // 流年干支从大运起运年份对应的干支开始逐年顺排
    // 先算大运起运年的干支：以 birthYear + qiYunAge 作近似，再按顺序排
    let liuGanIdx = curGanIdx
    let liuZhiIdx = curZhiIdx
    for (let j = 0; j < 10; j++) {
      liuNian.push({
        year: startYear + j,
        ganzhi: GAN[liuGanIdx] + ZHI[liuZhiIdx],
        age: startAge + j
      })
      liuGanIdx = (liuGanIdx + 1) % 10
      liuZhiIdx = (liuZhiIdx + 1) % 12
    }

    daYunList.push({
      idx: i,
      ganzhi: gz,
      startAge,
      endAge,
      startYear,
      endYear: startYear + 9,
      liuNian
    })

    // 按顺/逆方向移动到下一个大运
    if (isShun) {
      curGanIdx = (curGanIdx + 1) % 10
      curZhiIdx = (curZhiIdx + 1) % 12
    } else {
      curGanIdx = (curGanIdx - 1 + 10) % 10
      curZhiIdx = (curZhiIdx - 1 + 12) % 12
    }
  }

  return { qiYunAge, daYunList }
}

// 获取华盖贵人
export function getHuaGai(yearZhi, dayZhi, monthZhi) {
  // 年支和日支组合判断
  const zhiCombo = yearZhi + dayZhi
  for (const [k, v] of Object.entries(HUA_GAI_MAP)) {
    if (k.includes(yearZhi) && k.includes(dayZhi)) {
      // 再检查月令是否符合
      const monthMatch = k.includes(monthZhi)
      return {
        exists: true,
        zhi: v,
        monthMatch,
        desc: monthMatch ? `${yearZhi}${dayZhi}见${v}为华盖，月令${monthZhi}符合` : `${yearZhi}${dayZhi}见${v}为华盖，月令${monthZhi}未参与三合`
      }
    }
  }
  return { exists: false, zhi: '', monthMatch: false, desc: '' }
}

// ===== 四柱反查：根据八字反推公历出生日期 =====
export const JIA_ZI = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12])

// 轻量四柱计算（仅取四柱，不计算大运/十神等），用于反查遍历
export function getFourPillarsOfSolar(y, m, d) {
  try {
    const solar = Solar.fromYmd(+y, +m, +d)
    const lunar = solar.getLunar()
    const ec = lunar.getEightChar()
    return {
      year: ec.getYearGan() + ec.getYearZhi(),
      month: ec.getMonthGan() + ec.getMonthZhi(),
      day: ec.getDayGan() + ec.getDayZhi(),
    }
  } catch (e) {
    return null
  }
}

// 根据日干和时辰地支求时柱干支（五鼠遁）
export function getTimePillar(dayGan, timeZhi) {
  // 甲己日起甲子，乙庚日起丙子，丙辛日起戊子，丁壬日起庚子，戊癸日起壬子
  const startGanMap = { 甲:'甲', 己:'甲', 乙:'丙', 庚:'丙', 丙:'戊', 辛:'戊', 丁:'庚', 壬:'庚', 戊:'壬', 癸:'壬' }
  const zhiIdx = ZHI.indexOf(timeZhi)
  const startGanIdx = GAN.indexOf(startGanMap[dayGan])
  const gan = GAN[(startGanIdx + zhiIdx) % 10]
  return gan + timeZhi
}

/**
 * 四柱反查：在指定公历年份范围内搜索匹配给定四柱的日期
 * @param {Object} params
 * @param {string} params.yearGZ   年柱（如'甲辰'），空字符串表示通配
 * @param {string} params.monthGZ  月柱（如'癸酉'），空字符串表示通配
 * @param {string} params.dayGZ    日柱（如'己巳'），空字符串表示通配
 * @param {string} params.timeGZ   时柱（如'甲子'），空字符串表示通配
 * @param {number} params.startYear 起始年（默认 1900）
 * @param {number} params.endYear   结束年（默认 2100）
 * @param {boolean} params.everyDay 是否显示每一天（默认 false，只显示每个日柱首次出现的那天）
 * @returns {Array<{year,month,day,weekday,lunar,yearGZ,monthGZ,dayGZ,timeList:[{hour,zhi,ganzhi}]}>}
 */
export function reverseBaziSearch({
  yearGZ = '', monthGZ = '', dayGZ = '', timeGZ = '',
  startYear = 1900, endYear = 2100,
  everyDay = false
}) {
  const results = []
  const seenDayGZ = new Set()

  for (let y = +startYear; y <= +endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const daysInMonth = new Date(y, m, 0).getDate()
      for (let d = 1; d <= daysInMonth; d++) {
        const p = getFourPillarsOfSolar(y, m, d)
        if (!p) continue

        // 年/月/日柱匹配
        if (yearGZ && p.year !== yearGZ) continue
        if (monthGZ && p.month !== monthGZ) continue
        if (dayGZ && p.day !== dayGZ) continue

        // 如果未要求时柱，按 everyDay 控制是否收录
        if (!timeGZ) {
          if (!everyDay) {
            if (seenDayGZ.has(`${p.year}-${p.month}-${p.day}`)) continue
            seenDayGZ.add(`${p.year}-${p.month}-${p.day}`)
          }
          const solar = Solar.fromYmd(y, m, d)
          const lunar = solar.getLunar()
          results.push({
            year: y, month: m, day: d,
            weekday: ['日','一','二','三','四','五','六'][new Date(y, m - 1, d).getDay()],
            lunar: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
            yearGZ: p.year, monthGZ: p.month, dayGZ: p.day,
            timeList: []
          })
          continue
        }

        // 需要匹配时柱：枚举 12 个时辰
        const dayGan = p.day[0]
        const matchedTimes = []
        for (let hi = 0; hi < 12; hi++) {
          const zhi = ZHI[hi]
          const gz = getTimePillar(dayGan, zhi)
          if (gz === timeGZ) {
            // 时辰对应的小时范围：子时 23-1，丑时 1-3，... 亥时 21-23
            const startHour = (hi === 0) ? 23 : (hi * 2 - 1)
            const endHour = (hi === 0) ? 1 : (hi * 2 + 1)
            matchedTimes.push({ hour: `${String(startHour).padStart(2,'0')}:00-${String(endHour).padStart(2,'0')}:00`, zhi, ganzhi: gz })
          }
        }
        if (matchedTimes.length === 0) continue

        if (!everyDay) {
          const key = `${p.year}-${p.month}-${p.day}-${timeGZ}`
          if (seenDayGZ.has(key)) continue
          seenDayGZ.add(key)
        }

        const solar = Solar.fromYmd(y, m, d)
        const lunar = solar.getLunar()
        results.push({
          year: y, month: m, day: d,
          weekday: ['日','一','二','三','四','五','六'][new Date(y, m - 1, d).getDay()],
          lunar: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
          yearGZ: p.year, monthGZ: p.month, dayGZ: p.day,
          timeList: matchedTimes
        })
      }
    }
  }

  return results
}
