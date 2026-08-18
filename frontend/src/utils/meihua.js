// 梅花易数核心工具 - 体用、互卦、变卦、综卦、错卦、旺衰
export const ZHI_INDEX = { 子:1, 丑:2, 寅:3, 卯:4, 辰:5, 巳:6, 午:7, 未:8, 申:9, 酉:10, 戌:11, 亥:12 }
export const WX_CLASS = { 金:'wx-jin', 木:'wx-mu', 水:'wx-shui', 火:'wx-huo', 土:'wx-tu' }

import { GAN_WUXING, ZHI_WUXING } from './bazi.js'

// 八卦
// lines 索引 0=初爻（下）、1=二爻、2=三爻（上）
export const BAGUA = [
  null,
  { id:1, name:'乾', symbol:'☰', nature:'天', wx:'金', lines:[1,1,1] }, // 三阳
  { id:2, name:'兑', symbol:'☱', nature:'泽', wx:'金', lines:[1,1,0] }, // 上阴
  { id:3, name:'离', symbol:'☲', nature:'火', wx:'火', lines:[1,0,1] }, // 中虚
  { id:4, name:'震', symbol:'☳', nature:'雷', wx:'木', lines:[1,0,0] }, // 初阳
  { id:5, name:'巽', symbol:'☴', nature:'风', wx:'木', lines:[0,1,1] }, // 初阴
  { id:6, name:'坎', symbol:'☵', nature:'水', wx:'水', lines:[0,1,0] }, // 中实
  { id:7, name:'艮', symbol:'☶', nature:'山', wx:'土', lines:[0,0,1] }, // 上阳
  { id:8, name:'坤', symbol:'☷', nature:'地', wx:'土', lines:[0,0,0] }, // 三阴
]
export const BAGUA_BY_ID = Object.fromEntries(BAGUA.filter(Boolean).map(b => [b.id, b]))
// 按 lines 反查（按 lines 数组生成 key）
const _lk = (l) => l.join('')
const BAGUA_BY_LINES = Object.fromEntries(BAGUA.filter(Boolean).map(b => [_lk(b.lines), b]))

// ========== 64卦（通行本周易序列） ==========
// 格式：[upGuaId, downGuaId, no, '卦名']
const _ORD = [
  [1,1,1,'乾为天'],      [8,8,2,'坤为地'],      [6,4,3,'水雷屯'],      [7,6,4,'山水蒙'],
  [6,1,5,'水天需'],      [1,6,6,'天水讼'],      [8,6,7,'地水师'],      [6,8,8,'水地比'],
  [5,1,9,'风天小畜'],    [1,2,10,'天泽履'],     [8,1,11,'地天泰'],     [1,8,12,'天地否'],
  [1,3,13,'天火同人'],   [3,1,14,'火天大有'],   [8,7,15,'地山谦'],     [4,8,16,'雷地豫'],
  [2,4,17,'泽雷随'],     [7,5,18,'山风蛊'],     [8,2,19,'地泽临'],     [5,8,20,'风地观'],
  [3,4,21,'火雷噬嗑'],   [7,3,22,'山火贲'],     [7,8,23,'山地剥'],     [8,4,24,'地雷复'],
  [1,4,25,'天雷无妄'],   [7,1,26,'山天大畜'],   [7,4,27,'山雷颐'],     [2,5,28,'泽风大过'],
  [6,6,29,'坎为水'],      [3,3,30,'离为火'],      [2,7,31,'泽山咸'],     [4,5,32,'雷风恒'],
  [1,7,33,'天山遁'],     [4,1,34,'雷天大壮'],   [3,8,35,'火地晋'],     [8,3,36,'地火明夷'],
  [5,3,37,'风火家人'],   [3,2,38,'火泽睽'],     [6,7,39,'水山蹇'],     [4,6,40,'雷水解'],
  [7,2,41,'山泽损'],     [5,4,42,'风雷益'],     [2,1,43,'泽天夬'],     [1,5,44,'天风姤'],
  [2,8,45,'泽地萃'],     [8,5,46,'地风升'],     [2,6,47,'泽水困'],     [6,5,48,'水风井'],
  [2,3,49,'泽火革'],     [3,5,50,'火风鼎'],     [4,4,51,'震为雷'],      [7,7,52,'艮为山'],
  [5,7,53,'风山渐'],     [4,2,54,'雷泽归妹'],   [4,3,55,'雷火丰'],     [3,7,56,'火山旅'],
  [5,5,57,'巽为风'],      [2,2,58,'兑为泽'],      [5,6,59,'风水涣'],     [6,2,60,'水泽节'],
  [5,2,61,'风泽中孚'],   [4,7,62,'雷山小过'],   [6,3,63,'水火既济'],   [3,6,64,'火水未济'],
]
export const HEXAGRAMS = _ORD.map(([up, down, no, name]) => {
  const upG = BAGUA_BY_ID[up]
  const downG = BAGUA_BY_ID[down]
  const lines = []
  for (let i = 1; i <= 6; i++) lines.push({ n:i, text:`第${i}爻：详见《周易》原文`, xiang:`象曰：爻${i}` })
  // 卦名 + 大象（精简）
  const xiangFull = `${upG.nature}${upG.nature===downG.nature?'洊':(downG.nature)}，${name}；君子以见善则迁，有过则改。`
  return {
    no, up, down, name,
    judgment: '元亨利贞（详见《周易》原文）',
    tuan: `《彖》曰：${name}，刚柔相摩，八卦相荡。`,
    xiang: xiangFull,
    lines,
  }
})
// 重写乾坤两卦核心爻辞
HEXAGRAMS.find(h => h.no === 1).lines = [
  { n:1,text:'潜龙勿用。',xiang:'潜龙勿用，阳在下也。' },
  { n:2,text:'见龙在田，利见大人。',xiang:'见龙在田，德施普也。' },
  { n:3,text:'君子终日乾乾，夕惕若，厉无咎。',xiang:'终日乾乾，反复道也。' },
  { n:4,text:'或跃在渊，无咎。',xiang:'或跃在渊，进无咎也。' },
  { n:5,text:'飞龙在天，利见大人。',xiang:'飞龙在天，大人造也。' },
  { n:6,text:'亢龙有悔。',xiang:'亢龙有悔，盈不可久也。' },
]
HEXAGRAMS.find(h => h.no === 2).lines = [
  { n:1,text:'履霜，坚冰至。',xiang:'履霜坚冰，阴始凝也。' },
  { n:2,text:'直方大，不习无不利。',xiang:'六二之动，直以方也。' },
  { n:3,text:'含章可贞，或从王事，无成有终。',xiang:'含章可贞，以时发也。' },
  { n:4,text:'括囊，无咎无誉。',xiang:'括囊无咎，慎不害也。' },
  { n:5,text:'黄裳元吉。',xiang:'黄裳元吉，文在中也。' },
  { n:6,text:'龙战于野，其血玄黄。',xiang:'龙战于野，其道穷也。' },
]
export const HEX_LOOKUP = Object.fromEntries(HEXAGRAMS.map(h => [`${h.up}-${h.down}`, h]))
export function lookupHex(up, down) { return HEX_LOOKUP[`${up}-${down}`] || null }

// ===== 辅助 =====
function mod8(n){ return ((n-1)%8+8)%8+1 }
function mod6(n){ return ((n-1)%6+6)%6+1 }

// 求互卦（2-4爻做下，3-5爻做上）
export function huGua(hex) {
  const up = BAGUA_BY_ID[hex.up]
  const down = BAGUA_BY_ID[hex.down]
  // full lines: down 在下(1,2,3爻)，up 在上(4,5,6爻)
  const lines = [...down.lines, ...up.lines] // index 0=初爻(1) ... 5=上爻(6)
  const huDown = [lines[1], lines[2], lines[3]] // 2-4爻 -> 下卦
  const huUp   = [lines[2], lines[3], lines[4]] // 3-5爻 -> 上卦
  const huUpId = BAGUA_BY_LINES[_lk(huUp)]?.id
  const huDownId = BAGUA_BY_LINES[_lk(huDown)]?.id
  return lookupHex(huUpId, huDownId)
}

// 变卦：动爻变（1变0，0变1）
export function bianGua(hex, movingLine) {
  // movingLine: 1-6 (1=初爻=下卦最下)
  const up = BAGUA_BY_ID[hex.up]
  const down = BAGUA_BY_ID[hex.down]
  const lines = [...down.lines, ...up.lines]
  const i = movingLine - 1
  lines[i] = lines[i] === 1 ? 0 : 1
  const newDownId = BAGUA_BY_LINES[_lk(lines.slice(0,3))]?.id
  const newUpId = BAGUA_BY_LINES[_lk(lines.slice(3,6))]?.id
  return lookupHex(newUpId, newDownId)
}

// 错卦（阴阳互变）
export function cuoGua(hex) {
  const up = BAGUA_BY_ID[hex.up].lines.map(v => 1-v)
  const down = BAGUA_BY_ID[hex.down].lines.map(v => 1-v)
  return lookupHex(BAGUA_BY_LINES[_lk(up)]?.id, BAGUA_BY_LINES[_lk(down)]?.id)
}

// 综卦（上下倒转）
export function zongGua(hex) {
  const up = [...BAGUA_BY_ID[hex.up].lines].reverse()
  const down = [...BAGUA_BY_ID[hex.down].lines].reverse()
  // 注意：倒转后，原上卦的底变顶，成了新下卦
  const newDown = up // 原上翻转 -> 新下
  const newUp = down // 原下翻转 -> 新上
  return lookupHex(BAGUA_BY_LINES[_lk(newUp)]?.id, BAGUA_BY_LINES[_lk(newDown)]?.id)
}

// 体用关系 & 吉凶
const WX_REL = {
  金:{ 生:'水', 克:'木', 被生:'土', 被克:'火' },
  水:{ 生:'木', 克:'火', 被生:'金', 被克:'土' },
  木:{ 生:'火', 克:'土', 被生:'水', 被克:'金' },
  火:{ 生:'土', 克:'金', 被生:'木', 被克:'水' },
  土:{ 生:'金', 克:'水', 被生:'火', 被克:'木' },
}
function relation(tiWX, yongWX) {
  if (tiWX === yongWX) return '比和'
  if (WX_REL[tiWX].生 === yongWX) return '体生用'
  if (WX_REL[tiWX].克 === yongWX) return '体克用'
  if (WX_REL[tiWX].被生 === yongWX) return '用生体'
  if (WX_REL[tiWX].被克 === yongWX) return '用克体'
  return '未知'
}
const LUCK_MAP = {
  '用生体': { l:'大吉', note:'用卦生扶体卦，谋事易成，多有贵人相助。', s:5 },
  '比和':   { l:'吉',   note:'体用同气，诸事和合，平稳顺遂。', s:4 },
  '体克用': { l:'中吉', note:'体卦克制用卦，事在人为，稍劳而后得。', s:3 },
  '体生用': { l:'小凶', note:'体卦生用为泄气，多耗费而少所得。', s:2 },
  '用克体': { l:'凶',   note:'用卦克制体卦，阻滞重重，宜守不宜攻。', s:1 },
}
export function luckOf(rel) { return LUCK_MAP[rel] || { l:'平', note:'关系不明，参看卦辞爻象。', s:3 } }

// 月令旺衰（月支 -> 五行，判断体卦的旺相休囚死）
export function tiWangShuai(tiWX, monthZhiWX) {
  const rel = relation(monthZhiWX, tiWX) // 月令对体卦：月生体=相 体同月=旺 体生月=休 体克月=死 月克体=囚
  // 另一种标准：以五行为本。月令为主宰
  if (tiWX === monthZhiWX) return { tag:'旺', score:3 }
  if (WX_REL[monthZhiWX].生 === tiWX) return { tag:'相', score:2 }
  if (WX_REL[tiWX].被生 === monthZhiWX) return { tag:'休', score:1 }
  if (WX_REL[monthZhiWX].被克 === tiWX) return { tag:'囚', score:0 }
  if (WX_REL[tiWX].克 === monthZhiWX) return { tag:'死', score:-1 }
  return { tag:'平', score:1 }
}

// 数字起卦
export function meihuaByNumber(up, down, dongNum) {
  const upId = mod8(up)
  const downId = mod8(down)
  const sum = dongNum > 0 ? dongNum : (up + down)
  const moving = mod6(sum)
  return buildMeihua(upId, downId, moving, { source:'number', upNum:up, downNum:down, sumNum:sum })
}

// 时间起卦（年支+月+日 得上卦；再加时支得下卦；总除6得动爻）
export function meihuaByTime(yearZhiNum, month, day, timeZhiNum) {
  const sum1 = yearZhiNum + month + day
  const sum2 = sum1 + timeZhiNum
  const upId = mod8(sum1)
  const downId = mod8(sum2)
  const moving = mod6(sum2)
  return buildMeihua(upId, downId, moving, { source:'time', yearZhiNum, month, day, timeZhiNum })
}

function buildMeihua(upId, downId, movingLine, meta) {
  const up = BAGUA_BY_ID[upId]
  const down = BAGUA_BY_ID[downId]
  const ben = lookupHex(upId, downId)
  const movingInUpper = movingLine >= 4
  const ti = movingInUpper ? down : up       // 动在上，则下为体
  const yong = movingInUpper ? up : down
  const rel = relation(ti.wx, yong.wx)
  const luck = luckOf(rel)
  const hu = huGua(ben)
  const bian = bianGua(ben, movingLine)
  const cuo = cuoGua(ben)
  const zong = zongGua(ben)
  return {
    meta,
    ben, hu, bian, cuo, zong,
    movingLine,
    movingInUpper,
    upper: up, lower: down,
    ti, yong,
    relation: rel,
    luck,
    // 供AI解读使用的结构化内容
    lineText: ben.lines?.[movingLine-1]
  }
}
