-- Run after migrations + seed: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/attendance.sql
-- All fixtures use synthetic coordinates, and the entire test is rolled back.
begin;
do $$
declare teacher uuid; student uuid; subject uuid; room uuid; schedule uuid; sid uuid; sid2 uuid; sid3 uuid; sid4 uuid; student2 uuid; student3 uuid; result jsonb; amount integer;
 today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 select user_id into teacher from public.users where user_code='teacher01';
 select user_id into student from public.users where user_code='68001021';
 if teacher is null or student is null then raise exception 'Run seed first'; end if;
 insert into public.subjects(subject_code,subject_name,teacher_id) values('TEST-'||gen_random_uuid(),'Integration fixture',teacher) returning subject_id into subject;
 insert into public.enrollments(student_id,subject_id,semester) values(student,subject,'1/2569');
 insert into public.classrooms(room_name,default_latitude,default_longitude) values('TEST-'||gen_random_uuid(),null,null) returning room_id into room;
 insert into public.class_schedules(subject_id,day_of_week,start_time,end_time,room_id,term,term_start,term_end)
 values(subject,extract(isodow from today),'08:00','19:00',room,'1/2569',today,today) returning schedule_id into schedule;
 begin
  perform public.open_attendance(teacher,null,subject,room,100,'ทดสอบ',100,'fixture');
  raise exception 'Expected missing coordinates rejection';
 exception when others then if sqlerrm<>'ห้องยังไม่มีพิกัด' then raise; end if; end;
 -- Missing off-schedule reason.
 begin
  perform public.open_attendance(teacher,null,subject,room,100,'',100,'fixture');
  raise exception 'Expected reason rejection';
 exception when others then if sqlerrm<>'กรอกเหตุผลเปิดนอกตาราง' then raise; end if; end;
 -- Use a synthetic room only; no real classroom is assigned invented coordinates.
 update public.classrooms set default_latitude=0,default_longitude=0 where room_id=room;
 sid:=public.open_attendance(teacher,null,subject,room,100,'ทดสอบ',100,'fixture');
 -- Valid code cannot bypass GPS radius.
 result:=public.submit_attendance(sid,student,'code_gps',true,1,1,5);
 if result->>'ok'<>'false' or result->>'message'<>'อยู่นอกรัศมีห้องเรียน' then raise exception 'GPS bypass: %',result; end if;
 for i in 1..5 loop
  result:=public.submit_attendance(sid,student,'code_gps',false,0,0,5);
  if result->>'message'<>'Invalid code' then raise exception 'Wrong code audit missing'; end if;
 end loop;
 select count(*) into amount from public.attendance_records where session_id=sid and student_id=student and status='rejected' and reject_reason='Invalid code';
 if amount<>5 then raise exception 'Expected five invalid code logs'; end if;
 result:=public.submit_attendance(sid,student,'code_gps',true,0,0,5);
 if result->>'ok'<>'false' or result->>'message'<>'ล็อกการใส่เลข 5 นาที' then raise exception 'Lock bypass: %',result; end if;
 -- Simulate elapsed lock time without waiting five minutes.
 update private.code_attempts set locked_until=now()-interval '1 second' where session_id=sid and student_id=student;
 update public.attendance_sessions set start_time=now()-interval '16 minutes' where session_id=sid;
 result:=public.submit_attendance(sid,student,'code_gps',true,0,0,5);
 if result->>'ok'<>'true' then raise exception 'Lock did not expire: %',result; end if;
 if not exists(select 1 from public.attendance_records where session_id=sid and student_id=student and status='present' and is_late) then raise exception 'Late flag missing'; end if;
 -- A second request must not create a duplicate present record.
 perform public.submit_attendance(sid,student,'qr_gps',true,0,0,5);
 select count(*) into amount from public.attendance_records where session_id=sid and student_id=student and status='present';
 if amount<>1 then raise exception 'Duplicate present record'; end if;
 update public.attendance_sessions set status='closed' where session_id=sid;
 sid2:=public.open_attendance(teacher,null,subject,room,100,'ทดสอบคาบสอง',100,'fixture');
 result:=public.submit_attendance(sid2,student,'qr_gps',true,0,0,5);
 if result->>'ok'<>'true' then raise exception 'Second period failed: %',result; end if;
 -- Expiry rejects even if the stored status has not been updated by cron.
 update public.attendance_sessions set start_time=now()-interval '2 hours',end_time=now()-interval '1 second' where session_id=sid2;
 result:=public.submit_attendance(sid2,student,'code_gps',true,0,0,5);
 if result->>'ok'<>'false' then raise exception 'Expired session accepted'; end if;
 -- Code lockouts escalate instead of resetting after each lock.
 sid3:=public.open_attendance(teacher,null,subject,room,100,'ทดสอบล็อกสะสม',100,'fixture');
 for i in 1..5 loop perform public.submit_attendance(sid3,student,'code_gps',false,0,0,5); end loop;
 update private.code_attempts set locked_until=now()-interval '1 second' where session_id=sid3 and student_id=student;
 for i in 1..5 loop perform public.submit_attendance(sid3,student,'code_gps',false,0,0,5); end loop;
 if not exists(select 1 from private.code_attempts where session_id=sid3 and student_id=student and failures=10
  and locked_until between now()+interval '9 minutes' and now()+interval '10 minutes') then raise exception 'Lock did not escalate to 10 minutes'; end if;
 -- More than 10 attempts per minute are refused and not logged.
 select count(*) into amount from public.attendance_records where session_id=sid3 and student_id=student;
 if amount<>10 then raise exception 'Expected ten logged attempts, got %',amount; end if;
 result:=public.submit_attendance(sid3,student,'qr_gps',false,0,0,5);
 if result->>'message'<>'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่' then raise exception 'Rate limit missing: %',result; end if;
 select count(*) into amount from public.attendance_records where session_id=sid3 and student_id=student;
 if amount<>10 then raise exception 'Rate-limited attempt was logged'; end if;
 update public.attendance_sessions set status='closed' where session_id=sid3;
 -- GPS flags warn but never reject: identical precise coordinates flag both students,
 -- and reasons computed by the API (gps-flags.ts) are stored as sent.
 select user_id into student2 from public.users where user_code='68001022';
 select user_id into student3 from public.users where user_code='68001023';
 insert into public.enrollments(student_id,subject_id,semester) values(student2,subject,'1/2569'),(student3,subject,'1/2569');
 sid4:=public.open_attendance(teacher,null,subject,room,100,'ทดสอบธง GPS',100,'fixture');
 result:=public.submit_attendance(sid4,student,'qr_gps',true,0.0001,0.0001,5);
 if result->>'ok'<>'true' or exists(select 1 from public.attendance_records where session_id=sid4 and flagged) then raise exception 'First check-in flagged: %',result; end if;
 result:=public.submit_attendance(sid4,student2,'qr_gps',true,0.0001,0.0001,5);
 if result->>'ok'<>'true' then raise exception 'Duplicate coordinates must not reject: %',result; end if;
 select count(*) into amount from public.attendance_records where session_id=sid4 and status='present' and flagged and flag_reasons='{พิกัดซ้ำกับนักศึกษาคนอื่น}';
 if amount<>2 then raise exception 'Expected both duplicate records flagged once, got %',amount; end if;
 result:=public.submit_attendance(sid4,student3,'qr_gps',true,0.0002,0.0001,5,array['พิกัดนิ่งผิดปกติ']);
 if result->>'ok'<>'true' or not exists(select 1 from public.attendance_records where session_id=sid4 and student_id=student3 and flagged and flag_reasons='{พิกัดนิ่งผิดปกติ}') then raise exception 'API flag not stored: %',result; end if;
 update public.attendance_sessions set status='closed' where session_id=sid4;
 -- A schedule can have only one session per date, including closed sessions.
 update public.attendance_sessions set schedule_id=schedule where session_id=sid;
 begin
  perform public.open_attendance(teacher,schedule,null,null,100,'',100,'fixture');
  raise exception 'Expected duplicate period rejection';
 exception when others then if sqlerrm<>'คาบนี้มี session แล้ว เปิดซ้ำไม่ได้' then raise; end if; end;
 -- Another day and outside normal term cannot be opened through the schedule.
 update public.class_schedules set day_of_week=case when extract(isodow from today)=7 then 1 else extract(isodow from today)+1 end where schedule_id=schedule;
 begin
  perform public.open_attendance(teacher,schedule,null,null,100,'',100,'fixture');
  raise exception 'Expected day rejection';
 exception when others then if sqlerrm<>'วันนี้ไม่มีคาบนี้' then raise; end if; end;
 update public.class_schedules set day_of_week=extract(isodow from today),term_start=today-10,term_end=today-1 where schedule_id=schedule;
 begin
  perform public.open_attendance(teacher,schedule,null,null,100,'',100,'fixture');
  raise exception 'Expected term rejection';
 exception when others then if sqlerrm<>'วันนี้ไม่มีคาบนี้' then raise; end if; end;
 raise notice 'Attendance integration assertions passed';
end $$;
rollback;
