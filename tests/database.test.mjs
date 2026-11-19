import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client=()=>createClient(url,key,{auth:{persistSession:false}});
async function login(code) { const db=client(); const {error}=await db.auth.signInWithPassword({email:`${code}@attendance.example.com`,password:process.env.SEED_PASSWORD}); assert.ifError(error); return db; }
test('anonymous cannot read users',async()=>{const {data}=await client().from('users').select('*'); assert.ok(!data || data.length===0);});
test('student sees only self and cannot write attendance',async()=>{
 const db=await login('68001021'); const {data,error}=await db.from('users').select('*'); assert.ifError(error); assert.equal(data.length,1); assert.equal(data[0].user_code,'68001021');
 const write=await db.from('attendance_records').insert({}); assert.ok(write.error); 
 const secret=await db.from('devices').select('secret_encrypted'); assert.ok(secret.error);
 const token=await db.from('attendance_sessions').select('qr_token'); assert.ok(token.error);
 const card=await db.from('user_cards').select('card_uid_hash'); assert.ok(card.error);
});
test('teacher sees only taught subjects',async()=>{const db=await login('teacher02'); const {data,error}=await db.from('subjects').select('*');assert.ifError(error);assert.deepEqual(data.map(s=>s.subject_code).sort(),['CPE21167','CPE23167']);});
test('admin sees seeded users but cannot read device secret',async()=>{const db=await login('admin01');const {data,error}=await db.from('users').select('*');assert.ifError(error);assert.equal(data.length,25);assert.ok((await db.from('devices').select('secret_encrypted')).error);});
test('student can read twelve enrolled periods but cannot mutate schedules or invoke check-in RPC directly',async()=>{
 const db=await login('68001021');
 const {data,error}=await db.from('class_schedules').select('*').eq('term','1/2569');assert.ifError(error);assert.equal(data.length,12);
 assert.ok((await db.from('class_schedules').insert({})).error);
 const id='00000000-0000-4000-8000-000000000000';
 assert.ok((await db.rpc('session_secret',{sid:id})).error);
 assert.ok((await db.rpc('submit_attendance',{sid:id,student:id,method_value:'code_gps',credential_valid:true,lat:0,lng:0,accuracy:5})).error);
});
