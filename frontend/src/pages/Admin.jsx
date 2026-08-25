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

// 简易 Modal
function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[86vh] flex flex-col shadow-2xl">
        <div className="px-4 py-3 border-b border-ink-200 flex items-center justify-between">
          <div className="font-bold font-song text-[16px] text-ink-900">{title}</div>
          <button className="text-ink-400 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-ink-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

const emptyUserForm = {
  username: '', password: '', nickname: '', phone: '',
  is_admin: 0, is_vip: 0, ai_credits: 0, vip_days: 30,
}

export default function Admin() {
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState({})
  const [users, setUsers] = useState({ list: [], total: 0, page: 1 })
  const [orders, setOrders] = useState({ list: [], total: 0, page: 1 })
  const [logs, setLogs] = useState({ list: [], total: 0, page: 1 })
  const [usersKw, setUsersKw] = useState('')
  const [usersRole, setUsersRole] = useState('')
  const [grantCredits, setGrantCredits] = useState({})

  // 弹窗：新增用户 / 编辑用户 / 加会员 / 删除确认
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(emptyUserForm)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({ nickname: '', phone: '', ai_credits: 0, is_admin: 0, is_vip: 0, password: '' })
  const [addVipOpen, setAddVipOpen] = useState(false)
  const [vipTarget, setVipTarget] = useState(null)
  const [vipForm, setVipForm] = useState({ days: 30, credits: 0, stack: 1 })
  const [delOpen, setDelOpen] = useState(false)
  const [delTarget, setDelTarget] = useState(null)

  function load() {
    api.get('/admin/stats').then(r=>setStats(r.data.stats))
    api.get('/admin/users', { params:{ page: users.page, size: 20, keyword: usersKw, role: usersRole } }).then(r=>setUsers({ ...r.data, page: users.page }))
    api.get('/admin/orders', { params:{ page: orders.page, size: 20 } }).then(r=>setOrders({ ...r.data, page: orders.page }))
    api.get('/admin/ai-logs', { params:{ page: logs.page, size: 20 } }).then(r=>setLogs({ ...r.data, page: logs.page }))
  }
  useEffect(load, [tab, users.page, orders.page, logs.page])

  async function toggleVip(id) { if (confirm('确认切换该用户会员状态（开=30天 / 关=取消）？')) { await api.post(`/admin/users/${id}/toggle-vip`); load() } }
  async function grantCr(id) {
    const n = parseInt(grantCredits[id] || 0)
    if (!n) return
    await api.post(`/admin/users/${id}/grant-credits`, { credits: n })
    alert(`已赠 ${n} 次额度`)
    grantCredits[id] = 0
    load()
  }

  async function onCreate() {
    try {
      await api.post('/admin/users/create', createForm)
      alert('✅ 用户创建成功')
      setCreateOpen(false); setCreateForm(emptyUserForm); load()
    } catch (e) { alert('❌ ' + (e.response?.data?.error || e.message)) }
  }

  function openEdit(u) {
    setEditTarget(u)
    setEditForm({
      nickname: u.nickname || '',
      phone: u.phone || '',
      ai_credits: u.ai_credits || 0,
      is_admin: u.is_admin || 0,
      is_vip: u.is_vip || 0,
      // datetime-local 输入框需要 YYYY-MM-DDTHH:mm 格式
      vip_expire_at: u.vip_expire_at ? dayjs(Number(u.vip_expire_at)).format('YYYY-MM-DDTHH:mm') : '',
      password: '',
    })
    setEditOpen(true)
  }
  async function onEdit() {
    try {
      const payload = { ...editForm }
      // 把 datetime-local 字符串转回毫秒时间戳
      if (payload.vip_expire_at) {
        payload.vip_expire_at = new Date(payload.vip_expire_at).getTime()
      } else {
        payload.vip_expire_at = null
      }
      await api.post(`/admin/users/${editTarget.id}/update`, payload)
      alert('✅ 已更新')
      setEditOpen(false); load()
    } catch (e) { alert('❌ ' + (e.response?.data?.error || e.message)) }
  }

  function openAddVip(u) {
    setVipTarget(u)
    setVipForm({ days: 30, credits: 0, stack: 1 })
    setAddVipOpen(true)
  }
  async function onAddVip() {
    try {
      await api.post(`/admin/users/${vipTarget.id}/add-vip`, vipForm)
      alert('✅ 已添加会员')
      setAddVipOpen(false); load()
    } catch (e) { alert('❌ ' + (e.response?.data?.error || e.message)) }
  }

  async function onRemoveVip(id) {
    if (!confirm('确认取消该用户的会员身份？到期时间将清空。')) return
    try {
      await api.post(`/admin/users/${id}/remove-vip`)
      alert('✅ 会员已取消')
      load()
    } catch (e) { alert('❌ ' + (e.response?.data?.error || e.message)) }
  }

  function openDel(u) { setDelTarget(u); setDelOpen(true) }
  async function onDel() {
    try {
      await api.delete(`/admin/users/${delTarget.id}`)
      alert('✅ 已删除用户')
      setDelOpen(false); setDelTarget(null); load()
    } catch (e) { alert('❌ ' + (e.response?.data?.error || e.message)) }
  }

  return (
    <div className="min-h-screen bg-ink-50">
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
                ['管理员', stats.admins, '人'],
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
                <div>• <b>用户</b> 页可「新增用户 / 编辑资料 / 删除用户」，也可「加会员 / 取消会员 / 赠送额度」。</div>
                <div>• <b>管理员账号</b> 通过 Railway 环境变量 <code>ADMIN_USERNAME / ADMIN_PASSWORD</code> 强制指定；若在数据库里残留了旧默认 admin/admin123，启动时会自动降级为普通用户防止被爆破。</div>
                <div>• <b>订单</b> 页查看全部订单及支付状态；<b>AI 日志</b> 页查看所有调用记录。</div>
                <div>• 如需接入真实支付（微信/支付宝），在 <code>backend/src/routes/vip.js</code> 的 <code>fulfillOrder</code> 替换为真实回调即可。</div>
              </div>
            </div>
          </div>
        )}

        {tab==='users' && (
          <div className="rounded-2xl bg-white border border-ink-200 p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <input placeholder="搜索用户名/昵称/手机号" className="field !max-w-xs !py-2" value={usersKw} onChange={e=>setUsersKw(e.target.value)} />
                <select className="field !max-w-[150px] !py-2" value={usersRole} onChange={e=>setUsersRole(e.target.value)}>
                  <option value="">全部角色</option>
                  <option value="admin">管理员</option>
                  <option value="vip">VIP 会员</option>
                  <option value="normal">普通用户</option>
                </select>
                <button className="btn-mo !py-2 !px-4 text-[13px]" onClick={load}>🔍 查询</button>
              </div>
              <button className="btn-zhusha !py-2 !px-4 text-[13px]"
                onClick={() => { setCreateForm(emptyUserForm); setCreateOpen(true) }}>
                ➕ 新增用户
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-ink-50">
                  <tr>
                    {['ID','用户','昵称','手机','角色','VIP到期','额度','操作'].map(h=><th key={h} className="text-left p-2 font-medium text-ink-500 whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {users.list.map(u=>(
                    <tr key={u.id} className="border-t border-ink-100 align-top">
                      <td className="p-2">{u.id}</td>
                      <td className="p-2 font-medium">
                        {u.username}
                        {u.is_admin && <span className="ml-1 tag wx-jin">🛡️ 管理员</span>}
                      </td>
                      <td className="p-2">{u.nickname||'—'}</td>
                      <td className="p-2">{u.phone||'—'}</td>
                      <td className="p-2">
                        {u.is_admin ? <span className="tag wx-jin">管理员</span> :
                         u.is_vip   ? <span className="tag wx-huo">VIP</span> :
                                      <span className="tag">普通</span>}
                      </td>
                      <td className="p-2 text-[12px]">
                        {u.is_vip && u.vip_expire_at ? (
                          <div>
                            <div>{dayjs(u.vip_expire_at).format('YYYY-MM-DD HH:mm')}</div>
                            {u.vip_expire_at < Date.now() && <div className="text-red-600 text-[11px]">（已过期）</div>}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <div className="mb-1 font-bold text-ink-800">{u.ai_credits||0} 次</div>
                        <input type="number" className="!py-1 !px-2 !text-[12px] field w-20 inline" placeholder="赠N次"
                          value={grantCredits[u.id]??''} onChange={e=>setGrantCredits({...grantCredits, [u.id]:e.target.value})} />
                        <button onClick={()=>grantCr(u.id)} className="ml-1 text-[12px] px-2 py-1 rounded bg-primary-700 text-white">赠</button>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={()=>openEdit(u)} className="text-[12px] px-2 py-1 rounded bg-sky-100 text-sky-700">✏️ 编辑</button>
                          <button onClick={()=>openAddVip(u)} className="text-[12px] px-2 py-1 rounded bg-amber-100 text-amber-700">⭐ 加会员</button>
                          {u.is_vip
                            ? <button onClick={()=>onRemoveVip(u.id)} className="text-[12px] px-2 py-1 rounded bg-orange-100 text-orange-700">取消会员</button>
                            : <button onClick={()=>toggleVip(u.id)} className="text-[12px] px-2 py-1 rounded bg-green-100 text-green-700">开VIP(30天)</button>}
                          <button onClick={()=>openDel(u)} className="text-[12px] px-2 py-1 rounded bg-red-100 text-red-700">🗑️ 删除</button>
                        </div>
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
            <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
              <span className="px-2.5 py-1 rounded bg-primary-50 text-primary-700 border border-primary-100">
                总调用次数：<b>{logs.total}</b>
              </span>
              <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-700 border border-amber-100">
                涉及用户：<b>{new Set(logs.list.map(l=>l.user_id).filter(Boolean)).size}</b>（当前页）
              </span>
              <span className="px-2.5 py-1 rounded bg-ink-50 text-ink-600 border border-ink-100">
                本页合计 Tokens：<b>{logs.list.reduce((s,l)=>s+(+l.tokens_used||0),0)}</b>
              </span>
            </div>
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

      {/* 新增用户 Modal */}
      <Modal
        open={createOpen} title="➕ 新增用户"
        onClose={()=>setCreateOpen(false)}
        footer={<>
          <button className="btn-mo !py-2 !px-4 text-[13px]" onClick={()=>setCreateOpen(false)}>取消</button>
          <button className="btn-zhusha !py-2 !px-4 text-[13px]" onClick={onCreate}>创建</button>
        </>}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-1"><span className="field-label">用户名 *（≥3位）</span>
            <input className="field" value={createForm.username} onChange={e=>setCreateForm({...createForm, username:e.target.value})} placeholder="如 zhangsan" />
          </label>
          <label className="col-span-1"><span className="field-label">密码 *（≥6位）</span>
            <input type="text" className="field" value={createForm.password} onChange={e=>setCreateForm({...createForm, password:e.target.value})} placeholder="如 123456" />
          </label>
          <label className="col-span-1"><span className="field-label">昵称</span>
            <input className="field" value={createForm.nickname} onChange={e=>setCreateForm({...createForm, nickname:e.target.value})} />
          </label>
          <label className="col-span-1"><span className="field-label">手机号</span>
            <input className="field" value={createForm.phone} onChange={e=>setCreateForm({...createForm, phone:e.target.value})} placeholder="如 13800138000" />
          </label>
          <label className="col-span-1"><span className="field-label">初始 AI 额度</span>
            <input type="number" className="field" value={createForm.ai_credits} onChange={e=>setCreateForm({...createForm, ai_credits:e.target.value})} />
          </label>
          <label className="col-span-1"><span className="field-label">角色</span>
            <select className="field" value={+createForm.is_admin} onChange={e=>setCreateForm({...createForm, is_admin:+e.target.value})}>
              <option value={0}>普通用户</option>
              <option value={1}>管理员</option>
            </select>
          </label>
          <label className="col-span-1"><span className="field-label">是否开通 VIP</span>
            <select className="field" value={+createForm.is_vip} onChange={e=>setCreateForm({...createForm, is_vip:+e.target.value})}>
              <option value={0}>否</option>
              <option value={1}>是</option>
            </select>
          </label>
          <label className="col-span-1"><span className="field-label">VIP 天数（开通 VIP 时生效）</span>
            <input type="number" className="field" value={createForm.vip_days} disabled={!+createForm.is_vip}
              onChange={e=>setCreateForm({...createForm, vip_days:e.target.value})} />
          </label>
        </div>
      </Modal>

      {/* 编辑用户 Modal */}
      <Modal
        open={editOpen} title={`✏️ 编辑用户 · ${editTarget?.username ?? ''}`}
        onClose={()=>setEditOpen(false)}
        footer={<>
          <button className="btn-mo !py-2 !px-4 text-[13px]" onClick={()=>setEditOpen(false)}>取消</button>
          <button className="btn-zhusha !py-2 !px-4 text-[13px]" onClick={onEdit}>保存</button>
        </>}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-1"><span className="field-label">昵称</span>
            <input className="field" value={editForm.nickname} onChange={e=>setEditForm({...editForm, nickname:e.target.value})} />
          </label>
          <label className="col-span-1"><span className="field-label">手机号</span>
            <input className="field" value={editForm.phone} onChange={e=>setEditForm({...editForm, phone:e.target.value})} />
          </label>
          <label className="col-span-1"><span className="field-label">AI 额度</span>
            <input type="number" className="field" value={editForm.ai_credits} onChange={e=>setEditForm({...editForm, ai_credits:e.target.value})} />
          </label>
          <label className="col-span-1"><span className="field-label">管理员角色</span>
            <select className="field" value={+editForm.is_admin} onChange={e=>setEditForm({...editForm, is_admin:+e.target.value})}>
              <option value={0}>否</option><option value={1}>是</option>
            </select>
          </label>
          <label className="col-span-1"><span className="field-label">VIP 状态</span>
            <select className="field" value={+editForm.is_vip} onChange={e=>setEditForm({...editForm, is_vip:+e.target.value})}>
              <option value={0}>否</option><option value={1}>是</option>
            </select>
          </label>
          <label className="col-span-1"><span className="field-label">VIP 到期时间</span>
            <input type="datetime-local" className="field" value={editForm.vip_expire_at ?? ''} disabled={!+editForm.is_vip}
              onChange={e=>setEditForm({...editForm, vip_expire_at:e.target.value})} />
          </label>
          <label className="col-span-2"><span className="field-label">重置密码（留空则不改，≥6位）</span>
            <input type="text" className="field" value={editForm.password} onChange={e=>setEditForm({...editForm, password:e.target.value})} placeholder="如需要重置请输入新密码" />
          </label>
        </div>
      </Modal>

      {/* 加会员 Modal */}
      <Modal
        open={addVipOpen} title={`⭐ 为用户添加会员 · ${vipTarget?.username ?? ''}`}
        onClose={()=>setAddVipOpen(false)}
        footer={<>
          <button className="btn-mo !py-2 !px-4 text-[13px]" onClick={()=>setAddVipOpen(false)}>取消</button>
          <button className="btn-zhusha !py-2 !px-4 text-[13px]" onClick={onAddVip}>确认添加</button>
        </>}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-1"><span className="field-label">会员天数</span>
            <input type="number" min={1} className="field" value={vipForm.days} onChange={e=>setVipForm({...vipForm, days:+e.target.value})} />
          </label>
          <label className="col-span-1"><span className="field-label">赠送 AI 额度（次）</span>
            <input type="number" min={0} className="field" value={vipForm.credits} onChange={e=>setVipForm({...vipForm, credits:+e.target.value})} />
          </label>
          <label className="col-span-2"><span className="field-label">到期时间叠加方式</span>
            <select className="field" value={+vipForm.stack} onChange={e=>setVipForm({...vipForm, stack:+e.target.value})}>
              <option value={1}>叠加到现有到期时间（推荐：若当前是 VIP，从到期日再续天数）</option>
              <option value={0}>从今天开始重新计算（若当前是 VIP，也以今天起算）</option>
            </select>
          </label>
          <div className="col-span-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800 leading-relaxed">
            示例：选择 30 天 + 赠送 10 次额度 → 该用户立即升级 VIP，AI 额度 +10，到期日按叠加规则计算。
          </div>
        </div>
      </Modal>

      {/* 删除用户确认 */}
      <Modal
        open={delOpen} title="⚠️ 确认删除此用户？"
        onClose={()=>setDelOpen(false)}
        footer={<>
          <button className="btn-mo !py-2 !px-4 text-[13px]" onClick={()=>setDelOpen(false)}>取消</button>
          <button className="btn-zhusha !py-2 !px-4 text-[13px]" onClick={onDel}>确认删除</button>
        </>}
      >
        {delTarget && (
          <div className="space-y-2 text-[14px]">
            <div>用户ID：<b>{delTarget.id}</b></div>
            <div>用户名：<b>{delTarget.username}</b>{delTarget.is_admin && <span className="ml-1 tag wx-jin">🛡️ 管理员</span>}</div>
            <div>昵称/手机：<b>{delTarget.nickname||'—'}</b> / <b>{delTarget.phone||'—'}</b></div>
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700 leading-relaxed">
              ⚠️ 此操作会一并删除该用户的所有订单和 AI 调用记录，且不可恢复！<br/>
              若这是最后一位管理员，系统会拒绝删除以防止你锁死后台。
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
