# 🕹️ PixelFun - 에이전트 팀 프로젝트 지침서

## 프로젝트 개요
- **사이트명**: PixelFun
- **컨셉**: 레트로 픽셀 감성의 미니게임 모음 웹사이트
- **슬로건**: "두뇌를 깨우는 미니게임 모음"
- **기술 스택**: HTML / CSS / JavaScript (순수 바닐라), Firebase

---

## 🤖 에이전트 팀 구성 및 역할

### 👑 리드 에이전트 (팀장)
- 전체 작업 순서 조율
- 에이전트 간 파일 충돌 방지
- 디자인 통일성 최종 검토
- 완성된 결과물 통합

### 🎨 에이전트1 - UI/디자인
**담당 파일 (이 파일만 수정할 것)**
- `index.html`
- `style.css`
- `assets/` 폴더 전체

**작업 내용**
- 메인 페이지 레이아웃
- 게임 카드 7개 구성
- 헤더 / 푸터
- 반응형 디자인 (PC 4열 / 태블릿 2열 / 모바일 1열)
- 전체 공통 CSS 변수 정의

### 🎮 에이전트2 - 게임 A파트
**담당 파일 (이 파일만 수정할 것)**
- `games/number.html` - 숫자 맞추기
- `games/memory.html` - 카드 뒤집기
- `games/typing.html` - 타이핑 게임
- `games/wordchain.html` - 끝말잇기

**작업 내용**
- 각 게임 로직 구현
- 게임별 점수 계산
- 로컬스토리지에 최고기록 저장
- 게임 클리어/실패 화면

### 🎯 에이전트3 - 게임 B파트
**담당 파일 (이 파일만 수정할 것)**
- `games/math.html` - 암산 챌린지
- `games/quiz.html` - OX 퀴즈
- `games/color.html` - 색깔 맞추기

**작업 내용**
- 각 게임 로직 구현
- 60초 타이머 시스템
- 콤보/연속 정답 처리
- 결과 등급 표시 (S/A/B/C)

### 🔧 에이전트4 - 기능 시스템
**담당 파일 (이 파일만 수정할 것)**
- `js/ranking.js` - 랭킹/리더보드
- `js/stats.js` - 통계/플레이 기록
- `js/badge.js` - 업적/배지 시스템
- `js/sound.js` - 효과음/BGM

**작업 내용**
- Firebase Firestore 랭킹 연동
- 마이페이지 통계 차트
- 배지 획득 조건 및 알림 팝업
- 사운드 ON/OFF 설정 저장

### 🌍 에이전트5 - 로그인/다국어
**담당 파일 (이 파일만 수정할 것)**
- `js/auth.js` - Firebase 인증
- `js/i18n.js` - 다국어 처리
- `lang/ko.json` - 한국어
- `lang/en.json` - 영어

**작업 내용**
- 이메일 + 구글 소셜 로그인
- 게스트 모드 지원
- 언어 전환 (한국어 ↔ 영어)
- 로그인 상태에 따른 UI 변경

---

## 📁 프로젝트 폴더 구조

```
pixelfun/
├── CLAUDE.md              ← 이 파일
├── index.html             ← 메인 페이지 (에이전트1 담당)
├── style.css              ← 공통 스타일 (에이전트1 담당)
├── games/
│   ├── number.html        ← 숫자 맞추기 (에이전트2)
│   ├── memory.html        ← 카드 뒤집기 (에이전트2)
│   ├── typing.html        ← 타이핑 게임 (에이전트2)
│   ├── wordchain.html     ← 끝말잇기 (에이전트2)
│   ├── math.html          ← 암산 챌린지 (에이전트3)
│   ├── quiz.html          ← OX 퀴즈 (에이전트3)
│   └── color.html         ← 색깔 맞추기 (에이전트3)
├── js/
│   ├── ranking.js         ← 랭킹 (에이전트4)
│   ├── stats.js           ← 통계 (에이전트4)
│   ├── badge.js           ← 배지 (에이전트4)
│   ├── sound.js           ← 사운드 (에이전트4)
│   ├── auth.js            ← 로그인 (에이전트5)
│   └── i18n.js            ← 다국어 (에이전트5)
├── lang/
│   ├── ko.json            ← 한국어 (에이전트5)
│   └── en.json            ← 영어 (에이전트5)
└── assets/
    ├── sounds/            ← 효과음 파일 (에이전트4)
    └── icons/             ← 아이콘 (에이전트1)
```

---

## 🎨 디자인 시스템 (모든 에이전트 공통 적용)

### 색상 팔레트
```css
:root {
  --bg-main: #0a0a1a;        /* 메인 배경 */
  --bg-card: #1a1a2e;        /* 카드 배경 */
  --bg-hover: #16213e;       /* 호버 배경 */
  --neon-purple: #7b2ff7;    /* 네온 보라 (포인트1) */
  --neon-blue: #00d4ff;      /* 네온 하늘 (포인트2) */
  --neon-yellow: #ffd700;    /* 네온 노랑 (포인트3) */
  --neon-green: #00ff88;     /* 성공/정답 */
  --neon-red: #ff4757;       /* 실패/오답 */
  --text-primary: #ffffff;   /* 기본 텍스트 */
  --text-secondary: #a0a0b0; /* 보조 텍스트 */
}
```

### 폰트
```html
<!-- 모든 HTML 파일 <head>에 반드시 포함 -->
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">
```
- **타이틀/로고**: `Press Start 2P` (픽셀 폰트)
- **본문/UI**: `Noto Sans KR` (가독성)

### 공통 컴포넌트 규칙
- 카드 border-radius: `12px`
- 버튼 border-radius: `8px`
- 기본 transition: `all 0.3s ease`
- 카드 호버: `translateY(-8px)` + 네온 테두리
- 그림자: `0 0 20px rgba(123, 47, 247, 0.3)`

---

## 🎮 게임 공통 규칙 (에이전트2, 3 필독)

### 각 게임 HTML 파일 공통 구조
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="../style.css">
  <!-- 구글 폰트 -->
</head>
<body>
  <!-- 상단 네비: 홈으로 돌아가기 버튼 -->
  <nav class="game-nav">
    <a href="../index.html">← 홈으로</a>
    <span class="game-title">게임이름</span>
  </nav>

  <!-- 게임 영역 -->
  <main class="game-container">
    <!-- 게임 내용 -->
  </main>
</body>
</html>
```

### 점수/기록 저장 방식
```javascript
// 로컬스토리지 키 규칙 (통일할 것)
localStorage.setItem('pixelfun_number_best', score);
localStorage.setItem('pixelfun_memory_best', time);
localStorage.setItem('pixelfun_typing_best', wpm);
localStorage.setItem('pixelfun_wordchain_best', count);
localStorage.setItem('pixelfun_math_best', score);
localStorage.setItem('pixelfun_quiz_best', score);
localStorage.setItem('pixelfun_color_best', score);
```

### 게임 결과 이벤트 (배지 시스템 연동용)
```javascript
// 게임 완료 시 반드시 이 이벤트 발생시킬 것
window.dispatchEvent(new CustomEvent('gameComplete', {
  detail: {
    game: 'number',   // 게임 식별자
    score: 4,         // 점수
    isNewRecord: true // 최고기록 여부
  }
}));
```

---

## 🔊 사운드 사용 규칙 (에이전트2, 3 필독)

```javascript
// sound.js가 로드된 후 이렇게 호출
PixelSound.play('success');  // 정답
PixelSound.play('fail');     // 오답
PixelSound.play('clear');    // 게임 클리어
PixelSound.play('flip');     // 카드 뒤집기
PixelSound.play('start');    // 게임 시작
```

---

## 🌍 다국어 사용 규칙 (모든 에이전트)

```javascript
// i18n.js 로드 후 텍스트는 반드시 이렇게 처리
t('game.start')       // "게임 시작" / "Start Game"
t('game.result')      // "결과" / "Result"
t('game.retry')       // "다시하기" / "Retry"
t('nav.home')         // "홈으로" / "Home"
```

---

## ⚠️ 에이전트 공통 주의사항

1. **파일 소유권 엄수**: 자신이 담당하지 않은 파일은 절대 수정하지 말 것
2. **CSS 변수 사용**: 색상은 반드시 위의 CSS 변수 사용 (하드코딩 금지)
3. **폰트 통일**: 모든 HTML에 구글 폰트 링크 포함
4. **반응형 필수**: 모바일에서도 게임이 정상 작동해야 함
5. **한국어 우선**: 기본 언어는 한국어, 영어는 i18n으로 처리
6. **에러 처리**: Firebase 오류 시 게스트 모드로 폴백 처리
7. **작업 완료 보고**: 파일 작성 완료 시 리드 에이전트에게 완료 메시지 전송

---

## 🗓️ 권장 작업 순서

```
1단계: 에이전트1 → 메인 페이지 + CSS 변수 완성
         ↓ (디자인 확정 후)
2단계: 에이전트2, 3 → 게임 병렬 개발
       에이전트5 → 로그인/다국어 기초 설정
         ↓
3단계: 에이전트4 → 기능 시스템 개발
         ↓
4단계: 리드 에이전트 → 전체 통합 및 최종 검토
```

---

## 📋 완성 체크리스트

### 에이전트1 (UI)
- [ ] 메인 페이지 게임 카드 7개
- [ ] 헤더 네온 로고
- [ ] 반응형 레이아웃
- [ ] 카드 호버 애니메이션
- [ ] CSS 변수 정의 완료

### 에이전트2 (게임 A)
- [ ] 숫자 맞추기 완성
- [ ] 카드 뒤집기 완성
- [ ] 타이핑 게임 완성
- [ ] 끝말잇기 완성
- [ ] 로컬스토리지 기록 저장

### 에이전트3 (게임 B)
- [ ] 암산 챌린지 완성
- [ ] OX 퀴즈 완성
- [ ] 색깔 맞추기 완성
- [ ] 등급 시스템 (S/A/B/C)

### 에이전트4 (기능)
- [ ] 랭킹 페이지
- [ ] 마이페이지 통계
- [ ] 배지 7개 이상
- [ ] 사운드 ON/OFF

### 에이전트5 (시스템)
- [ ] 이메일 로그인
- [ ] 구글 로그인
- [ ] 게스트 모드
- [ ] 한국어/영어 전환
