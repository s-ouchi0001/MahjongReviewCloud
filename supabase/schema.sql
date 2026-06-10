create extension if not exists "pgcrypto";

create table if not exists public.review_rounds (
  id text primary key,
  captured_at timestamptz not null,
  event text not null,
  round_before text not null,
  round_after text,
  honba integer not null default 0,
  kyotaku integer not null default 0,
  result_text text not null,
  image_path text,
  guide_rect jsonb,
  raw_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.review_detections (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.review_rounds(id) on delete cascade,
  detection_index integer not null,
  roi_id text not null,
  roi_name text not null,
  label text not null,
  confidence real not null,
  rect jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'correct', 'corrected')),
  corrected_label text,
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  raw_detection jsonb not null,
  created_at timestamptz not null default now(),
  unique (round_id, detection_index)
);

create or replace view public.review_round_stats
with (security_invoker = true) as
select
  r.id,
  r.captured_at,
  r.round_before,
  r.result_text,
  r.image_path,
  count(d.id)::integer as total_count,
  count(d.id) filter (where d.status = 'pending')::integer as pending_count,
  count(d.id) filter (where d.status = 'correct')::integer as correct_count,
  count(d.id) filter (where d.status = 'corrected')::integer as corrected_count
from public.review_rounds r
left join public.review_detections d on d.round_id = r.id
group by r.id;

insert into storage.buckets (id, name, public)
values ('training-images', 'training-images', false)
on conflict (id) do nothing;

alter table public.review_rounds enable row level security;
alter table public.review_detections enable row level security;

drop policy if exists "reviewers can read rounds" on public.review_rounds;
create policy "reviewers can read rounds"
on public.review_rounds
for select
to authenticated
using (true);

drop policy if exists "reviewers can read detections" on public.review_detections;
create policy "reviewers can read detections"
on public.review_detections
for select
to authenticated
using (true);

drop policy if exists "reviewers can update detections" on public.review_detections;
create policy "reviewers can update detections"
on public.review_detections
for update
to authenticated
using (true)
with check (
  status in ('pending', 'correct', 'corrected')
);

drop policy if exists "reviewers can read training images" on storage.objects;
create policy "reviewers can read training images"
on storage.objects
for select
to authenticated
using (bucket_id = 'training-images');

grant select on public.review_rounds to authenticated;
grant select on public.review_round_stats to authenticated;
grant select, update on public.review_detections to authenticated;
