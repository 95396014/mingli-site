import { useMemo, useState } from 'react'
import { calculateBazi, GAN_WUXING, ZHI_WUXING, CN_DST_RANGES, withinChinaDst } from '../utils/bazi.js'
import api from '../utils/api.js'
import { useAuthStore } from '../store/auth.js'
import { Link, useNavigate } from 'react-router-dom'

const WX_CN = { 金:'金', 木:'木', 水:'水', 火:'火', 土:'土' }
const WX_CLASS = { 金:'wx-jin', 木:'wx-mu', 水:'wx-shui', 火:'wx-huo', 土:'wx-tu' }
const WX_HEX = { 金:'#8a94a3', 木:'#3aa84d', 水:'#2f80ed', 火:'#e64a33', 土:'#c68a3f' }

function SSTag({ children, title, cname }) {
  return <span title={title} className={`tag inline-flex items-center justify-center mx-0.5 ${cname || ''}`}>{children}</span>
}

function PillarCell({ pillar, isDay, dayKong }) {
  const kEmpty = (dayKong || []).includes(pillar.zhi)
  return (
    <div className={`rounded-2xl border ${isDay ? 'border-amber-500 bg-gradient-to-b from-amber-50 via-white to-amber-50 shadow-md ring-2 ring-amber-100' : 'border-ink-200 bg-white'} px-1.5 py-2.5 text-center relative`}>
      <div className="absolute top-1 left-1 text-[10px] text-ink-400 font-medium">{pillar.name}</div>
      <div className="text-[10px] text-ink-400 mt-4">{pillar.naYin || '—'}{kEmpty ? ' 𡈽' : ''}</div>

      {/* 上：天干（大字）+ 十神标签 */}
      <div className="mt-1">
        <div className={`mx-auto mb-0.5 inline-flex items-center gap-1 rounded px-2 py-0.5 ${isDay ? 'bg-amber-100 text-amber-700' : 'bg-ink-50 text-ink-600'} text-[10px]`}>
          <span className={WX_CLASS[GAN_WUXING[pillar.gan]]}>{GAN_WUXING[pillar.gan]}</span>
          <span className="text-ink-300">·</span>
          <span className="font-semibold">{pillar.ganShiShen}</span>
        </div>
      </div>
      <div className={`text-[38px] leading-none font-song my-0.5 ${isDay ? 'text-amber-700' : 'text-primary-800'}`}>
        {pillar.gan}
      </div>

      {/* 中：地支五行标签 + 地支大字 */}
      <div className={`mx-auto my-0.5 inline-flex items-center rounded px-2 py-0.5 ${isDay ? 'bg-amber-50 text-amber-700' : 'bg-ink-50 text-ink-600'} text-[10px]`}>
        <span className={WX_CLASS[ZHI_WUXING[pillar.zhi]]}>{ZHI_WUXING[pillar.zhi]}</span>
      </div>
      <div className={`text-[38px] leading-none font-song my-0.5 ${isDay ? 'text-amber-900' : 'text-ink-900'}`}>
        {pillar.zhi}
      </div>

      {/* 下：藏干 + 十神 + 权重 */}
      <div className="mt-1 border-t border-dashed border-ink-200 pt-1 space-y-0.5 px-1">
        {pillar.cangGan.map((c, i) => (
          <div key={i} className="text-[11px] flex items-center justify-between">
            <span className={`font-bold ${WX_CLASS[c.wuxing]}`}>{c.gan}</span>
            <span className="text-[10px] text-ink-500">{c.shiShen}</span>
            <span className="text-[10px] text-ink-400" style={{padding:'0 3px', borderRadius:4, background:'#fafafa'}}>
              {Math.round(c.weight*100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WuXingBar({ score, detail, wx }) {
  const total = Object.values(score).reduce((a,b)=>a+b,0) || 1
  const pct = (score[wx]/total) * 100
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className={`tag ${WX_CLASS[wx]}`}>{WX_CN[wx]}</span>
        <span className="text-ink-500">{score[wx].toFixed(2)} · {pct.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{width:`${Math.max(3, pct)}%`, background: WX_HEX[wx]}} />
      </div>
      <div className="text-[10px] text-ink-400 mt-1 leading-snug line-clamp-2">{detail.join(' · ')}</div>
    </div>
  )
}

// 问真风格：输入栏顶部"农历/阳历"大 Tab + 姓名/性别并排 + 日期时分 + 夏令时开关 + 经度 + 真太阳时开关
export default function Bazi() {
  const nav = useNavigate()
  const { user } = useAuthStore()
  const now = new Date()
  const [form, setForm] = useState({
    calendar: 'solar',
    year: now.getFullYear(),
    month: now.getMonth()+1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    lunarLeap: false,
    dstSwitch: 'auto',        // auto | on | off
    trueSolar: true,         // 是否启用真太阳时（=是否应用经度修正）
    zaoWanZi: false,         // 早晚子时（23:00后算第二天早子时）
    lng: 120,
    gender: 0,
    name: '',
    place: '',
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [question, setQuestion] = useState('请综合解读此命：性格、事业财运、感情婚姻、健康、近年走势。')
  const [aiContent, setAiContent] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState('')

  const dstHint = useMemo(() => {
    if (form.dstSwitch === 'on')  return '✅ 已强制按夏令时还原（-1小时）'
    if (form.dstSwitch === 'off') return '⏸  未使用夏令时'
    try {
      const d = new Date(+form.year, +form.month-1, +form.day, +form.hour, +form.minute||0)
      return withinChinaDst(d) ? '⚡ 命中 1986-1991 中国夏令时时段（已自动还原 -1h）' : '不涉及夏令时'
    } catch { return '' }
  }, [form.dstSwitch, form.year, form.month, form.day, form.hour, form.minute])

  function onCalc() {
    setLoading(true); setAiContent(''); setAiErr('')
    try {
      const r = calculateBazi({
        year: +form.year, month: +form.month, day: +form.day,
        hour: +form.hour, minute: +form.minute, gender: +form.gender,
        lng: form.trueSolar ? +form.lng : 120,
        calendar: form.calendar,
        lunarLeap: !!form.lunarLeap,
        dstSwitch: form.dstSwitch,
        name: form.name,
        place: form.place,
      })
      setResult(r)
    } catch (e) {
      alert('排盘失败：' + e.message)
    } finally { setLoading(false) }
  }

  async function onAi() {
    if (!user) { if (confirm('请先登录后使用 AI 解读')) nav('/login'); return }
    setAiLoading(true); setAiErr(''); setAiContent('')
    try {
      const { data } = await api.post('/ai/interpret', { type:'bazi', payload: result, question })
      setAiContent(data.content)
    } catch (e) { setAiErr(e.response?.data?.error || e.message) }
    finally { setAiLoading(false) }
  }

  function toggleOpt(key, exclusive) {
    if (exclusive) {
      // 互斥单选逻辑：真太阳时、早晚子时、夏令时三个互斥
      setForm({
        ...form,
        trueSolar: key === 'trueSolar',
        zaoWanZi: key === 'zaoWanZi',
        // 夏令时用 dstSwitch 控制，单选 true → 自动识别模式开启
        dstSwitch: key === 'dst' ? 'auto' : 'off',
      })
    } else {
      setForm({ ...form, [key]: !form[key] })
    }
  }

  return (
    <div className="pb-4">
      {/* 输入卡 - yrydai 风格：一行一输入项 */}
      <div className="paper-card p-0 mb-3 overflow-hidden">
        {/* 顶部标题条 + 农历/阳历切换 */}
        <div className="bg-gradient-to-r from-[#00b3a0] to-[#00c9b3] text-white">
          <div className="grid grid-cols-2">
            {[
              { k:'solar', l:'公历 / 阳历' },
              { k:'lunar', l:'农历 / 阴历' },
            ].map(o => (
              <button key={o.k} type="button"
                onClick={()=>setForm({...form, calendar: o.k})}
                className={`py-3 font-song font-bold text-[15px] transition ${form.calendar===o.k ? 'bg-white text-[#009e8d] shadow-inner' : 'text-white/90'}`}>
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {/* 客户名称 */}
          <div className="flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-[15px] font-medium text-ink-800">客户名称</span>
            <input className="!border-0 !bg-transparent !p-0 text-right text-[14px] text-ink-500 placeholder:text-ink-300 focus:!ring-0 w-48"
              placeholder="请输入名称(选填)" value={form.name}
              onChange={e=>setForm({...form, name:e.target.value})} />
          </div>

          {/* 选择性别 */}
          <div className="flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-[15px] font-medium text-ink-800">选择性别</span>
            <div className="flex items-center gap-5">
              {[{v:0,l:'男'},{v:1,l:'女'}].map(o => (
                <label key={o.v} className="inline-flex items-center gap-2 text-[14px] text-ink-700 cursor-pointer">
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${+form.gender===o.v ? 'border-[#00b3a0]' : 'border-ink-300'}`}>
                    {+form.gender===o.v && <span className="w-2.5 h-2.5 rounded-full bg-[#00b3a0]" />}
                  </span>
                  {o.l}
                </label>
              ))}
            </div>
          </div>

          {/* 出生时间 */}
          <div className="flex items-center justify-between py-3 border-b border-ink-100"
               onClick={()=>document.getElementById('bazi-time-btn')?.click()}>
            <span className="text-[15px] font-medium text-ink-800">出生时间</span>
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-ink-500">
                {form.calendar === 'solar'
                  ? `${form.year}年${form.month}月${form.day}日 ${String(form.hour).padStart(2,'0')}:${String(form.minute).padStart(2,'0')}`
                  : `农历${form.year}年${form.lunarLeap?'闰':''}${form.month}月${form.day}日 ${String(form.hour).padStart(2,'0')}:${String(form.minute).padStart(2,'0')}`}
              </span>
              <span className="text-ink-300">›</span>
            </div>
          </div>

          {/* 展开式日期时间输入（点击出生时间时展开） */}
          <div id="bazi-time-inputs" className="pb-3 border-b border-ink-100">
            <div className="grid grid-cols-2 gap-2.5 pt-3">
              {form.calendar === 'solar' ? (
                <>
                  <label><span className="field-label">公历年</span>
                    <input type="number" className="field" value={form.year} onChange={e=>setForm({...form, year:e.target.value})} />
                  </label>
                  <label><span className="field-label">公历月</span>
                    <input type="number" min={1} max={12} className="field" value={form.month} onChange={e=>setForm({...form, month:e.target.value})} />
                  </label>
                  <label><span className="field-label">公历日</span>
                    <input type="number" min={1} max={31} className="field" value={form.day} onChange={e=>setForm({...form, day:e.target.value})} />
                  </label>
                </>
              ) : (
                <>
                  <label><span className="field-label">农历年</span>
                    <input type="number" className="field" value={form.year} onChange={e=>setForm({...form, year:e.target.value})} />
                  </label>
                  <label className="flex items-end gap-2">
                    <div className="flex-1"><span className="field-label">农历月</span>
                      <input type="number" min={1} max={12} className="field" value={form.month} onChange={e=>setForm({...form, month:e.target.value})} />
                    </div>
                    <label className="inline-flex items-center gap-1 pb-2 text-[12px] text-ink-600 whitespace-nowrap">
                      <input type="checkbox" className="!w-4 !h-4" checked={!!form.lunarLeap}
                        onChange={e=>setForm({...form, lunarLeap: e.target.checked})}/> 闰月
                    </label>
                  </label>
                  <label><span className="field-label">农历日</span>
                    <input type="number" min={1} max={30} className="field" value={form.day} onChange={e=>setForm({...form, day:e.target.value})} />
                  </label>
                </>
              )}
              <label><span className="field-label">时（0-23）</span>
                <input type="number" min={0} max={23} className="field" value={form.hour} onChange={e=>setForm({...form, hour:e.target.value})} />
              </label>
              <label><span className="field-label">分（0-59）</span>
                <input type="number" min={0} max={59} className="field" value={form.minute} onChange={e=>setForm({...form, minute:e.target.value})} />
              </label>
            </div>
          </div>

          {/* 出生地点 */}
          <div className="flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-[15px] font-medium text-ink-800">出生地点</span>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <input className="!border-0 !bg-transparent !p-0 text-right text-[14px] text-ink-500 placeholder:text-ink-300 focus:!ring-0 w-40"
                placeholder="请选择出生地点" value={form.place}
                onChange={e=>{
                  const v = e.target.value
                  setForm(f => {
                    const lngMap = {'北京':116.4,'上海':121.5,'广州':113.3,'深圳':114.1,'成都':104.1,'杭州':120.2,'武汉':114.3,'西安':108.9,'南京':118.8,'重庆':106.5,'天津':117.2,'苏州':120.6,'长沙':112.9,'沈阳':123.4,'青岛':120.4,'郑州':113.6,'大连':121.6,'厦门':118.1,'福州':119.3,'合肥':117.3,'济南':117.0,'昆明':102.7,'哈尔滨':126.6,'长春':125.3,'石家庄':114.5,'太原':112.5,'南昌':115.9,'南宁':108.3,'贵阳':106.6,'兰州':103.8,'乌鲁木齐':87.6,'拉萨':91.1,'海口':110.3,'呼和浩特':111.7,'银川':106.2,'西宁':101.8}
                    let lng = 120
                    for (const k of Object.keys(lngMap)) if (v.includes(k)) { lng = lngMap[k]; break }
                    return {...f, place: v, lng}
                  })
                }} />
              <input type="number" step="0.01" className="!border !border-ink-200 !rounded-lg !px-2 !py-1 text-right text-[12px] text-ink-500 w-20"
                placeholder="经度" value={form.lng}
                onChange={e=>setForm({...form, lng: e.target.value})}
                title="出生地经度" />
              <span className="text-ink-300">›</span>
            </div>
          </div>

          {/* 选项行：真太阳时 / 早晚子时 / 夏令时 + 四柱反查 */}
          <div className="flex items-center justify-between py-4 flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              {[
                { key:'trueSolar', label:'真太阳时', checked: form.trueSolar },
                { key:'zaoWanZi', label:'早晚子时', checked: form.zaoWanZi },
                { key:'dst', label:'夏令时', checked: form.dstSwitch !== 'off' },
              ].map(opt => (
                <label key={opt.key} className="inline-flex items-center gap-2 text-[14px] text-ink-700 cursor-pointer"
                       onClick={()=>toggleOpt(opt.key, true)}>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${opt.checked ? 'border-[#00b3a0]' : 'border-ink-300'}`}>
                    {opt.checked && <span className="w-2.5 h-2.5 rounded-full bg-[#00b3a0]" />}
                  </span>
                  {opt.label}
                </label>
              ))}
            </div>
            <button type="button" className="px-4 py-1.5 rounded-md bg-[#00b3a0] text-white text-[13px] font-medium hover:bg-[#00a08f] transition"
              onClick={()=>alert('四柱反查：根据八字反推出生时间，功能开发中')}>
              四柱反查
            </button>
          </div>

          {/* 提示 */}
          <div className="text-[11px] text-ink-400 leading-relaxed mb-3">
            {dstHint !== '不涉及夏令时' && form.dstSwitch !== 'off' && <span>· {dstHint}<br/></span>}
            · 当前经度东经 {form.lng}°（真太阳时每差 1° ≈ ±4 分钟）
          </div>
        </div>

        {/* 开始排盘按钮 */}
        <button className="w-full py-4 bg-gradient-to-r from-[#00b3a0] to-[#00c9b3] text-white text-[17px] font-song font-bold tracking-wider hover:from-[#00a08f] hover:to-[#00b8a4] transition disabled:opacity-60"
          onClick={onCalc} disabled={loading} id="bazi-time-btn">
          {loading ? '排盘中…' : '开 始 排 盘'}
        </button>

        {/* 排盘记录按钮 */}
        <button className="w-full py-4 mt-2 bg-[#f6f2ec] text-ink-700 text-[16px] font-bold tracking-wider border-t border-ink-100 hover:bg-ink-50 transition"
          onClick={()=>alert('排盘记录功能开发中')}>
          排 盘 记 录
        </button>
      </div>

      {!result && (
        <div className="paper-card p-4 text-center text-ink-500 text-[13px]">
          📜 请输入出生年月日时，点击「立即排盘」<br />
          <span className="text-[11px] text-ink-400 mt-1 block">推荐使用真太阳时校正（出生地经度越准越好）</span>
        </div>
      )}

      {result && <>
        {/* 基础信息 - 问真风格顶部八字标题条 */}
        <div className="paper-card p-4 mb-3">
          <div className="flex items-start justify-between mb-2.5 flex-wrap gap-2">
            <div>
              <div className="text-[12px] text-ink-600 font-medium tracking-wide">
                {result.meta.name ? <span className="mr-2">{result.meta.name}</span> : null}
                {result.meta.genderText}
                {result.meta.place ? <span className="ml-2">· 出生地 {result.meta.place}</span> : null}
              </div>
              <div className="text-[11px] text-ink-500 mt-1 leading-relaxed">
                生肖属{result.shengXiao} · {result.lunarStr}<br />
                {result.meta.calendar === 'lunar' ? '农历输入，已换算公历：' : '公历：'}{result.solarStr}
              </div>
              <div className="font-song font-bold text-[16px] text-ink-900 mt-1">
                日主：<span className="text-primary-700">{result.dayGan}</span>{result.dayZhi}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-ink-500">旺衰综合：<b className="text-primary-700">{result.wangLevel}</b></div>
              <div className="text-[10px] text-ink-400 mt-0.5">令·{result.deLingScore.toFixed(1)}  地·{result.deDiScore.toFixed(1)}  助·{result.deZhuScore.toFixed(1)} = <b>{result.totalWangScore.toFixed(1)}</b></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-ink-50 rounded px-2 py-1.5"><span className="text-ink-500">日历：</span>{result.meta.calendar==='lunar' ? '农历'+(result.meta.lunarLeap?'（闰）':'') : '公历'}</div>
            <div className="bg-ink-50 rounded px-2 py-1.5"><span className="text-ink-500">夏令时：</span>{result.meta.dstApplied ? `已还原 (${result.dstAdjustMin}分)` : (result.meta.dstSwitch==='off'?'关闭':'未启用')}</div>
            <div className="bg-ink-50 rounded px-2 py-1.5"><span className="text-ink-500">真太阳时：</span>{result.trueSolar}（经度 {result.meta.lng}°，修正 {result.tzAdjustMin>=0?'+':''}{result.tzAdjustMin}分）</div>
            <div className="bg-ink-50 rounded px-2 py-1.5"><span className="text-ink-500">起运：</span>{result.qiYunSui}岁 · {result.qiYunDate}</div>
            <div className="bg-ink-50 rounded px-2 py-1.5 col-span-2"><span className="text-ink-500">月令：</span>{result.monthWX} · 坐{result.wangStatus.label} &nbsp;|&nbsp; 节气：{result.solarTerm || '-'} &nbsp;|&nbsp; 下一节气：{result.nextSolarTerm || '-'}（{result.nextSolarTermDate || '-'}）</div>
          </div>
        </div>

        {/* 四柱 - 问真风格四列大卡 */}
        <div className="paper-card p-3 mb-3">
          <div className="flex items-center justify-between mb-2 px-1 flex-wrap gap-2">
            <div className="font-song font-bold text-primary-800">四柱干支 · 藏干 · 十神 · 纳音 · 空亡</div>
            <div className="text-[10px] text-ink-500">
              日空 {result.dayKong.map(z=><SSTag key={'d'+z} cname="wx-tu">{z}</SSTag>)} &nbsp;
              年空 {result.yearKong.map(z=><SSTag key={'y'+z} cname="wx-mu">{z}</SSTag>)}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {result.pillars.map((p,i) => <PillarCell key={i} pillar={p} isDay={p.key==='day'} dayKong={result.dayKong} />)}
          </div>
        </div>

        {/* 五行 + 旺衰 */}
        <div className="paper-card p-4 mb-3">
          <div className="font-song font-bold text-[15px] text-ink-900 mb-3 flex items-center gap-2">
            <span className="tag wx-huo">五行分布</span>
            <span className="text-[11px] text-ink-500">（天干 1.0 分 + 藏干按权重折算）</span>
          </div>
          <div className="space-y-2.5">
            {['木','火','土','金','水'].map(wx => (
              <WuXingBar key={wx} score={result.wxScore} detail={result.wxDetail[wx]} wx={wx} />
            ))}
          </div>
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-br from-amber-50 via-white to-primary-50 border border-amber-100">
            <div className="font-song font-bold text-primary-800 mb-1.5">日主旺衰判定 · 得令 · 得地 · 得助</div>
            <div className="grid grid-cols-3 gap-2 text-[12px] mb-2">
              <div className="bg-white rounded-lg p-2 text-center shadow-sm"><div className="text-ink-400 text-[10px]">得令</div><div className="font-bold text-ink-800 text-[15px]">{result.deLingScore.toFixed(1)}</div></div>
              <div className="bg-white rounded-lg p-2 text-center shadow-sm"><div className="text-ink-400 text-[10px]">得地</div><div className="font-bold text-ink-800 text-[15px]">{result.deDiScore.toFixed(1)}</div></div>
              <div className="bg-white rounded-lg p-2 text-center shadow-sm"><div className="text-ink-400 text-[10px]">得助</div><div className="font-bold text-ink-800 text-[15px]">{result.deZhuScore.toFixed(1)}</div></div>
            </div>
            <div className="text-[12px] text-ink-700 leading-relaxed">
              日主 <b className="text-primary-700">{result.dayGan}</b>（{GAN_WUXING[result.dayGan]}），生于 <b>{result.monthWX}</b> 月 → 月令「{result.wangStatus.label}」（{result.wangStatus.note}）；综合判定为「<b className="text-primary-700">{result.wangLevel}</b>」。
            </div>
          </div>
        </div>

        {/* 十神分布 */}
        <div className="paper-card p-4 mb-3">
          <div className="font-song font-bold text-[15px] text-ink-900 mb-2"><span className="tag wx-mu">十神分布</span> · 比肩/劫财（同类）→ 食伤 → 财 → 官杀 → 印枭（生身）</div>
          <div className="grid grid-cols-5 gap-2">
            {['比肩','劫财','食神','伤官','偏财','正财','七杀','正官','偏印','正印'].map(s => (
              <div key={s} className="text-center rounded-lg bg-ink-50 py-2">
                <div className="text-[10px] text-ink-500">{s}</div>
                <div className="font-bold text-ink-800 text-[14px] mt-0.5">{(result.shiShenCount[s]||0).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 格局 + 用神喜忌 */}
        <div className="paper-card p-4 mb-3">
          <div className="font-song font-bold text-[15px] text-ink-900 mb-3 flex items-center gap-2">
            <span className="tag wx-huo">格局 · 用神喜忌</span>
            <span className="text-[11px] text-ink-500">（月令取格 + 扶抑用神，简易版供参考）</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-primary-200 bg-gradient-to-br from-primary-50 via-white to-white p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-bold text-[14px] font-song text-primary-800">命局格局</span>
                {result.geju.isTouChu && <span className="tag wx-mu text-[10px]">透干有力</span>}
                {result.geju.sub?.length > 0 && result.geju.sub.slice(0,2).map(s => (
                  <span key={s} className="tag wx-shui text-[10px]">{s}</span>
                ))}
              </div>
              <div className="font-song text-[20px] text-primary-700 mb-1.5 font-bold">{result.geju.main}</div>
              <div className="text-[12.5px] text-ink-700 leading-[1.8]">{result.geju.detail}</div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-3.5">
              <div className="font-bold text-[14px] font-song text-amber-800 mb-2">用神 · 喜神 · 忌神</div>
              <div className="space-y-1.5 text-[12.5px]">
                <div className="flex items-start gap-2">
                  <span className="tag wx-huo !text-[11px] shrink-0 mt-0.5">用神</span>
                  <div className="text-ink-800">{result.yongShen.yong.join(' / ')}</div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="tag wx-mu !text-[11px] shrink-0 mt-0.5">喜神</span>
                  <div className="text-ink-800">{result.yongShen.xi.join(' / ')}</div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="tag wx-jin !text-[11px] shrink-0 mt-0.5">忌神</span>
                  <div className="text-ink-800">{result.yongShen.ji.join(' / ')}</div>
                </div>
              </div>
              <div className="mt-2.5 text-[12px] text-ink-700 leading-[1.8] border-t border-amber-100 pt-2">
                {result.yongShen.note}
              </div>
            </div>
          </div>
        </div>

        {/* 大运 + 流年 */}
        <div className="paper-card p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-song font-bold text-[15px] text-ink-900"><span className="tag wx-shui">大运 · 流年</span></div>
            <div className="text-[11px] text-ink-500">{result.qiYunSui}岁起运 · 每十年一换</div>
          </div>
          <div className="space-y-2.5">
            {result.daYunList.map(dy => (
              <details key={dy.idx} className="rounded-xl border border-ink-200 overflow-hidden" open={dy.idx < 2}>
                <summary className="px-3 py-2.5 bg-gradient-to-r from-ink-50 to-white cursor-pointer list-none flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="tag wx-tu">第{dy.idx+1}运</span>
                    <span className="font-song text-[22px] text-primary-700">{dy.ganzhi}</span>
                    <span className="text-[11px] text-ink-500">{dy.startAge}-{dy.endAge}岁 · {dy.startYear}-{dy.endYear}</span>
                  </div>
                  <span className="text-ink-400 text-[12px]">▾</span>
                </summary>
                <div className="p-2.5 border-t border-ink-100 bg-white">
                  <div className="grid grid-cols-5 gap-1.5">
                    {dy.liuNian.map(ln => (
                      <div key={ln.year} className="text-center rounded-md bg-ink-50 py-1.5">
                        <div className="text-[10px] text-ink-400">{ln.age}岁</div>
                        <div className="font-song font-bold text-ink-800 text-[12px] mt-0.5">{ln.ganzhi}</div>
                        <div className="text-[10px] text-ink-400">{ln.year}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* AI 解读 */}
        <div className="paper-card p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-song font-bold text-[15px] text-ink-900"><span className="tag wx-mu">🤖 AI 深度解读（DeepSeek）</span></div>
            <button onClick={onAi} className="btn-zhusha !py-2 !px-4 text-[13px]" disabled={aiLoading}>
              {aiLoading ? '解读中…' : '开始 AI 解读'}
            </button>
          </div>
          <textarea className="field min-h-[88px] mb-2 text-[13px]" placeholder="想问什么？可留空使用默认模板"
            value={question} onChange={e=>setQuestion(e.target.value)} />
          {aiErr && <div className="mb-2 p-3 rounded-lg bg-red-50 text-red-700 text-[13px] border border-red-100">⚠️ {aiErr}</div>}
          {aiLoading && <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-[12px] border border-amber-100">🧘 正在请命理先生解盘，大约需要 10~20 秒，请稍候…</div>}
          {aiContent && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50/50 via-white to-primary-50/40 border border-primary-100 text-[13.5px] leading-[1.9] text-ink-800 whitespace-pre-wrap font-song">
              {aiContent}
            </div>
          )}
        </div>
      </>}
    </div>
  )
}
