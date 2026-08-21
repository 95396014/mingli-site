const KEY = 'bazi_history'
const MAX = 50

export function getHistory() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveHistory(record) {
  try {
    const list = getHistory()
    list.unshift({
      id: Date.now(),
      savedAt: new Date().toISOString(),
      name: record.name || '匿名',
      gender: record.genderText,
      solarStr: record.solarStr,
      lunarStr: record.lunarStr,
      place: record.place || '',
      dayGan: record.dayGan,
      dayZhi: record.dayZhi,
      shengXiao: record.shengXiao,
      wangLevel: record.wangLevel,
      pillars: record.pillars.map(p => ({ key: p.key, gan: p.gan, zhi: p.zhi })),
      monthWX: record.monthWX,
      solarTerm: record.solarTerm || '',
    })
    const trimmed = list.slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(trimmed))
    return trimmed
  } catch { return [] }
}

export function deleteHistory(id) {
  try {
    const list = getHistory().filter(r => r.id !== id)
    localStorage.setItem(KEY, JSON.stringify(list))
    return list
  } catch { return [] }
}

export function clearHistory() {
  try { localStorage.removeItem(KEY) } catch {}
}
