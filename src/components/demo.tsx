'use client';
import { useEffect, useRef, useState } from 'react';
import { AttendanceShell } from './attendance-shell';
import { CheckInScreen } from './check-in';
import { demoData } from '@/lib/attendance/demo';

export function DemoBanner(){return <div className="demo-banner"><span><strong>โหมดตัวอย่าง</strong> ไม่ต้องล็อกอิน · ไม่บันทึกข้อมูล</span><a href="/login">เข้าสู่ระบบจริง</a></div>;}
export function Demo(){
 const [role,setRole]=useState<'student'|'teacher'>('student');
 return <><DemoBanner/><div className="demo-role-switch" role="group" aria-label="เลือกบทบาทตัวอย่าง"><button aria-pressed={role==='student'} onClick={()=>setRole('student')}>นักศึกษา</button><button aria-pressed={role==='teacher'} onClick={()=>setRole('teacher')}>อาจารย์</button><span>จำลองวันอังคาร 10 พ.ย. 2569 เวลา 11:20</span></div><AttendanceShell key={role} initialData={demoData(role)} demo/></>;
}
export function DemoCheckIn(){
 const [step,setStep]=useState<'choose'|'qr'|'code'|'gps'|'confirm'|'result'|'failed'>('choose');
 const [digits,setDigits]=useState(['','','','']);
 const [message,setMessage]=useState('');
 const inputs=useRef<(HTMLInputElement|null)[]>([]);
 useEffect(()=>{if(step==='code')inputs.current[0]?.focus();},[step]);
 function move(next:typeof step){setStep(next);setMessage(next==='qr'?'โหมดตัวอย่างไม่เปิดกล้อง เลือกใส่เลขแทนเพื่อดูขั้นตอนถัดไป':'');}
 return <div className="demo-check"><DemoBanner/><a className="demo-back" href="/demo">กลับหน้าตัวอย่าง</a><CheckInScreen homeHref="/demo" step={step} method="code_gps" message={message} busy={false} loading={false} available unavailable="" cameraState="error" digits={digits}
 subjectCode="CPE23267" subjectName="วิศวกรรมซอฟต์แวร์" room="05-0901" period="11:00 – 12:40" sessionDate="10 พฤศจิกายน 2569"
 onMove={move} inputRef={(el,i)=>{inputs.current[i]=el;}}
 onNumeric={(value,index)=>{const numbers=value.replace(/\D/g,'').slice(0,4-index),next=[...digits];if(!numbers)next[index]='';else numbers.split('').forEach((n,i)=>next[index+i]=n);setDigits(next);inputs.current[Math.min(3,index+numbers.length)]?.focus();if(next.every(Boolean))move('gps');}}
 onBackspace={index=>{const next=[...digits];if(next[index])next[index]='';else if(index>0){next[index-1]='';inputs.current[index-1]?.focus();}setDigits(next);}}
 onLocate={()=>{move('confirm');setMessage('ตัวอย่างขั้นตอนยืนยัน ยังไม่ได้อ่านตำแหน่ง GPS จริง');}}
 onSubmit={()=>setMessage('โหมดตัวอย่างไม่บันทึกการเข้าเรียน ต้องเข้าสู่ระบบจริงก่อนเช็คชื่อ')}
 onCameraRetry={()=>setMessage('โหมดตัวอย่างไม่เปิดกล้อง กรุณาสลับไปใส่เลข 4 ตัว')}
 onRetry={()=>{setDigits(['','','','']);move('choose');}}/></div>;
}
