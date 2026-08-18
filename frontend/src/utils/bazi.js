// 八字精准计算工具 - 基于 lunar-javascript
// 输出：四柱、藏干、十神、纳音、空亡、五行统计、旺衰、大运、流年

import { Solar } from 'lunar-javascript'

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
export function kongWangOf(gan, zhi) {
  const gIdx = GAN.indexOf(gan)
  const zIdx = ZHI.indexOf(zhi)
  // 旬首：甲子、甲戌、甲申、甲午、甲辰、甲寅 -> 天干 - 地支 相差0/2/4/6/8/10
  let diff = (gIdx - zIdx + 12) % 12
  // 每旬 10 天干配 12 地支 -> 每旬后两个地支空
  const start = (zIdx - diff + 12) % 12 // 旬首地支
  const k1 = ZHI[(start + 10) % 12]
  const k2 = ZHI[(start + 11) % 12]
  return [k1, k2]
}

// 月令：以节气定月支 -> lunar-javascript 已处理
export function calculateBazi({ year, month, day, hour, minute = 0, second = 0, gender = 0, lng = 120 }) {
  // 真太阳时修正
  const tzAdjustMin = (lng - 120) * 4
  const d = new Date(year, month - 1, day, hour, minute, second || 0)
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
    p.zhiShiShen = shiShenOfGan(dayGan, p.zhi.charAt(0) === p.zhi ? '甲' : '甲') // placeholder 无用
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

  // 大运 & 流年（lunar-javascript）
  const yun = ec.getYun(gender === 0 ? 1 : 0) // male=1, female=0
  const dayunListRaw = yun.getDaYun() || []
  const first = dayunListRaw[0]
  const qiYunSui = first ? (typeof first.getStartAge === 'function' ? first.getStartAge() : 1) : 1
  const qiYunSolar = first?.getStartSolar ? first.getStartSolar() : null
  const qiYunDate = qiYunSolar ? qiYunSolar.toYmd() : '-'
  const daYunList = dayunListRaw.slice(0, 10).map((dy, i) => {
    const startAge = typeof dy.getStartAge === 'function' ? dy.getStartAge() : (qiYunSui + i * 10)
    const endAge = typeof dy.getEndAge === 'function' ? dy.getEndAge() : (startAge + 9)
    const startYear = typeof dy.getStartYear === 'function' ? dy.getStartYear() : null
    const endYear = typeof dy.getEndYear === 'function' ? dy.getEndYear() : null
    const ganzhi = typeof dy.getGanZhi === 'function' ? dy.getGanZhi() : '-'
    let liuNian = []
    try { liuNian = (dy.getLiuNian ? dy.getLiuNian().slice(0, 10) : []).map(ln => ({
      year: typeof ln.getYear === 'function' ? ln.getYear() : null,
      ganzhi: typeof ln.getGanZhi === 'function' ? ln.getGanZhi() : '-',
      age: startAge + (ln.getYear ? (ln.getYear() - startYear) : 0)
    })) } catch(e) {}
    return { idx: i, startAge, endAge, startYear, endYear, ganzhi, liuNian }
  })

  return {
    pillars, dayGan, dayZhi,
    shengXiao: lunar.getYearShengXiao(),
    lunarStr: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}日`,
    solarStr: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,
    trueSolar: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
    tzAdjustMin: Math.round(tzAdjustMin),
    gender: gender === 0 ? '男' : '女',
    wxScore, wxPercent, wxDetail,
    monthWX, wangStatus,
    deLingScore, deDiScore, deZhuScore, totalWangScore, wangLevel,
    dayKong, yearKong,
    shiShenCount,
    qiYunSui, qiYunDate,
    daYunList,
    solarTerm: (typeof lunar.getJieQi === 'function') ? (lunar.getJieQi()?.getName?.() || lunar.getJieQi() || '') : '',
    nextSolarTerm: lunar.getNextJieQi?.()?.getName?.() || '',
    nextSolarTermDate: lunar.getNextJieQi?.()?.getSolar?.()?.toYmd?.() || ''
  }
}

function wangOf(dayGan, monthWX) {
  const me = GAN_WUXING[dayGan]
  // 旺：同我；相：我生；休：生我；囚：克我；死：我克
  if (me === monthWX) return { label:'旺', note:'得令，五行旺相' }
  if (SHENG_KE[me].sheng === monthWX) return { label:'相', note:'我生为相，次旺' }
  if (SHENG_KE[me].beSheng === monthWX) return { label:'休', note:'生我者休，气渐退' }
  if (SHENG_KE[me].beKe === monthWX) return { label:'囚', note:'克我者囚，气被困' }
  if (SHENG_KE[me].ke === monthWX) return { label:'死', note:'我克者死，气衰竭' }
  return { label:'平', note:'平和' }
}

// 节气日期工具（给UI显示用）
export const SOLAR_TERMS = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至']
