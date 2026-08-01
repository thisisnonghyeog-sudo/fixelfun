-- =====================================================================
-- PixelFun · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) rankings : 게임별 리더보드 (전체 공개 읽기)
-- ---------------------------------------------------------------------
create table if not exists public.rankings (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  game       text        not null,
  name       text        not null,
  score      double precision not null,
  created_at timestamptz not null default now(),

  -- 알려진 게임 식별자만 허용
  constraint rankings_game_valid check (
    game in ('number','memory','typing','math','quiz',
             'color','tictactoe','chess','sequence','random')
  ),
  -- 표시 이름 길이 제한
  constraint rankings_name_len check (char_length(name) between 1 and 20),
  -- 말도 안 되는 점수 차단
  constraint rankings_score_range check (score >= 0 and score <= 1000000)
);

-- 리더보드 조회(게임별 + 점수 정렬)를 위한 인덱스
create index if not exists rankings_game_score_idx
  on public.rankings (game, score);
create index if not exists rankings_created_at_idx
  on public.rankings (created_at desc);

alter table public.rankings enable row level security;

-- 리더보드는 누구나 볼 수 있습니다.
drop policy if exists "rankings are viewable by everyone" on public.rankings;
create policy "rankings are viewable by everyone"
  on public.rankings for select
  using (true);

-- 등록은 누구나 가능하되(게스트 포함), 남의 user_id를 사칭할 수 없습니다.
drop policy if exists "anyone can submit a score" on public.rankings;
create policy "anyone can submit a score"
  on public.rankings for insert
  with check (user_id is null or user_id = auth.uid());

-- UPDATE / DELETE 정책은 만들지 않습니다 → 기록 위변조·삭제 불가.


-- ---------------------------------------------------------------------
-- 2) user_data : 로그인 사용자의 통계/배지/최고기록 (본인만 접근)
--    통계 구조가 바뀌어도 마이그레이션이 필요 없도록 jsonb 한 칸에 담습니다.
-- ---------------------------------------------------------------------
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "users read own data" on public.user_data;
create policy "users read own data"
  on public.user_data for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own data" on public.user_data;
create policy "users insert own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own data" on public.user_data;
create policy "users update own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own data" on public.user_data;
create policy "users delete own data"
  on public.user_data for delete
  using (auth.uid() = user_id);
