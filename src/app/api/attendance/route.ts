import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sameRequestOrigin } from '@/lib/attendance/origin';
import { currentTerms, termOrder } from '@/lib/attendance/calendar';
import { codeAt, qrAt, counterAt, verify, encryptSecret, decryptSecret } from '@/lib/attendance/tokens.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=z.string().uuid();
// Messages meant for the user. Anything else is logged and replaced with a generic message.
class UserError extends Error { constructor(message:string, readonly status=400) { super(message); } }
// P0001 = RAISE EXCEPTION in our SQL functions, whose messages are written for users.
function checked<T>({data,error}:{data:T;error:{message:string;code?:string}|null}):NonNullable<T> {if(error) throw error.code==='P0001'?new UserError(error.message):error.code==='PGRST116'?new UserError('ไม่พบข้อมูล',404):new Error(error.message);if(data===null||data===undefined) throw new UserError("ไม่พบข้อมูล",404);return data as NonNullable<T>;}
// For writes that return no rows (update without select, void RPC): only the error matters.
function saved({error}:{error:{message:string;code?:string}|null}) {if(error) throw error.code==='P0001'?new UserError(error.message):new Error(error.message);}
function encryptionKey() {
 const key=process.env.DEVICE_ENCRYPTION_KEY;
 if(!key||!/^[0-9a-f]{64}$/i.test(key)) throw new Error('DEVICE_ENCRYPTION_KEY must be 64 hex characters');
 return key;
}
const defaultSettings={open_early_minutes:15,late_after_minutes:15,close_grace_minutes:10};
async function context() {
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user) throw new UserError('กรุณาเข้าสู่ระบบ',401);
 const db=createAdminClient();
 const me=checked(await db.from('users').select('*').eq('auth_id',user.id).eq('is_active',true).single());
 return {client,db,me};
}
const termParam=z.string().regex(/^[1-3]\/[0-9]{4}$/);
export async function GET(req:NextRequest) {
 try {
  const {client,db,me}=await context();
  // Read through authenticated RLS. Never select QR tokens, codes or encrypted secrets.
  // The app polls this every 10 seconds, so only the current term is returned, not the whole history.
  const allSchedules=checked(await client.from('class_schedules').select('*'));
  // Reports may ask for an earlier term with ?term=1/2569; anything not in the visible schedules falls back to the current term.
  const available=[...new Set(allSchedules.map(x=>x.term as string))].sort((a,b)=>termOrder(b)-termOrder(a));
  const requested=termParam.safeParse(req.nextUrl.searchParams.get('term'));
  const terms=requested.success&&available.includes(requested.data)?[requested.data]:currentTerms(allSchedules);
  const filtered=terms.length>0;
  const schedules=filtered?allSchedules.filter(s=>terms.includes(s.term)):allSchedules;
  const sessionQuery=client.from('attendance_sessions').select('session_id,subject_id,room_id,teacher_id,semester,schedule_id,session_date,start_time,end_time,status,late_after_minutes');
  const recordQuery=client.from('attendance_records').select('record_id,session_id,student_id,status,method,flagged,is_late,timestamp,reject_reason,attendance_sessions!inner(semester)');
  const enrollmentQuery=client.from('enrollments').select('*');
  const [subjects,sessions,recordRows,rooms,settings,enrollments]=await Promise.all([
   client.from('subjects').select('*').then(checked),
   (filtered?sessionQuery.in('semester',terms):sessionQuery).then(checked),
   (filtered?recordQuery.in('attendance_sessions.semester',terms):recordQuery).then(checked),
   client.from('classrooms').select('*').then(checked),client.from('attendance_settings').select('*').maybeSingle().then(({data,error})=>{if(error) throw new Error(error.message);return data??defaultSettings;}),
   (filtered?enrollmentQuery.in('semester',terms):enrollmentQuery).then(checked)
  ]);
  const records=recordRows.map(({attendance_sessions:_,...record})=>record);
  const teachers=subjects.length?checked(await db.from('users').select('user_id,first_name,last_name').in('user_id',subjects.map(s=>s.teacher_id))):[];
  const students=me.role==='teacher'?checked(await client.from('users').select('user_id,user_code,first_name,last_name').eq('role','student')):[];
  const suggestions=me.role==='admin'?checked(await client.from('location_suggestions').select('*').eq('status','pending')):[];
  return NextResponse.json({me,subjects,schedules,sessions,records,rooms,settings,enrollments,teachers,students,suggestions,terms:available,term:terms[0]??null,serverNow:Date.now()},{headers:{'Cache-Control':'no-store'}});
 } catch(e) {return failure(e);}
}
const checkIn=z.object({action:z.literal('check-in'),session_id:uuid,method:z.enum(['qr_gps','code_gps']),credential:z.string().min(1).max(200),latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),accuracy:z.number().finite().min(0).max(100000)});
export async function POST(req:NextRequest) {
 try {
  let browserOrigin:string;
  try {browserOrigin=sameRequestOrigin(req.headers.get('origin'),req.headers.get('host'));} catch {throw new UserError('คำขอไม่ถูกต้อง',403);}
  const body=await req.json();
  if(body.action==='login') {
   const input=z.object({code:z.string().regex(/^[A-Za-z0-9]{1,32}$/),password:z.string().min(1).max(200)}).parse(body);
   const client=await createClient(); const {error}=await client.auth.signInWithPassword({email:`${input.code}@attendance.example.com`,password:input.password});
   if(error) {
    if(!error.status || error.status>=500) throw new UserError('เชื่อมต่อระบบเข้าสู่ระบบไม่ได้ กรุณาลองอีกครั้ง');
    if(error.status===429) throw new UserError('ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่');
    throw new UserError('รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
   }
   return NextResponse.json({ok:true});
  }
  const {client,db,me}=await context();
  if(body.action==='logout') {await client.auth.signOut();return NextResponse.json({ok:true});}
  if(body.action==='check-in') {
   if(me.role!=='student') throw new UserError('สำหรับนักศึกษา',403);
   const input=checkIn.parse(body);
   const encrypted=checked(await db.rpc('session_secret',{sid:input.session_id}));
   if(!encrypted) throw new UserError('ไม่พบข้อมูล session');
   const secret=decryptSecret(encrypted,encryptionKey());
   const valid=verify(secret,input.session_id,input.credential,input.method);
   const result=checked(await db.rpc('submit_attendance',{sid:input.session_id,student:me.user_id,method_value:input.method,credential_valid:valid,lat:input.latitude,lng:input.longitude,accuracy:input.accuracy}));
   return NextResponse.json(result);
  }
  if(body.action==='open') {
   if(me.role!=='teacher') throw new UserError('สำหรับอาจารย์',403);
   const input=z.object({schedule_id:uuid.nullable(),subject_id:uuid.nullable(),room_id:uuid.nullable(),radius:z.number().int().min(20).max(500),reason:z.string().max(500).default(''),duration:z.number().int().min(1).max(480).default(100)}).parse(body);
   const encrypted=encryptSecret(randomBytes(32),encryptionKey());
   const id=checked(await db.rpc('open_attendance',{tid:me.user_id,sid:input.schedule_id,subject:input.subject_id,room:input.room_id,radius:input.radius,reason:input.reason,duration:input.duration,encrypted}));
   return NextResponse.json({ok:true,session_id:id});
  }
  if(body.action==='live'||body.action==='close') {
   const id=uuid.parse(body.session_id);
   const session=checked(await db.from('attendance_sessions').select('teacher_id,status,end_time').eq('session_id',id).single());
   if(me.role!=='teacher'||session.teacher_id!==me.user_id) throw new UserError('ไม่มีสิทธิ์',403);
   if(body.action==='close') {saved(await db.from('attendance_sessions').update({status:'closed'}).eq('session_id',id));return NextResponse.json({ok:true});}
   if(session.status!=='active'||Date.parse(session.end_time)<=Date.now()) throw new UserError('ปิดเช็คชื่อแล้ว');
   const encrypted=checked(await db.rpc('session_secret',{sid:id}));
   const secret=decryptSecret(encrypted,encryptionKey());const now=Date.now(),counter=counterAt(now);
   return NextResponse.json({ok:true,code:codeAt(secret,id,counter),url:`${browserOrigin}/c?session=${id}&token=${qrAt(secret,id,counter)}`,expiresAt:(counter+1)*30000,serverNow:now});
  }
  if(me.role!=='admin') throw new UserError('ไม่มีสิทธิ์',403);
  if(body.action==='room') {
   const input=z.object({room_id:uuid,latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180)}).parse(body);
   saved(await db.from('classrooms').update({default_latitude:input.latitude,default_longitude:input.longitude}).eq('room_id',input.room_id));
  } else if(body.action==='approve-location') {
   saved(await db.rpc('approve_room_location',{suggestion:uuid.parse(body.suggestion_id),reviewer:me.user_id}));
  } else if(body.action==='settings') {
   const input=z.object({open_early_minutes:z.number().int().min(0).max(180),late_after_minutes:z.number().int().min(0).max(180),close_grace_minutes:z.number().int().min(0).max(180)}).parse(body);
   saved(await db.from('attendance_settings').update(input).eq('id',true));
  } else throw new UserError('ไม่พบคำสั่ง');
  return NextResponse.json({ok:true});
 } catch(e) {return failure(e);}
}
function failure(e:unknown) {
 if(e instanceof z.ZodError) return NextResponse.json({ok:false,message:'ข้อมูลไม่ถูกต้อง'},{status:400});
 if(e instanceof UserError) return NextResponse.json({ok:false,message:e.message},{status:e.status});
 console.error('attendance API error',e);
 return NextResponse.json({ok:false,message:'ระบบขัดข้อง กรุณาลองอีกครั้ง'},{status:500});
}
