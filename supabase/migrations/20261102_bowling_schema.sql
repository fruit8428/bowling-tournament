-- ============================================================
-- 扶輪 3523 地區保齡球聯誼賽 即時計分看板 資料表
-- 全部以 bowling_ 為前綴，與同一 Supabase 專案內其他系統（3523D 報名系統）隔離
-- ============================================================

-- 1. 選手與成績（每球道 4 個席位，主鍵 = 球道 + 序號）
create table if not exists public.bowling_players (
  lane          int  not null check (lane between 1 and 60),
  player_order  int  not null check (player_order between 1 and 4),
  name          text not null default '',
  title         text not null default '',   -- 扶輪職稱 PP/PE/CP...
  nickname      text not null default '',   -- 社名 / 英文名
  gender        text not null default '男' check (gender in ('男','女')),
  club          text not null default '',   -- 所屬社，如 12-1龍門社
  identity      text not null default '社友' check (identity in ('社友','寶尊眷','子女')),
  g1            int  check (g1 between 0 and 300),
  g2            int  check (g2 between 0 and 300),
  g3            int  check (g3 between 0 and 300),
  turkeys       int  not null default 0 check (turkeys >= 0),
  flowers       int  not null default 0 check (flowers >= 0),
  updated_at    timestamptz not null default now(),
  primary key (lane, player_order)
);

-- 2. 公開的賽事設定（賽事名稱、女子每局加分、球道數）
create table if not exists public.bowling_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- 3. 密碼（不開放前端讀取，只有後端 API 用 secret key 查）
create table if not exists public.bowling_auth (
  role       text primary key check (role in ('admin','assistant')),
  pin        text not null,
  updated_at timestamptz not null default now()
);

-- 4. 全場廣播公告
create table if not exists public.bowling_announcements (
  id         bigint generated always as identity primary key,
  message    text not null,
  duration   int  not null default 8000,
  created_at timestamptz not null default now()
);

-- 5. 操作紀錄（除錯 / 稽核用）
create table if not exists public.bowling_logs (
  id           bigint generated always as identity primary key,
  lane         int,
  player_order int,
  action       text not null,
  details      text,
  actor_role   text,
  created_at   timestamptz not null default now()
);

-- updated_at 自動更新
create or replace function public.bowling_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_bowling_players_touch on public.bowling_players;
create trigger trg_bowling_players_touch before update on public.bowling_players
  for each row execute function public.bowling_touch_updated_at();

drop trigger if exists trg_bowling_settings_touch on public.bowling_settings;
create trigger trg_bowling_settings_touch before update on public.bowling_settings
  for each row execute function public.bowling_touch_updated_at();

-- ============================================================
-- Row Level Security：前端只能「讀」公開資料，所有寫入都走後端 API（secret key）
-- ============================================================
alter table public.bowling_players       enable row level security;
alter table public.bowling_settings      enable row level security;
alter table public.bowling_auth          enable row level security;
alter table public.bowling_announcements enable row level security;
alter table public.bowling_logs          enable row level security;

drop policy if exists "bowling_players_public_read" on public.bowling_players;
create policy "bowling_players_public_read" on public.bowling_players
  for select to anon, authenticated using (true);

drop policy if exists "bowling_settings_public_read" on public.bowling_settings;
create policy "bowling_settings_public_read" on public.bowling_settings
  for select to anon, authenticated using (true);

drop policy if exists "bowling_announcements_public_read" on public.bowling_announcements;
create policy "bowling_announcements_public_read" on public.bowling_announcements
  for select to anon, authenticated using (true);
-- bowling_auth 與 bowling_logs 不建立任何 policy → 前端完全無法讀寫

-- ============================================================
-- Realtime：讓前端訂閱選手成績、設定、公告的即時變更
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='bowling_players') then
    alter publication supabase_realtime add table public.bowling_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='bowling_settings') then
    alter publication supabase_realtime add table public.bowling_settings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='bowling_announcements') then
    alter publication supabase_realtime add table public.bowling_announcements;
  end if;
end $$;

-- 讓 UPDATE 事件也帶出舊值（前端合併用）
alter table public.bowling_players replica identity full;

-- ============================================================
-- 預設資料
-- ============================================================
insert into public.bowling_settings (key, value) values
  ('event_name', '國際扶輪3523地區 2026-27年度地區保齡球聯誼賽'),
  ('female_bonus_per_game', '12'),
  ('total_lanes', '40'),
  ('ocr_enabled', '1')   -- 拍照辨識登錄：預設開啟（照片自動備份到 Storage bucket bowling-photos），管理後台可關閉
on conflict (key) do nothing;

insert into public.bowling_auth (role, pin) values
  ('admin', '2222'),
  ('assistant', '3523')
on conflict (role) do nothing;

-- 預先建立 40 球道 × 4 席位的空白名冊
insert into public.bowling_players (lane, player_order)
select l, p from generate_series(1, 40) l, generate_series(1, 4) p
on conflict do nothing;
