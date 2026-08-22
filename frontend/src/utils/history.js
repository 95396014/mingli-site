const BAZI_KEY = 'bazi_history'
const MEIHUA_KEY = 'meihua_history'
const MAX = 50

export function getHistory(type = 'bazi') {
  const KEY = type === 'meihua' ? MEIHUA_KEY : BAZI_KEY
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveHistory(record, type = 'bazi') {
  const KEY = type === 'meihua' ? MEIHUA_KEY : BAZI_KEY
  try {
    const list = getHistory(type)
    if (type === 'meihua') {
      list.unshift({
        id: Date.now(),
        savedAt: new Date().toISOString(),
        question: record.question || '',
        benName: record.ben?.name || '',
        huName: record.hu?.name || '',
        bianName: record.bian?.name || '',
        movingLine: record.movingLine,
        monthZhi: record.monthZhi,
        monthWX: record.monthWX,
        luck: record.luck,
        mode: record.mode || '',
      })
    } else {
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
    }
    const trimmed = list.slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(trimmed))
    return trimmed
  } catch { return [] }
}

export function deleteHistory(id, type = 'bazi') {
  const KEY = type === 'meihua' ? MEIHUA_KEY : BAZI_KEY
  try {
    const list = getHistory(type).filter(r => r.id !== id)
    localStorage.setItem(KEY, JSON.stringify(list))
    return list
  } catch { return [] }
}

export function clearHistory(type = 'bazi') {
  const KEY = type === 'meihua' ? MEIHUA_KEY : BAZI_KEY
  try { localStorage.removeItem(KEY) } catch {}
}
