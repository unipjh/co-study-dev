import { useState, useEffect, useCallback } from 'react'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import useAuthStore from '../store/authStore'
import useDocumentStore from '../store/documentStore'
import useAI from '../components/AI/useAI'
import { extractTextFromPdf } from '../lib/pdfParser'

const MAX_TEXT_CHARS = 18000 // 토큰 한도 대비 텍스트 상한
const MAX_MAPS = 5           // 문서당 저장 마인드맵 최대 수

function mapsCol(uid, docId) {
  return collection(db, 'users', uid, 'mindmaps', docId, 'maps')
}

/**
 * 마인드맵 생성·저장·로드 훅
 * @param {string} docId
 */
export default function useMindMap(docId) {
  const uid          = useAuthStore((s) => s.user?.uid)
  const { pdfBlob, currentPage, numPages } = useDocumentStore()
  const { generateMindMap } = useAI()

  const [maps,       setMaps]       = useState([])   // 저장된 마인드맵 목록
  const [activeMap,  setActiveMap]  = useState(null) // 현재 표시 중
  const [generating, setGenerating] = useState(false)
  const [progress,   setProgress]   = useState(null) // { pass, label }
  const [error,      setError]      = useState(null)

  // Firestore 실시간 목록 구독
  useEffect(() => {
    if (!docId || !uid) return
    const unsub = onSnapshot(mapsCol(uid, docId), (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data())
        .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      setMaps(items)
      // 현재 표시 중인 맵이 삭제됐으면 초기화
      setActiveMap((prev) => (prev && items.find((m) => m.id === prev.id) ? prev : null))
    })
    return unsub
  }, [docId, uid])

  /**
   * 텍스트 준비: scope에 따라 PDF에서 추출
   */
  async function prepareText(scope) {
    if (!pdfBlob) throw new Error('PDF가 로드되지 않았습니다.')

    let pageIndices
    if (scope === 'page') {
      pageIndices = [currentPage - 1]
    } else {
      // 전체 (최대 MAX_MAPS 페이지 분량 텍스트로 제한)
      pageIndices = Array.from({ length: numPages }, (_, i) => i)
    }

    const pages = await extractTextFromPdf(pdfBlob, pageIndices)
    const combined = pages
      .map((p) => `[페이지 ${p.pageIndex + 1}]\n${p.text}`)
      .join('\n\n')

    // 토큰 초과 방지: 상한 초과 시 앞부분 우선
    return combined.length > MAX_TEXT_CHARS
      ? combined.slice(0, MAX_TEXT_CHARS) + '\n\n[이하 생략됨]'
      : combined
  }

  /**
   * 마인드맵 생성
   * @param {'full'|'page'} scope
   */
  const generate = useCallback(async (scope = 'full') => {
    if (!docId || !uid || generating) return
    setGenerating(true)
    setError(null)
    setProgress({ pass: 0, label: '텍스트 추출 중…' })

    try {
      const text   = await prepareText(scope)
      const result = await generateMindMap(text, (p) => setProgress(p))

      const mapId  = `map_${Date.now()}`
      const scopeLabel = scope === 'page' ? `${currentPage}p` : '전체'
      const mapData = {
        id: mapId,
        docId,
        scope,
        scopeLabel,
        nodes: result.nodes,
        edges: result.edges,
        createdAt: new Date().toISOString(),
      }

      // 최대 수 초과 시 가장 오래된 것 삭제
      if (maps.length >= MAX_MAPS) {
        const oldest = [...maps].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))[0]
        await deleteDoc(doc(mapsCol(uid, docId), oldest.id))
      }

      await setDoc(doc(mapsCol(uid, docId), mapId), mapData)
      setActiveMap(mapData)
    } catch (err) {
      setError(err.message ?? '마인드맵 생성 실패')
    } finally {
      setGenerating(false)
      setProgress(null)
    }
  }, [docId, uid, generating, pdfBlob, currentPage, numPages, maps, generateMindMap])

  const load = useCallback((mapId) => {
    const found = maps.find((m) => m.id === mapId)
    if (found) setActiveMap(found)
  }, [maps])

  const remove = useCallback(async (mapId) => {
    if (!uid) return
    await deleteDoc(doc(mapsCol(uid, docId), mapId))
    if (activeMap?.id === mapId) setActiveMap(null)
  }, [uid, docId, activeMap])

  return { maps, activeMap, generating, progress, error, generate, load, remove }
}
