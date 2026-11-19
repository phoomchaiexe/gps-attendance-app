import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
const timetable = JSON.parse(await readFile(new URL('../src/data/timetable.json', import.meta.url), 'utf8')); 
const env = z.object({ NEXT_PUBLIC_SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(20), SEED_PASSWORD: z.string().min(12), DEVICE_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/) }).parse(process.env);
if (!process.argv.includes('--confirm-test-project')) throw new Error('ใช้กับโปรเจกต์ทดสอบเท่านั้น: เพิ่ม --confirm-test-project');
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
function check({data,error}) { if(error) throw error; return data; }
// Check schema before creating any Auth accounts, to avoid a partial seed.
for(const table of ['users','subjects','classrooms','enrollments','class_schedules','attendance_settings']) {
 const {error}=await db.from(table).select('*',{head:true}).limit(1);
 if(error)throw new Error(`ตาราง ${table} ยังไม่พร้อม: ${error.message} — รัน migration ก่อน seed`);
}
const people = [['admin01','ปณิธาน','วงศ์สวัสดิ์','admin'],...timetable.teachers.map(t=>[...t,'teacher'])];
const names = [['ธนกร','สุขเกษม'],['ณัฐชา','วงศ์คำ'],['ภูริณัฐ','ใจดี'],['พิมพ์ชนก','แสงทอง'],['กฤตภาส','บุญมา'],['ชลธิชา','ศรีสุข'],['ศุภวิชญ์','มีทรัพย์'],['ณิชาภัทร','แก้วใส'],['ปวริศ','ทองดี'],['วรัญญา','พงษ์พิพัฒน์'],['อัครพล','จันทร์หอม'],['รินรดา','วัฒนชัย'],['ธีรภัทร','คำมูล'],['ศศิธร','ดวงแก้ว'],['สิรวิชญ์','นาคทอง'],['กัญญาวีร์','ร่มเย็น'],['ภาคิน','อินทร์คำ'],['นภัสสร','สุขสันต์'],['ปุณณวิช','สีหราช'],['มนัสนันท์','พรหมมา']];
names.forEach((n,i)=>people.push([String(68001021+i),...n,'student']));
const authUsers = [];
for(let page=1;;page++) { const result=check(await db.auth.admin.listUsers({page,perPage:1000})); authUsers.push(...result.users); if(result.users.length<1000) break; }
const users=[];
for(const [code,first,last,role] of people) {
 const email=`${code}@attendance.example.com`;
 let auth=authUsers.find(u=>u.email===email);
 if(!auth) auth=check(await db.auth.admin.createUser({email,password:env.SEED_PASSWORD,email_confirm:true})).user;
 const user=check(await db.from('users').upsert({auth_id:auth.id,user_code:code,first_name:first,last_name:last,role,email},{onConflict:'user_code'}).select().single());
 users.push(user);
}
// Existing approved coordinates are preserved when the seed is rerun.
const rooms=[];
for (const room_name of timetable.rooms) {
 let room=check(await db.from('classrooms').select('*').eq('room_name',room_name).maybeSingle());
 if(!room) room=check(await db.from('classrooms').insert({room_name,default_latitude:null,default_longitude:null}).select().single());
 rooms.push(room);
}
const subjects=check(await db.from('subjects').upsert(timetable.subjects.map(([subject_code,subject_name,teacher])=>({subject_code,subject_name,teacher_id:users.find(u=>u.user_code===teacher).user_id})),{onConflict:'subject_code'}).select());
check(await db.from('class_schedules').upsert(timetable.schedules.map(([code,day,start,end,room])=>({
 subject_id:subjects.find(s=>s.subject_code===code).subject_id,day_of_week:day,start_time:start,end_time:end,
 room_id:room?rooms.find(r=>r.room_name===room).room_id:null,term:timetable.term,term_start:timetable.term_start,term_end:timetable.term_end
})),{onConflict:'subject_id,term,day_of_week,start_time'}));
check(await db.from('enrollments').upsert(users.filter(u=>u.role==='student').flatMap(u=>subjects.map(s=>({student_id:u.user_id,subject_id:s.subject_id,semester:timetable.term}))),{onConflict:'student_id,subject_id,semester'}));
// Keep administrator changes to timing settings on repeat runs.
if(!check(await db.from('attendance_settings').select('id').eq('id',true).maybeSingle()))
 check(await db.from('attendance_settings').insert({id:true,...timetable.settings}));
console.log('Seed พร้อม: admin 1, teacher 4, student 20, subjects 8, rooms 6 (ไม่กำหนดพิกัด), schedules 12');
