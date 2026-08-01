# PixelFun 배포 · Supabase 연동 가이드

로그인과 랭킹 저장이 **Supabase**로 연결되어 있습니다.
아래 3단계만 하면 바로 동작합니다. 설정 전까지는 자동으로 **로컬(게스트) 모드**로 돌아가므로 사이트가 깨지지는 않습니다.

---

## 1단계 · Supabase 프로젝트 만들고 테이블 생성

1. https://supabase.com 에서 프로젝트를 생성합니다.
2. 대시보드 왼쪽 **SQL Editor** → **New query**
3. [`supabase/schema.sql`](supabase/schema.sql) 파일 내용을 통째로 붙여넣고 **Run**

만들어지는 테이블은 3개입니다.

| 테이블 | 저장 내용 | 접근 권한 (RLS) |
|---|---|---|
| `rankings` | 게임별 리더보드 기록 (게임, 이름, 점수, 시각) | 읽기: 전체 공개 / 쓰기: 등록만 가능, 수정·삭제 불가 |
| `user_data` | 로그인 사용자의 통계·배지·최고기록 (jsonb) | 본인 것만 읽기/쓰기 |
| `profiles` | 닉네임 ↔ 계정 매핑 (중복 방지) | 읽기: 전체 공개 / 쓰기: 가입 트리거만 |

같이 만들어지는 것:
- `handle_new_user()` 트리거 — 가입 시 `profiles` 행 자동 생성
- `nickname_exists(text)` 함수 — 중복확인 버튼이 호출하는 RPC

> 게스트도 랭킹 등록은 가능하지만(`user_id`가 비어 있는 행), 남의 계정 id를 사칭한 행은 DB가 거부합니다.

---

## 2단계 · 키 넣기

Supabase 대시보드 → **Project Settings → API** 에서 두 값을 복사합니다.

- **Project URL**
- **anon / public** key

[`js/supabase-config.js`](js/supabase-config.js) 상단을 교체하세요.

```js
var SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

### ⚠️ 키에 대해

- `anon` key는 **브라우저에 공개되는 것이 정상**입니다. 깃허브에 올라가도 괜찮습니다. 실제 보안은 1단계의 RLS 정책이 담당합니다.
- **`service_role` key는 절대 넣지 마세요.** RLS를 전부 우회합니다.
- **데이터베이스 비밀번호**(`supabase비밀번호` 파일에 적어두신 값)도 여기 들어가는 값이 아닙니다. Postgres에 직접 붙을 때만 쓰이며, 웹사이트 코드에는 필요 없습니다. 그 파일은 `.gitignore`에 등록되어 있어 깃에 올라가지 않습니다.

---

## 3단계 · 로그인 방식 설정 (⚠️ 필수)

Supabase 대시보드 → **Authentication → Providers → Email**

1. **Email** provider를 **켭니다**.
2. **"Confirm email" 을 반드시 끕니다.** ← 이걸 안 끄면 회원가입이 실패합니다.

### 왜 꺼야 하나요?

이 사이트는 **닉네임 + 비밀번호**로만 로그인합니다. 그런데 Supabase Auth는 내부적으로
이메일이나 전화번호가 반드시 있어야 합니다. 그래서 닉네임을 SHA-256으로 해시해
`u<해시40자>@pixelfun.local` 이라는 **내부 전용 주소**를 만들어 계정에 붙입니다.

- 같은 닉네임 → 항상 같은 주소 → 로그인할 때 다시 계산해서 찾아갑니다
- 사용자에게는 전혀 노출되지 않고, 실제로 메일이 오가지도 않습니다
- 받을 수 없는 주소이므로 **확인 메일 기능을 켜두면 가입이 완료되지 않습니다**

> 해시는 브라우저의 `crypto.subtle` API를 쓰기 때문에 **HTTPS 또는 localhost**에서만 동작합니다.
> 그 외 환경에서는 로그인 버튼이 잠기고 안내 문구가 뜹니다. 배포된 사이트는 HTTPS이므로 문제없습니다.

### 닉네임 규칙과 중복 확인

- 한글 / 영문 / 숫자 / 밑줄, **2~12자**
- 대소문자를 구분하지 않습니다 (`Player`와 `player`는 같은 닉네임)
- 회원가입 탭에서 입력을 멈추면 자동으로 중복 검사하고, **중복확인** 버튼으로 직접 확인할 수도 있습니다
- 확인을 통과한 뒤 다른 사람이 먼저 가입해버리는 경쟁 상태는
  `profiles` 테이블의 `lower(nickname)` unique 인덱스가 막습니다.
  이 경우 가입 트랜잭션 전체가 롤백되어 중복 계정이 생기지 않습니다.

> 비밀번호 찾기는 없습니다. 메일 주소를 받지 않으므로 재설정 메일을 보낼 수 없습니다.
> 나중에 필요해지면 이메일 입력을 선택 항목으로 추가하면 됩니다.

## 배포

이 사이트는 빌드가 필요 없는 정적 사이트입니다. 단, **저장소 루트가 아니라 `glh/` 폴더가 사이트 루트**입니다.

### Netlify / Vercel (권장)
저장소를 연결한 뒤 설정에서:
- **Base directory / Root directory**: `glh`
- Build command: 없음
- Publish directory: `glh` (Netlify는 base 지정 시 `.`)

### GitHub Pages
Settings → Pages → Source를 `main` 브랜치 `/ (root)`로 두면
사이트 주소가 `https<!-- -->://<계정>.github.io/fixelfun/glh/` 가 됩니다.
주소를 깔끔하게 하려면 `glh/` 안의 파일들을 저장소 루트로 옮기면 됩니다.

### 로컬 테스트
`file://` 로 열면 `lang/*.json` fetch와 `crypto.subtle`(로그인 해시)이 막힙니다. 반드시 로컬 서버로 여세요.

```bash
cd glh
python -m http.server 5500
# → http://localhost:5500
```

---

## 동작 방식 요약

| 상황 | 랭킹 | 통계 / 배지 |
|---|---|---|
| Supabase 미설정 | localStorage | localStorage |
| 설정됨 + 게스트 | Supabase `rankings` (익명 등록) | localStorage |
| 설정됨 + 닉네임 로그인 | Supabase `rankings` (계정 연결) | localStorage + `user_data` 동기화 |

- 로그인하면 기존 로컬 기록과 서버 기록이 **병합**됩니다 (최고기록은 더 좋은 쪽, 배지는 합집합, 플레이 수는 큰 쪽).
- 네트워크 오류가 나면 콘솔에 경고만 남기고 로컬에 저장한 뒤 계속 진행합니다. 게임이 멈추지 않습니다.

## 관련 파일

| 파일 | 역할 |
|---|---|
| `js/supabase-config.js` | 클라이언트 초기화 (여기에 키 입력) |
| `js/auth.js` | 닉네임+비밀번호 로그인/회원가입, 중복확인, 게스트 모드 |
| `js/ranking.js` | `rankings` 테이블 읽기/쓰기 + 리더보드 렌더링 |
| `js/cloud-sync.js` | `user_data` 통계·배지 병합 동기화 |
| `supabase/schema.sql` | 테이블 + RLS 정책 + 닉네임 트리거/RPC |
