import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { codeAt, qrAt, verify, digest, encryptSecret, decryptSecret } from '../src/lib/attendance/tokens.mjs';
import { bangkokDay, isToday, sessionStatus } from '../src/lib/attendance/calendar.ts';
const timetable=JSON.parse(readFileSync(new URL('../src/data/timetable.json',import.meta.url)));
const key=Buffer.from(Array.from({length:32},(_,i)=>i));
const session='12345678-1234-4234-8234-123456789abc';
const schedules=timetable.schedules.map(([subject,day,start,end,room])=>({subject,day_of_week:day,start_time:start,end_time:end,room_id:room,term_start:timetable.term_start,term_end:timetable.term_end}));
test('12 distinct periods, eight subjects and unknown room coordinates',()=>{
 assert.equal(schedules.length,12);assert.equal(timetable.subjects.length,8);assert.equal(timetable.rooms.length,6);
 const tuesday=schedules.filter(s=>s.subject==='CPE23267'&&s.day_of_week===2);
 assert.equal(tuesday.length,2);assert.deepEqual(tuesday.map(s=>s.start_time),['11:00','15:00']);assert.notEqual(tuesday[0].room_id,tuesday[1].room_id);
 assert.equal(schedules.filter(s=>s.room_id===null).length,4);
});
test('Bangkok dates, term boundaries, Sunday and days without classes',()=>{
 assert.deepEqual(bangkokDay(new Date('2026-08-23T17:00:00Z')),{date:'2026-08-24',day:1});
 const today=s=>schedules.filter(x=>isToday(x,new Date(s)));
 assert.equal(today('2026-08-24T09:00:00+07:00').length,3);
 assert.equal(today('2026-12-14T09:00:00+07:00').length,3);
 for(const d of ['2026-08-17','2026-12-21','2026-11-08','2026-11-06','2026-11-07'])assert.equal(today(`${d}T12:00:00+07:00`).length,0);
 assert.equal(today('2026-11-10T12:00:00+07:00').filter(s=>s.subject==='CPE23267').length,2);
});
test('per-period state and automatic expiry independent of status persistence',()=>{
 const now=Date.parse('2026-11-10T12:00:00+07:00');
 assert.equal(sessionStatus(undefined,false,now),'ยังไม่เปิด');
 assert.equal(sessionStatus({status:'active',end_time:new Date(now+1).toISOString()},false,now),'เปิดเช็คชื่ออยู่');
 assert.equal(sessionStatus({status:'active',end_time:new Date(now).toISOString()},false,now),'ปิดแล้ว (ไม่ได้เช็ค)');
 assert.equal(sessionStatus({status:'closed',end_time:new Date(now).toISOString()},true,now),'เช็คชื่อแล้ว');
});
test('current and previous counters accepted; expired, future and another session rejected',()=>{
 const now=1800000000000,c=Math.floor(now/30000);
 for(const method of ['code_gps','qr_gps']){
  const value=i=>method==='code_gps'?codeAt(key,session,i):qrAt(key,session,i);
  assert.ok(verify(key,session,value(c),method,now));assert.ok(verify(key,session,value(c-1),method,now));
  assert.equal(verify(key,session,value(c-2),method,now),false);assert.equal(verify(key,session,value(c+1),method,now),false);
  assert.equal(verify(key,'another-session',value(c),method,now),false);
 }
});
test('leading zero codes, independent HMAC construction and encryption roundtrip',()=>{
 let found=false;
 for(let c=0;c<200;c++){const code=codeAt(key,session,c);assert.match(code,/^\d{4}$/);if(code.startsWith('0'))found=true;}
 assert.ok(found);
 const counter=60000000,bytes=Buffer.alloc(8);bytes.writeBigUInt64BE(BigInt(counter));
 const independent=createHmac('sha256',key).update(Buffer.concat([Buffer.from(`attendance:v1:${session}:`),bytes])).digest();
 assert.deepEqual(digest(key,session,counter),independent);
 const encrypted=encryptSecret(key,'ab'.repeat(32));assert.deepEqual(decryptSecret(encrypted,'ab'.repeat(32)),key);
 assert.throws(()=>decryptSecret(encrypted,'cd'.repeat(32)));
});
test('firmware C++ HMAC/code agrees with web on fixed counters',()=>{
 const folder=mkdtempSync(join(tmpdir(),'attendance-firmware-'));
 try {
  const binary=join(folder,'token');execFileSync('c++',['-std=c++11','tests/firmware-token.cpp','-o',binary,...(process.platform==='darwin'?[]:['-lcrypto'])],{stdio:'pipe'});
  for(const counter of [0,1,60000000,60000001,4294967296]){
   const expected=codeAt(key,session,counter);
   const lines=execFileSync(binary,[session,String(counter),expected],{encoding:'utf8'}).trim().split('\n');
   assert.equal(lines[0],expected);assert.equal(lines[1],digest(key,session,counter).toString('hex'));
  }
 } finally {rmSync(folder,{recursive:true,force:true});}
});
test('LAN and localhost origins use actual Host; cross-site requests stay blocked',async()=>{
 const {sameRequestOrigin}=await import('../src/lib/attendance/origin.ts');
 assert.equal(sameRequestOrigin('http://192.168.1.147:3000','192.168.1.147:3000'),'http://192.168.1.147:3000');
 assert.equal(sameRequestOrigin('http://localhost:3000','localhost:3000'),'http://localhost:3000');
 assert.equal(sameRequestOrigin('https://attendance.example','attendance.example'),'https://attendance.example');
 for(const [origin,host] of [['http://evil.example','192.168.1.147:3000'],['http://localhost:3001','localhost:3000'],['null','localhost:3000'],[null,'localhost:3000'],['file:///','localhost:3000'],['http://localhost:3000/path','localhost:3000']])assert.throws(()=>sameRequestOrigin(origin,host));
});
test('post-login redirect stays on this origin, including tab/newline tricks',async()=>{
 const {safeNext}=await import('../src/lib/attendance/origin.ts');
 const origin='https://attendance.example';
 assert.equal(safeNext('/check-in?session=1#x',origin),'/check-in?session=1#x');
 assert.equal(safeNext(undefined,origin),'/');
 for(const bad of ['//evil.example','/\t/evil.example','/\n/evil.example','/\\evil.example','https://evil.example','javascript:alert(1)'])
  assert.equal(safeNext(bad,origin),'/',bad);
});
test('current term: inside term, between terms falls back to latest started, empty input',async()=>{
 const {currentTerms}=await import('../src/lib/attendance/calendar.ts');
 const rows=[{term:'1/2569',term_start:'2026-08-24',term_end:'2026-12-14'},{term:'2/2569',term_start:'2027-01-11',term_end:'2027-05-01'}];
 assert.deepEqual(currentTerms(rows,new Date('2026-11-19T10:00:00+07:00')),['1/2569']);
 assert.deepEqual(currentTerms(rows,new Date('2026-12-25T10:00:00+07:00')),['1/2569']);
 assert.deepEqual(currentTerms(rows,new Date('2027-02-01T10:00:00+07:00')),['2/2569']);
 assert.deepEqual(currentTerms(rows,new Date('2026-01-01T10:00:00+07:00')),['1/2569']);
 assert.deepEqual(currentTerms([],new Date()),[]);
 const {termOrder}=await import('../src/lib/attendance/calendar.ts');
 assert.deepEqual(['1/2569','3/2568','2/2569','1/2570'].sort((a,b)=>termOrder(b)-termOrder(a)),['1/2570','2/2569','1/2569','3/2568']);
});

test('GPS spoofing flags', async () => {
 const { gpsFlags, FLAG_STILL, FLAG_ACCURACY, FLAG_CLOCK } = await import('../src/lib/attendance/gps-flags.ts');
 const now = Date.UTC(2026, 10, 20, 2);
 const at = (i, lat, lng, accuracy) => ({ latitude: lat, longitude: lng, accuracy, timestamp: now - (5 - i) * 1000 });
 const jitter = [0, 1, 2, 3].map(i => at(i, 13.8 + i * 1e-6, 100.5 - i * 1e-6, 8.4 + i));
 assert.deepEqual(gpsFlags(jitter, now), []);
 assert.deepEqual(gpsFlags([], now), []);
 // A precise fix that never moves looks like a dropped pin.
 assert.deepEqual(gpsFlags([0, 1, 2].map(i => at(i, 13.8, 100.5, 5)), now), [FLAG_STILL]);
 // Coarse Wi-Fi fixes repeat legitimately indoors, and fewer than 3 readings prove nothing.
 assert.deepEqual(gpsFlags([0, 1, 2].map(i => at(i, 13.8, 100.5, 35)), now), []);
 assert.deepEqual(gpsFlags([0, 1].map(i => at(i, 13.8, 100.5, 5)), now), []);
 // A precise fix re-served unchanged for the whole read is as suspicious as a frozen one.
 assert.deepEqual(gpsFlags([at(0, 13.8, 100.5, 5), at(0, 13.8, 100.5, 5), at(0, 13.8, 100.5, 5)], now), [FLAG_STILL]);
 // iPhones report round accuracies such as 5 or 65; only sub-metre accuracy is implausible.
 assert.deepEqual(gpsFlags([at(0, 13.8, 100.5, 65)], now), []);
 assert.deepEqual(gpsFlags([at(0, 13.8, 100.5, 0.5)], now), [FLAG_ACCURACY]);
 assert.deepEqual(gpsFlags([{ ...at(0, 13.8, 100.5, 8), timestamp: now - 3 * 60 * 1000 }], now), [FLAG_CLOCK]);
 assert.deepEqual(gpsFlags([{ ...at(0, 13.8, 100.5, 8), timestamp: now + 90 * 1000 }], now), []);
});
