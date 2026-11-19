-- Hardening for check-in:
-- 1. Per-student rate limit per session, so rejected attempts cannot flood attendance_records.
-- 2. Code lockouts escalate (5, 10, 20, 40, 60 minutes) instead of resetting after each lock,
--    so a 4-digit code cannot be guessed by waiting out repeated 5-minute locks.
create or replace function public.submit_attendance(sid uuid, student uuid, method_value text, credential_valid boolean, lat double precision, lng double precision, accuracy double precision)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.attendance_sessions; attempt private.code_attempts; rejection text; distance double precision; late boolean;
 limit_key text := 'check-in:'||sid||':'||student; hit_count integer; lock_minutes integer;
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
 -- At most 10 attempts per minute per student and session. Excess attempts are not logged.
 insert into private.rate_limits(key,hits,expires_at) values(limit_key,1,now()+interval '1 minute')
 on conflict(key) do update set
  hits=case when private.rate_limits.expires_at<=now() then 1 else private.rate_limits.hits+1 end,
  expires_at=case when private.rate_limits.expires_at<=now() then now()+interval '1 minute' else private.rate_limits.expires_at end
 returning private.rate_limits.hits into hit_count;
 if hit_count>10 then return jsonb_build_object('ok',false,'message','ส่งคำขอบ่อยเกินไป กรุณารอสักครู่'); end if;
 if method_value='code_gps' then
  insert into private.code_attempts(session_id,student_id) values(sid,student) on conflict do nothing;
  select * into attempt from private.code_attempts where session_id=sid and student_id=student for update;
  if attempt.locked_until>now() then
   rejection:='ล็อกการใส่เลข '||ceil(extract(epoch from attempt.locked_until-now())/60)::integer||' นาที';
  elsif not credential_valid then
   -- Failures are never reset within a session; every fifth failure locks for twice as long, up to 60 minutes.
   lock_minutes:=case when (attempt.failures+1)%5=0 then least(60,5*power(2,(attempt.failures+1)/5-1)::integer) end;
   update private.code_attempts set failures=failures+1,
    locked_until=case when lock_minutes is not null then now()+make_interval(mins=>lock_minutes) else locked_until end
   where session_id=sid and student_id=student;
   rejection:='Invalid code';
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
revoke all on function public.submit_attendance(uuid,uuid,text,boolean,double precision,double precision,double precision) from public,anon,authenticated;
grant execute on function public.submit_attendance(uuid,uuid,text,boolean,double precision,double precision,double precision) to service_role;
-- Expired rate-limit rows are purged every 10 minutes.
select cron.schedule('purge-rate-limits','*/10 * * * *',$$delete from private.rate_limits where expires_at<now()$$);
