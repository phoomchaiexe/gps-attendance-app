alter table public.classrooms alter default_latitude drop not null, alter default_longitude drop not null;
alter table public.classrooms add constraint coordinates_pair check ((default_latitude is null) = (default_longitude is null));
create table public.class_schedules (
 schedule_id uuid primary key default gen_random_uuid(),
 subject_id uuid not null references public.subjects(subject_id),
 day_of_week integer not null check(day_of_week between 1 and 7),
 start_time time not null, end_time time not null check(end_time > start_time),
 room_id uuid references public.classrooms(room_id), term text not null check(term ~ '^[1-3]/[0-9]{4}$'),
 term_start date not null, term_end date not null check(term_end >= term_start),
 unique(subject_id,term,day_of_week,start_time)
);
alter table public.class_schedules enable row level security;
revoke all on public.class_schedules from anon, authenticated;
grant select on public.class_schedules to authenticated;
grant all on public.class_schedules to service_role;
create policy schedules_read on public.class_schedules for select to authenticated using (
 private.current_role()='admin' or private.teaches(subject_id) or exists (
 select 1 from public.enrollments e where e.student_id=private.current_user_id() and e.subject_id=class_schedules.subject_id and e.semester=class_schedules.term));
alter table public.attendance_sessions add schedule_id uuid references public.class_schedules(schedule_id),
 add session_date date, add off_schedule_reason text,
 add late_after_minutes integer not null default 15 check(late_after_minutes between 0 and 180);
update public.attendance_sessions set session_date=(start_time at time zone 'Asia/Bangkok')::date;
alter table public.attendance_sessions alter session_date set not null;
create unique index one_schedule_per_date on public.attendance_sessions(schedule_id,session_date) where schedule_id is not null;
drop index public.active_code;
alter table public.attendance_sessions drop constraint attendance_sessions_attendance_code_check;
-- Rotating codes are derived, never stored on new sessions.
alter table public.attendance_sessions alter attendance_code drop not null;
update public.attendance_sessions set attendance_code=null;
alter table public.attendance_sessions add constraint attendance_sessions_attendance_code_check check(attendance_code ~ '^[0-9]{4}$');
alter table public.attendance_records add is_late boolean not null default false;
alter table public.attendance_records alter distance_meters type numeric(12,2);
grant select(schedule_id,session_date,off_schedule_reason,late_after_minutes) on public.attendance_sessions to authenticated;
create table public.attendance_settings (
 id boolean primary key default true check(id), open_early_minutes integer not null check(open_early_minutes between 0 and 180),
 late_after_minutes integer not null check(late_after_minutes between 0 and 180), close_grace_minutes integer not null check(close_grace_minutes between 0 and 180)
);
alter table public.attendance_settings enable row level security;
revoke all on public.attendance_settings from anon,authenticated;
grant select on public.attendance_settings to authenticated;
grant all on public.attendance_settings to service_role;
create policy settings_read on public.attendance_settings for select to authenticated using(private.current_role() is not null);
create table private.session_secrets (session_id uuid primary key references public.attendance_sessions(session_id), secret_encrypted text not null);
create table private.code_attempts (
 session_id uuid references public.attendance_sessions(session_id), student_id uuid references public.users(user_id),
 failures integer not null default 0, locked_until timestamptz, primary key(session_id,student_id)
);
alter table private.session_secrets enable row level security;
alter table private.code_attempts enable row level security;
grant all on private.session_secrets,private.code_attempts to service_role;
-- Only the server can retrieve encrypted secrets.
create function public.session_secret(sid uuid) returns text language sql security definer set search_path='' as $$
 select coalesce((select d.secret_encrypted from public.devices d join public.attendance_sessions s on s.room_id=d.room_id where s.session_id=sid and d.is_active),
 (select secret_encrypted from private.session_secrets where session_id=sid));
$$;
-- Scheduled openings use database time and a transaction, so concurrent opens cannot race.
create function public.open_attendance(tid uuid, sid uuid, subject uuid, room uuid, radius integer, reason text, duration integer, encrypted text)
returns uuid language plpgsql security definer set search_path='' as $$
declare sch public.class_schedules; r public.classrooms; cfg public.attendance_settings; id uuid;
 today date := (now() at time zone 'Asia/Bangkok')::date; starts timestamptz; ends timestamptz; term_value text;
begin
 perform pg_advisory_xact_lock(hashtextextended(coalesce(sid::text,room::text),0));
 update public.attendance_sessions set status='closed' where status='active' and end_time<=now();
 select cfg_row.* into cfg from public.attendance_settings cfg_row where cfg_row.id=true;
 if cfg.id is null then raise exception 'ยังไม่ได้ตั้งค่าตารางเรียน'; end if;
 if sid is not null then
  select * into sch from public.class_schedules where schedule_id=sid;
  if sch.schedule_id is null or today not between sch.term_start and sch.term_end or extract(isodow from today)<>sch.day_of_week then raise exception 'วันนี้ไม่มีคาบนี้'; end if;
  if exists(select 1 from public.attendance_sessions where schedule_id=sid and session_date=today) then raise exception 'คาบนี้มี session แล้ว เปิดซ้ำไม่ได้'; end if;
  subject:=sch.subject_id; room:=coalesce(sch.room_id,room); term_value:=sch.term;
  starts:=(today+sch.start_time) at time zone 'Asia/Bangkok';
  ends:=((today+sch.end_time) at time zone 'Asia/Bangkok')+make_interval(mins=>cfg.close_grace_minutes);
  if now()<starts-make_interval(mins=>cfg.open_early_minutes) or now()>=ends then raise exception 'ยังไม่ถึงเวลาเปิดหรือคาบสิ้นสุดแล้ว'; end if;
 else
  if length(trim(coalesce(reason,'')))<3 then raise exception 'กรอกเหตุผลเปิดนอกตาราง'; end if;
  if duration not between 1 and 480 then raise exception 'ระยะเวลาไม่ถูกต้อง'; end if;
  starts:=now(); ends:=now()+make_interval(mins=>duration); 
  select cs.term into term_value from public.class_schedules cs where cs.subject_id=subject order by cs.term_start desc limit 1;
  if term_value is null then raise exception 'ไม่มีภาคเรียนสำหรับวิชานี้'; end if;
 end if;
 if not exists(select 1 from public.subjects where subject_id=subject and teacher_id=tid) then raise exception 'ไม่มีสิทธิ์เปิดวิชานี้'; end if;
 select * into r from public.classrooms where room_id=room;
 if r.default_latitude is null or r.default_longitude is null then raise exception 'ห้องยังไม่มีพิกัด'; end if;
 if exists(select 1 from public.attendance_sessions where room_id=room and status='active') then raise exception 'ห้องมี session เปิดอยู่'; end if;
 insert into public.attendance_sessions(subject_id,teacher_id,room_id,semester,latitude,longitude,radius_meters,qr_token,qr_expires_at,start_time,end_time,schedule_id,session_date,off_schedule_reason,late_after_minutes)
 values(subject,tid,room,term_value,r.default_latitude,r.default_longitude,radius,gen_random_uuid()::text,ends,starts,ends,sid,today,case when sid is null then reason end,cfg.late_after_minutes) returning session_id into id;
 insert into private.session_secrets values(id,encrypted);
 return id;
end $$;
-- All attempts for a session are serialized. Client cannot supply identity or a validation result.
create function public.submit_attendance(sid uuid, student uuid, method_value text, credential_valid boolean, lat double precision, lng double precision, accuracy double precision)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.attendance_sessions; attempt private.code_attempts; rejection text; distance double precision; late boolean;
begin
 select * into s from public.attendance_sessions where session_id=sid for update;
 if s.session_id is null then raise exception 'ไม่พบคาบ'; end if;
 if method_value not in ('code_gps','qr_gps') then raise exception 'Invalid method'; end if;
 if not exists(select 1 from public.enrollments where student_id=student and subject_id=s.subject_id and semester=s.semester) then raise exception 'ไม่ได้ลงทะเบียนวิชานี้'; end if;
 if s.status<>'active' or now()>=s.end_time then
  update public.attendance_sessions set status='closed' where session_id=sid and end_time<=now();
  return jsonb_build_object('ok',false,'message','ปิดเช็คชื่อแล้ว');
 end if;
 if exists(select 1 from public.attendance_records where session_id=sid and student_id=student and status='present') then return jsonb_build_object('ok',true,'message','เช็คชื่อแล้ว'); end if;
 if method_value='code_gps' then
  insert into private.code_attempts(session_id,student_id) values(sid,student) on conflict do nothing;
  select * into attempt from private.code_attempts where session_id=sid and student_id=student for update;
  if attempt.locked_until>now() then rejection:='ล็อกการใส่เลข 5 นาที';
  else
   if attempt.locked_until is not null then update private.code_attempts set failures=0,locked_until=null where session_id=sid and student_id=student; end if;
   if not credential_valid then
    update private.code_attempts set failures=failures+1,locked_until=case when failures+1>=5 then now()+interval '5 minutes' end where session_id=sid and student_id=student;
    rejection:='Invalid code';
   end if;
  end if;
 elsif not credential_valid then rejection:='Invalid QR'; end if;
 if rejection is null then
  if lat is null or lng is null or accuracy is null or lat not between -90 and 90 or lng not between -180 and 180 or accuracy<0 then rejection:='พิกัดไม่ถูกต้อง';
  else
   distance:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat-s.latitude)/2),2)+cos(radians(s.latitude))*cos(radians(lat))*power(sin(radians(lng-s.longitude)/2),2))));
   if accuracy>s.max_accuracy_meters then rejection:='ตำแหน่งยังไม่แม่นยำ';
   elsif distance>s.radius_meters then rejection:='อยู่นอกรัศมีห้องเรียน'; end if;
  end if;
 end if;
 late:=now()>s.start_time+make_interval(mins=>s.late_after_minutes);
 insert into public.attendance_records(session_id,student_id,student_latitude,student_longitude,gps_accuracy,distance_meters,status,reject_reason,method,is_late)
 values(sid,student,lat,lng,accuracy,distance,case when rejection is null then 'present' else 'rejected' end,rejection,method_value,late and rejection is null);
 return jsonb_build_object('ok',rejection is null,'message',coalesce(rejection,case when late then 'เช็คชื่อแล้ว · มาสาย' else 'เช็คชื่อแล้ว' end));
end $$;
revoke all on function public.session_secret(uuid),public.open_attendance(uuid,uuid,uuid,uuid,integer,text,integer,text),public.submit_attendance(uuid,uuid,text,boolean,double precision,double precision,double precision) from public,anon,authenticated;
grant execute on function public.session_secret(uuid),public.open_attendance(uuid,uuid,uuid,uuid,integer,text,integer,text),public.submit_attendance(uuid,uuid,text,boolean,double precision,double precision,double precision) to service_role;
-- Read paths always treat end_time <= now() as closed. pg_cron also persists status without a browser.
create extension if not exists pg_cron;
select cron.schedule('close-attendance-sessions','* * * * *',$$update public.attendance_sessions set status='closed' where status='active' and end_time<=now()$$);
create function public.approve_room_location(suggestion uuid, reviewer uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.location_suggestions;
begin
 if not exists(select 1 from public.users where user_id=reviewer and role='admin' and is_active) then raise exception 'Admin required'; end if;
 select * into item from public.location_suggestions where suggestion_id=suggestion and status='pending' for update;
 if item.suggestion_id is null then raise exception 'ไม่พบพิกัดที่รออนุมัติ'; end if;
 update public.classrooms set default_latitude=item.latitude,default_longitude=item.longitude where room_id=item.room_id;
 update public.location_suggestions set status='approved',reviewed_by=reviewer,reviewed_at=now() where suggestion_id=suggestion;
end $$;
revoke all on function public.approve_room_location(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_room_location(uuid,uuid) to service_role;
