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

// ── 모듈 레벨 공유 상태 ────────────────────────────────────────────
// DocumentCanvas / ChatPanel 두 인스턴스가 동일 docId에 대해 중복 빌드하지 않도록
// 청크와 빌드 중 여부를 모듈 레벨에서 공유한다.
const chunksCache    = new Map()   // docId → chunk[]  (메모리 캐시)
const buildingDocIds = new Set()   // 현재 빌드 진행 중인 docId

const LOG = (...args) => console.log('[useDocumentIndex]', ...args)

/**
 * 문서 임베딩 색인 관리 훅
 *
 * - Firestore 경로: users/{uid}/documents/{docId}/embeddings/{pageIndex}
 * - 첫 호출 시 기존 색인 자동 로드 (모듈 캐시 → Firestore 순)
 * - 두 인스턴스가 동시에 마운트되어도 buildIndex는 1회만 실행
 * - search(query, k)로 관련 청크 검색
 */
export default function useDocumentIndex(docId) {
  const uid     = useAuthStore((s) => s.user?.uid)
  const pdfBlob = useDocumentStore((s) => s.pdfBlob)

  const [indexed,       setIndexed]       = useState(false)
  const [indexing,      setIndexing]      = useState(false)
  const [indexProgress, setIndexProgress] = useState(0)
  const [indexTotal,    setIndexTotal]    = useState(0)
  const [chunkCount,    setChunkCount]    = useState(0)
  const [checkDone,     setCheckDone]     = useState(false)
  const [indexError,    setIndexError]    = useState(null)

  // 인스턴스 로컬 청크 ref — 모듈 캐시에서 복사하거나 빌드 후 채운다
  const chunksRef = useRef([])

  // docId 변경 시 → 모듈 캐시 우선, 없으면 Firestore 조회
  useEffect(() => {
    if (!uid || !docId) return
    setIndexed(false)
    setCheckDone(false)
    setIndexError(null)
    setChunkCount(0)
    chunksRef.current = []

    LOG(`docId 변경: ${docId}`)

    // 1) 모듈 캐시에 이미 있으면 즉시 사용 (Firestore 왕복 생략)
    if (chunksCache.has(docId)) {
      const cached = chunksCache.get(docId)
      LOG(`캐시 히트: ${cached.length}청크 (${docId})`)
      chunksRef.current = cached
      setChunkCount(cached.length)
      setIndexed(true)
      setCheckDone(true)
      return
    }

    // 2) Firestore에서 기존 색인 로드
    async function loadExisting() {
      LOG(`Firestore 조회 시작 (${docId})`)
      const col  = collection(db, 'users', uid, 'documents', docId, 'embeddings')
      const snap = await getDocs(col)
      if (!snap.empty) {
        const metaDoc = snap.docs.find((d) => d.id === 'indexMeta')
        if (metaDoc?.data()?.complete) {
          const chunks = snap.docs
            .filter((d) => d.id !== 'indexMeta')
            .map((d) => d.data())
          chunks.sort((a, b) => a.pageIndex - b.pageIndex)
          LOG(`Firestore 로드 완료: ${chunks.length}청크 (${docId})`)
          chunksCache.set(docId, chunks)   // 모듈 캐시에 저장
          chunksRef.current = chunks
          setChunkCount(chunks.length)
          setIndexed(true)
        } else {
          LOG(`Firestore 색인 미완성(중단됨) → buildIndex 예정 (${docId})`)
        }
      } else {
        LOG(`Firestore 비어있음 → buildIndex 예정 (${docId})`)
      }
      setCheckDone(true)
    }
    loadExisting().catch((err) => {
      console.error('[useDocumentIndex] loadExisting 오류:', err)
      setCheckDone(true)   // 오류여도 checkDone은 true로 — 자동 빌드 트리거
    })
  }, [uid, docId])

  /**
   * PDF 전체를 페이지 단위로 임베딩하여 Firestore에 저장
   * - 모듈 레벨 buildingDocIds로 다른 인스턴스와 중복 실행 방지
   * - 이미 색인이 있으면 스킵
   */
  const buildIndex = useCallback(async () => {
    if (!uid || !docId || !pdfBlob || indexing || indexed) {
      LOG(`buildIndex 스킵: uid=${!!uid} docId=${!!docId} pdfBlob=${!!pdfBlob} indexing=${indexing} indexed=${indexed}`)
      return
    }
    // 다른 인스턴스가 이미 동일 docId를 빌드 중이면 스킵
    if (buildingDocIds.has(docId)) {
      LOG(`buildIndex 스킵: 이미 빌드 중 (${docId})`)
      return
    }

    buildingDocIds.add(docId)
    setIndexing(true)
    setIndexProgress(0)
    setIndexError(null)

    try {
      LOG(`buildIndex 시작 (${docId}), pdfBlob size=${pdfBlob.size}`)
      const pages = await extractTextFromPdf(pdfBlob)
      LOG(`PDF 텍스트 추출 완료: ${pages.length}페이지`)
      setIndexTotal(pages.length)
      const chunks = []

      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        const batch = pages.slice(i, i + BATCH_SIZE)
        const truncatedTexts = batch.map(({ text }) => text.slice(0, MAX_PAGE_CHARS))
        LOG(`배치 임베딩 요청: ${i}~${i + batch.length - 1}페이지`)
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

      // 모든 청크 저장 완료 → 완료 마커 기록 (부분 색인 감지용)
      await setDoc(
        doc(db, 'users', uid, 'documents', docId, 'embeddings', 'indexMeta'),
        { complete: true, totalPages: pages.length, builtAt: Date.now() }
      )
      LOG(`buildIndex 완료: ${chunks.length}청크 저장됨 (${docId})`)
      chunksCache.set(docId, chunks)   // 모듈 캐시에 저장
      chunksRef.current = chunks
      setChunkCount(chunks.length)
      setIndexed(true)
    } catch (err) {
      console.error('[useDocumentIndex] buildIndex 오류:', err)
      setIndexError(err.message ?? '색인 생성 실패')
    } finally {
      setIndexing(false)
      buildingDocIds.delete(docId)
    }
  }, [uid, docId, pdfBlob, indexing, indexed])

  /**
   * 쿼리와 가장 관련 있는 상위 K 페이지 청크 반환
   */
  const search = useCallback(async (queryText, k = DEFAULT_K) => {
    if (chunksRef.current.length === 0) return []
    const queryVec = await embedText(queryText)
    return findTopK(queryVec, chunksRef.current, k)
  }, [])

  /**
   * 특정 페이지 청크를 직접 반환 (pageIndex 0-based)
   * 색인이 없거나 해당 페이지가 없으면 null
   */
  const getChunkByPage = useCallback((pageIndex) => {
    return chunksRef.current.find((c) => c.pageIndex === pageIndex) ?? null
  }, [])

  // PDF 로드 직후 자동 색인 — Firestore 확인이 끝나고 색인이 없을 때만 실행
  useEffect(() => {
    if (checkDone && !indexed && !indexing && !indexError && pdfBlob && uid && docId) {
      LOG(`자동 색인 트리거 (${docId}) — pdfBlob size=${pdfBlob?.size}`)
      buildIndex()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkDone, indexed, indexing, indexError, pdfBlob])

  return { indexed, indexing, indexProgress, indexTotal, chunkCount, checkDone, indexError, pdfReady: !!pdfBlob, buildIndex, search, getChunkByPage }
}
