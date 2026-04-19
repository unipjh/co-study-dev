import { useState, useRef } from 'react'
import useMindMap from '../../hooks/useMindMap'
import MindMapCanvas from '../MindMap/MindMapCanvas'
import useDocumentStore from '../../store/documentStore'

const PROGRESS_LABELS = ['', '핵심 개념 추출 중…', '관계 분류 중…', '원문 인용 연결 중…']

/**
 * 마인드맵 탭 패널
 *
 * @param {{ docId: string }} props
 */
export default function MindMapPanel({ docId }) {
  const { numPages, currentPage, pdfBlob } = useDocumentStore()
  const {
    maps, activeMap, generating, progress, error,
    generate, load, remove,
  } = useMindMap(docId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimerRef = useRef(null)

  function handleDeleteClick() {
    if (confirmDelete) {
      clearTimeout(confirmTimerRef.current)
      remove(activeMap.id)
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  const noDoc = !docId || !pdfBlob

  return (
    <div style={styles.panel}>
      {/* 상단 툴바 */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button
            style={{ ...styles.genBtn, opacity: (noDoc || generating) ? 0.45 : 1 }}
            disabled={noDoc || generating}
            onClick={() => generate('full')}
          >
            전체 생성
          </button>
          <button
            style={{ ...styles.genBtn, ...styles.genBtnSecondary, opacity: (noDoc || generating) ? 0.45 : 1 }}
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
          >
            <option value="">-- 이전 맵 --</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.scopeLabel} · {new Date(m.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 생성 진행 상태 */}
      {generating && (
        <div style={styles.progressBar}>
          <div style={styles.progressSteps}>
            {[1, 2, 3].map((step) => (
              <div key={step} style={styles.progressStep}>
                <div
                  style={{
                    ...styles.stepDot,
                    background: progress?.pass >= step ? '#6366f1' : '#e0e0ff',
                    transform: progress?.pass === step ? 'scale(1.3)' : 'scale(1)',
                  }}
                />
                <span style={{
                  ...styles.stepLabel,
                  color: progress?.pass >= step ? '#6366f1' : '#ccc',
                  fontWeight: progress?.pass === step ? 700 : 400,
                }}>
                  {['개념 추출', '관계 분류', '원문 연결'][step - 1]}
                </span>
              </div>
            ))}
          </div>
          <p style={styles.progressText}>
            {PROGRESS_LABELS[progress?.pass ?? 0] || '준비 중…'}
          </p>
        </div>
      )}

      {/* 에러 */}
      {error && !generating && (
        <div style={styles.errorBanner}>
          <span style={styles.errorText}>{error}</span>
          <button style={styles.errorClose} onClick={() => {}}>×</button>
        </div>
      )}

      {/* 빈 상태 */}
      {!generating && !activeMap && !error && (
        <div style={styles.empty}>
          {noDoc
            ? <p style={styles.emptyText}>PDF를 열면 마인드맵을 생성할 수 있습니다</p>
            : <p style={styles.emptyText}>
                위 버튼으로 마인드맵을 생성하세요.<br />
                <span style={styles.emptyHint}>노드 클릭 시 해당 페이지로 이동합니다</span>
              </p>
          }
        </div>
      )}

      {/* 그래프 */}
      {!generating && activeMap && (
        <div style={styles.canvasWrapper}>
          <div style={styles.mapMeta}>
            <span style={styles.mapMetaText}>
              노드 {activeMap.nodes?.length ?? 0}개 · 관계 {activeMap.edges?.length ?? 0}개 · {activeMap.scopeLabel}
            </span>
            <button
              style={confirmDelete ? styles.deleteMapBtnConfirm : styles.deleteMapBtn}
              onClick={handleDeleteClick}
              title={confirmDelete ? '한 번 더 클릭하면 삭제됩니다' : '이 마인드맵 삭제'}
            >
              {confirmDelete ? '정말 삭제?' : '삭제'}
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
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#fafafa',
  },
  toolbar: {
    padding: '10px 12px',
    background: '#fff',
    borderBottom: '1px solid #e8e8e8',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  toolbarLeft: {
    display: 'flex',
    gap: 6,
    flex: 1,
  },
  genBtn: {
    padding: '6px 12px',
    background: '#6366f1',
    color: '#fff',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    whiteSpace: 'nowrap',
  },
  genBtnSecondary: {
    background: '#f0f0ff',
    color: '#6366f1',
    border: '1px solid #e0e0ff',
  },
  mapSelect: {
    fontSize: 11,
    borderRadius: 6,
    border: '1px solid #e0e0e0',
    padding: '4px 6px',
    color: '#555',
    background: '#fff',
    cursor: 'pointer',
    maxWidth: 160,
  },
  progressBar: {
    padding: '16px 16px 12px',
    background: '#f5f5ff',
    borderBottom: '1px solid #e0e0ff',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  progressSteps: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    transition: 'transform 0.2s, background 0.2s',
  },
  stepLabel: {
    fontSize: 10,
    transition: 'color 0.2s',
  },
  progressText: {
    fontSize: 11,
    color: '#6366f1',
    textAlign: 'center',
    fontWeight: 500,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    background: '#fff0f0',
    borderBottom: '1px solid #fcc',
    flexShrink: 0,
  },
  errorText: { fontSize: 12, color: '#c00', flex: 1 },
  errorClose: { fontSize: 16, color: '#aaa', cursor: 'pointer', background: 'transparent', border: 'none' },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 13,
    color: '#bbb',
    textAlign: 'center',
    lineHeight: 1.8,
  },
  emptyHint: {
    fontSize: 11,
    color: '#ccc',
  },
  canvasWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  mapMeta: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    background: '#fff',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  mapMetaText: {
    fontSize: 11,
    color: '#aaa',
    flex: 1,
  },
  deleteMapBtn: {
    fontSize: 11,
    color: '#ccc',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    padding: '2px 4px',
  },
  deleteMapBtnConfirm: {
    fontSize: 11,
    color: '#ef4444',
    cursor: 'pointer',
    fontWeight: 700,
    background: '#fff0f0',
    border: '1px solid #fca5a5',
    borderRadius: 4,
    padding: '3px 8px',
  },
}
