import { useMemo, useState } from 'react'
import { meihuaByNumber, meihuaByTime, meihuaByManual, meihuaByAuto, BAGUA_BY_ID, ZHI_INDEX, WX_CLASS, tiWangShuai, solarToLunarState } from '../utils/meihua.js'
import { getHistory, saveHistory, deleteHistory } from '../utils/history.js'
import api from '../utils/api.js'
import { useAuthStore } from '../store/auth.js'
import { Link, useNavigate } from 'react-router-dom'

const ZHI_OPTS = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
const MONTH_WX = { 寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水',子:'水',丑:'土' }
const MONTH_NUM = { 寅:1,卯:2,辰:3,巳:4,午:5,未:6,申:7,酉:8,戌:9,亥:10,子:11,丑:12 }
const ZHI_MONTH = Object.fromEntries(Object.entries(MONTH_NUM).map(([k,v])=>[v,k]))

const MODES = [
  { k:'time',  l:'🕒 时间起卦',  desc:'按占问时间自动换算' },
  { k:'num2',  l:'🔢 数字起卦（两数）', desc:'上卦数+下卦数' },
  { k:'num3',  l:'🔢 数字起卦（三数）', desc:'上卦+下卦+动爻' },
  { k:'manual', l:'✋ 手动指定六爻',  desc:'自由选择爻象' },
  { k:'auto',  l:'🎲 自动起卦',    desc:'系统随机成卦' },
]

const YAO_LABELS = ['初爻','二爻','三爻','四爻','五爻','上爻']
const YAO_OPTS = [
  { v:1, l:'少阳 ╋', desc:'阳爻，不变' },
  { v:0, l:'少阴 ╴', desc:'阴爻，不变' },
  { v:3, l:'老阳 ●', desc:'阳动，变阴' },
  { v:2, l:'老阴 ●', desc:'阴动，变阳' },
]

function Yao({ lines, movingLine }) {
  const arr = [...lines].reverse()
  return (
    <div className="flex flex-col gap-2 py-2 items-center">
      {arr.map((v, i) => {
        const realN = 6 - i
        const isMove = realN === movingLine
        return (
          <div key={i} className="flex items-center justify-center gap-1 relative yao-dong-wrap">
            {v === 1 ? (
              <div className="h-3 rounded-sm bg-ink-900" style={{width: 58}} />
            ) : (
              <div className="flex gap-1.5">
                <div className="h-3 rounded-sm bg-ink-900" style={{width: 26}} />
                <div className="h-3 rounded-sm bg-ink-900" style={{width: 26}} />
              </div>
            )}
            <div className="ml-1.5 flex flex-col items-center justify-center text-[10px] leading-none">
              <span className={isMove ? 'text-primary-700 font-bold' : 'text-ink-400'}>{realN}爻</span>
              {isMove && <span className="text-[10px] text-primary-700 mt-0.5">●动</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HexTile({ hex, label, ti, yong }) {
  if (!hex) return null
  const up = BAGUA_BY_ID[hex.up]; const down = BAGUA_BY_ID[hex.down]
  const lines = [...down.lines, ...up.lines]
  const isTi = (t) => ti && ti.id === t ? true : false
  const isYong = (t) => yong && yong.id === t ? true : false
  return (
    <div className="rounded-2xl border border-ink-200 bg-gradient-to-b from-white to-ink-50 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="tag wx-tu">{label}</span>
        <span className="text-[11px] font-bold text-ink-800 font-song">{hex.no ? `第${hex.no}卦` : ''}</span>
      </div>
      <div className="font-song font-bold text-[15px] text-ink-900 text-center mb-0.5">{hex.name}</div>
      <div className="text-center text-[11px] text-ink-500 mb-1">
        上{up.name}{up.nature} · 下{down.name}{down.nature}
      </div>
      <div className="text-center text-2xl mb-1 tracking-widest text-ink-800">{up.symbol}{down.symbol}</div>
      <div className="mx-auto w-max px-2">
        <Yao lines={lines} movingLine={hex.__movingLine || 0} />
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
        <div className={`tag mx-auto ${WX_CLASS[up.wx]}`}>
          上{up.name} {up.wx}
          {isTi(up.id) && <b className="text-primary-700 ml-0.5">体</b>}
          {isYong(up.id) && <b className="text-red-700 ml-0.5">用</b>}
        </div>
        <div className={`tag mx-auto ${WX_CLASS[down.wx]}`}>
          下{down.name} {down.wx}
          {isTi(down.id) && <b className="text-primary-700 ml-0.5">体</b>}
          {isYong(down.id) && <b className="text-red-700 ml-0.5">用</b>}
        </div>
      </div>
    </div>
  )
}

function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50/50 overflow-hidden">
      <button type="button"
        className="w-full px-3 py-2.5 flex items-center justify-between text-[13px] text-ink-600 hover:bg-ink-50 transition"
        onClick={() => setOpen(!open)}>
        <span className="font-medium">{title}</span>
        <span className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-3 pb-3 pt-0 text-[12px] text-ink-600 leading-relaxed">{children}</div>}
    </div>
  )
}

function MeihuaHistoryModal({ list, onClose, onLoad, onDelete }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-100 flex items-center justify-between">
          <h3 className="font-bold text-[15px]">📜 梅花易数排盘记录</h3>
          <button onClick={onClose} className="text-ink-400 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {list.length === 0 && <div className="text-center text-ink-400 py-8 text-[13px]">暂无记录</div>}
          {list.map(rec => (
            <div key={rec.id} className="rounded-xl border border-ink-200 p-3 bg-ink-50/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-bold text-ink-800">{rec.benName || '未知卦'}</span>
                <span className="text-[10px] text-ink-400">{new Date(rec.savedAt).toLocaleString('zh-CN')}</span>
              </div>
              <div className="text-[11px] text-ink-500 mb-1.5">
                {rec.question ? `占问：${rec.question}` : '无占问'}
              </div>
              <div className="flex items-center gap-1 flex-wrap mb-2">
                <span className="tag wx-tu text-[10px]">互: {rec.huName || '-'}</span>
                <span className="tag wx-huo text-[10px]">变: {rec.bianName || '-'}</span>
                <span className="tag text-[10px] bg-ink-100 text-ink-600">{rec.movingLine}爻动</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onLoad(rec)} className="flex-1 py-1.5 rounded-lg bg-primary-700 text-white text-[12px]">查看此卦</button>
                <button onClick={() => onDelete(rec.id)} className="flex-1 py-1.5 rounded-lg bg-red-50 text-red-600 text-[12px] border border-red-200">删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Meihua() {
  const nav = useNavigate()
  const { user, refreshUser } = useAuthStore()
  const [mode, setMode] = useState('time')
  const [num2, setNum2] = useState({ up: 7, down: 3 })
  const [num3, setNum3] = useState({ up: 7, down: 3, dong: 4 })
  const [manualLines, setManualLines] = useState([1, 1, 1, 1, 1, 1])
  const [manualMoving, setManualMoving] = useState(0)
  const [solarDate, setSolarDate] = useState(() => {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [aiContent, setAiContent] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState('')
  const [showTimeDetail, setShowTimeDetail] = useState(false)
  const [historyList, setHistoryList] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  const solarDateObj = useMemo(() => {
    // 兜底兼容：某些浏览器/时机 datetime-local 返回的字符串会让 new Date() 得到 Invalid Date
    try {
      const d = new Date(solarDate)
      if (isNaN(d.getTime())) return new Date()
      return d
    } catch {
      return new Date()
    }
  }, [solarDate])
  const lunarState = useMemo(() => {
    try { return solarToLunarState(solarDateObj) } catch (e) {
      console.warn('[meihua] solarToLunarState 失败，fallback', e?.message)
      return { year: solarDateObj.getFullYear(), yearZhi: '寅', month: 1, day: 1, timeZhi: '子', monthZhi: '寅' }
    }
  }, [solarDateObj])
  const monthZhi = lunarState.monthZhi || '寅'

  const num2Calc = useMemo(() => {
    const s = (+num2.up || 0) + (+num2.down || 0)
    const dong = s > 0 ? ((s - 1) % 6) + 1 : 0
    const shangGuaId = s > 0 ? (((+num2.up - 1) % 8) + 1) : 0
    const xiaGuaId = s > 0 ? (((+num2.down - 1) % 8) + 1) : 0
    return { s, dong, shangGuaId, xiaGuaId }
  }, [num2.up, num2.down])

  const timeDetail = useMemo(() => {
    if (!lunarState) return null
    const zhiIdx = ZHI_INDEX[lunarState.yearZhi] || 1
    const shangSum = zhiIdx + (+lunarState.month) + (+lunarState.day)
    const shangGuaId = ((shangSum - 1) % 8) + 1
    const xiaSum = shangSum + (ZHI_INDEX[lunarState.timeZhi] || 1)
    const xiaGuaId = ((xiaSum - 1) % 8) + 1
    const dong = ((xiaSum - 1) % 6) + 1
    return { zhiIdx, shangSum, shangGuaId, xiaSum, xiaGuaId, dong }
  }, [lunarState])

  function openHistory() {
    if (!user) { if (confirm('请先登录后查看排盘记录（记录已保存在本机，登录后可跨设备同步）')) nav('/login'); return }
    setHistoryList(getHistory('meihua'))
    setShowHistory(true)
  }

  function loadFromHistory(rec) {
    if (rec.question) setQuestion(rec.question)
    if (rec.mode) setMode(rec.mode === 'number' ? 'num2' : rec.mode)
    // 如果有完整快照，直接还原排盘结果
    if (rec.snapshot) {
      setResult(rec.snapshot)
      setAiContent('')
      setAiErr('')
    } else {
      // 兼容旧记录（无快照）
      setResult(null)
    }
    setShowHistory(false)
  }

  function onDeleteHistory(id) {
    deleteHistory(id, 'meihua')
    setHistoryList(getHistory('meihua'))
  }

  function onCalc() {
    setAiContent(''); setAiErr('')
    try {
      let r
      if (mode === 'time') {
        const ls = solarToLunarState(solarDateObj)
        r = meihuaByTime(ZHI_INDEX[ls.yearZhi], +ls.month, +ls.day, ZHI_INDEX[ls.timeZhi])
      } else if (mode === 'num2') {
        if (!num2.up || !num2.down) return alert('请填上、下卦数')
        r = meihuaByNumber(+num2.up, +num2.down, +num2.up + +num2.down)
      } else if (mode === 'num3') {
        if (!num3.up || !num3.down || !num3.dong) return alert('请填写三个数字')
        r = meihuaByNumber(+num3.up, +num3.down, +num3.dong)
      } else if (mode === 'manual') {
        // 检查是否已有动爻
        const hasMove = manualLines.some(v => v === 2 || v === 3)
        r = meihuaByManual(manualLines, manualMoving || (hasMove ? 0 : 1))
      } else if (mode === 'auto') {
        r = meihuaByAuto()
      }
      const mw = MONTH_WX[monthZhi] || '土'
      const ws = tiWangShuai(r.ti.wx, mw)
      r.tiWangShuai = ws
      r.monthZhi = monthZhi
      r.monthWX = mw
      r.question = question
      r.mode = mode
      setResult({...r})
      saveHistory(r, 'meihua')
    } catch (e) {
      alert('起卦失败：' + e.message)
    }
  }

  async function onAi() {
    if (!user) { if (confirm('请先登录后使用 AI 解读')) nav('/login'); return }
    setAiLoading(true); setAiErr(''); setAiContent('')
    try {
      await refreshUser()
    } catch {}
    try {
      const { data } = await api.post('/ai/interpret', {
        type:'meihua',
        payload: {
          question,
          monthZhi: result.monthZhi,
          monthWX: result.monthWX,
          tiWangShuai: result.tiWangShuai,
          ben: { no:result.ben.no, name:result.ben.name, up:result.ben.up, down:result.ben.down, judgment:result.ben.judgment, tuan:result.ben.tuan, xiang:result.ben.xiang, lines:result.ben.lines },
          hu: { no:result.hu?.no, name:result.hu?.name },
          bian: { no:result.bian?.no, name:result.bian?.name },
          movingLine: result.movingLine,
          lineText: result.lineText,
          ti: { name:result.ti.name, wx:result.ti.wx, nature:result.ti.nature, wangShuai: result.tiWangShuai },
          yong: { name:result.yong.name, wx:result.yong.wx, nature:result.yong.nature },
          relation: result.relation,
          luck: result.luck,
        },
        question: question || '请综合断此卦吉凶与应期'
      })
      setAiContent(data.content)
    } catch (e) {
      let msg = ''
      const status = e.response?.status
      const rawData = e.response?.data
      if (typeof rawData === 'object' && rawData?.error) {
        msg = rawData.error
      } else if (typeof rawData === 'string' && rawData.startsWith('<!')) {
        msg = '服务器暂时不可用 (502)，请稍后重试'
      } else if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
        msg = '请求超时，请稍后重试'
      } else if (status === 402) {
        msg = rawData?.error || '额度不足，请开通会员或购买次数'
      } else if (status) {
        msg = `服务器错误 (${status})，请稍后重试`
      } else {
        msg = `网络错误：${e.message || '未知错误'}`
      }
      setAiErr(msg)
    } finally {
      setAiLoading(false)
    }
  }

  function handleManualYaoChange(idx, val) {
    // 必须用 functional update，避免 React 批处理/快速连点时用了陈旧的 manualLines 闭包
    setManualLines(prev => {
      const next = [...prev]
      next[idx] = val
      return next
    })
    // 老阴(2) / 老阳(3) 自动记为当前动爻；用户也可以之后在动爻栏再改
    if (val === 2 || val === 3) {
      setManualMoving(idx + 1)
    }
  }

  return (
    <div className="pb-4">
      {showHistory && <MeihuaHistoryModal list={historyList} onClose={()=>setShowHistory(false)} onLoad={loadFromHistory} onDelete={onDeleteHistory} />}
      
      <div className="paper-card p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-song font-bold text-[17px] text-ink-900 flex items-center gap-2">
            <span className="seal text-xs">起卦</span> 梅花易数起卦
          </h2>
          <button onClick={openHistory} className="text-[12px] text-primary-700 flex items-center gap-1">
            📜 排盘记录
          </button>
        </div>

        <label className="mb-3 block"><span className="field-label">所占何事（必填，AI 解读越详细越准）</span>
          <textarea rows={2} className="field" placeholder="例如：明日面试能否通过？此项目合作是否顺利？"
            value={question} onChange={e=>setQuestion(e.target.value)} />
        </label>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="field-label mb-0">占问时间</span>
            <span className="text-[11px] text-ink-400">系统自动按节气换算月令</span>
          </div>
          <div className="rounded-xl bg-ink-50 border border-ink-100 px-3 py-2.5 text-[12px] text-ink-700 flex items-center gap-2 flex-wrap">
            <span className="tag wx-tu">节气</span>
            <b className="text-primary-700">{monthZhi}月（{MONTH_WX[monthZhi]}）</b>
            <span className="text-ink-300">·</span>
            <span className="text-ink-500">{solarDateObj.getFullYear()}年{solarDateObj.getMonth()+1}月{solarDateObj.getDate()}日</span>
          </div>
        </div>

        <label className="mb-2 block">
          <span className="field-label mb-0">起卦方式</span>
          <select className="field mt-1.5" value={mode} onChange={e=>{setMode(e.target.value); setResult(null); setAiContent(''); setAiErr('')}}>
            {MODES.map(m => (
              <option key={m.k} value={m.k}>{m.l} — {m.desc}</option>
            ))}
          </select>
        </label>

        {mode === 'time' && (
          <div className="space-y-3">
            <label className="block"><span className="field-label">选择公历日期时间</span>
              <input type="datetime-local" step={60} className="field"
                value={solarDate} onChange={e=>setSolarDate(e.target.value)} />
            </label>
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-[12px] text-ink-700">
              <div className="text-primary-700 font-bold mb-1">🔄 自动换算</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                <div>年支：<b className="text-ink-800">{lunarState.yearZhi}</b>（{ZHI_INDEX[lunarState.yearZhi]}）</div>
                <div>时辰：<b className="text-ink-800">{lunarState.timeZhi}</b>（{ZHI_INDEX[lunarState.timeZhi]}）</div>
                <div>农历月：<b className="text-ink-800">{lunarState.month}</b></div>
                <div>农历日：<b className="text-ink-800">{lunarState.day}</b></div>
              </div>
            </div>
            <Collapsible title="📖 查看起卦详情">
              {timeDetail && (
                <div className="space-y-1.5">
                  <p className="text-ink-800 font-medium">梅花易数 · 时间起卦推导过程：</p>
                  <div className="bg-white rounded-lg p-2.5 space-y-0.5 text-[11px] font-mono border border-ink-100">
                    <div>年支 {lunarState.yearZhi} = {ZHI_INDEX[lunarState.yearZhi]}</div>
                    <div>农历月 {lunarState.month}，农历日 {lunarState.day}</div>
                    <div>时辰 {lunarState.timeZhi} = {ZHI_INDEX[lunarState.timeZhi]}</div>
                    <div className="text-primary-700 pt-0.5 border-t border-ink-100 mt-1 pt-1">
                      上卦 = ({ZHI_INDEX[lunarState.yearZhi]} + {lunarState.month} + {lunarState.day}) mod 8 = <b>{timeDetail.shangGuaId}</b>
                    </div>
                    <div className="text-primary-700">
                      下卦 = ({timeDetail.shangSum} + {ZHI_INDEX[lunarState.timeZhi]}) mod 8 = <b>{timeDetail.xiaGuaId}</b>
                    </div>
                    <div className="text-primary-700 pt-0.5 border-t border-ink-100 mt-1 pt-1">
                      动爻 = ({timeDetail.xiaSum}) mod 6 = <b>{timeDetail.dong}</b>
                    </div>
                  </div>
                </div>
              )}
            </Collapsible>
          </div>
        )}

        {mode === 'num2' && (
          <div className="space-y-3">
            <label className="block"><span className="field-label">上卦数</span>
              <input type="number" min="1" className="field" placeholder="任意正整数" value={num2.up} onChange={e=>setNum2({...num2, up:e.target.value})} />
            </label>
            <label className="block"><span className="field-label">下卦数</span>
              <input type="number" min="1" className="field" placeholder="任意正整数" value={num2.down} onChange={e=>setNum2({...num2, down:e.target.value})} />
            </label>
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-[13px] text-ink-800 flex items-center justify-between">
              <div>
                <div className="text-primary-700 font-bold text-[13px]">📐 自动推算</div>
                <div className="text-[11px] text-ink-500 mt-0.5">
                  动爻为第 <b className="text-primary-700 text-[14px]">{num2Calc.dong || '—'}</b> 爻
                  <span className="text-ink-300 mx-1">·</span>
                  上卦 <b>{num2Calc.shangGuaId || '—'}</b>
                  <span className="text-ink-300 mx-1">·</span>
                  下卦 <b>{num2Calc.xiaGuaId || '—'}</b>
                </div>
              </div>
              <span className="tag wx-mu">自动</span>
            </div>
            <Collapsible title="📖 起卦规则说明">
              <div className="space-y-1.5">
                <p><b className="text-ink-800">梅花易数 · 数字起卦（两数法）：</b></p>
                <p>① 上卦 = 上卦数 mod 8，余 0 取 8</p>
                <p>② 下卦 = 下卦数 mod 8，余 0 取 8</p>
                <p>③ 动爻 = (上卦数 + 下卦数) mod 6，余 0 取 6</p>
                <p className="text-ink-400">示例：上7 下3 → 上7艮；下3离；动爻(7+3)%6=4 → 第4爻动</p>
              </div>
            </Collapsible>
          </div>
        )}

        {mode === 'num3' && (
          <div className="space-y-3">
            <label className="block"><span className="field-label">上卦数（第1数）</span>
              <input type="number" min="1" className="field" placeholder="任意正整数" value={num3.up} onChange={e=>setNum3({...num3, up:e.target.value})} />
            </label>
            <label className="block"><span className="field-label">下卦数（第2数）</span>
              <input type="number" min="1" className="field" placeholder="任意正整数" value={num3.down} onChange={e=>setNum3({...num3, down:e.target.value})} />
            </label>
            <label className="block"><span className="field-label">动爻数（第3数）</span>
              <input type="number" min="1" className="field" placeholder="动爻 = 此数 mod 6" value={num3.dong} onChange={e=>setNum3({...num3, dong:e.target.value})} />
            </label>
            {(() => {
              const upId = (+num3.up > 0) ? (((+num3.up - 1) % 8) + 1) : 0
              const downId = (+num3.down > 0) ? (((+num3.down - 1) % 8) + 1) : 0
              const dong = (+num3.dong > 0) ? (((+num3.dong - 1) % 6) + 1) : 0
              return (
                <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-[13px] text-ink-800 flex items-center justify-between">
                  <div>
                    <div className="text-primary-700 font-bold text-[13px]">📐 推算结果</div>
                    <div className="text-[11px] text-ink-500 mt-0.5">
                      动爻为第 <b className="text-primary-700 text-[14px]">{dong || '—'}</b> 爻
                      <span className="text-ink-300 mx-1">·</span>
                      上卦 <b>{upId || '—'}</b>
                      <span className="text-ink-300 mx-1">·</span>
                      下卦 <b>{downId || '—'}</b>
                    </div>
                  </div>
                  <span className="tag wx-huo">三数</span>
                </div>
              )
            })()}
            <Collapsible title="📖 起卦规则说明">
              <div className="space-y-1.5">
                <p><b className="text-ink-800">梅花易数 · 数字起卦（三数法）：</b></p>
                <p>① 上卦 = 第1数 mod 8，余 0 取 8</p>
                <p>② 下卦 = 第2数 mod 8，余 0 取 8</p>
                <p>③ 动爻 = 第3数 mod 6，余 0 取 6</p>
                <p className="text-ink-400">示例：7、3、5 → 上7艮；下3离；动5%6=5 → 第5爻动</p>
              </div>
            </Collapsible>
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-3">
            <div className="text-[12px] text-ink-600 bg-ink-50 rounded-lg p-2.5 border border-ink-100">
              💡 选择六爻的阴阳属性。选"老阳/老阴"会自动标记为动爻；也可以手动指定动爻位置。
            </div>
            <div className="space-y-2">
              {YAO_LABELS.map((label, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-ink-200 p-2.5">
                  <div className="w-14 text-[12px] font-medium text-ink-700">{label}</div>
                  <div className="flex-1 grid grid-cols-4 gap-1">
                    {YAO_OPTS.map(opt => (
                      <button key={opt.v} type="button"
                        onClick={() => handleManualYaoChange(idx, opt.v)}
                        className={`py-1.5 rounded text-[11px] font-medium transition ${
                          manualLines[idx] === opt.v
                            ? 'bg-primary-700 text-white'
                            : 'bg-ink-50 text-ink-600 border border-ink-200'
                        }`}
                        title={opt.desc}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-ink-200 p-2.5">
              <div className="w-14 text-[12px] font-medium text-ink-700">动爻</div>
              <div className="flex-1 grid grid-cols-6 gap-1">
                {[1,2,3,4,5,6].map(n => (
                  <button key={n} type="button"
                    onClick={() => setManualMoving(manualMoving === n ? 0 : n)}
                    className={`py-1.5 rounded text-[11px] font-medium transition ${
                      manualMoving === n
                        ? 'bg-red-600 text-white'
                        : 'bg-ink-50 text-ink-600 border border-ink-200'
                    }`}>
                    {n}爻
                  </button>
                ))}
              </div>
            </div>
            {manualMoving > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                已指定第 {manualMoving} 爻为动爻
              </div>
            )}
          </div>
        )}

        {mode === 'auto' && (
          <div className="space-y-3">
            <div className="text-center py-6 bg-ink-50 rounded-xl border border-ink-100">
              <div className="text-4xl mb-2">🎲</div>
              <div className="text-[14px] text-ink-700 font-medium">系统将为你随机起一卦</div>
              <div className="text-[11px] text-ink-400 mt-1">点击下方"至诚起卦"按钮即可</div>
            </div>
            <div className="text-[12px] text-ink-500 bg-ink-50 rounded-lg p-2.5 border border-ink-100">
              💡 随机起卦的上下卦和动爻由系统随机生成，模拟古人掷蓍草起卦的效果。
            </div>
          </div>
        )}

        <button className="btn-zhusha w-full mt-4" onClick={onCalc}>✨ 至诚起卦</button>
        <div className="text-[10px] text-ink-400 text-center mt-1.5">《梅花易数》：不动不占，不因事不占，诚心求问方验</div>
      </div>

      {result && <>
        <div className="paper-card p-3 mb-3">
          <div className="grid grid-cols-3 gap-2">
            <HexTile hex={{...result.ben, __movingLine: result.movingLine }} label="本卦" ti={result.ti} yong={result.yong} />
            <HexTile hex={result.hu} label="互卦（过程）" />
            <HexTile hex={{...result.bian, __movingLine: result.movingLine }} label="变卦（结果）" />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] text-ink-500">
            <div className="bg-ink-50 rounded-lg px-2.5 py-2">
              <span>错卦（反）：</span><b className="text-ink-700">{result.cuo?.name}</b>
            </div>
            <div className="bg-ink-50 rounded-lg px-2.5 py-2">
              <span>综卦（倒）：</span><b className="text-ink-700">{result.zong?.name}</b>
            </div>
          </div>
        </div>

        <div className="paper-card p-4 mb-3">
          <div className="font-song font-bold text-[15px] text-ink-900 mb-3"><span className="tag wx-huo">体用生克 · 吉凶</span></div>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="rounded-xl border border-primary-300 bg-primary-50 p-2.5">
              <div className="text-[10px] text-primary-700 font-semibold">体卦</div>
              <div className="font-song font-bold text-[18px] text-primary-800 mt-0.5">{result.ti.name}</div>
              <div className="text-[11px]"><span className={`tag ${WX_CLASS[result.ti.wx]}`}>{result.ti.wx}</span></div>
              <div className="text-[10px] text-ink-500 mt-1">月令{result.tiWangShuai?.tag}（{result.tiWangShuai?.score}分）</div>
            </div>
            <div className="rounded-xl bg-ink-50 border border-ink-200 p-2.5 flex flex-col justify-center">
              <div className="text-[10px] text-ink-500">五行关系</div>
              <div className="text-[15px] font-bold text-ink-900 mt-0.5">{result.relation}</div>
            </div>
            <div className="rounded-xl border border-red-300 bg-red-50 p-2.5">
              <div className="text-[10px] text-red-700 font-semibold">用卦</div>
              <div className="font-song font-bold text-[18px] text-red-800 mt-0.5">{result.yong.name}</div>
              <div className="text-[11px]"><span className={`tag ${WX_CLASS[result.yong.wx]}`}>{result.yong.wx}</span></div>
              <div className="text-[10px] text-ink-500 mt-1">&nbsp;</div>
            </div>
          </div>
          <div className={`rounded-xl p-3.5 border ${result.luck.s>=4?'border-green-300 bg-green-50':result.luck.s>=3?'border-amber-300 bg-amber-50':'border-red-300 bg-red-50'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="font-song font-bold text-[15px]">吉凶综合：<span className={result.luck.s>=4?'text-green-700':result.luck.s>=3?'text-amber-700':'text-red-700'}>{result.luck.l}</span></div>
              <div className="text-[11px] text-ink-500">动爻：第 {result.movingLine} 爻（{result.movingInUpper?'在上卦':'在下卦'}）</div>
            </div>
            <div className="text-[13px] text-ink-700 leading-relaxed">{result.luck.note}</div>
          </div>
        </div>

        <div className="paper-card p-4 mb-3">
          <div className="font-song font-bold text-[15px] text-ink-900 mb-2"><span className="tag wx-tu">卦辞 · 爻辞 · 象传</span></div>
          <div className="space-y-2 text-[13px] leading-[1.85] text-ink-800">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-primary-700 font-bold mb-1">卦辞：</div>{result.ben.judgment}
            </div>
            {result.ben.tuan && (
              <div className="p-3 rounded-lg bg-sky-50 border border-sky-200">
                <div className="text-sky-700 font-bold mb-1">彖曰：</div>{result.ben.tuan}
              </div>
            )}
            {result.ben.xiang && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="text-green-700 font-bold mb-1">象曰：</div>{result.ben.xiang}
              </div>
            )}
            {result.lineText && (
              <div className="p-3 rounded-lg bg-primary-50 border border-primary-200">
                <div className="text-primary-700 font-bold mb-1">动爻（{result.movingLine}爻）：</div>
                <div className="font-bold">{result.lineText.text}</div>
                {result.lineText.xiang && <div className="text-ink-500 mt-1 text-[12px]">{result.lineText.xiang}</div>}
              </div>
            )}
          </div>
        </div>

        <div className="paper-card p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-song font-bold text-[15px] text-ink-900 flex items-center gap-2">
              <span className="seal text-[10px]">AI</span>
              大师级 AI 断卦
            </div>
            {!user && <Link to="/login" className="text-[12px] text-primary-700 underline">请先登录</Link>}
          </div>
          {user && (
            <div className="flex items-center gap-2 mb-2 text-[12px] flex-wrap">
              {user.is_admin && <span className="tag wx-shui text-[10px]">管理员</span>}
              {!user.is_admin && user.is_vip && user.vip_expire_at && user.vip_expire_at > Date.now() && <span className="tag wx-huo text-[10px]">VIP会员</span>}
              {!user.is_admin && !(user.is_vip && user.vip_expire_at && user.vip_expire_at > Date.now()) && (user.ai_credits > 0) && <span className="tag wx-tu text-[10px]">已购单次额度</span>}
              {!user.is_admin && !(user.is_vip && user.vip_expire_at && user.vip_expire_at > Date.now()) && user.ai_credits === 0 && <span className="tag wx-jin text-[10px]">未开通</span>}
              <span className="text-ink-500">额度：</span>
              <b className="text-primary-700">
                {user.is_admin ? '无限' : (
                  (user.is_vip && user.vip_expire_at && user.vip_expire_at > Date.now())
                    ? `今日 ${Math.max(0, 3 - (user.free_daily_used||0))}/3${(user.ai_credits||0) > 0 ? ` · 单次 ${user.ai_credits}` : ''}`
                    : `单次 ${user.ai_credits || 0} 次`
                )}
              </b>
              <button onClick={() => refreshUser()} className="text-[10px] text-ink-400 hover:text-primary-600 ml-1">🔄 刷新</button>
            </div>
          )}
          <button className="btn-mo w-full" onClick={onAi} disabled={aiLoading || !user}>
            {aiLoading ? '🔮 大师推演中…（约 10-30 秒）' : (user ? '🔮 请 AI 大师断卦（含吉凶/应期/建议）' : '🔒 登录后可用')}
          </button>
          {aiErr && <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-700 text-[12px] border border-red-200">⚠️ {aiErr}</div>}
          {aiContent && (
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-b from-amber-50 to-white border border-amber-200">
              <div className="text-[11px] text-primary-700 mb-2 font-semibold">— 康节先生门下 AI 谨断 —</div>
              <div className="text-[14px] text-ink-800 leading-[1.85] whitespace-pre-wrap">{aiContent}</div>
            </div>
          )}
        </div>
      </>}
    </div>
  )
}
