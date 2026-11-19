import { createClient } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!publicKey||!serviceKey){console.error('ยังตั้งค่า URL, public key หรือ service role key ไม่ครบใน .env.local');process.exit(1);}
try {
 const response=await fetch(`${url}/auth/v1/health`,{headers:{apikey:publicKey},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error(`Supabase health: HTTP ${response.status}`);
 console.log('PASS: เชื่อมต่อ Supabase ได้');
 const db=createClient(url,serviceKey,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
 for(const table of ['users','subjects','classrooms','enrollments','class_schedules','attendance_sessions','attendance_records','attendance_settings']){
  const {error}=await db.from(table).select('*',{head:true,count:'exact'});
  if(error)throw new Error(`ตาราง ${table}: ${error.message} — ตรวจว่าได้รัน migration ทั้งสองไฟล์แล้ว`);
 }
 console.log('PASS: พบตารางที่ระบบต้องใช้');
 let found=false;
 for(let page=1;;page++){
  const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});
  if(error)throw new Error(`ตรวจ Auth ไม่สำเร็จ: ${error.message}`);
  found ||= data.users.some(u=>u.email==='68001021@attendance.example.com');
  if(found||data.users.length<1000)break;
 }
 if(!found)throw new Error('ยังไม่มีบัญชี 68001021 ให้รัน npm run db:seed -- --confirm-test-project ในโปรเจกต์ทดสอบ');
 console.log('PASS: พบบัญชีนักศึกษาทดสอบ 68001021 (ยังไม่ได้ตรวจรหัสผ่าน)');
} catch(error){console.error('FAIL:',error.cause?.code??error.message);process.exitCode=1;}
