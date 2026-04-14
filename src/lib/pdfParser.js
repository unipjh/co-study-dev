import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'

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

/**
 * PDF Blob에서 지정 페이지들의 텍스트를 추출
 * @param {Blob} pdfBlob
 * @param {number[]|null} pageIndices  — 0-based. null이면 전체 페이지
 * @returns {Promise<Array<{pageIndex: number, text: string}>>}
 */
export async function extractTextFromPdf(pdfBlob, pageIndices = null) {
  const arrayBuffer = await pdfBlob.arrayBuffer()
  const pdf = await getDocument({ data: arrayBuffer }).promise

  const targets = pageIndices ?? Array.from({ length: pdf.numPages }, (_, i) => i)

  const result = []
  for (const pageIndex of targets) {
    const page = await pdf.getPage(pageIndex + 1) // pdf.js는 1-based
    const content = await page.getTextContent()
    const text = content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim()
    if (text) result.push({ pageIndex, text })
  }
  return result
}
