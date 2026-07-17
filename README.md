<!-- problem-first-summary:start -->
**Huge Problem(Pain Point):** PDF 학습 도구가 읽기·질문·메모·복습을 분리하면 학습 맥락이 끊기고 AI 답변을 수동적으로 소비하게 된다.

**솔루션 한 줄 정의:** PDF 근거 기반 AI 대화와 선택·메모·퀴즈·마인드맵을 한 학습 흐름으로 연결한다.

**현재 상태:** 대표 제품 프로젝트

**문제 해결 중심의 사고 흐름**

1. **관찰** — 문서를 읽는 화면과 AI에 묻는 화면이 분리되면 선택한 근거와 학습 흔적을 다시 옮겨야 했다.
2. **선택** — 현재 페이지와 선택 영역을 공통 맥락으로 사용하고 생성 결과를 메모·퀴즈·마인드맵으로 재사용하게 했다.
3. **구현** — React PDF 뷰어, Firebase 사용자 데이터, Gemini RAG와 학습 단위별 이해 확인 흐름을 통합했다.
4. **검증과 한계** — AI·RAG·청킹·퀴즈·마인드맵·UI 회귀 스크립트와 Playwright 검증 문서를 저장소에 포함했다. 실제 학습 효과 평가는 별도 연구 과제다.
<!-- problem-first-summary:end -->

---
# 코스터디 (Co-Study)

PDF 문서를 업로드해 읽고, 하이라이트·메모·퀴즈·마인드맵·AI 채팅을 한 화면에서 이어 가는 개인 학습 도우미 웹앱

---

## 주요 기능

- **로그인 / 튜토리얼** — Firebase Auth 기반 Google 로그인, 개발용 E2E 로그인, 기능 소개 영상 튜토리얼
- **문서 라이브러리** — PDF 업로드, 검색, 정렬, 폴더 지정/해제, 문서 삭제, 사용자별 문서 목록 관리
- **PDF 뷰어** — 페이지 모드 / 스크롤 모드, 줌 조절, 썸네일 페이지 이동, 키보드 이동, 모바일 자동 맞춤
- **선택 도구** — 텍스트 선택, 영역 이미지 선택, 이동/팬 모드, 전체 페이지 선택, 다중 선택 묶음
- **하이라이트 / 메모** — 색상별 하이라이트 저장, 메모 작성·수정·삭제, 실행 취소, 메모 탭에서 모아보기
- **AI 즉시 도움** — 선택 내용 설명, 선택 내용 기반 Chat 전송, AI 답변을 메모로 저장
- **RAG 채팅** — PDF 청크 인덱싱, Gemini 임베딩 검색, 선택 맥락·현재 페이지·근거 페이지를 반영한 스트리밍 채팅
- **추천 질문 게이트** — 학습 단위별 목표와 O/X 질문 생성, 페이지 이동 전 이해 확인, Skip/비활성화 지원
- **퀴즈** — 현재 페이지 / 전체 문서 / 저장 메모 / 선택 텍스트 범위로 퀴즈 생성, 저장된 세션과 오답·정답 복습
- **마인드맵** — 전체 문서 또는 현재 페이지 기준 3-pass AI 마인드맵 생성, 근거 연결, 저장본 다시 열기
- **상호작용 로그** — 업로드, 문서 열기, 채팅, 퀴즈, 마인드맵 등 사용자 이벤트 기록과 비밀번호 보호 대시보드

---

## 유저 플로우

```
1. 로그인          Google 로그인 또는 개발용 테스트 로그인
        ↓
2. 라이브러리      PDF 업로드 → 검색/정렬/폴더 관리 → 문서 카드 클릭
        ↓
3. 뷰어            PDF 읽기 (페이지 / 스크롤 / 줌 / 썸네일 / 모바일 맞춤)
        ↓
4. 선택            텍스트 드래그 또는 영역 선택 → 메모 / Chat / AI 설명 / Quiz 선택
        ↓
5. 학습 보조       학습 목표 확인 → 추천 질문 답변 → 필요 시 페이지 이동 게이트 해제
        ↓
6. AI 대화         선택 맥락 + 문서 검색 근거 + 현재 페이지 기반으로 질문
        ↓
7. 복습            메모 탭 / 퀴즈 탭 / 마인드맵 탭에서 저장된 학습 흔적 재사용
```

---

## 폴더 구조

```
src/
├── components/
│   ├── AI/             # Gemini 호출 훅, 스트리밍 Chat, 퀴즈/마인드맵/학습목표 생성
│   ├── Brand/          # Co-Study 로고와 브랜드 마크
│   ├── Canvas/         # PDF 렌더링, 하이라이트 레이어, 선택 툴바, AI 팝업, 학습 질문 팝업
│   ├── MindMap/        # React Flow 기반 마인드맵 캔버스, 노드, 엣지
│   ├── Sidebar/        # Chat / Memo / MindMap / Quiz 탭 패널
│   ├── Toolbar/        # 상단 문서 툴바, 페이지/줌/보기 모드/질문 게이트 토글
│   └── InteractionLogDashboard.* # 사용자 이벤트 로그 대시보드
├── hooks/
│   ├── useAuth.js                  # Firebase Auth, Google 로그인, E2E 로그인
│   ├── useDocumentList.js          # 사용자별 문서 목록, 삭제, 폴더 관리
│   ├── useDocumentUpload.js        # PDF Storage 업로드와 Firestore 메타데이터 저장
│   ├── useAnnotation.js            # 하이라이트/메모 CRUD와 undo
│   ├── useChat.js                  # 문서별 채팅 메시지 저장
│   ├── useDocumentIndex.js         # PDF 텍스트 추출, 청킹, 임베딩 인덱스
│   ├── useLearningUnits.js         # 학습 단위/목표/추천 질문 생성 및 저장
│   ├── useLearningQuestionAnswers.js # 추천 질문 답변 상태 저장
│   ├── useMindMap.js               # 마인드맵 생성/저장/불러오기/삭제
│   └── useQuizSessions.js          # 퀴즈 세션 저장과 복습
├── lib/
│   ├── ai/                         # RAG 프롬프트, 근거 검증, 응답 citation 처리
│   ├── firebase.js                 # Firebase Auth / Firestore / Storage 초기화와 emulator 연결
│   ├── chunking.js, embeddings.js  # PDF 청크 생성과 벡터 검색
│   ├── learningUnits.js            # 페이지 청크를 학습 단위로 묶는 로직
│   ├── quizDiversity.js            # 중복 퀴즈 회피와 복습 소스 선택
│   ├── mindmapValidation.js        # 마인드맵 그래프 검증/품질 평가
│   └── interactionLogs.js          # 사용자 이벤트 로깅
├── pages/
│   ├── LoginPage.jsx     # 로그인과 기능 소개 영상
│   ├── LibraryPage.jsx   # 문서 라이브러리
│   └── ViewerPage.jsx    # PDF 학습 화면
├── store/                # Zustand 전역 상태 (auth, document, annotation, chat, undo)
├── App.jsx               # 인증 분기와 라우팅
└── main.jsx

scripts/                  # AI/RAG/퀴즈/마인드맵/학습 게이트/UI 회귀 테스트
docs/                     # 기획, 변경 보고서, UX/기술 검증 문서
public/                   # favicon, OG 이미지, 로컬 기능 소개 영상 fallback
```

---

## 스택

| | |
|---|---|
| 프론트엔드 | React 19 + Vite 6 |
| 라우팅 | React Router 7 |
| PDF | react-pdf |
| 상태 관리 | Zustand |
| 데이터베이스 | Firebase Auth + Firestore + Storage |
| AI | Google Gemini 2.5 Flash / 2.5 Flash Lite / Gemini Embedding |
| 마인드맵 | @xyflow/react + dagre |
| Markdown/수식 | react-markdown + remark-math + rehype-katex + KaTeX |
| 검증 | Node 기반 스크립트 테스트 + Playwright |
| 배포 | Vercel / Firebase Hosting 설정 포함 |

---

## 데이터 흐름

```
PDF 업로드
  ├─ Storage: pdfs/{docId}.pdf
  └─ Firestore: users/{uid}/documents/{docId}
       { docId, name, storagePath, downloadURL, uploadedAt, pageCount, folder }

뷰어 진입
  ├─ Storage Blob 로드 → react-pdf 렌더링
  ├─ PDF 텍스트 추출 → chunking → Gemini embedding → 문서 인덱스
  ├─ annotations / chats / quizSessions / mindMaps / learningUnits 저장
  └─ interactionLogs에 주요 사용자 행동 기록

AI 응답
  ├─ 선택 텍스트/영역 이미지/하이라이트 맥락 수집
  ├─ 현재 페이지와 semantic top-k 청크로 근거 패키지 구성
  ├─ Gemini 스트리밍 응답 생성
  └─ 허용된 페이지 citation 검증 후 Chat에 저장
```

---

## 로컬 실행

```bash
npm install
npm run dev
```

`.env` 파일에 기본 키가 필요해요:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_GEMINI_API_KEY=
```

개발/검증용 선택 환경변수:

```env
VITE_FIREBASE_EMULATOR=true
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
VITE_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_FIRESTORE_EMULATOR_PORT=8080
VITE_FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_STORAGE_EMULATOR_PORT=9199

VITE_E2E_AUTH=true
VITE_E2E_AUTH_EMAIL=
VITE_E2E_AUTH_PASSWORD=

VITE_INTERACTION_LOGS_ENABLED=true
VITE_LOG_DASHBOARD_PASSWORD=
VITE_INTRODUCE_VIDEO_SOURCE=storage
```

---

## 스크립트

```bash
npm run dev                 # Vite 개발 서버
npm run build               # 프로덕션 빌드
npm run preview             # 빌드 결과 미리보기

npm run test:ai             # AI 파이프라인 계약 테스트
npm run test:rag            # RAG golden set baseline
npm run test:chunking       # PDF 청킹 로직
npm run test:quiz           # 퀴즈 다양성/중복 회피
npm run test:learning-gate  # 추천 질문 게이트
npm run test:mindmap        # 마인드맵 검증
npm run test:ui-ux          # UI/UX 회귀 검사
```

---

## 문서

- [프로젝트 목표](docs/project_goal.md)
- [기능 명세](docs/feature_spec_costudy.md)
- [사용자 기능 명세](docs/feature_spec_user_2026-04-25.md)
- [개발 방향](docs/dev.md)
- [마인드맵 개발 계획](docs/mindmap_dev_plan.md)
- [Phase 0/1 변경 보고서](docs/phase0_phase1_change_report_2026-05-26.md)
- [평가 베이스라인](docs/evaluation_baseline_2026-05-26.md)
- [UI 기술 검증](docs/ui_technical_verification_2026-05-12.md)
- [Playwright 인증 설정](docs/playwright_auth_setup.md)
- [기능 소개 영상 튜토리얼](docs/introduce_video_tutorial_2026-06-04.md)
