# 코스터디 (Co-Study)

PDF 문서를 읽으며 하이라이트·메모를 남기고, AI와 함께 공부할 수 있는 학습 도우미 웹앱

---

## 주요 기능

- **PDF 뷰어** — 페이지 모드 / 스크롤 모드, 줌 조절
- **하이라이트** — 텍스트 드래그 후 중요·이해필요·암기 3가지 색상으로 표시
- **메모** — 하이라이트에 노트를 붙이고, 메모 탭에서 한눈에 모아보기
- **AI 채팅** — 하이라이트한 내용을 바탕으로 설명 요청·퀴즈 생성

---

## 유저 플로우

```
1. 라이브러리      PDF 업로드 → 문서 카드 클릭
        ↓
2. 뷰어            PDF 읽기 (페이지 / 스크롤 / 줌)
        ↓
3. 하이라이트      텍스트 드래그 → 색상 선택 → 메모 입력(선택) → 저장
        ↓
4. AI 대화         하이라이트 클릭 → "Chat으로 보내기"
                   → 설명 요청 or 퀴즈 생성 or 직접 질문
        ↓
5. 메모 탭         모든 하이라이트 모아보기 → 페이지 이동 / Chat 연결
```

---

## 폴더 구조

```
src/
├── components/
│   ├── Canvas/       # PDF 렌더링, 하이라이트 레이어, 선택 툴바, 팝업
│   ├── Sidebar/      # 사이드패널, Chat 탭, 메모 탭
│   ├── AI/           # Gemini API 연동 (useAI)
│   └── Toolbar/      # 상단 툴바
├── hooks/            # useAnnotation, useChat, useDocumentList, useDocumentUpload
├── lib/              # Firebase 초기화, 텍스트 선택 유틸
├── pages/            # LibraryPage, ViewerPage
└── store/            # Zustand 전역 상태 (document, annotation, chat)
docs/                 # 기획·구현 문서
```

---

## 스택

| | |
|---|---|
| 프론트엔드 | React 19 + Vite |
| 상태 관리 | Zustand |
| 데이터베이스 | Firebase Firestore + Storage |
| AI | Google Gemini 2.0 Flash |
| 배포 | Vercel |

---

## 로컬 실행

```bash
npm install
npm run dev
```

`.env` 파일에 아래 키가 필요해요:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_GEMINI_API_KEY=
```

---

## 문서

- [기능 명세](docs/feature_spec_costudy.md)
- [개발 방향](dev.md)
- [구현 현황 (2025.04.06)](docs/intuction0406.md)
# co-study-dev
