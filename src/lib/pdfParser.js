import { GlobalWorkerOptions } from 'pdfjs-dist'

// Vite 환경에서 worker를 CDN으로 지정 — 로컬 import 시 CORS/모듈 에러 발생
GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs`

/**
 * File 객체 → Object URL 변환
 * react-pdf의 file prop에 { url } 형태로 전달
 */
export function fileToUrl(file) {
  return URL.createObjectURL(file)
}

/**
 * 이전에 생성한 Object URL 해제
 */
export function revokeUrl(url) {
  URL.revokeObjectURL(url)
}
