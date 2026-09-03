/**
 * 支付宝当面付（Native 扫码）后端封装
 * 官方文档：https://opendocs.alipay.com/open/194/105072
 *
 * 只用 Node 内置 crypto，不引入 alipay-sdk，避免 SDK 版本混乱和密钥格式差异。
 * 密钥来源：全部走环境变量，禁止写入文件或提交到仓库。
 *
 * 环境变量（Railway Variables 里配置）：
 *   ALIPAY_APP_ID      - 应用 AppId（你自己的：2021005173683354）
 *   ALIPAY_PRIVATE_KEY - 应用私钥（PKCS8 格式，可为纯 Base64 或完整 PEM；代码会自动适配）
 *   ALIPAY_PUBLIC_KEY  - 支付宝公钥（不是应用公钥！开放平台「接口加签方式」页面复制）
 *   ALIPAY_NOTIFY_URL  - 异步回调地址（例如 https://mingli-site-production.up.railway.app/api/vip/alipay-notify）
 *   ALIPAY_GATEWAY     - 可选，默认 https://openapi.alipay.com/gateway.do，沙箱填 https://openapi-sandbox.dl.alipaydev.com/gateway.do
 */
const crypto = require('crypto')
const axios = require('axios')

const APP_ID = process.env.ALIPAY_APP_ID || ''
const GATEWAY = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do'
const NOTIFY_URL = process.env.ALIPAY_NOTIFY_URL || ''
const PRIVATE_KEY_RAW = process.env.ALIPAY_PRIVATE_KEY || ''
const PUBLIC_KEY_RAW = process.env.ALIPAY_PUBLIC_KEY || ''

/**
 * 把纯 Base64 或已有 PEM 的密钥统一成 Node crypto 能直接用的 PEM 字符串
 */
function toPem(raw, isPublic) {
  if (!raw) return ''
  let s = String(raw).trim()
  // 已经是 PEM 格式就直接返回
  if (s.includes('BEGIN')) return s
  // 去掉可能的 \r\n 或 \n
  s = s.replace(/\r|\n/g, '')
  // 64 字符一行
  const lines = []
  for (let i = 0; i < s.length; i += 64) lines.push(s.slice(i, i + 64))
  const body = lines.join('\n')
  return isPublic
    ? `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`
    : `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
}

const PRIVATE_KEY = toPem(PRIVATE_KEY_RAW, false)
const PUBLIC_KEY = toPem(PUBLIC_KEY_RAW, true)

function checkAlipayConfig() {
  if (!APP_ID) return { ok: false, reason: '未配置 ALIPAY_APP_ID' }
  if (!PRIVATE_KEY) return { ok: false, reason: '未配置 ALIPAY_PRIVATE_KEY（应用私钥）' }
  if (!PUBLIC_KEY) return { ok: false, reason: '未配置 ALIPAY_PUBLIC_KEY（支付宝公钥）' }
  if (!NOTIFY_URL) return { ok: false, reason: '未配置 ALIPAY_NOTIFY_URL（异步回调地址）' }
  // 快速自检：私钥能否被 Node 识别
  try { crypto.createSign('RSA-SHA256').update('ping').sign(PRIVATE_KEY, 'base64') }
  catch (e) { return { ok: false, reason: `应用私钥解析失败（${e.message}），请确认是 PKCS8 格式` } }
  return { ok: true }
}

/**
 * 把对象按字典序拼成 key=value&key=value 字符串（只含非空值）
 */
function buildSignString(params) {
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
  keys.sort()
  return keys.map(k => `${k}=${params[k]}`).join('&')
}

/**
 * RSA2 签名（应用私钥）
 */
function rsaSign(str) {
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(str)
  return sign.sign(PRIVATE_KEY, 'base64')
}

/**
 * RSA2 验签（支付宝公钥）
 */
function rsaVerify(str, signature) {
  try {
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(str)
    return verify.verify(PUBLIC_KEY, signature, 'base64')
  } catch (e) {
    console.error('[alipay] 验签异常：', e.message)
    return false
  }
}

/**
 * 发请求到开放平台
 * @returns {Promise<Object>} 开放平台 response 里的业务对象（已解析 JSON）
 */
async function callGateway(method, bizContent) {
  const params = {
    app_id: APP_ID,
    method,
    format: 'JSON',
    charset: 'UTF-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '').replace('T', ' '), // 2026-08-25 12:34:56
    version: '1.0',
    biz_content: JSON.stringify(bizContent)
  }
  const signStr = buildSignString(params)
  const signature = rsaSign(signStr)
  const query = new URLSearchParams({ ...params, sign: signature }).toString()
  const url = `${GATEWAY}?${query}`

  // 网关要求 POST + Content-Type: application/x-www-form-urlencoded
  const { data } = await axios.post(GATEWAY, query, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    timeout: 15000,
    validateStatus: () => true
  })

  if (!data || typeof data !== 'object') {
    throw new Error(`开放平台响应异常：${JSON.stringify(data).slice(0, 200)}`)
  }

  // 响应里会有 alipay.trade.precreate.response 和 sign
  const respKey = Object.keys(data).find(k => k.endsWith('.response'))
  const bizResp = respKey ? data[respKey] : null
  if (!bizResp) {
    throw new Error(`开放平台响应中缺少业务 response 字段：${JSON.stringify(data).slice(0, 200)}`)
  }

  // 网关级错误（如果有，会有 sub_msg / msg）
  if (bizResp.code !== '10000') {
    throw new Error(`支付宝网关错误：code=${bizResp.code} sub_code=${bizResp.sub_code || ''} msg=${bizResp.msg} ${bizResp.sub_msg || ''}`)
  }
  return bizResp
}

/**
 * 当面付扫码下单：alipay.trade.precreate
 * 文档：https://opendocs.alipay.com/open/194/105072
 * @param {Object} opt
 * @param {string} opt.out_trade_no - 我们的订单号
 * @param {number|string} opt.total_amount - 金额（元，两位小数；也可以传整数，代码会转）
 * @param {string} opt.subject - 商品标题
 * @param {string} [opt.timeout_express] - 过期时间，例如 '5m'，默认 15m
 * @returns {Promise<{ qr_code: string }>}
 */
async function createPrecreate({ out_trade_no, total_amount, subject, timeout_express = '15m' }) {
  const amount = typeof total_amount === 'number' ? total_amount.toFixed(2) : String(total_amount)
  const biz = {
    out_trade_no,
    total_amount: amount,
    subject,
    product_code: 'FACE_TO_FACE_PAYMENT',
    scene: 'bar_code',
    notify_url: NOTIFY_URL,
    timeout_express
  }
  const resp = await callGateway('alipay.trade.precreate', biz)
  if (!resp.qr_code) {
    throw new Error(`开放平台返回成功 code=10000 但没有 qr_code：${JSON.stringify(resp).slice(0, 300)}`)
  }
  return { qr_code: resp.qr_code }
}

/**
 * 验证支付宝异步回调签名
 * @param {Object} params - req.body（已用 qs 解析成对象）
 * @returns {boolean}
 */
function verifyNotify(params) {
  if (!params || !params.sign || !params.sign_type) return false
  const { sign, sign_type, ...rest } = params
  if (sign_type.toUpperCase() !== 'RSA2') {
    console.warn('[alipay] 非 RSA2 签名类型，收到的是：', sign_type)
  }
  const str = buildSignString(rest)
  return rsaVerify(str, sign)
}

module.exports = {
  checkAlipayConfig,
  createPrecreate,
  verifyNotify,
  // 方便部署时打印脱敏配置
  getDebugSummary: () => ({
    appIdSet: !!APP_ID,
    appIdTail: APP_ID ? APP_ID.slice(-4) : '',
    privateKeySet: !!PRIVATE_KEY,
    publicKeySet: !!PUBLIC_KEY,
    notifyUrlSet: !!NOTIFY_URL,
    gateway: GATEWAY
  })
}
