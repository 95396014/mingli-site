import { useMemo, useState } from 'react'
import { meihuaByNumber, meihuaByTime, BAGUA_BY_ID, ZHI_INDEX, WX_CLASS, tiWangShuai, solarToLunarState } from '../utils/meihua.js'
import api from '../utils/api.js'
import { useAuthStore } from '../store/auth.js'
import { Link, useNavigate } from 'react-router-dom'

const ZHI_OPTS = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
const MONTH_WX = { 寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水',子:'水',丑:'土' }
const MONTH_NUM = { 寅:1,卯:2,辰:3,巳:4,午:5,未:6,申:7,酉:8,戌:9,亥:10,子:11,丑:12 }
const ZHI_MONTH = Object.fromEntries(Object.entries(MONTH_NUM).map(([k,v])=>[v,k]))

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

export default function Meihua() {
  const nav = useNavigate()
  const { user } = useAuthStore()
  const [mode, setMode] = useState('num')
  const [num, setNum] = useState({ up: 7, down: 3 })
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

  const solarDateObj = useMemo(() => new Date(solarDate), [solarDate])

  // 自动换算：公历 → 农历年支/月/日/时辰 + 节气月令
  const lunarState = useMemo(() => solarToLunarState(solarDateObj), [solarDateObj])
  const monthZhi = lunarState.monthZhi

  // 数字起卦动爻自动推算
  const numCalc = useMemo(() => {
    const s = (+num.up || 0) + (+num.down || 0)
    const dong = s > 0 ? ((s - 1) % 6) + 1 : 0
    const shangGuaId = s > 0 ? (((+num.up - 1) % 8) + 1) : 0
    const xiaGuaId = s > 0 ? (((+num.down - 1) % 8) + 1) : 0
    return { s, dong, shangGuaId, xiaGuaId }
  }, [num.up, num.down])

  // 时间起卦自动推算细节
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

  function onCalc() {
    setAiContent(''); setAiErr('')
    try {
      let r
      if (mode === 'num') {
        if (!num.up || !num.down) return alert('请填上、下卦数')
        r = meihuaByNumber(+num.up, +num.down, +num.up + +num.down)
      } else {
        const ls = solarToLunarState(solarDateObj)
        r = meihuaByTime(ZHI_INDEX[ls.yearZhi], +ls.month, +ls.day, ZHI_INDEX[ls.timeZhi])
      }
      const mw = MONTH_WX[monthZhi] || '土'
      const ws = tiWangShuai(r.ti.wx, mw)
      r.tiWangShuai = ws
      r.monthZhi = monthZhi
      r.monthWX = mw
      r.question = question
      setResult({...r})
    } catch (e) {
      alert('起卦失败：' + e.message)
    }
  }

  async function onAi() {
    if (!user) { if (confirm('请先登录后使用 AI 解读')) nav('/login'); return }
    setAiLoading(true); setAiErr(''); setAiContent('')
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
      setAiErr(e.response?.data?.error || e.message)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="pb-4">
      {/* 输入卡 */}
      <div className="paper-card p-4 mb-3">
        <h2 className="font-song font-bold text-[17px] text-ink-900 mb-3 flex items-center gap-2">
          <span className="seal text-xs">起卦</span> 梅花易数起卦
        </h2>

        {/* 占问事项 */}
        <label className="mb-3 block"><span className="field-label">所占何事（必填，AI 解读越详细越准）</span>
          <textarea rows={2} className="field" placeholder="例如：明日面试能否通过？此项目合作是否顺利？"
            value={question} onChange={e=>setQuestion(e.target.value)} />
        </label>

        {/* 占问时间 - 自动读取系统时间换算 */}
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

        {/* 起卦方式切换 */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[{k:'num',l:'🔢 数字起卦'},{k:'time',l:'🕒 时间起卦'}].map(o=>(
            <button key={o.k} onClick={()=>{setMode(o.k); setResult(null); setAiContent(''); setAiErr('')}}
              className={`py-2.5 rounded-lg font-medium text-[13px] border ${mode===o.k?'bg-primary-700 text-white border-primary-800':'bg-white text-ink-600 border-ink-200'}`}>
              {o.l}
            </button>
          ))}
        </div>

        {/* 数字起卦 */}
        {mode === 'num' && (
          <div className="space-y-3">
            <label className="block"><span className="field-label">上卦数</span>
              <input type="number" min="1" className="field" placeholder="任意正整数" value={num.up} onChange={e=>setNum({...num, up:e.target.value})} />
            </label>
            <label className="block"><span className="field-label">下卦数</span>
              <input type="number" min="1" className="field" placeholder="任意正整数" value={num.down} onChange={e=>setNum({...num, down:e.target.value})} />
            </label>

            {/* 动爻自动推算结果 */}
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-[13px] text-ink-800 flex items-center justify-between">
              <div>
                <div className="text-primary-700 font-bold text-[13px]">📐 自动推算</div>
                <div className="text-[11px] text-ink-500 mt-0.5">
                  动爻为第 <b className="text-primary-700 text-[14px]">{numCalc.dong || '—'}</b> 爻
                  <span className="text-ink-300 mx-1">·</span>
                  上卦 <b>{numCalc.shangGuaId || '—'}</b>
                  <span className="text-ink-300 mx-1">·</span>
                  下卦 <b>{numCalc.xiaGuaId || '—'}</b>
                </div>
              </div>
              <span className="tag wx-mu">自动</span>
            </div>

            {/* 规则说明 - 折叠 */}
            <Collapsible title="📖 起卦规则说明">
              <div className="space-y-1.5">
                <p><b className="text-ink-800">梅花易数 · 数字起卦：</b></p>
                <p>① 上卦 = 上卦数 mod 8，余 0 取 8（先天八卦序：1乾 2兑 3离 4震 5巽 6坎 7艮 8坤）</p>
                <p>② 下卦 = 下卦数 mod 8，余 0 取 8</p>
                <p>③ 动爻 = (上卦数 + 下卦数) mod 6，余 0 取 6</p>
                <p>④ 动爻为下往上第 N 爻变化，阳变阴、阴变阳，得变卦</p>
                <p className="text-ink-400 pt-1">示例：上7 下3 → 上卦7 mod 8 = 7 艮；下卦3 mod 8 = 3 离；动爻(7+3) mod 6 = 4 → 第4爻动</p>
              </div>
            </Collapsible>
          </div>
        )}

        {/* 时间起卦 */}
        {mode === 'time' && (
          <div className="space-y-3">
            <label className="block"><span className="field-label">选择公历日期时间</span>
              <input type="datetime-local" step={60} className="field"
                value={solarDate} onChange={e=>setSolarDate(e.target.value)} />
            </label>

            {/* 自动换算摘要 */}
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-[12px] text-ink-700">
              <div className="text-primary-700 font-bold mb-1">🔄 自动换算</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                <div>年支：<b className="text-ink-800">{lunarState.yearZhi}</b>（{ZHI_INDEX[lunarState.yearZhi]}）</div>
                <div>时辰：<b className="text-ink-800">{lunarState.timeZhi}</b>（{ZHI_INDEX[lunarState.timeZhi]}）</div>
                <div>农历月：<b className="text-ink-800">{lunarState.month}</b></div>
                <div>农历日：<b className="text-ink-800">{lunarState.day}</b></div>
              </div>
            </div>

            {/* 起卦详情 - 折叠 */}
            <Collapsible title="📖 查看起卦详情">
              {timeDetail && (
                <div className="space-y-1.5">
                  <p className="text-ink-800 font-medium">梅花易数 · 时间起卦推导过程：</p>
                  <div className="bg-white rounded-lg p-2.5 space-y-0.5 text-[11px] font-mono border border-ink-100">
                    <div>年支 {lunarState.yearZhi} = {ZHI_INDEX[lunarState.yearZhi]}</div>
                    <div>农历月 {lunarState.month}，农历日 {lunarState.day}</div>
                    <div>时辰 {lunarState.timeZhi} = {ZHI_INDEX[lunarState.timeZhi]}</div>
                    <div className="text-primary-700 pt-0.5 border-t border-ink-100 mt-1 pt-1">
                      上卦 = ({ZHI_INDEX[lunarState.yearZhi]} + {lunarState.month} + {lunarState.day}) mod 8
                    </div>
                    <div className="text-primary-700">
                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {timeDetail.shangSum} mod 8 = <b>{timeDetail.shangGuaId}</b>
                    </div>
                    <div className="text-primary-700 pt-0.5 border-t border-ink-100 mt-1 pt-1">
                      下卦 = ({timeDetail.shangSum} + {ZHI_INDEX[lunarState.timeZhi]}) mod 8
                    </div>
                    <div className="text-primary-700">
                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {timeDetail.xiaSum} mod 8 = <b>{timeDetail.xiaGuaId}</b>
                    </div>
                    <div className="text-primary-700 pt-0.5 border-t border-ink-100 mt-1 pt-1">
                      动爻 = ({timeDetail.xiaSum}) mod 6 = <b>{timeDetail.dong}</b>
                    </div>
                  </div>
                  <p className="text-ink-400 pt-1 text-[11px]">先天八卦序：1乾 2兑 3离 4震 5巽 6坎 7艮 8坤</p>
                </div>
              )}
            </Collapsible>
          </div>
        )}

        <button className="btn-zhusha w-full mt-4" onClick={onCalc}>✨ 至诚起卦</button>
        <div className="text-[10px] text-ink-400 text-center mt-1.5">《梅花易数》：不动不占，不因事不占，诚心求问方验</div>
      </div>

      {result && <>
        {/* 卦象卡 */}
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

        {/* 体用生克 */}
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

        {/* 卦辞/爻辞 */}
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

        {/* AI 解读 */}
        <div className="paper-card p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-song font-bold text-[15px] text-ink-900 flex items-center gap-2">
              <span className="seal text-[10px]">AI</span>
              大师级 AI 断卦
            </div>
            {!user && <Link to="/login" className="text-[12px] text-primary-700 underline">请先登录</Link>}
          </div>
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
