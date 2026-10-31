-- Fornace Pizza 관리자 스키마. Supabase SQL Editor에서 한 번 실행한다.

-- ───────────────────────── 관리자 ─────────────────────────
-- 쓰기 정책이 없으므로 앱에서는 추가할 수 없다 (supabase/add_admin.sql 참고)
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────────────────────── 문의 ─────────────────────────
create table public.inquiries (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  type text not null check (type in ('group', 'catering', 'rental', 'etc')),
  preferred_date date,
  people integer,
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  memo text not null default ''
);

create index inquiries_created_at_idx on public.inquiries (created_at desc);
create index inquiries_status_idx on public.inquiries (status);

create trigger inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

-- ───────────────────────── 메뉴 ─────────────────────────
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  emoji text not null default '🍕',
  tag text,
  sort_order integer not null default 0,
  is_visible boolean not null default true
);

create index menu_items_order_idx on public.menu_items (sort_order);

create trigger menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

-- ───────────────────────── 매장 정보 (한 행만 존재) ─────────────────────────
create table public.site_settings (
  id integer primary key default 1 check (id = 1),
  updated_at timestamptz not null default now(),
  address text not null,
  hours text not null,
  phone text not null
);

create trigger site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ───────────────────────── 권한 ─────────────────────────
-- 문의 저장은 서버 라우트가 service role로 하므로 공개 INSERT 정책을 두지 않는다
alter table public.admin_users enable row level security;
alter table public.inquiries enable row level security;
alter table public.menu_items enable row level security;
alter table public.site_settings enable row level security;

revoke all on public.admin_users, public.inquiries from anon;
grant select on public.admin_users to authenticated;
grant select, update, delete on public.inquiries to authenticated;
grant select on public.menu_items, public.site_settings to anon;
grant select, insert, update, delete on public.menu_items to authenticated;
grant select, update on public.site_settings to authenticated;

create policy "본인 관리자 행 조회" on public.admin_users
  for select to authenticated using (user_id = auth.uid());

create policy "관리자 문의 조회" on public.inquiries
  for select to authenticated using (public.is_admin());
create policy "관리자 문의 수정" on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "관리자 문의 삭제" on public.inquiries
  for delete to authenticated using (public.is_admin());

create policy "공개 메뉴 조회" on public.menu_items
  for select to anon, authenticated using (is_visible or public.is_admin());
create policy "관리자 메뉴 추가" on public.menu_items
  for insert to authenticated with check (public.is_admin());
create policy "관리자 메뉴 수정" on public.menu_items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "관리자 메뉴 삭제" on public.menu_items
  for delete to authenticated using (public.is_admin());

create policy "공개 매장 정보 조회" on public.site_settings
  for select to anon, authenticated using (true);
create policy "관리자 매장 정보 수정" on public.site_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────── 초기 데이터 ─────────────────────────
insert into public.menu_items (name, description, price, emoji, tag, sort_order) values
  ('마르게리타 D.O.P', '산 마르차노 토마토, 물소 모짜렐라, 바질', 17000, '🍅', 'BEST', 10),
  ('디아볼라', '매콤한 살라미, 칼라브리아 고추, 꿀 한 방울', 21000, '🌶️', 'HOT', 20),
  ('콰트로 포르마지', '고르곤졸라 · 폰티나 · 파르미지아노 · 모짜렐라', 23000, '🧀', null, 30),
  ('타르투포', '트러플 크림, 양송이, 루꼴라', 26000, '🍄', 'NEW', 40);

insert into public.site_settings (address, hours, phone) values
  ('서울시 마포구 화덕로 485, 1층', '11:30 – 22:00 (브레이크 15:00 – 17:00)', '02-485-0090');
