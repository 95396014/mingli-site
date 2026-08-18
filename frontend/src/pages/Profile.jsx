import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../utils/api.js'
import { useAuthStore } from '../store/auth.js'
import dayjs from 'dayjs'

export default function Profile() {
  const nav = useNavigate()
  const { user, logout, refreshUser } = useAuthStore()
  const [quota, setQuota] = useState(null)
  const [orders, setOrders] = useState([])
  useEffect(() => { refreshUser() }, [])
  useEffect(() => {
    (async () => {
      const [{data:q},{data:o}] = await Promise.all([
        api.get('/ai/quota'), api.get('/vip/orders')
      ])
      setQuota(q); setOrders(o.list)
    })()
  }, [])

  return (
    <div className="pb-4">
      {/* 个人卡 */}
      <div className="rounded-2xl p-5 mb-3 text-white relative overflow-hidden"
        style={{background:'linear-gradient(135deg,#4a2410 0%,#84381e 60%,#c55a1e 100%)'}}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 text-primary-900 flex items-center justify-center text-2xl font-bold font-song shadow-inner border-2 border-amber-100/40">
            {(user.nickname || user.username).charAt(0)}
          </div>
          <div className="flex-1">
            <div className="font-song font-bold text-[19px]">{user.nickname || user.username}</div>
            <div className="text-[12px] opacity-80 mt-0.5">@{user.username} · {user.is_admin?'超级管理员':(user.is_vip?'至尊会员':'普通用户')}</div>
          </div>
          {user.is_vip && <div className="seal !bg-yellow-200/20 !border-yellow-200 !text-yellow-200">VIP</div>}
        </div>
        {quota && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/10 backdrop-blur rounded-xl p-2.5 text-center border border-white/20">
              <div className="text-[10px] opacity-80">免费剩余</div>
              <div className="font-bold text-[18px]">{quota.freeRemain}<span className="text-[11px] opacity-80 ml-0.5">/ {quota.freeDailyLimit}</span></div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-2.5 text-center border border-white/20">
              <div className="text-[10px] opacity-80">AI 额度</div>
              <div className="font-bold text-[18px]">{user.ai_credits||0}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-2.5 text-center border border-white/20">
              <div className="text-[10px] opacity-80">会员</div>
              <div className="font-bold text-[18px]">{quota.isVip||quota.isAdmin ? '✓' : '—'}</div>
            </div>
          </div>
        )}
      </div>

      {/* 操作 */}
      <div className="paper-card p-2 mb-3 grid grid-cols-3 gap-2">
        <Link to="/bazi" className="py-2.5 text-center rounded-lg bg-primary-50 text-primary-800 text-[13px] font-medium">☯ 八字排盘</Link>
        <Link to="/meihua" className="py-2.5 text-center rounded-lg bg-ink-50 text-ink-800 text-[13px] font-medium">䷀ 梅花易数</Link>
        <Link to="/vip" className="py-2.5 text-center rounded-lg bg-amber-50 text-amber-800 text-[13px] font-medium">✦ 会员中心</Link>
      </div>

      {user.is_admin && (
        <div className="paper-card p-4 mb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-[14px] text-ink-900 font-song">🛡️ 后台管理</div>
              <div className="text-[11px] text-ink-500 mt-0.5">用户 / 订单 / AI调用日志 / 赠权益</div>
            </div>
            <Link to="/admin" className="btn-mo !py-2 !px-4 text-[12px]">进入后台</Link>
          </div>
        </div>
      )}

      {/* 订单 */}
      <div className="paper-card p-4 mb-3">
        <div className="font-bold text-[14px] text-ink-900 font-song mb-3">📒 我的订单</div>
        {orders.length === 0 && <div className="text-center text-[12px] text-ink-400 py-6">尚无订单，去 <Link to="/vip" className="text-primary-700 underline">开通会员</Link></div>}
        <div className="space-y-2">
          {orders.map(o => (
            <div key={o.id} className="flex items-center justify-between p-3 rounded-xl bg-ink-50 border border-ink-100">
              <div>
                <div className="font-bold text-[13px] text-ink-900">{o.plan_name}</div>
                <div className="text-[10px] text-ink-400 mt-0.5">{o.order_no} · {dayjs(o.created_at).format('YYYY-MM-DD HH:mm')}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-[14px] text-primary-700">¥{(o.amount/100).toFixed(2)}</div>
                <div className={`text-[10px] mt-0.5 ${o.status==='paid'?'text-green-600':'text-amber-600'}`}>
                  {o.status==='paid'?'✅ 已支付':'⏳ 待支付'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="w-full py-3 rounded-xl border-2 border-red-200 bg-white text-red-600 font-semibold active:bg-red-50"
        onClick={()=>{ logout(); nav('/') }}>
        退出登录
      </button>
    </div>
  )
}
