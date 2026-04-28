# AGENT.md

이 저장소는 Co-Study 프론트엔드 프로토타입이다. 새 에이전트는 README.md보다 실제 코드와 `docs/`의 기획 문맥을 우선해서 읽는다.

## 제품 방향

- PDF를 읽으며 하이라이트, 메모, 채팅, 마인드맵으로 학습 흐름을 이어가는 도구.
- 핵심 철학은 "AI가 먼저 답을 주는 서비스"가 아니라 "사용자가 먼저 생각하고 AI가 보조하는 서비스"다.
- 기능 완성도와 실제 동작을 우선한다. 큰 리팩터링보다 현재 구조에 맞춘 작은 수정을 선호한다.

## 현재 스택

- React + Vite
- Firebase Auth, Firestore, Storage
- Zustand
- react-pdf / pdf.js
- Gemini API: 채팅, 빠른 설명, 임베딩, 마인드맵 생성
- React Flow + dagre: 마인드맵 렌더링

## 작업 원칙

- README.md는 오래된 내용이므로 구현 판단에 사용하지 않는다.
- 먼저 `src/App.jsx`, `src/pages/ViewerPage.jsx`, `src/components/Canvas/DocumentCanvas.jsx`, `src/components/Sidebar/ChatPanel.jsx`, `src/hooks/`, `src/store/`, `docs/`를 읽고 작업한다.
- 기존 파일 일부는 한글 인코딩이 깨져 있다. 새 문서와 새 문자열은 UTF-8 한국어로 작성한다.
- Firebase 데이터 경로와 Zustand 상태 구조를 바꾸는 작업은 영향 범위가 크므로 먼저 현재 호출 흐름을 확인한다.
- AI 키는 브라우저 환경 변수 `VITE_GEMINI_API_KEY`를 사용한다. 프로덕션 전환 시 서버 프록시/Edge Function이 필요하다.

## 주요 구현 문서

- 최신 구현 정리: `docs/codex_2026-04-25.md`
- 기존 기획 문맥: `docs/project_goal.md`, `docs/dev.md`, `docs/feature_spec_costudy.md`, `docs/UX_dev_v0.md`, `docs/mindmap_dev_plan.md`
