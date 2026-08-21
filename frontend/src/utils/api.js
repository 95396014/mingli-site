import axios from 'axios'
import { useAuthStore } from '../store/auth.js'

// 部署时把这里改成你的后端公网地址（https://xxx.up.railway.app 或 https://xxx.onrender.com 等）
// 留空或 '/'：表示前端和后端同源（即 Vercel 反向代理 /api -> 后端；或后端自己托管前端 dist）
// 填写正式域名时，会直接跨域访问（后端已开启 CORS）
let API_BASE = import.meta.env.VITE_API_BASE || ''

// 兜底：如果是本地开发（localhost:5xxx），且没有显式配置 VITE_API_BASE，就走 3001 后端本地端口
if (!API_BASE && typeof window !== 'undefined') {
  const host = window.location.hostname || 'localhost'
  const port = window.location.port || ''
  const isLocalDev = (host === 'localhost' || host === '127.0.0.1') && port && String(port).startsWith('5')
  if (isLocalDev) API_BASE = `http://${host}:3001`
}

const api = axios.create({
  baseURL: API_BASE || '/',
  timeout: 90000,
  responseType: 'json'
})

api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (config.url && !config.url.startsWith('/')) {
  } else if (!config.url?.startsWith('/api')) {
    config.url = '/api' + (config.url || '')
  }
  return config
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    // 兼容 Railway 等代理层返回的 HTML 错误页
    if (err.response && typeof err.response.data === 'string' && err.response.data.startsWith('<!')) {
      err.response.data = { error: `服务器暂时不可用 (${err.response.status})，请稍后重试` }
    }
    return Promise.reject(err)
  }
)

export function getApiBase() { return API_BASE || '/' }
export function setApiBase(url) {
  API_BASE = url || ''
  api.defaults.baseURL = API_BASE || '/'
}

export default api
