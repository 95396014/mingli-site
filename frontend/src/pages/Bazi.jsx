import { useMemo, useState } from 'react'
import { calculateBazi, GAN_WUXING, ZHI_WUXING } from '../utils/bazi.js'
import api from '../utils/api.js'
import { useAuthStore } from '../store/auth.js'
import { Link, useNavigate } from 'react-router-dom'

const WX_CN = { 金:'金', 木:'木', 水:'水', 火:'火', 土:'土' }
const WX_CLASS = { 金:'wx-jin', 木:'wx-mu', 水:'wx-shui', 火:'wx-huo', 土:'wx-tu' }
const WX_HEX = { 金:'#8a94a3', 木:'#3aa84d', 水:'#2f80ed', 火:'#e64a33', 土:'#c68a3f' }

function PillarCell({ pillar, isDay }) {
  return (
    <div className={`rounded-xl border ${isDay ? 'border-primary-400 bg-gradient-to-b from-primary-50 to-white shadow-inner' : 'border-ink-200 bg-white'} px-2 py-3 text-center relative`}>
      <div className="text-[10px] text-ink-400 font-medium">{pillar.name}</div>
      <div className="text-[10px] text-ink-500 mt-0.5">纳音 {pillar.naYin || '-'}</div>
      <div className="mt-1">
        <div className="tag mb-1 mx-auto" style={{maxWidth:'fit-content'}}>
          <span className={WX_CLASS[GAN_WUXING[pillar.gan]]}>{GAN_WUXING[pillar.gan]}</span>
          <span className="mx-1 text-ink-300">·</span>
          <span>{pillar.ganShiShen}</span>
        </div>
        <div className="pillar-big text-[34px] text-primary-800 my-1" style={{writingMode:'horizontal-tb'}}>
          {pillar.gan}
        </div>
        <div className="my-0.5">
          <span className="tag mx-auto" style={{maxWidth:'fit-content'}}>
            <span className={WX_CLASS[ZHI_WUXING[pillar.zhi]]}>{ZHI_WUXING[pillar.zhi]}</span>
          </span>
        </div>
        <div className="pillar-big text-[34px] text-ink-800 my-1">{pillar.zhi}</div>
        <div className="mt-1 border-t border-dashed border-ink-200 pt-1.5 space-y-0.5">
          {pillar.cangGan.map((c,i) => (
            <div key={i} className="text-[11px] flex items-center justify-between px-1">
              <span className="font-bold text-ink-800">{c.gan}</span>
              <span className="text-[10px] text-ink-500">{c.shiShen}</span>
              <span className={`text-[10px] ${WX_CLASS[c.wuxing]}`} style={{padding:'0 4px', borderRadius:4}}>{Math.round(c.weight*100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WuXingBar({ score, percent, detail, wx }) {
  const total = Object.values(score).reduce((a,b)=>a+b,0) || 1
  const pct = (score[wx]/total) * 100
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className={`tag ${WX_CLASS[wx]}`}>{WX_CN[wx]}</span>
        <span className="text-ink-500">{score[wx].toFixed(2)} / {pct.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{width:`${Math.max(3, pct)}%`, background: WX_HEX[wx]}} />
      </div>
      <div className="text-[10px] text-ink-400 mt-1 leading-snug line-clamp-2">{detail.join(' · ')}</div>
    </div>
  )
}

export default function Bazi() {
  const nav = useNavigate()
  const { user } = useAuthStore()
  const now = new Date()
  const [form, setForm] = useState({
    year: now.getFullYear(),
    month: now.getMonth()+1,
    day: now.getDate(),
    hour: 12,
    minute: 0,
    gender: 0,
    lng: 120
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [question, setQuestion] = useState('请综合解读此命：性格、事业财运、感情婚姻、健康、近年走势。')
  const [aiContent, setAiContent] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState('')

  function onCalc() {
    setLoading(true)
    setAiContent('')
    setAiErr('')
    try {
      const r = calculateBazi({
        year: +form.year, month: +form.month, day: +form.day,
        hour: +form.hour, minute: +form.minute,
        gender: +form.gender, lng: +form.lng
      })
      setResult(r)
    } catch (e) {
      alert('排盘失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function onAi() {
    if (!user) { if (confirm('请先登录后使用 AI 解读')) nav('/login'); return }
    setAiLoading(true); setAiErr(''); setAiContent('')
    try {
      const { data } = await api.post('/ai/interpret', { type:'bazi', payload: result, question })
      setAiContent(data.content)
    } catch (e) {
      setAiErr(e.response?.data?.error || e.message)
    } finally {
      setAiLoading(false)
    }
  }

  const up = form.month >= 2 && form.month <= 8 // 粗略默认
  return (
    <div className="pb-4">
      {/* 输入卡 */}
      <div className="paper-card p-4 mb-3">
        <h2 className="font-song font-bold text-[17px] text-ink-900 mb-3 flex items-center gap-2">
          <span className="seal text-xs">排盘</span> 八字排盘参数
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ['year','公历年（1900-2100）','number'],
            ['month','月（1-12）','number'],
            ['day','日（1-31）','number'],
            ['hour','时（0-23）','number'],
            ['minute','分（0-59）','number'],
            ['lng','出生地经度（默认120）','number'],
          ].map(([k,l,t]) => (
            <label key={k}><span className="field-label">{l}</span>
              <input type={t} className="field" value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} />
            </label>
          ))}
          <label className="col-span-2"><span className="field-label">性别</span>
            <div className="grid grid-cols-2 gap-2">
              {[{v:0,l:'乾造 · 男'},{v:1,l:'坤造 · 女'}].map(o => (
                <button key={o.v} type="button" onClick={()=>setForm({...form,gender:o.v})}
                  className={`py-2.5 rounded-lg text-[14px] font-medium border ${+form.gender===o.v ? 'bg-primary-700 text-white border-primary-800' : 'bg-white text-ink-600 border-ink-200'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </label>
        </div>
        <button className="btn-zhusha w-full mt-4" onClick={onCalc} disabled={loading}>
          {loading ? '排盘中…' : '✦ 立即排盘'}
        </button>
      </div>

      {!result && (
        <div className="paper-card p-4 text-center text-ink-500 text-[13px]">
          📜 请输入出生年月日时，点击「立即排盘」<br />
          <span className="text-[11px] text-ink-400 mt-1 block">推荐使用真太阳时校正（出生地经度越准越好）</span>
        </div>
      )}

      {result && <>
        {/* 基本信息 */}
        <div className="paper-card p-4 mb-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-[11px] text-ink-500">
                {result.gender}造 · 生肖属{result.shengXiao} · {result.lunarStr}
              </div>
              <div className="font-song font-bold text-[16px] text-ink-900 mt-0.5">
                日主：<span className="text-primary-700">{result.dayGan}</span>{result.dayZhi}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-ink-500">旺衰综合：<b className="text-primary-700">{result.wangLevel}</b></div>
              <div className="text-[10px] text-ink-400 mt-0.5">令·{result.deLingScore.toFixed(1)} 地·{result.deDiScore.toFixed(1)} 助·{result.deZhuScore.toFixed(1)} = <b>{result.totalWangScore.toFixed(1)}</b></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-ink-50 rounded px-2 py-1.5"><span className="text-ink-500">公历：</span>{result.solarStr}</div>
            <div className="bg-ink-50 rounded px-2 py-1.5"><span className="text-ink-500">真太阳时：</span>{result.trueSolar}（{result.tzOffsetMin>=0?'+':''}{result.tzOffsetMin}分）</div>
            <div className="bg-ink-50 rounded px-2 py-1.5"><span className="text-ink-500">起运：</span>{result.qiYunSui}岁 · {result.qiYunDate}</div>
            <div className="bg-ink-50 rounded px-2 py-1.5"><span className="text-ink-500">月令：</span>{result.monthWX} · 坐{result.wangStatus.label}</div>
          </div>
        </div>

        {/* 四柱 - 问真风格四列 */}
        <div className="paper-card p-3 mb-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="font-song font-bold text-primary-800">四柱干支 · 藏干 · 十神</div>
            <div className="text-[10px] text-ink-500">
              日空 <span className="tag wx-tu mx-1">{result.dayKong[0]}</span>
              <span className="tag wx-tu mx-1">{result.dayKong[1]}</span>
              年空 <span className="tag wx-mu mx-1">{result.yearKong[0]}</span>
              <span className="tag wx-mu mx-1">{result.yearKong[1]}</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {result.pillars.map((p,i) => <PillarCell key={i} pillar={p} isDay={p.key==='day'} />)}
          </div>
        </div>

        {/* 五行 + 旺衰 */}
        <div className="paper-card p-4 mb-3">
          <div className="font-song font-bold text-[15px] text-ink-900 mb-3 flex items-center gap-2">
            <span className="tag wx-huo">五行分布</span>
            <span className="text-[11px] text-ink-500">（天干 1.0 + 藏干权重）</span>
          </div>
          <div className="space-y-2.5">
            {['木','火','土','金','水'].map(wx => (
              <WuXingBar key={wx} score={result.wxScore} percent={result.wxPercent} detail={result.wxDetail[wx]} wx={wx} />
            ))}
          </div>
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-br from-primary-50 to-amber-50 border border-primary-100">
            <div className="font-song font-bold text-primary-800 mb-1.5">日主旺衰判定</div>
            <div className="grid grid-cols-3 gap-2 text-[12px] mb-2">
              <div className="bg-white rounded-lg p-2 text-center"><div className="text-ink-400 text-[10px]">得令</div><div className="font-bold text-ink-800 text-[15px]">{result.deLingScore.toFixed(1)}</div></div>
              <div className="bg-white rounded-lg p-2 text-center"><div className="text-ink-400 text-[10px]">得地</div><div className="font-bold text-ink-800 text-[15px]">{result.deDiScore.toFixed(1)}</div></div>
              <div className="bg-white rounded-lg p-2 text-center"><div className="text-ink-400 text-[10px]">得助</div><div className="font-bold text-ink-800 text-[15px]">{result.deZhuScore.toFixed(1)}</div></div>
            </div>
            <div className="text-[12px] text-ink-700">
              日主 {result.dayGan}{GAN_WUXING[result.dayGan]}，生于 {result.monthWX} 月 → 月令「{result.wangStatus.label}」，综合判定为「<b className="text-primary-700">{result.wangLevel}</b>」。
            </div>
          </div>
        </div>

        {/* 十神分布 */}
        <div className="paper-card p-4 mb-3">
          <div className="font-song font-bold text-[15px] text-ink-900 mb-2"><span className="tag wx-mu">十神分布</span></div>
          <div className="grid grid-cols-5 gap-2">
            {['比肩','劫财','食神','伤官','偏财','正财','七杀','正官','偏印','正印'].map(s => (
              <div key={s} className="text-center rounded-lg bg-ink-50 py-2">
                <div className="text-[10px] text-ink-500">{s}</div>
                <div className="font-bold text-ink-800 text-[14px] mt-0.5">{(result.shiShenCount[s]||0).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 大运 + 流年 */}
        <div className="paper-card p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-song font-bold text-[15px] text-ink-900"><span className="tag wx-shui">大运 · 流年</span></div>
            <div className="text-[11px] text-ink-500">{result.qiYunSui}岁起运 · 每十年一换</div>
          </div>
          <div className="space-y-3">
            {result.daYunList.map(dy => (
              <details key={dy.idx} className="rounded-xl border border-ink-200 overflow-hidden" open={dy.idx < 2}>
                <summary className="px-3 py-2.5 bg-gradient-to-r from-ink-50 to-white cursor-pointer list-none flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="tag wx-tu">第{dy.idx+1}运</span>
                    <span className="pillar-big text-[22px] text-primary-700">{dy.ganzhi}</span>
                    <span className="text-[11px] text-ink-500">{dy.startAge}-{dy.endAge}岁 · {dy.startYear}-{dy.endYear}</span>
                  </div>
                  <span className="text-ink-400 text-[12px]">▾</span>
                </summary>
                <div className="p-2.5 border-t border-ink-100 bg-white">
                  <div className="grid grid-cols-5 gap-1.5">
                    {dy.liuNian.map(ln => (
                      <div key={ln.year} className="text-center rounded-md bg-ink-50 py-1.5">
                        <div className="text-[10px] text-ink-400">{ln.age}岁</div>
                        <div className="font-bold text-ink-800 text-[12px] mt-0.5">{ln.ganzhi}</div>
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
          <div className="flex items-center justify-between mb-3">
            <div className="font-song font-bold text-[15px] text-ink-900 flex items-center gap-2">
              <span className="seal text-[10px]">AI</span>
              大师级 AI 解读
            </div>
            {!user && <Link to="/login" className="text-[12px] text-primary-700 underline">请先登录</Link>}
          </div>
          <label><span className="field-label">您的求问（可自定义，留空用默认综合解读）</span>
            <textarea className="field" rows={2} value={question} onChange={e=>setQuestion(e.target.value)} />
          </label>
          <button className="btn-mo w-full mt-3" onClick={onAi} disabled={aiLoading || !user}>
            {aiLoading ? '生成解读中…（约 10-30 秒）' : (user ? '🔮 请 AI 大师解读' : '🔒 登录后可用')}
          </button>
          {aiErr && <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-700 text-[12px] border border-red-200">⚠️ {aiErr}</div>}
          {aiContent && (
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-b from-amber-50 to-white border border-amber-200">
              <div className="text-[11px] text-primary-700 mb-2 font-semibold">— AI 命理师 谨致 —</div>
              <div className="text-[14px] text-ink-800 leading-[1.85] whitespace-pre-wrap">
                {aiContent}
              </div>
            </div>
          )}
        </div>
      </>}
    </div>
  )
}
