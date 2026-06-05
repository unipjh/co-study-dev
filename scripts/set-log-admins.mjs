import admin from 'firebase-admin'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const serviceAccountPaths = [
  resolve(scriptDir, 'serviceAccountKey.json'),
  resolve(scriptDir, '../serviceAccountKey.json'),
]

const adminUids = [
  'NVfG2rTb2gPQlYjjxqWTdywyUlz2',
  'Oy6k4xHgE8SQisSY8RvE7dHzu1j1',
]

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  }

  const keyPath = serviceAccountPaths.find((candidate) => existsSync(candidate))
  if (!keyPath) return null

  return JSON.parse(readFileSync(keyPath, 'utf8'))
}

function initializeAdmin() {
  const serviceAccount = loadServiceAccount()

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
    return
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    })
    return
  }

  throw new Error([
    'Firebase Admin 인증 정보가 없습니다.',
    '아래 중 하나를 설정해 주세요:',
    '- scripts/serviceAccountKey.json',
    '- serviceAccountKey.json',
    '- GOOGLE_APPLICATION_CREDENTIALS=서비스계정키파일경로',
    '- FIREBASE_SERVICE_ACCOUNT_JSON=서비스계정JSON문자열',
  ].join('\n'))
}

initializeAdmin()

for (const uid of adminUids) {
  const user = await admin.auth().getUser(uid)
  await admin.auth().setCustomUserClaims(uid, {
    ...(user.customClaims ?? {}),
    logAdmin: true,
  })
  console.log(`logAdmin granted: ${uid}`)
}
