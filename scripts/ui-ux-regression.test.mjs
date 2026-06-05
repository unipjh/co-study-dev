import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

{
  const source = read('src/components/Canvas/SelectionToolbar.jsx')
  assert.match(source, /function CustomColorPicker/)
  assert.match(source, /색상 코드/)
  assert.match(source, /색상 지정/)
  assert.match(source, /function HelpIcon/)
  assert.doesNotMatch(source, />\s*AI\s*</)
  assert.match(source, /handleQuickSave/)
  assert.match(source, /handleMemoSave/)
}

{
  const source = read('src/components/Canvas/AnnotationPopup.jsx')
  assert.match(source, /function CustomColorPicker/)
  assert.match(source, /색상 코드/)
  assert.match(source, /색상 지정/)
  assert.match(source, /const \[selectedColor, setSelectedColor\]/)
  assert.match(source, /colorChanged/)
  assert.match(source, /handleSave/)
  assert.doesNotMatch(source, /onUpdate\?\.\(annotation\.id,\s*{\s*color: colorKey/)
}

{
  const source = read('src/pages/LoginPage.jsx')
  assert.match(source, /className="login-page"/)
  assert.match(source, /FEATURE_VIDEOS/)
  assert.match(source, /기능 보기/)
  assert.match(source, /tutorial-video/)
  assert.match(source, /getDownloadURL/)
  assert.match(source, /VITE_INTRODUCE_VIDEO_SOURCE/)
  assert.match(source, /구글로 로그인 하기/)
  assert.doesNotMatch(source, /아직 기능 소개 준비 x/)
  assert.doesNotMatch(source, /feature-section/)
  assert.doesNotMatch(source, /landing-hero/)
}

{
  const uploadSource = read('src/hooks/useDocumentUpload.js')
  const librarySource = read('src/pages/LibraryPage.jsx')
  assert.match(uploadSource, /MAX_PDF_UPLOAD_BYTES = 100 \* 1024 \* 1024/)
  assert.match(uploadSource, /PDF는 최대/)
  assert.match(uploadSource, /storage\/unauthorized/)
  assert.match(uploadSource, /permission-denied/)
  assert.match(uploadSource, /resolve\(null\)/)
  assert.match(uploadSource, /function isPdfFile/)
  assert.match(uploadSource, /deleteObject/)
  assert.match(librarySource, /library-upload-error/)
  assert.match(librarySource, /role="alert"/)
}

{
  const source = read('src/pages/ViewerPage.jsx')
  assert.match(source, /function getDocumentLoadErrorMessage/)
  assert.match(source, /storage\/object-not-found/)
  assert.match(source, /storage\/unauthorized/)
  assert.match(source, /const SIDEBAR_MIN_RATIO = 0\.2/)
  assert.match(source, /const SIDEBAR_MAX_RATIO = 0\.5/)
  assert.match(source, /const SIDEBAR_DEFAULT_RATIO = 0\.4/)
  assert.match(source, /const \[sidebarRatio,\s+setSidebarRatio\]/)
  assert.match(source, /clampSidebarWidth\(dragStartWidthRef\.current \+ delta, viewportWidth\)/)
  assert.doesNotMatch(source, /activeTab === 'mindmap'/)
  assert.doesNotMatch(source, /setSidebarWidth/)
}

{
  const source = read('src/components/Canvas/DocumentCanvas.jsx')
  assert.match(source, /leftPageNavOffset = \(isMobile \? 0 : LEFT_RAIL_WIDTH\) \+ PAGE_NAV_GUTTER/)
  assert.match(source, /rightPageNavOffset = PAGE_NAV_GUTTER/)
  assert.doesNotMatch(source, /currentEl\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/)
  assert.match(source, /const shouldStayInScroll = viewMode === 'scroll'/)
  assert.match(source, /if \(shouldStayInScroll\)/)
}

{
  const source = read('src/components/Canvas/LearningQuestionPopup.jsx')
  const chooseHandler = source.match(/async function choose\(answer\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(source, /const \[activeQuestionKey, setActiveQuestionKey\]/)
  assert.match(source, /function continueAfterFeedback/)
  assert.match(source, /\{chosen && \(/)
  assert.doesNotMatch(chooseHandler, /onMoveAfterResolved/)
}

{
  const source = read('src/lib/studyIds.js')
  assert.match(source, /pagePart = pageIndex == null \? 'all' : `p\$\{pageIndex\}`/)
  assert.match(source, /`\$\{unitId \|\| 'unit'\}_\$\{pagePart\}_\$\{stableHash\(question\)\}`/)
}

{
  const source = read('src/components/Canvas/PageThumbnailPanel.jsx')
  assert.match(source, /rightInset = 0/)
  assert.match(source, /right: rightInset/)
}

{
  const source = read('src/components/Sidebar/ChatPanel.jsx')
  assert.match(source, /p\.\$\{pages\[0\]\}/)
  assert.match(source, /외 \$\{pages\.length - 1\}개/)
  assert.match(source, /선택 텍스트/)
  assert.doesNotMatch(source, /주륵주륵/)
  assert.doesNotMatch(source, /어쩌구저쩌구/)
}

{
  const source = read('src/components/Sidebar/QuizPanel.jsx')
  assert.match(source, /useLearningQuestionAnswers/)
  assert.match(source, /popup_ox/)
  assert.match(source, /팝업O\/X퀴즈/)
  assert.match(source, /popupQuizEntries/)
  assert.match(source, /아직 저장된 팝업 O\/X 퀴즈가 없습니다\./)
}

{
  const canvasSource = read('src/components/MindMap/MindMapCanvas.jsx')
  const nodeSource = read('src/components/MindMap/MindMapNode.jsx')
  const aiSource = read('src/components/AI/useAI.js')
  assert.match(canvasSource, /rankdir:\s*'LR'/)
  assert.match(canvasSource, /compareMindMapNodes/)
  assert.match(nodeSource, /Position\.Left/)
  assert.match(nodeSource, /Position\.Right/)
  assert.match(aiSource, /root:true/)
  assert.match(aiSource, /level 1/)
  assert.match(aiSource, /낮은 level에서 높은 level로/)
}

console.log('UI/UX regression checks passed')
