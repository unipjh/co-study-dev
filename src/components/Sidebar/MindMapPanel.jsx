import { useRef, useState } from 'react'
import useMindMap from '../../hooks/useMindMap'
import MindMapCanvas from '../MindMap/MindMapCanvas'
import useDocumentStore from '../../store/documentStore'

const PROGRESS_LABELS = ['', '학습 흐름 노드 설계 중...', '논리 관계 정렬 중...', '원문 근거 연결 중...']

function formatMapLabel(map) {
  if (!map) return ''
  const date = map.createdAt ? new Date(map.createdAt) : null
  const time = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
  return [map.scopeLabel, time].filter(Boolean).join(' · ')
}

export default function MindMapPanel({ docId }) {
  const { currentPage, pdfBlob } = useDocumentStore()
  const {
    maps, activeMap, generating, progress, error,
    generate, load, remove,
  } = useMindMap(docId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimerRef = useRef(null)

  const noDoc = !docId || !pdfBlob
  const mapLabel = formatMapLabel(activeMap)

  function handleDeleteClick() {
    if (!activeMap) return

    if (confirmDelete) {
      clearTimeout(confirmTimerRef.current)
      remove(activeMap.id)
      setConfirmDelete(false)
      return
    }

    setConfirmDelete(true)
    confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000)
  }

  return (
    <div style={styles.panel}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button
            type="button"
            style={{ ...styles.primaryButton, opacity: (noDoc || generating) ? 0.45 : 1 }}
            disabled={noDoc || generating}
            onClick={() => generate('full')}
          >
            전체 생성
          </button>
          <button
            type="button"
            style={{ ...styles.secondaryButton, opacity: (noDoc || generating) ? 0.45 : 1 }}
            disabled={noDoc || generating}
            onClick={() => generate('page')}
          >
            현재 페이지 ({currentPage}p)
          </button>
        </div>

        {maps.length > 0 && (
          <select
            style={styles.mapSelect}
            value={activeMap?.id ?? ''}
            onChange={(e) => load(e.target.value)}
            aria-label="마인드맵 선택"
          >
            <option value="">이전 마인드맵 선택</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {formatMapLabel(m)}
              </option>
            ))}
          </select>
        )}
      </div>

      {generating && (
        <div style={styles.progressBar}>
          <div style={styles.progressSteps}>
            {[1, 2, 3].map((step) => (
              <div key={step} style={styles.progressStep}>
                <span
                  style={{
                    ...styles.stepDot,
                    background: progress?.pass >= step ? '#070761' : '#d9d9e8',
                    transform: progress?.pass === step ? 'scale(1.25)' : 'scale(1)',
                  }}
                />
                <span
                  style={{
                    ...styles.stepLabel,
                    color: progress?.pass >= step ? '#070761' : '#8d8d98',
                    fontWeight: progress?.pass === step ? 800 : 500,
                  }}
                >
                  {['노드 설계', '관계 정렬', '근거 연결'][step - 1]}
                </span>
              </div>
            ))}
          </div>
          <p style={styles.progressText}>
            {PROGRESS_LABELS[progress?.pass ?? 0] || '준비 중...'}
          </p>
        </div>
      )}

      {error && !generating && (
        <div style={styles.errorBanner}>
          <span style={styles.errorText}>{error}</span>
        </div>
      )}

      {!generating && !activeMap && !error && (
        <div style={styles.empty}>
          <p style={styles.emptyText}>
            {noDoc
              ? 'PDF를 열면 마인드맵을 생성할 수 있습니다.'
              : '버튼을 눌러 좌에서 우로 읽히는 논리 흐름도를 생성하세요.'}
          </p>
        </div>
      )}

      {!generating && activeMap && (
        <div style={styles.canvasWrapper}>
          <div style={styles.mapMeta}>
            <span style={styles.mapMetaText}>
              노드 {activeMap.nodes?.length ?? 0}개 · 관계 {activeMap.edges?.length ?? 0}개 · {activeMap.scopeLabel}
            </span>
            {mapLabel && <span style={styles.mapDate}>{mapLabel}</span>}
            <button
              type="button"
              style={confirmDelete ? styles.deleteMapBtnConfirm : styles.deleteMapBtn}
              onClick={handleDeleteClick}
              title={confirmDelete ? '한 번 더 클릭하면 삭제됩니다' : '마인드맵 삭제'}
            >
              {confirmDelete ? '삭제?' : '삭제'}
            </button>
          </div>
          <MindMapCanvas mindMap={activeMap} />
        </div>
      )}
    </div>
  )
}

const styles = {
  panel: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#eeeef8',
  },
  toolbar: {
    height: 60,
    padding: '10px 14px 10px 10px',
    background: '#ffffff',
    borderBottom: '1px solid #d9d9d9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexShrink: 0,
  },
  toolbarLeft: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  primaryButton: {
    width: 90,
    height: 40,
    borderRadius: 5,
    background: '#070761',
    color: '#ffffff',
    fontSize: 14,
    lineHeight: '20px',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  secondaryButton: {
    minWidth: 127,
    height: 40,
    padding: '0 17px',
    borderRadius: 5,
    background: '#eeeef8',
    color: '#070761',
    fontSize: 14,
    lineHeight: '20px',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  mapSelect: {
    width: 180,
    maxWidth: '44%',
    height: 30,
    padding: '0 12px',
    borderRadius: 5,
    border: '1px solid #d9d9d9',
    background: '#ffffff',
    color: '#6e6e6e',
    fontSize: 12,
    lineHeight: '20px',
    fontWeight: 500,
  },
  progressBar: {
    padding: '16px 18px 13px',
    background: '#ffffff',
    borderBottom: '1px solid #d9d9d9',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  progressSteps: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressStep: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
  },
  stepDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    transition: 'transform 0.2s, background 0.2s',
  },
  stepLabel: {
    fontSize: 11,
    lineHeight: '16px',
  },
  progressText: {
    color: '#070761',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 700,
    textAlign: 'center',
  },
  errorBanner: {
    padding: '9px 14px',
    background: '#fff0f0',
    borderBottom: '1px solid #fca5a5',
    flexShrink: 0,
  },
  errorText: {
    color: '#c02626',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 600,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#6e6e6e',
    fontSize: 14,
    lineHeight: '22px',
    textAlign: 'center',
  },
  canvasWrapper: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  mapMeta: {
    height: 40,
    padding: '0 14px',
    background: '#ffffff',
    borderBottom: '1px solid #d9d9d9',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  mapMetaText: {
    flex: 1,
    minWidth: 0,
    color: '#6e6e6e',
    fontSize: 14,
    lineHeight: '20px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  mapDate: {
    color: '#6e6e6e',
    fontSize: 12,
    lineHeight: '20px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  deleteMapBtn: {
    color: '#6e6e6e',
    fontSize: 12,
    lineHeight: '20px',
    fontWeight: 600,
    padding: '2px 6px',
  },
  deleteMapBtnConfirm: {
    height: 24,
    padding: '2px 8px',
    borderRadius: 5,
    border: '1px solid #fca5a5',
    background: '#fff0f0',
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 800,
  },
}
