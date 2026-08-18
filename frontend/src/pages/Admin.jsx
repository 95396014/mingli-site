import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../utils/api.js'
import dayjs from 'dayjs'

function Pager({ total, page, size, onChange }) {
  const pages = Math.max(1, Math.ceil(total / size))
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <button className="px-2 py-1 rounded border border-ink-200" disabled={page<=1} onClick={()=>onChange(page-1)}>上一页</button>
      <span className="text-ink-500">第 {page} / {pages} 页，共 {total} 条</span>
      <button className="px-2 py-1 rounded border border-ink-200" disabled={page>=pages} onClick={()=>onChange(page+1)}>下一页</button>
    </div>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState({})
  const [users, setUsers] = useState({ list: [], total: 0, page: 1 })
  const [orders, setOrders] = useState({ list: [], total: 0, page: 1 })
  const [logs, setLogs] = useState({ list: [], total: 0, page: 1 })
  const [usersKw, setUsersKw] = useState('')
  const [grantCredits, setGrantCredits] = useState({})

  function load() {
    api.get('/admin/stats').then(r=>setStats(r.data.stats))
    api.get('/admin/users', { params:{ page: users.page, size: 20, keyword: usersKw } }).then(r=>setUsers({ ...r.data, page: users.page }))
    api.get('/admin/orders', { params:{ page: orders.page, size: 20 } }).then(r=>setOrders({ ...r.data, page: orders.page }))
    api.get('/admin/ai-logs', { params:{ page: logs.page, size: 20 } }).then(r=>setLogs({ ...r.data, page: logs.page }))
  }
  useEffect(load, [tab, users.page, orders.page, logs.page])

  async function toggleVip(id) { if (confirm('确认切换该用户会员状态？')) { await api.post(`/admin/users/${id}/toggle-vip`); load() } }
  async function grantCr(id) {
    const n = parseInt(grantCredits[id] || 0)
    if (!n) return
    await api.post(`/admin/users/${id}/grant-credits`, { credits: n })
    alert(`已赠 ${n} 次额度`)
    grantCredits[id] = 0
    load()
  }

  return (
    <div className="min-h-screen bg-ink-50">
      {/* admin header */}
      <header className="bg-ink-900 text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="seal !border-amber-400 !text-amber-400">Admin</div>
            <div>
              <div className="font-bold text-[15px] font-song">问命阁 · 后台管理</div>
              <div className="text-[11px] text-ink-300">Dashboard · Users · Orders · AI Logs</div>
            </div>
          </div>
          <Link to="/" className="text-[12px] text-amber-400 underline">← 返回前台</Link>
        </div>
        <div className="max-w-6xl mx-auto mt-3 flex gap-1 overflow-x-auto no-scrollbar">
          {[
            ['dashboard','📊 概览'],['users','👥 用户'],['orders','🧾 订单'],['ai-logs','🤖 AI 日志']
          ].map(([k,l]) => (
            <button key={k} onClick={()=>setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-[13px] whitespace-nowrap ${tab===k?'bg-primary-600 text-white':'bg-ink-800 text-ink-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {tab==='dashboard' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {[
                ['用户总数', stats.users, '人'],
                ['VIP用户', stats.vip, '人'],
                ['订单数', stats.orders, '单'],
                ['收入(分)', stats.revenue||0, '分'],
                ['AI调用', stats.aiCalls, '次'],
              ].map(([l,v,u]) => (
                <div key={l} className="rounded-2xl bg-white border border-ink-200 p-4 shadow-sm">
                  <div className="text-[11px] text-ink-500">{l}</div>
                  <div className="font-bold text-[22px] text-ink-900 mt-1">{v||0}<span className="text-[12px] text-ink-400 ml-1">{u}</span></div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-white border border-ink-200 p-5">
              <div className="font-bold text-[15px] font-song mb-3">快速操作</div>
              <div className="text-[13px] text-ink-600 space-y-1 leading-relaxed">
                <div>• <b>用户</b> 页可手动切换 VIP 状态、赠送 AI 额度。</div>
                <div>• <b>订单</b> 页查看全部订单及支付状态。</div>
                <div>• <b>AI 日志</b> 页查看所有调用记录与 Token 消耗。</div>
                <div>• 如需接入真实支付（微信/支付宝），在 <code>/workspace/mingli-site/backend/src/routes/vip.js</code> 的 <code>fulfillOrder</code> 替换为真实回调；在订单创建时返回真实支付参数即可。</div>
                <div>• 如需切换大模型，编辑 <code>backend/.env</code> 的 <code>DEEPSEEK_API_URL</code> 与 MODEL 变量（兼容 OpenAI 协议）。</div>
              </div>
            </div>
          </div>
        )}

        {tab==='users' && (
          <div className="rounded-2xl bg-white border border-ink-200 p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <input placeholder="搜索用户名/昵称" className="field !max-w-xs" value={usersKw} onChange={e=>setUsersKw(e.target.value)} />
              <button className="btn-mo !py-2 !px-4 text-[13px]" onClick={load}>🔍 查询</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-ink-50">
                  <tr>
                    {['ID','用户','昵称','手机','VIP','到期','额度','操作'].map(h=><th key={h} className="text-left p-2 font-medium text-ink-500 whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {users.list.map(u=>(
                    <tr key={u.id} className="border-t border-ink-100">
                      <td className="p-2">{u.id}</td>
                      <td className="p-2 font-medium">{u.username}{u.is_admin?' 🛡️':''}</td>
                      <td className="p-2">{u.nickname||'—'}</td>
                      <td className="p-2">{u.phone||'—'}</td>
                      <td className="p-2">{u.is_vip?'<span className="tag wx-huo">VIP</span>':'普通'}</td>
                      <td className="p-2 text-[12px]">{u.vip_expire_at?dayjs(u.vip_expire_at).format('YYYY-MM-DD'):'—'}</td>
                      <td className="p-2">
                        <input type="number" className="!py-1 !px-2 !text-[12px] field w-20 inline" placeholder={String(u.ai_credits||0)}
                          value={grantCredits[u.id]??''} onChange={e=>setGrantCredits({...grantCredits, [u.id]:e.target.value})} />
                        <button onClick={()=>grantCr(u.id)} className="ml-1 text-[12px] px-2 py-1 rounded bg-primary-700 text-white">赠</button>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <button onClick={()=>toggleVip(u.id)} className={`text-[12px] px-2 py-1 rounded ${u.is_vip?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>
                          {u.is_vip?'取消VIP':'开VIP(30天)'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><Pager total={users.total} page={users.page} size={20} onChange={p=>setUsers({...users, page:p})} /></div>
          </div>
        )}

        {tab==='orders' && (
          <div className="rounded-2xl bg-white border border-ink-200 p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-ink-50">
                  <tr>
                    {['单号','用户','套餐','金额','状态','支付方式','创建时间','支付时间'].map(h=><th key={h} className="text-left p-2 font-medium text-ink-500 whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {orders.list.map(o=>(
                    <tr key={o.id} className="border-t border-ink-100">
                      <td className="p-2 font-mono text-[12px]">{o.order_no}</td>
                      <td className="p-2">{o.username}</td>
                      <td className="p-2">{o.plan_name}</td>
                      <td className="p-2">¥{(o.amount/100).toFixed(2)}</td>
                      <td className="p-2">{o.status==='paid'?'✅ 已支付':'⏳ 待支付'}</td>
                      <td className="p-2">{o.pay_method||'—'}</td>
                      <td className="p-2 text-[12px]">{dayjs(o.created_at).format('YYYY-MM-DD HH:mm')}</td>
                      <td className="p-2 text-[12px]">{o.paid_at?dayjs(o.paid_at).format('YYYY-MM-DD HH:mm'):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><Pager total={orders.total} page={orders.page} size={20} onChange={p=>setOrders({...orders, page:p})} /></div>
          </div>
        )}

        {tab==='ai-logs' && (
          <div className="rounded-2xl bg-white border border-ink-200 p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-ink-50">
                  <tr>
                    {['ID','用户','类型','Tokens','时间'].map(h=><th key={h} className="text-left p-2 font-medium text-ink-500 whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {logs.list.map(l=>(
                    <tr key={l.id} className="border-t border-ink-100">
                      <td className="p-2">{l.id}</td>
                      <td className="p-2">{l.username}</td>
                      <td className="p-2">{l.type==='bazi'?'八字':l.type==='meihua'?'梅花':l.type}</td>
                      <td className="p-2">{l.tokens_used}</td>
                      <td className="p-2 text-[12px]">{dayjs(l.created_at).format('YYYY-MM-DD HH:mm:ss')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><Pager total={logs.total} page={logs.page} size={20} onChange={p=>setLogs({...logs, page:p})} /></div>
          </div>
        )}
      </main>
    </div>
  )
}
