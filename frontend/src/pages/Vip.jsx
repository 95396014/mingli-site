import { useEffect, useState } from 'react'
import api from '../utils/api.js'
import { useAuthStore } from '../store/auth.js'
import dayjs from 'dayjs'

export default function Vip() {
  const { user, refreshUser } = useAuthStore()
  const [plans, setPlans] = useState([])
  const [pick, setPick] = useState('year')
  const [order, setOrder] = useState(null)
  const [payStatus, setPayStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [poll, setPoll] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [wechatCopied, setWechatCopied] = useState(false)
  const WECHAT_ID = 'YiGeHuiZi_'

  function copyWechat() {
    const text = WECHAT_ID
    // 优先使用 Clipboard API（HTTPS/安全上下文），否则用 textarea + execCommand 兼容
    const fallback = () => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0'
        document.body.appendChild(ta); ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('execCommand failed')
        setWechatCopied(true); setTimeout(()=>setWechatCopied(false), 1800)
      } catch {
        // 最差方案：prompt 提示用户手动复制
        window.prompt('请手动复制微信号：', text)
      }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => { setWechatCopied(true); setTimeout(()=>setWechatCopied(false), 1800) })
        .catch(fallback)
    } else {
      fallback()
    }
  }
  useEffect(() => { (async () => { const {data} = await api.get('/vip/plans'); setPlans(data.plans) })() }, [])

  useEffect(() => {
    if (!order || !poll) return
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get(`/vip/order/${order.orderNo}`)
        if (data.order.status === 'paid') {
          setPayStatus('✅ 支付成功！会员/额度已到账')
          setPoll(false); clearInterval(timer)
          refreshUser()
        }
      } catch {}
    }, 1500)
    return () => clearInterval(timer)
  }, [order, poll])

  async function buy() {
    setLoading(true)
    setOrder(null); setPayStatus('')
    try {
      const { data } = await api.post('/vip/order/create', { planId: pick })
      setOrder(data); setPoll(true)
      setPayStatus('请用支付宝 App 扫描下方二维码完成支付（5 分钟内有效）')
    } catch (e) {
      const rawErr = e.response?.data?.error || e.message || ''
      const code = e.response?.data?.code
      const status = e.response?.status
      // 支付宝环境变量缺失 / 后端 5xx 配置类错误 —— 一律走"联系管理员充值"的友好弹窗，附一键复制微信号
      if (code === 'ALIPAY_NOT_CONFIGURED'
        || /ALIPAY|未配置|环境变量|gateway|拉取环境变量/.test(rawErr)
        || (status && status >= 500 && status < 600)
      ) {
        setContactOpen(true)
      } else {
        // 其他错误（例如"请先登录""套餐不存在"等）继续直接提示
        alert(rawErr)
      }
    } finally {
      setLoading(false)
    }
  }

  function cancelOrder() {
    setOrder(null); setPoll(false); setPayStatus('')
  }

  return (
    <div className="pb-4">
      {/* 支付宝未配置/充值咨询弹窗 */}
      {contactOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-5" onClick={()=>setContactOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
              <div className="font-bold font-song text-[16px] text-ink-900">💳 充值通道</div>
              <button onClick={()=>setContactOpen(false)} className="text-ink-400 text-2xl leading-none">×</button>
            </div>
            <div className="px-5 py-5 space-y-3">
              <div className="text-[14px] text-ink-700 leading-relaxed">
                拉取环境变量失败，请联系管理员充值。
              </div>
              <div
                onClick={copyWechat}
                className="cursor-pointer select-all rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/60 px-4 py-3 flex items-center justify-between active:scale-[0.99] transition"
                title="点击复制微信号">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-green-500 text-[22px] shrink-0">💬</div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-ink-500">点击复制WeChat</div>
                    <div className="font-bold text-[15px] text-blue-700 break-all tracking-wide">
                      {WECHAT_ID}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] shrink-0 ml-3">
                  {wechatCopied
                    ? <span className="bg-green-500 text-white rounded-full px-2.5 py-1 font-semibold shadow-sm">✓ 已复制</span>
                    : <span className="bg-blue-500 text-white rounded-full px-2.5 py-1 font-semibold shadow-sm">复制</span>
                  }
                </div>
              </div>
              <div className="text-[11px] text-ink-400 pt-1 text-center">
                长按/点击微信号即可复制，打开微信添加好友后联系管理员充值
              </div>
            </div>
            <div className="px-5 py-3 border-t border-ink-100 flex gap-2 justify-end bg-ink-50/60">
              <button onClick={()=>setContactOpen(false)} className="btn-mo !py-2 !px-4 text-[13px]">我知道了</button>
            </div>
          </div>
        </div>
      )}

      {/* 顶部宣传 */}
      <div className="rounded-2xl p-5 mb-3 text-white relative overflow-hidden"
        style={{background:'linear-gradient(135deg,#8B4513 0%,#D2691E 40%,#DAA520 100%)'}}>
        <div className="absolute right-0 top-0 opacity-20 text-[160px] leading-none font-song select-none -mr-2 -mt-4">✦</div>
        <div className="seal !text-white !border-white/70 !bg-white/10 mb-2">VIP</div>
        <div className="font-song font-bold text-[22px] leading-tight">问命阁 · 至尊会员</div>
        <div className="text-[12px] mt-1.5 opacity-90">会员期内每天 3 次 AI 深度解读 · 也可购买单次额度单独扣减</div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            {t:'每日 3 次',d:'会员期内每天重置'},
            {t:'全功能',d:'八字 / 梅花 / 后续板块'},
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
              {user.is_admin ? (
                <span className="text-primary-700">✨ 超级管理员</span>
              ) : (user.is_vip && user.vip_expire_at && user.vip_expire_at > Date.now()) ? (
                <span className="text-primary-700">✨ 至尊会员</span>
              ) : '普通用户'}
            </div>
          </div>
          <div className="text-right">
            {(user.is_vip && user.vip_expire_at && user.vip_expire_at > Date.now()) && (
              <>
                <div className="text-[12px] text-ink-600">
                  到期：<b>{dayjs(user.vip_expire_at).format('YYYY-MM-DD')}</b>
                </div>
                <div className="text-[12px] text-ink-600 mt-1">
                  今日会员额度：<b className="text-primary-700">{Math.max(0, 3 - (user.free_daily_used||0))}/3</b>
                </div>
              </>
            )}
            <div className="text-[12px] text-ink-600 mt-1">
              单次额度：<b className="text-primary-700">{user.ai_credits||0}</b> 次
            </div>
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

      {/* 支付方式：仅支付宝当面付 */}
      <div className="paper-card p-3 mb-3">
        <div className="font-bold text-[14px] text-ink-900 mb-2">💳 支付方式</div>
        <div className="flex items-center gap-3 rounded-xl p-3 border-2 border-blue-500 bg-blue-50">
          <div className="text-[28px]">💙</div>
          <div className="flex-1">
            <div className="font-bold text-[14px]">支付宝当面付</div>
            <div className="text-[11px] text-ink-500 mt-0.5">扫码即时到账 · 支持花呗</div>
          </div>
          <div className="text-[12px] text-blue-600 font-bold">已启用</div>
        </div>
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
          <div className="text-[12px] text-ink-600 mb-2">{payStatus}</div>

          {/* 支付宝当面付二维码 */}
          {order.payInfo?.qr_code && (
            <div className="mt-3 flex flex-col items-center">
              <div className="bg-white rounded-xl p-3 border-2 border-blue-200 shadow-sm">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(order.payInfo.qr_code)}`}
                  alt="支付宝支付二维码"
                  className="w-[200px] h-[200px]"
                />
              </div>
              <div className="text-[11px] text-ink-500 mt-2">
                📱 打开支付宝 App「扫一扫」付款
              </div>
              <button onClick={cancelOrder} className="mt-3 text-[12px] text-ink-400 underline">
                取消订单
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
