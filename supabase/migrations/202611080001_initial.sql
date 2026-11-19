create schema if not exists private;
revoke all on schema private from public;
create extension if not exists pgcrypto with schema extensions;

create table public.users (
 user_id uuid primary key default gen_random_uuid(),
 auth_id uuid not null unique references auth.users(id) on delete restrict,
 user_code text not null unique check (length(user_code) between 1 and 32),
 first_name text not null check (length(trim(first_name)) > 0),
 last_name text not null check (length(trim(last_name)) > 0),
 role text not null check (role in ('admin','teacher','student')),
 email text not null unique, is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.subjects (
 subject_id uuid primary key default gen_random_uuid(), subject_code text not null unique,
 subject_name text not null, teacher_id uuid not null references public.users(user_id)
);
create index on public.subjects(teacher_id);
create table public.classrooms (
 room_id uuid primary key default gen_random_uuid(), room_name text not null unique,
 default_latitude decimal(10,8) not null check (default_latitude between -90 and 90),
 default_longitude decimal(11,8) not null check (default_longitude between -180 and 180)
);
create table public.enrollments (
 enrollment_id uuid primary key default gen_random_uuid(), student_id uuid not null references public.users(user_id),
 subject_id uuid not null references public.subjects(subject_id), semester text not null check (semester ~ '^[1-3]/[0-9]{4}$'),
 unique(student_id,subject_id,semester)
);
create index on public.enrollments(subject_id,semester);
create table public.attendance_sessions (
 session_id uuid primary key default gen_random_uuid(), subject_id uuid not null references public.subjects(subject_id),
 teacher_id uuid not null references public.users(user_id), room_id uuid references public.classrooms(room_id),
 semester text not null check (semester ~ '^[1-3]/[0-9]{4}$'), group_name text,
 latitude decimal(10,8) not null check (latitude between -90 and 90),
 longitude decimal(11,8) not null check (longitude between -180 and 180),
 radius_meters integer not null check (radius_meters between 20 and 500),
 max_accuracy_meters integer not null default 100 check (max_accuracy_meters between 1 and 1000),
 qr_token text not null unique, qr_expires_at timestamptz not null,
 attendance_code text not null check (attendance_code ~ '^[0-9]{6}$'),
 start_time timestamptz not null, end_time timestamptz not null,
 status text not null default 'active' check (status in ('active','closed')), check (end_time > start_time)
);
create unique index one_active_room on public.attendance_sessions(room_id) where status = 'active';
create unique index active_code on public.attendance_sessions(attendance_code) where status = 'active';
create index on public.attendance_sessions(subject_id,start_time desc);
create index on public.attendance_sessions(teacher_id,status);
create table public.devices (
 device_id text primary key check (device_id ~ '^[A-Za-z0-9_-]{1,64}$'), room_id uuid not null unique references public.classrooms(room_id),
 secret_encrypted text not null, firmware_version text, last_seen_at timestamptz, last_ip inet,
 rssi integer check (rssi between -127 and 0), is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.attendance_records (
 record_id uuid primary key default gen_random_uuid(), session_id uuid not null references public.attendance_sessions(session_id),
 student_id uuid not null references public.users(user_id),
 student_latitude decimal(10,8) check (student_latitude between -90 and 90),
 student_longitude decimal(11,8) check (student_longitude between -180 and 180),
 gps_accuracy decimal(8,2) check (gps_accuracy >= 0), distance_meters decimal(8,2) check (distance_meters >= 0),
 status text not null check (status in ('present','rejected')), reject_reason text,
 method text not null check (method in ('qr_gps','code_gps','rfid')), device_id text references public.devices(device_id),
 flagged boolean not null default false, ip inet, user_agent text, timestamp timestamptz not null default now(),
 check ((status = 'present' and reject_reason is null) or (status = 'rejected' and length(reject_reason) > 0)),
 check (method <> 'rfid' or (student_latitude is null and student_longitude is null and gps_accuracy is null and distance_meters is null and device_id is not null)),
 check (status <> 'present' or method = 'rfid' or (student_latitude is not null and student_longitude is not null and gps_accuracy is not null and distance_meters is not null))
);
create unique index one_present_per_session on public.attendance_records(session_id,student_id) where status = 'present';
create index on public.attendance_records(student_id,timestamp desc);
create index on public.attendance_records(session_id,timestamp desc);
create index on public.attendance_records(device_id);
create table public.user_cards (
 card_id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(user_id),
 card_uid_hash text not null unique check (card_uid_hash ~ '^[a-f0-9]{64}$'), is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create index on public.user_cards(user_id);
create table public.location_suggestions (
 suggestion_id uuid primary key default gen_random_uuid(), device_id text not null references public.devices(device_id),
 room_id uuid not null references public.classrooms(room_id), latitude decimal(10,8) not null check (latitude between -90 and 90),
 longitude decimal(11,8) not null check (longitude between -180 and 180), hdop numeric not null check (hdop >= 0 and hdop < 2),
 samples integer not null check (samples >= 60), status text not null default 'pending' check (status in ('pending','approved','rejected')),
 reviewed_by uuid references public.users(user_id), reviewed_at timestamptz, created_at timestamptz not null default now(),
 check ((status = 'pending' and reviewed_by is null and reviewed_at is null) or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);
create index on public.location_suggestions(device_id,created_at desc);
create table public.attendance_adjustments (
 adjustment_id uuid primary key default gen_random_uuid(), record_id uuid not null references public.attendance_records(record_id),
 changed_by uuid not null references public.users(user_id), old_status text not null check (old_status in ('present','rejected')),
 new_status text not null check (new_status in ('present','rejected')), reason text not null check (length(trim(reason)) >= 3),
 created_at timestamptz not null default now()
);
create index on public.attendance_adjustments(record_id);
create table private.device_nonces (
 device_id text not null references public.devices(device_id) on delete cascade,
 nonce text not null check (length(nonce) between 16 and 128), expires_at timestamptz not null,
 primary key(device_id,nonce)
);
create index on private.device_nonces(expires_at);
create table private.rate_limits (key text primary key, hits integer not null check (hits > 0), expires_at timestamptz not null);
create index on private.rate_limits(expires_at);
create table private.card_registration_sessions (
 registration_id uuid primary key default gen_random_uuid(), device_id text not null references public.devices(device_id),
 user_id uuid not null references public.users(user_id), created_by uuid not null references public.users(user_id),
 expires_at timestamptz not null, used_at timestamptz
);

create function private.current_user_id() returns uuid language sql stable security definer set search_path = '' as $$
 select user_id from public.users where auth_id = (select auth.uid()) and is_active;
$$;
create function private.current_role() returns text language sql stable security definer set search_path = '' as $$
 select role from public.users where auth_id = (select auth.uid()) and is_active;
$$;
create function private.teaches(sid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.subjects where subject_id = sid and teacher_id = private.current_user_id());
$$;
create function private.enrolled(sid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.enrollments where subject_id = sid and student_id = private.current_user_id());
$$;
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_id(), private.current_role(), private.teaches(uuid), private.enrolled(uuid) to authenticated;

-- Mutations go through server endpoints; RLS supplies read access only.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
grant select on public.users, public.subjects, public.classrooms, public.enrollments, public.attendance_records, public.attendance_adjustments, public.location_suggestions to authenticated;
grant select(session_id,subject_id,teacher_id,room_id,semester,group_name,latitude,longitude,radius_meters,max_accuracy_meters,start_time,end_time,status) on public.attendance_sessions to authenticated;
grant select(device_id,room_id,firmware_version,last_seen_at,last_ip,rssi,is_active,created_at) on public.devices to authenticated;
grant select(card_id,user_id,is_active,created_at) on public.user_cards to authenticated;
grant all on all tables in schema public to service_role;
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;

do $$ declare t text; begin
 foreach t in array array['users','subjects','classrooms','enrollments','attendance_sessions','attendance_records','devices','user_cards','location_suggestions','attendance_adjustments'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
alter table private.device_nonces enable row level security;
alter table private.rate_limits enable row level security;
alter table private.card_registration_sessions enable row level security;
create policy users_read on public.users for select to authenticated using (
 private.current_role() = 'admin' or user_id = private.current_user_id() or
 (private.current_role() = 'teacher' and exists(select 1 from public.enrollments e where e.student_id = users.user_id and private.teaches(e.subject_id)))
);
create policy subjects_read on public.subjects for select to authenticated using (private.current_role() = 'admin' or private.teaches(subject_id) or private.enrolled(subject_id));
create policy classrooms_read on public.classrooms for select to authenticated using (private.current_role() is not null);
create policy enrollments_read on public.enrollments for select to authenticated using (private.current_role() = 'admin' or student_id = private.current_user_id() or private.teaches(subject_id));
create policy sessions_read on public.attendance_sessions for select to authenticated using (private.current_role() = 'admin' or private.teaches(subject_id) or private.enrolled(subject_id));
create policy records_read on public.attendance_records for select to authenticated using (private.current_role() = 'admin' or student_id = private.current_user_id() or exists(select 1 from public.attendance_sessions s where s.session_id = attendance_records.session_id and private.teaches(s.subject_id)));
create policy devices_read on public.devices for select to authenticated using (private.current_role() = 'admin');
create policy cards_read on public.user_cards for select to authenticated using (private.current_role() = 'admin');
create policy suggestions_read on public.location_suggestions for select to authenticated using (private.current_role() = 'admin');
create policy adjustments_read on public.attendance_adjustments for select to authenticated using (private.current_role() = 'admin' or exists(select 1 from public.attendance_records r where r.record_id = attendance_adjustments.record_id));

create function private.validate_roles() returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_table_name in ('subjects','attendance_sessions') then
  if not exists(select 1 from public.users where user_id = new.teacher_id and role = 'teacher') then raise exception 'Teacher required'; end if;
 end if;
 if tg_table_name in ('enrollments','attendance_records') then
  if not exists(select 1 from public.users where user_id = new.student_id and role = 'student') then raise exception 'Student required'; end if;
 end if;
 if tg_table_name = 'attendance_sessions' then
  if not exists(select 1 from public.subjects where subject_id = new.subject_id and teacher_id = new.teacher_id) then raise exception 'Subject teacher mismatch'; end if;
 end if;
 return new;
end $$;
create trigger validate_subject before insert or update on public.subjects for each row execute function private.validate_roles();
create trigger validate_session before insert or update on public.attendance_sessions for each row execute function private.validate_roles();
create trigger validate_enrollment before insert or update on public.enrollments for each row execute function private.validate_roles();
create trigger validate_record before insert or update on public.attendance_records for each row execute function private.validate_roles();
revoke all on function private.validate_roles() from public;

alter publication supabase_realtime add table public.attendance_records;
