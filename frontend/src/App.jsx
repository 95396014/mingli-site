import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Home from './pages/Home.jsx'
import Bazi from './pages/Bazi.jsx'
import Meihua from './pages/Meihua.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Profile from './pages/Profile.jsx'
import Vip from './pages/Vip.jsx'
import Admin from './pages/Admin.jsx'
import { useAuthStore } from './store/auth.js'

function Layout({ children }) {
  const { user, logout, refreshUser } = useAuthStore()
  const loc = useLocation()
  const isAdmin = loc.pathname.startsWith('/admin')
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => {
    if (user) refreshUser()
  }, [user?.id])
  if (isAdmin) return <div className="min-h-screen">{children}</div>

  const tabs = [
    { to: '/', label: '首页', icon: '🏠' },
    { to: '/bazi', label: '八字', icon: '☯' },
    { to: '/meihua', label: '梅花', icon: '䷀' },
    { to: user ? '/profile' : '/login', label: user ? '我的' : '登录', icon: user ? '👤' : '🔑' },
  ]

  return (
    <div className="min-h-screen pb-20">
      <header className="top-bar px-4 pt-5 pb-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="seal text-sm">问命</div>
            <div>
              <div className="text-[17px] font-bold text-amber-50 tracking-wider font-song">问命阁</div>
              <div className="text-[11px] text-amber-200/80">八字命理 · 梅花易数</div>
            </div>
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-3 -mt-3">{children}</main>

      {/* 底部 Tabbar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-ink-100 z-30 safe-bottom">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {tabs.map(t => (
            <Link key={t.to} to={t.to}
              className={`flex flex-col items-center py-2.5 text-[11px] ${loc.pathname === t.to ? 'text-primary-600' : 'text-ink-500'}`}>
              <div className="text-[20px] mb-0.5">{t.icon}</div>
              <div className="font-medium">{t.label}</div>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

function RequireAuth({ children, requireAdmin = false }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && !user.is_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout><Home /></Layout>} />
      <Route path="/bazi" element={<Layout><Bazi /></Layout>} />
      <Route path="/meihua" element={<Layout><Meihua /></Layout>} />
      <Route path="/login" element={<Layout><Login /></Layout>} />
      <Route path="/register" element={<Layout><Register /></Layout>} />
      <Route path="/profile" element={<Layout><RequireAuth><Profile /></RequireAuth></Layout>} />
      <Route path="/vip" element={<Layout><RequireAuth><Vip /></RequireAuth></Layout>} />
      <Route path="/admin" element={<RequireAuth requireAdmin><Admin /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
