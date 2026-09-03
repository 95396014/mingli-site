import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

export default function Home() {
  const { user } = useAuthStore()
  const cards = [
    { to: '/bazi', title:'八字排盘', sub:'四柱·十神·大运·流年', color:'from-primary-700 to-primary-500', icon:'☯' },
    { to: '/meihua', title:'梅花易数', sub:'体用·互变·生克·卦辞', color:'from-ink-700 to-ink-500', icon:'䷀' },
    { to: user ? '/profile' : '/login', title: user ? '我的账户' : '登录注册', sub: user ? '额度 / 会员状态' : '登录后开启服务', color:'from-sky-600 to-blue-500', icon: user ? '👤' : '🔑' },
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

      {/* 购买会员 / 额度入口 */}
      <Link to={user ? '/vip' : '/login'}
        className="block rounded-2xl p-4 mb-3 text-white relative overflow-hidden shadow-md active:scale-[0.98] transition"
        style={{background:'linear-gradient(135deg,#8B4513 0%,#D2691E 40%,#DAA520 100%)'}}>
        <div className="absolute right-2 top-0 opacity-20 text-[120px] leading-none font-song select-none -mr-1 -mt-3">✦</div>
        <div className="flex items-center justify-between relative">
          <div>
            <div className="flex items-center gap-2">
              <span className="seal !text-white !border-white/70 !bg-white/10">VIP</span>
              <div className="font-song font-bold text-[18px]">开通会员 · 单次额度</div>
            </div>
            <div className="text-[12px] mt-1.5 opacity-90 leading-relaxed">
              7天 ¥166 · 月会员 ¥600 · 年会员 ¥5200 · 单次额度 ¥36<br/>
              <span className="opacity-80">会员每天 3 次 AI 深度解读，单次额度永久有效</span>
            </div>
          </div>
          <div className="bg-white text-primary-800 font-bold text-[13px] px-4 py-2 rounded-full whitespace-nowrap shadow">
            {user ? '立即购买 →' : '登录购买 →'}
          </div>
        </div>
      </Link>

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
