import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, getDocs, setDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAuthStore from '../store/authStore'
import useDocumentStore from '../store/documentStore'
import { extractTextFromPdf } from '../lib/pdfParser'
import { embedText, batchEmbedTexts } from '../components/AI/useAI'
import { findTopK } from '../lib/embeddings'

// 페이지당 임베딩 입력 최대 길이 (~500 토큰)
const MAX_PAGE_CHARS = 2000
const DEFAULT_K = 5
const BATCH_SIZE = 50  // batchEmbedContents 1회 요청 최대 페이지 수

/**
 * 문서 임베딩 색인 관리 훅
 *
 * - Firestore 경로: users/{uid}/documents/{docId}/embeddings/{pageIndex}
 * - 첫 호출 시 기존 색인 자동 로드
 * - buildIndex()로 색인 신규 생성 (페이지당 1회 API 호출)
 * - search(query, k)로 관련 청크 검색
 */
export default function useDocumentIndex(docId) {
  const uid     = useAuthStore((s) => s.user?.uid)
  const pdfBlob = useDocumentStore((s) => s.pdfBlob)

  const [indexed,       setIndexed]       = useState(false)
  const [indexing,      setIndexing]      = useState(false)
  const [indexProgress, setIndexProgress] = useState(0)   // 완료된 페이지 수
  const [indexTotal,    setIndexTotal]    = useState(0)   // 전체 페이지 수
  const [checkDone,     setCheckDone]     = useState(false) // Firestore 확인 완료 여부

  // 메모리 캐시 — re-render 없이 검색에 바로 사용
  const chunksRef = useRef([])  // { pageIndex, text, embedding }[]

  // docId 변경 시 캐시 초기화 + Firestore에서 기존 색인 로드
  useEffect(() => {
    if (!uid || !docId) return
    setIndexed(false)
    setCheckDone(false)
    chunksRef.current = []

    async function loadExisting() {
      const col  = collection(db, 'users', uid, 'documents', docId, 'embeddings')
      const snap = await getDocs(col)
      if (!snap.empty) {
        const chunks = snap.docs.map((d) => d.data())
        chunks.sort((a, b) => a.pageIndex - b.pageIndex)
        chunksRef.current = chunks
        setIndexed(true)
      }
      setCheckDone(true)
    }
    loadExisting().catch(console.error)
  }, [uid, docId])

  /**
   * PDF 전체를 페이지 단위로 임베딩하여 Firestore에 저장
   * 이미 색인이 있으면 스킵
   */
  const buildIndex = useCallback(async () => {
    if (!uid || !docId || !pdfBlob || indexing || indexed) return
    setIndexing(true)
    setIndexProgress(0)

    try {
      const pages = await extractTextFromPdf(pdfBlob)
      setIndexTotal(pages.length)
      const chunks = []

      // 배치 단위로 임베딩 — BATCH_SIZE 페이지를 1회 API 호출로 처리
      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        const batch = pages.slice(i, i + BATCH_SIZE)
        const truncatedTexts = batch.map(({ text }) => text.slice(0, MAX_PAGE_CHARS))
        const embeddings = await batchEmbedTexts(truncatedTexts)

        for (let j = 0; j < batch.length; j++) {
          const { pageIndex } = batch[j]
          const chunk = { pageIndex, text: truncatedTexts[j], embedding: embeddings[j] }
          chunks.push(chunk)
          await setDoc(
            doc(db, 'users', uid, 'documents', docId, 'embeddings', String(pageIndex)),
            chunk
          )
          setIndexProgress((p) => p + 1)
        }
      }

      chunksRef.current = chunks
      setIndexed(true)
    } catch (err) {
      console.error('색인 생성 오류:', err)
      throw err
    } finally {
      setIndexing(false)
    }
  }, [uid, docId, pdfBlob, indexing, indexed])

  /**
   * 쿼리와 가장 관련 있는 상위 K 페이지 청크 반환
   * @param {string} queryText
   * @param {number} k
   * @returns {Promise<Array<{pageIndex, text, score}>>}
   */
  const search = useCallback(async (queryText, k = DEFAULT_K) => {
    if (chunksRef.current.length === 0) return []
    const queryVec = await embedText(queryText)
    return findTopK(queryVec, chunksRef.current, k)
  }, [])

  // PDF 로드 직후 자동 색인 — Firestore 확인이 끝난 뒤 색인이 없을 때만 실행
  useEffect(() => {
    if (checkDone && !indexed && !indexing && pdfBlob && uid && docId) {
      buildIndex()
    }
  // buildIndex 참조 변경은 무시 (내부 가드로 중복 실행 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkDone, indexed, indexing, pdfBlob])

  return { indexed, indexing, indexProgress, indexTotal, buildIndex, search }
}
