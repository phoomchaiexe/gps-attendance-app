'use client';

import { useState } from 'react';
import { ArrowRight, BookOpen, Eye, EyeOff, LockKeyhole, MapPin, UserRound } from 'lucide-react';
import { action } from '@/lib/attendance/types';
import { safeNext } from '@/lib/attendance/origin';
import { Brand, Notice, Spinner } from './interface';

export function Login({ next = '/' }: { next?: string }) {
 const [message, setMessage] = useState('');
 const [busy, setBusy] = useState(false);
 const [visible, setVisible] = useState(false);

 return <main className="login-layout">
  <section className="login-aside" aria-label="เข้าห้อง ระบบเช็คชื่อเข้าเรียน">
   <Brand light />
   <div className="login-aside-content">
    <span className="section-label light-label">ตารางเรียน · การเข้าเรียน</span>
    <h1>ถึงห้องแล้ว<br />เช็คชื่อได้เลย</h1>
    <p>ดูคาบเรียน เช็คชื่อ และติดตามการเข้าเรียน<br />ในที่เดียวกัน</p>
    <div className="campus-plan" aria-hidden="true">
     <div className="plan-caption"><span>ห้องเรียน</span><span>01 / CLASSROOM</span></div>
     <div className="plan-room">
      <span className="plan-board" />
      <div className="plan-seats">{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</div>
      <span className="plan-door" />
      <span className="plan-location"><MapPin size={25} strokeWidth={1.5} /></span>
     </div>
     <div className="plan-caption"><span><span className="small-dot" />ตำแหน่งใช้เฉพาะตอนเช็คชื่อ</span><BookOpen size={16} /></div>
    </div>
   </div>
   <p className="login-aside-footer">สำหรับอาจารย์และนักศึกษา</p>
  </section>

  <section className="login-main">
   <div className="login-mobile-brand"><Brand /></div>
   <form className="login-form" method="post" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setMessage('');
    try {
     await action({ action: 'login', code: String(fields.get('code')).trim(), password: fields.get('password') });
     window.location.assign(safeNext(next, window.location.origin));
    } catch (error) { setMessage((error as Error).message); setBusy(false); }
   }} aria-busy={busy}>
    <span className="section-label">บัญชีผู้ใช้งาน</span>
    <h2>เข้าสู่ระบบ</h2>
    <p className="login-intro">ใช้รหัสนักศึกษาหรือรหัสผู้ใช้ของคุณ</p>
    <div className="form-fields">
     <label htmlFor="user-code">รหัสผู้ใช้</label>
     <div className="input-with-icon"><UserRound size={18} aria-hidden="true" /><input id="user-code" name="code" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="รหัสนักศึกษา / รหัสอาจารย์" required disabled={busy} aria-describedby={message ? 'login-error' : undefined} /></div>
     <label htmlFor="password">รหัสผ่าน</label>
     <div className="input-with-icon"><LockKeyhole size={18} aria-hidden="true" /><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="กรอกรหัสผ่าน" required disabled={busy} aria-describedby={message ? 'login-error' : undefined} /><button type="button" className="password-toggle" aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>
    </div>
    {message && <div id="login-error"><Notice>{message}</Notice></div>}
    <button className="primary-button login-submit" disabled={busy}>{busy ? <><Spinner />กำลังเข้าสู่ระบบ</> : <>เข้าสู่ระบบ<ArrowRight size={18} /></>}</button>
    <a className="secondary-button demo-login-link" href="/demo">ดูตัวอย่างก่อนเข้าสู่ระบบ<ArrowRight size={16}/></a>
    <p className="login-help">หากเข้าใช้งานไม่ได้ ติดต่อผู้ดูแลระบบของคุณ</p>
   </form>
   <footer className="login-footer"><LockKeyhole size={13} aria-hidden="true" />ใช้บัญชีเดียวกันได้ทั้งในคอมพิวเตอร์และมือถือ</footer>
  </section>
 </main>;
}
