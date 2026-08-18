import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

export default function Home() {
  const { user } = useAuthStore()
  const cards = [
    { to: '/bazi', title:'八字排盘', sub:'四柱·十神·大运·流年', color:'from-primary-700 to-primary-500', icon:'☯' },
    { to: '/meihua', title:'梅花易数', sub:'体用·互变·生克·卦辞', color:'from-ink-700 to-ink-500', icon:'䷀' },
    { to: '/vip', title:'会员特权', sub:'每日 50 次 AI 深度解读', color:'from-amber-500 to-yellow-500', icon:'✦' },
    { to: user ? '/profile' : '/login', title: user ? '我的账户' : '登录注册', sub: user ? '订单 / 会员 / 额度' : '登录后开启会员服务', color:'from-sky-600 to-blue-500', icon: user ? '👤' : '🔑' },
  ]
  return (
    <div>
      {/* 欢迎卡 */}
      <div className="paper-card p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[13px] text-ink-500">今日 {new Date().toLocaleDateString('zh-CN', {month:'long', day:'numeric', weekday:'long'})}</div>
            <div className="font-song text-xl font-bold text-ink-900 mt-0.5">
              {user ? `${user.nickname || user.username}，命由天定，运由己造` : '君子藏器于身，待时而动'}
            </div>
          </div>
          <div className="seal text-xs">命理</div>
        </div>
        <div className="text-[12px] text-ink-600 leading-relaxed border-t border-ink-100 pt-2 mt-2">
          本站排盘基于精确真太阳时与节气校正，采用古籍正统算法；AI 解读由资深命理师 prompt 调教，结合三命通会、滴天髓、梅花易数等典籍，力求分析有据可依。
        </div>
      </div>

      {/* 功能入口 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {cards.map(c => (
          <Link key={c.to} to={c.to} className={`bg-gradient-to-br ${c.color} text-white rounded-2xl p-4 shadow-md active:scale-95 transition`}>
            <div className="text-2xl mb-2 opacity-90">{c.icon}</div>
            <div className="font-bold text-[15px] mb-0.5">{c.title}</div>
            <div className="text-[11px] opacity-90">{c.sub}</div>
          </Link>
        ))}
      </div>

      {/* 知识卡 */}
      <div className="paper-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-song font-bold text-[15px] text-ink-900">📜 命理小常识</div>
          <span className="tag wx-tu">常识</span>
        </div>
        <ul className="space-y-2 text-[13px] text-ink-700 leading-relaxed">
          <li>• <b className="text-primary-700">真太阳时</b>：古人以日晷定时，现代经度不同需真太阳时校正，否则时柱可能排错。</li>
          <li>• <b className="text-primary-700">换日</b>：八字以 23 点为界，23 点后属次日早子时（夜子时请谨慎）。</li>
          <li>• <b className="text-primary-700">月令</b>：以节气定月，非农历月份。如立春后才算寅月。</li>
          <li>• <b className="text-primary-700">梅花易数</b>：不动不占，无事不占，心诚则灵。起卦后以体用生克断吉凶。</li>
        </ul>
      </div>
    </div>
  )
}
