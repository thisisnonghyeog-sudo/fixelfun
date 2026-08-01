# PixelFun 배포 · Supabase 연동 가이드

로그인과 랭킹 저장이 **Supabase**로 연결되어 있습니다.
아래 3단계만 하면 바로 동작합니다. 설정 전까지는 자동으로 **로컬(게스트) 모드**로 돌아가므로 사이트가 깨지지는 않습니다.

---

## 1단계 · Supabase 프로젝트 만들고 테이블 생성

1. https://supabase.com 에서 프로젝트를 생성합니다.
2. 대시보드 왼쪽 **SQL Editor** → **New query**
3. [`supabase/schema.sql`](supabase/schema.sql) 파일 내용을 통째로 붙여넣고 **Run**

만들어지는 테이블은 2개입니다.

| 테이블 | 저장 내용 | 접근 권한 (RLS) |
|---|---|---|
| `rankings` | 게임별 리더보드 기록 (게임, 이름, 점수, 시각) | 읽기: 전체 공개 / 쓰기: 등록만 가능, 수정·삭제 불가 |
| `user_data` | 로그인 사용자의 통계·배지·최고기록 (jsonb) | 본인 것만 읽기/쓰기 |

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

## 3단계 · 로그인 방식 설정

Supabase 대시보드 → **Authentication**

### 이메일 로그인
- **Providers → Email** 이 켜져 있으면 바로 사용 가능합니다.
- 기본적으로 **가입 확인 메일**이 필요합니다. 테스트 중에 번거로우면
  **Providers → Email → Confirm email** 을 꺼두면 가입 즉시 로그인됩니다.

### 구글 로그인
1. **Providers → Google** 을 켜고, Google Cloud Console에서 발급한
   Client ID / Client Secret 을 입력합니다.
2. Google Cloud Console의 **승인된 리디렉션 URI**에 Supabase가 알려주는
   `https://xxxx.supabase.co/auth/v1/callback` 을 등록합니다.
3. Supabase → **Authentication → URL Configuration** 에서
   - **Site URL**: 배포된 사이트 주소
   - **Redirect URLs**: 배포 주소 + 로컬 테스트 주소(`http://localhost:5500` 등)

구글 설정을 안 해도 이메일 로그인과 게스트 모드는 정상 동작합니다.

---

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
`file://` 로 열면 `lang/*.json` fetch와 OAuth 리다이렉트가 막힙니다. 반드시 로컬 서버로 여세요.

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
| 설정됨 + 로그인 | Supabase `rankings` (계정 연결) | localStorage + `user_data` 동기화 |

- 로그인하면 기존 로컬 기록과 서버 기록이 **병합**됩니다 (최고기록은 더 좋은 쪽, 배지는 합집합, 플레이 수는 큰 쪽).
- 네트워크 오류가 나면 콘솔에 경고만 남기고 로컬에 저장한 뒤 계속 진행합니다. 게임이 멈추지 않습니다.

## 관련 파일

| 파일 | 역할 |
|---|---|
| `js/supabase-config.js` | 클라이언트 초기화 (여기에 키 입력) |
| `js/auth.js` | 이메일/구글/게스트 로그인, 로그인 모달 |
| `js/ranking.js` | `rankings` 테이블 읽기/쓰기 + 리더보드 렌더링 |
| `js/cloud-sync.js` | `user_data` 통계·배지 병합 동기화 |
| `supabase/schema.sql` | 테이블 + RLS 정책 |
