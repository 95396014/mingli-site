import { useEffect, useState } from 'react'
import api from '../utils/api.js'
import { useAuthStore } from '../store/auth.js'
import dayjs from 'dayjs'

export default function Vip() {
  const { user, refreshUser } = useAuthStore()
  const [plans, setPlans] = useState([])
  const [pick, setPick] = useState('year')
  const [order, setOrder] = useState(null)
  const [payStatus, setPayStatus] = useState('待支付…（演示模式 5 秒内自动到账）')
  const [loading, setLoading] = useState(false)
  const [poll, setPoll] = useState(false)

  useEffect(() => { (async () => { const {data} = await api.get('/vip/plans'); setPlans(data.plans) })() }, [])

  useEffect(() => {
    if (!order || !poll) return
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get(`/vip/order/${order.orderNo}`)
        if (data.order.status === 'paid') {
          setPayStatus('✅ 支付成功，会员/额度已到账')
          setPoll(false); clearInterval(timer)
          refreshUser()
        }
      } catch {}
    }, 800)
    return () => clearInterval(timer)
  }, [order, poll])

  async function buy() {
    setLoading(true)
    try {
      const { data } = await api.post('/vip/order/create', { planId: pick })
      setOrder(data); setPoll(true)
      setPayStatus(data.payInfo?.tip || '支付中…')
    } catch (e) {
      alert(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-4">
      {/* 顶部宣传 */}
      <div className="rounded-2xl p-5 mb-3 text-white relative overflow-hidden"
        style={{background:'linear-gradient(135deg,#8B4513 0%,#D2691E 40%,#DAA520 100%)'}}>
        <div className="absolute right-0 top-0 opacity-20 text-[160px] leading-none font-song select-none -mr-2 -mt-4">✦</div>
        <div className="seal !text-white !border-white/70 !bg-white/10 mb-2">VIP</div>
        <div className="font-song font-bold text-[22px] leading-tight">问命阁 · 至尊会员</div>
        <div className="text-[12px] mt-1.5 opacity-90">30+ 年实战命理师调教 Prompt · 每日 50 次深度解读</div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            {t:'每日 50 次',d:'AI 深度解读'},
            {t:'全功能',d:'八字 / 梅花无限制'},
            {t:'优先',d:'客服优先响应'}
          ].map(i=>(
            <div key={i.t} className="bg-white/10 backdrop-blur rounded-xl p-2.5 border border-white/20">
              <div className="font-bold text-[15px]">{i.t}</div>
              <div className="text-[10px] opacity-90">{i.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 我的状态 */}
      <div className="paper-card p-4 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] text-ink-500">当前身份</div>
            <div className="font-song font-bold text-[17px] text-ink-900 mt-0.5">
              {user.is_vip || user.is_admin ? (
                <span className="text-primary-700">✨ {user.is_admin?'超级管理员':'至尊会员'}</span>
              ) : '普通用户'}
            </div>
          </div>
          <div className="text-right">
            {user.is_vip && user.vip_expire_at && (
              <div className="text-[12px] text-ink-600">
                到期：<b>{dayjs(user.vip_expire_at).format('YYYY-MM-DD')}</b>
              </div>
            )}
            <div className="text-[12px] text-ink-600 mt-1">额外 AI 额度：<b className="text-primary-700">{user.ai_credits||0}</b> 次</div>
          </div>
        </div>
      </div>

      {/* 套餐 */}
      <div className="space-y-2.5 mb-3">
        {plans.map(p => (
          <button key={p.id} onClick={()=>setPick(p.id)}
            className={`w-full text-left rounded-2xl border-2 p-4 transition ${pick===p.id?'border-primary-600 bg-gradient-to-r from-primary-50 to-white shadow-md':'border-ink-200 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-[15px] text-ink-900 font-song flex items-center gap-2">
                  {p.name}
                  {pick===p.id && <span className="tag wx-huo !py-0.5">已选</span>}
                  {p.id==='year' && <span className="tag wx-mu !py-0.5">推荐</span>}
                  {p.id==='per_use' && <span className="tag wx-jin !py-0.5">按次</span>}
                </div>
                <div className="text-[11px] text-ink-500 mt-1">{p.desc}</div>
              </div>
              <div className="text-right">
                <div className="text-primary-700 font-bold text-[20px]">¥{p.price}</div>
                <div className="text-[10px] text-ink-400">{p.days > 0 ? `约 ¥${(p.price/p.days).toFixed(2)}/天` : p.credits > 1 ? `约 ¥${(p.price/p.credits).toFixed(2)}/次` : '一次一价'}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <button className="btn-zhusha w-full mb-3" onClick={buy} disabled={loading}>
        {loading?'下单中…':`立即开通 ${plans.find(p=>p.id===pick)?.name || ''}`}
      </button>

      {order && (
        <div className={`paper-card p-4 mb-3 ${poll?'animate-pulse':''}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="font-bold text-[14px] text-ink-900">订单：{order.orderNo}</div>
            <div className="tag wx-tu">¥{order.amount}</div>
          </div>
          <div className="text-[12px] text-ink-600">{payStatus}</div>
        </div>
      )}

      {/* 支付说明 */}
      <div className="paper-card p-4">
        <div className="font-bold text-[14px] text-ink-900 mb-2">🔒 支付与权益说明</div>
        <ul className="text-[12px] text-ink-600 space-y-1.5 leading-relaxed">
          <li>• <b>演示环境</b>：本站点当前为演示版，下单后 5 秒自动到账，不发生真实扣款。</li>
          <li>• <b>生产环境</b>：上线时可接入<b>微信支付/支付宝</b>官方接口，付款成功后通过回调开通权益。</li>
          <li>• <b>会员权益</b>：每日 0 点重置免费次数（50次/日），AI额度包不限时间，永久有效。</li>
          <li>• <b>后台管理</b>：管理员账号登录后，可在 <code>/admin</code> 页面手动赠会员/赠额度/看订单。</li>
        </ul>
      </div>
    </div>
  )
}
