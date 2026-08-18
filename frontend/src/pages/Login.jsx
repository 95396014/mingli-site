import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

export default function Login() {
  const nav = useNavigate()
  const { login } = useAuthStore()
  const [form, setForm] = useState({ username: '', password: '' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setErr(''); setLoading(true)
    try { await login(form.username, form.password); nav('/profile') }
    catch (e) { setErr(e.response?.data?.error || e.message) }
    finally { setLoading(false) }
  }
  return (
    <div className="paper-card p-5 mt-2">
      <div className="text-center mb-5">
        <div className="seal mx-auto mb-2">问命阁</div>
        <div className="font-song font-bold text-[18px] text-ink-900">欢迎回来</div>
        <div className="text-[12px] text-ink-500 mt-0.5">登录后可使用 AI 深度解读与会员功能</div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label><span className="field-label">用户名</span><input className="field" value={form.username} onChange={e=>setForm({...form, username:e.target.value})} /></label>
        <label><span className="field-label">密码</span><input type="password" className="field" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} /></label>
        {err && <div className="text-red-600 text-[13px] px-1">⚠️ {err}</div>}
        <button className="btn-zhusha w-full" disabled={loading}>{loading?'登录中…':'登 录'}</button>
      </form>
      <div className="text-center text-[13px] text-ink-500 mt-4">
        还没账号？<Link to="/register" className="text-primary-700 font-semibold underline">立即注册</Link>
      </div>
      <div className="mt-5 p-3 rounded-lg bg-amber-50 text-[11px] text-amber-800 border border-amber-200">
        💡 演示账号：<b>admin / admin123</b>（管理员）<br />注册一个新账号更方便体验会员和充值。
      </div>
    </div>
  )
}
