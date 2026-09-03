import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

export default function Register() {
  const nav = useNavigate()
  const { register } = useAuthStore()
  const [form, setForm] = useState({ username:'', password:'', nickname:'', phone:'' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  function validate() {
    if (!form.username || form.username.length < 3) return '用户名至少 3 位'
    if (!form.password || form.password.length < 6) return '密码至少 6 位'
    if (!form.phone) return '手机号必填，方便后续联系'
    if (!/^1[3-9]\d{9}$/.test(form.phone.trim())) return '手机号格式不正确（应为 11 位 1 开头）'
    return ''
  }

  async function submit(e) {
    e.preventDefault()
    const tip = validate()
    if (tip) { setErr(tip); return }
    setErr(''); setLoading(true)
    try { await register({ ...form, phone: form.phone.trim() }); nav('/profile') }
    catch (e) { setErr(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }
  return (
    <div className="paper-card p-5 mt-2">
      <div className="text-center mb-5">
        <div className="seal mx-auto mb-2">注册</div>
        <div className="font-song font-bold text-[18px] text-ink-900">新开命盘</div>
        <div className="text-[12px] text-ink-500 mt-0.5">注册后需开通会员或购买单次额度才能使用 AI 深度解读</div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label><span className="field-label">用户名 *（≥3位）</span><input className="field" value={form.username} onChange={e=>setForm({...form, username:e.target.value})} placeholder="字母/数字/中文均可" /></label>
        <label><span className="field-label">昵称</span><input className="field" value={form.nickname} onChange={e=>setForm({...form, nickname:e.target.value})} placeholder="选填，显示于右上角" /></label>
        <label><span className="field-label">手机号 *（必填）</span><input className="field" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} placeholder="方便后续联系 / 11 位 1 开头" inputMode="numeric" maxLength={11} /></label>
        <label><span className="field-label">密码 *（≥6位）</span><input type="password" className="field" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} /></label>
        {err && <div className="text-red-600 text-[13px] px-1">⚠️ {err}</div>}
        <button className="btn-mo w-full" disabled={loading}>{loading?'注册中…':'立 即 注 册'}</button>
      </form>
      <div className="text-center text-[13px] text-ink-500 mt-4">
        已有账号？<Link to="/login" className="text-primary-700 font-semibold underline">返回登录</Link>
      </div>
    </div>
  )
}
