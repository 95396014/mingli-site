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

  // 格局：以月令为核心，看月令藏干 + 天干透出
  const gejuInfo = gejuOf(yearGan, monthGan, monthZhi, dayGan, timeGan)
  // 用神喜忌：基于日主旺衰做基础判断（简化版，够用）
  const yongShen = yongShenOf(wangLevel, meWX, monthWX, shiShenCount)

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

// 简易格局判断：以月令为核心 + 天干透出（子平真诠简化版）
// 返回 { main, detail, desc }
function gejuOf(yearGan, monthGan, monthZhi, dayGan, timeGan) {
  const cang = ZHI_CANGGAN[monthZhi] || []
  const tianGan = [ { who:'年', g:yearGan }, { who:'月', g:monthGan }, { who:'时', g:timeGan } ]
  function touChu(ganList /* 要找的藏干十神 */) {
    // 月令藏干某气对应十神
    const ss = ganList.map(g => ({ g, ss: shiShenOfGan(dayGan, g.g) }))
    // 看对应十神是否在年/月/时干透出（含月干本身）
    const tou = tianGan.filter(tg => ganList.some(c => shiShenOfGan(dayGan, c.g) === shiShenOfGan(dayGan, tg.g)))
    return { ss, tou }
  }

  // 取月支本气十神作为主格局
  const benQi = cang[0]
  const mainSS = benQi ? shiShenOfGan(dayGan, benQi.g) : null
  // 是否透出
  const touTianGan = tianGan.filter(tg => shiShenOfGan(dayGan, tg.g) === mainSS)
  const main = mainSS ? `${mainSS}格` : '月令取格不明显'

  // 其它兼格
  const jian = []
  if (mainSS === '正官' || mainSS === '七杀') {
    // 官杀是否有印
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

  let desc = ''
  desc += `月令月支【${monthZhi}】，本气藏干【${benQi?.g}】→ 取为 ${main}。`
  if (touTianGan.length) desc += ` 天干透出：${touTianGan.map(t=>t.who+'干'+t.g).join('、')}（有力）。`
  else desc += ` 天干未透出，藏而不露。`
  if (jian.length) desc += ` 兼看：${jian.join(' / ')}。`

  return {
    main,
    sub: jian,
    detail: desc,
    isTouChu: touTianGan.length > 0,
    touChu: touTianGan,
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
