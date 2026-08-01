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


-- ---------------------------------------------------------------------
-- 3) profiles : 닉네임 ↔ 계정 매핑 (닉네임 중복 방지)
--    로그인은 닉네임 + 비밀번호로 하고, Supabase Auth 내부적으로는
--    닉네임을 해시한 내부 전용 주소(u<hash>@pixelfun.local)를 씁니다.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text        not null,
  created_at timestamptz not null default now(),

  constraint profiles_nickname_len check (char_length(nickname) between 2 and 12)
);

-- 대소문자를 구분하지 않는 유일성 보장.
-- 중복확인 버튼을 통과한 뒤 다른 사람이 먼저 가입해버리는 경쟁 상태도 여기서 막힙니다.
create unique index if not exists profiles_nickname_unique_idx
  on public.profiles (lower(nickname));

alter table public.profiles enable row level security;

-- 닉네임은 리더보드에 어차피 노출되므로 조회는 공개합니다.
drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone"
  on public.profiles for select
  using (true);

-- 행 생성은 아래 트리거(security definer)만 담당합니다.
-- INSERT/UPDATE/DELETE 정책이 없으므로 클라이언트는 닉네임을 조작할 수 없습니다.

-- 회원가입 시 profiles 행 자동 생성.
-- 닉네임이 중복이면 unique 인덱스 위반 → auth.users INSERT까지 롤백되어
-- 가입 자체가 실패합니다 (중복 계정이 만들어지지 않음).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
             'user_' || left(new.id::text, 6))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 닉네임 중복 확인용 RPC.
-- security definer 라서 profiles 전체를 노출하지 않고 true/false만 돌려줍니다.
create or replace function public.nickname_exists(p_nick text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where lower(nickname) = lower(trim(p_nick))
  );
$$;

revoke all on function public.nickname_exists(text) from public;
grant execute on function public.nickname_exists(text) to anon, authenticated;
