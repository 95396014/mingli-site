const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const axios = require('axios')

const certDir = path.resolve(__dirname, '../../cert')
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true })
}

/**
 * 尝试从环境变量 Base64 写入证书文件（方便 Railway 部署时通过 Variables 传递证书）
 */
function ensureCertFromEnv() {
  const privB64 = process.env.WXPAY_PRIV_KEY_B64
  const pubB64 = process.env.WXPAY_PLATFORM_B64
  if (privB64) {
    try {
      const buf = Buffer.from(privB64, 'base64')
      fs.writeFileSync(path.join(certDir, 'apiclient_key.pem'), buf)
      console.log('[wxpay] ✅ 已从环境变量解码 apiclient_key.pem')
    } catch (e) {
      console.error('[wxpay] 解码私钥失败:', e.message)
    }
  }
  if (pubB64) {
    try {
      const buf = Buffer.from(pubB64, 'base64')
      fs.writeFileSync(path.join(certDir, 'wechat_platform.pem'), buf)
      console.log('[wxpay] ✅ 已从环境变量解码 wechat_platform.pem')
    } catch (e) {
      console.error('[wxpay] 解码平台证书失败:', e.message)
    }
  }
}
ensureCertFromEnv()

const mchid = process.env.WXPAY_MCHID || ''
const APIv3Key = process.env.WXPAY_API_V3_KEY || ''
const notifyUrl = process.env.WXPAY_NOTIFY_URL || ''
const appid = process.env.WXPAY_APPID || ''

const privateKeyPath = path.join(certDir, 'apiclient_key.pem')
const publicKeyPath = path.join(certDir, 'wechat_platform.pem')

function loadKey(path) {
  try { return fs.readFileSync(path, 'utf-8') } catch (e) { return '' }
}

const privateKey = loadKey(privateKeyPath)
const platformPublicKey = loadKey(publicKeyPath)

function checkWxpayConfig() {
  if (!mchid) return { ok: false, reason: '未配置 WXPAY_MCHID' }
  if (!APIv3Key || APIv3Key.length !== 32) return { ok: false, reason: '未配置 WXPAY_API_V3_KEY 或长度不是 32' }
  if (!privateKey) return { ok: false, reason: '未找到 backend/cert/apiclient_key.pem' }
  if (!platformPublicKey) return { ok: false, reason: '未找到 backend/cert/wechat_platform.pem（需在商户平台下载「平台证书」公钥）' }
  return { ok: true }
}

/**
 * 生成微信 APIv3 认证头
 */
function buildAuthorization(method, url, bodyStr = '') {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(16).toString('hex')
  const urlPath = new URL(url).pathname
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyStr}\n`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  const signature = sign.sign(privateKey, 'base64')
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${getSerialNo()}",signature="${signature}"`
}

function getSerialNo() {
  if (process.env.WXPAY_PUBLIC_KEY_ID) return process.env.WXPAY_PUBLIC_KEY_ID
  try {
    const cert = loadKey(path.join(certDir, 'apiclient_cert.pem'))
    if (cert) {
      const certInfo = new (require('@fidm/x509').Certificate)(Buffer.from(cert))
      return certInfo.serialNumber
    }
  } catch {}
  return ''
}

/**
 * 解密微信回调中的资源（使用 APIv3Key + AES-GCM）
 */
function decryptResource(resource) {
  if (!resource?.ciphertext) return resource
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(APIv3Key),
    Buffer.from(resource.nonce || resource.associated_data || '', 'base64')
  )
  decipher.setAuthTag(Buffer.from(resource.nonce || '', 'base64'))
  let decrypted = decipher.update(Buffer.from(resource.ciphertext, 'base64'), null, 'utf-8')
  decrypted += decipher.final('utf-8')
  return JSON.parse(decrypted)
}

/**
 * 验证微信回调签名
 */
function verifyWxpaySignature(headers, bodyStr) {
  try {
    const timestamp = headers['wechatpay-timestamp']
    const nonce = headers['wechatpay-nonce']
    const serial = headers['wechatpay-serial']
    const signature = headers['wechatpay-signature']
    if (!timestamp || !nonce || !signature) return false
    const message = `${timestamp}\n${nonce}\n${bodyStr}\n`
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(message)
    return verify.verify(platformPublicKey, signature, 'base64')
  } catch (e) {
    console.error('[wxpay] 验签异常:', e.message)
    return false
  }
}

/**
 * 调用微信 Native 下单接口
 * 返回 { code_url, ... }
 */
async function createNativeOrder({ description, out_trade_no, amount }) {
  const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/native'
  const body = {
    appid,
    mchid,
    description,
    out_trade_no,
    notify_url: notifyUrl,
    amount: { total: amount, currency: 'CNY' }
  }
  const bodyStr = JSON.stringify(body)
  const authorization = buildAuthorization('POST', url, bodyStr)
  const headers = {
    Authorization: authorization,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  }
  const { data } = await axios.post(url, body, { headers, timeout: 15000 })
  return data
}

module.exports = {
  checkWxpayConfig,
  createNativeOrder,
  verifyWxpaySignature,
  decryptResource,
  buildAuthorization,
  NOTIFY_URL: notifyUrl,
  MCHID: mchid
}
