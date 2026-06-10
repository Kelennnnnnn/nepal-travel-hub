-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)

-- 1. Profiles table (extends auth.users)
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  name        text not null,
  email       text not null,
  role        text not null default 'user' check (role in ('user', 'agency', 'admin')),
  agency_name text,
  created_at  timestamptz default now()
);

-- 2. Enable Row Level Security
alter table public.profiles enable row level security;

-- 3. RLS Policies
-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Profiles are inserted by the app on signup (service role or anon with insert policy)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Admins can read all profiles (uses auth.jwt() to avoid recursive self-join)
create policy "Admins can read all profiles"
  on public.profiles for select
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 4. Trigger: auto-create profile on auth.users insert (bypasses RLS)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, agency_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    new.raw_user_meta_data->>'agency_name'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. Create your first admin user
-- After signing up via the Admin Portal, run this to promote the user to admin:
--
--   update public.profiles
--   set role = 'admin'
--   where email = 'admin@nepaltrails.com';
