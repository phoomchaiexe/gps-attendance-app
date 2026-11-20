'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, CircleCheck, Clock3, Hash, LocateFixed, MapPin, RotateCcw, ScanLine, ShieldCheck } from 'lucide-react';
import { action, type Data } from '@/lib/attendance/types';
import { loadLibrary, scannerLibrary, type Scanner } from '@/lib/attendance/browser-libraries';
import { MAX_SAMPLES, READ_INTERVAL_MS, READ_MAX_MS, READ_MIN_MS, type GpsSample } from '@/lib/attendance/gps-flags';
import { Brand, Notice, Spinner } from './interface';

type Step = 'choose' | 'qr' | 'code' | 'gps' | 'confirm' | 'result' | 'failed';
type Method = 'qr_gps' | 'code_gps';
type CameraState = 'starting' | 'ready' | 'error';
const formatTime = (value: string) => new Date(value).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });

export function CheckIn({ sessionId, token }: { sessionId: string; token?: string }) {
 const [data, setData] = useState<Data>();
 const [step, setStep] = useState<Step>(token ? 'gps' : 'choose');
 const [method, setMethod] = useState<Method>(token ? 'qr_gps' : 'code_gps');
 const [credential, setCredential] = useState(token ?? '');
 const [digits, setDigits] = useState(['', '', '', '']);
 const [message, setMessage] = useState('');
 const [busy, setBusy] = useState(false);
 const [samples, setSamples] = useState<GpsSample[]>([]);
 const stopReading = useRef<() => void>(undefined);
 const [cameraState, setCameraState] = useState<CameraState>('starting');
 const [cameraAttempt, setCameraAttempt] = useState(0);
 const [now, setNow] = useState(Date.now());
 const inputs = useRef<(HTMLInputElement | null)[]>([]);
 const submitted = useRef(false);
 const session = data?.sessions.find(s => s.session_id === sessionId);
 const open = session?.status === 'active' && Date.parse(session.end_time) > now;

 useEffect(() => {
  let cancelled = false;
  fetch('/api/attendance').then(async response => {
   const result = await response.json();
   if (!response.ok) throw new Error(result.message);
   if (cancelled) return;
   setData(result);
   if (result.records.some((r: Data['records'][number]) => r.session_id === sessionId && r.student_id === result.me.user_id && r.status === 'present')) {
    setStep('result'); setMessage('คาบนี้เช็คชื่อแล้ว');
   }
  }).catch(error => { if (!cancelled) setMessage(error.message); });
  return () => { cancelled = true; };
 }, [sessionId]);
 useEffect(() => {
  const offset = data ? data.serverNow - Date.now() : 0;
  setNow(Date.now() + offset);
  const timer = setInterval(() => setNow(Date.now() + offset), 1000);
  return () => clearInterval(timer);
 }, [data]);
 useEffect(() => { if (step === 'code') inputs.current[0]?.focus(); }, [step]);
 useEffect(() => {
  if (step !== 'qr' || !open || data?.me.role !== 'student') return;
  let cancelled = false, started = false;
  let scanner: Scanner | undefined;
  setCameraState('starting');
  (async () => {
   try {
    await loadLibrary(scannerLibrary);
    if (cancelled) return;
    scanner = new window.Html5Qrcode('qr-reader');
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, text => {
     if (cancelled) return;
     try {
      const url = new URL(text, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== '/c' || url.searchParams.get('session') !== sessionId) throw new Error('QR ไม่ใช่ของคาบนี้ ลองสแกน QR ที่อาจารย์แสดง');
      const value = url.searchParams.get('token');
      if (!value) throw new Error('QR ไม่ถูกต้อง');
      setCredential(value); setMethod('qr_gps'); setStep('gps'); setMessage('');
     } catch (error) { setMessage((error as Error).message); }
    }, () => {});
    started = true;
    if (cancelled) await scanner.stop();
    else setCameraState('ready');
   } catch {
    if (!cancelled) {
     setCameraState('error');
     setMessage('เปิดกล้องไม่ได้ แตะการตั้งค่าเว็บไซต์ข้างแถบที่อยู่ แล้วอนุญาตกล้อง หรือสลับไปใส่เลข 4 ตัว');
    }
   }
  })();
  return () => { cancelled = true; if (started && scanner) void scanner.stop().catch(() => {}); };
 }, [step, sessionId, open, data?.me.role, cameraAttempt]);

 function move(next: Step) { setMessage(''); setStep(next); }
 function numeric(value: string, index: number) {
  const numbers = value.replace(/\D/g, ''), next = [...digits];
  if (numbers.length > 1) numbers.slice(0, 4 - index).split('').forEach((n, i) => { next[index + i] = n; });
  else next[index] = numbers;
  setDigits(next);
  if (numbers) inputs.current[Math.min(3, index + numbers.length)]?.focus();
  if (next.every(Boolean)) { setCredential(next.join('')); setMethod('code_gps'); move('gps'); }
 }
 useEffect(() => () => stopReading.current?.(), []);
 // Read GPS for a few seconds instead of once: real fixes jitter, mock pins usually do not (see gps-flags.ts).
 // Poll with fresh one-shot reads; watchPosition only reports changes, so a frozen pin would yield one reading.
 function locate() {
  if (!navigator.geolocation) { setMessage('เปิดตำแหน่งไม่ได้ ลองใช้เบราว์เซอร์บนมือถือผ่าน HTTPS'); return; }
  setBusy(true); setMessage('');
  const readings: GpsSample[] = [], started = Date.now();
  let done = false, next: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { done = true; clearTimeout(next); clearTimeout(maxTimer); stopReading.current = undefined; };
  const finish = (error?: GeolocationPositionError) => {
   if (done) return;
   stop();
   if (readings.length) { setSamples(readings); setStep('confirm'); }
   else setMessage(error?.code === 1 ? 'ยังไม่ได้อนุญาตตำแหน่ง เปิดสิทธิ์ตำแหน่งในการตั้งค่าเว็บไซต์ แล้วลองอีกครั้ง' : 'อ่านตำแหน่งไม่ได้ เปิด GPS แล้วลองอีกครั้ง');
   setBusy(false);
  };
  const read = () => navigator.geolocation.getCurrentPosition(result => {
   if (done) return;
   const { latitude, longitude, accuracy } = result.coords;
   readings.push({ latitude, longitude, accuracy, timestamp: result.timestamp });
   if (Date.now() - started >= READ_MIN_MS || readings.length >= MAX_SAMPLES) finish();
   else next = setTimeout(read, READ_INTERVAL_MS);
  }, error => {
   if (done) return;
   // Permission denied or no fix at all ends the read; a failed later read keeps what we have.
   if (error.code === 1 || !readings.length && Date.now() - started >= READ_MAX_MS) finish(error);
   else if (readings.length) finish();
   else next = setTimeout(read, READ_INTERVAL_MS);
  }, { enableHighAccuracy: true, timeout: READ_MAX_MS, maximumAge: 0 });
  const maxTimer = setTimeout(() => finish(), READ_MAX_MS);
  stopReading.current = stop;
  read();
 }
 async function submit() {
  if (!samples.length || submitted.current) return;
  submitted.current = true; setBusy(true); setMessage('');
  try {
   const result = await action({ action: 'check-in', session_id: sessionId, method, credential, samples });
   setMessage(result.message); setStep(result.ok ? 'result' : 'failed');
  } catch (error) { setMessage((error as Error).message); setStep('failed'); }
  finally { submitted.current = false; setBusy(false); }
 }
 const subject = data?.subjects.find(s => s.subject_id === session?.subject_id);
 const room = data?.rooms.find(r => r.room_id === session?.room_id);
 const schedule = data?.schedules.find(s => s.schedule_id === session?.schedule_id);
 const loading = !data;
 const available = !!data && data.me.role === 'student' && !!open;
 const unavailable = data?.me.role !== 'student' ? 'หน้านี้สำหรับนักศึกษา' : !session ? 'ไม่พบคาบเรียนนี้' : 'คาบนี้ปิดเช็คชื่อแล้ว';
 return <CheckInScreen step={step} method={method} message={message} busy={busy} loading={loading} available={available}
  unavailable={unavailable} cameraState={cameraState} digits={digits} accuracy={samples.at(-1)?.accuracy}
  subjectCode={subject?.subject_code} subjectName={subject?.subject_name} room={room?.room_name}
  period={session ? `${schedule?.start_time.slice(0, 5) ?? formatTime(session.start_time)} – ${schedule?.end_time.slice(0, 5) ?? formatTime(session.end_time)}` : undefined}
  sessionDate={session ? new Date(`${session.session_date}T12:00:00+07:00`).toLocaleDateString('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' }) : undefined}
  onMove={move} onNumeric={numeric} inputRef={(element, index) => { inputs.current[index] = element; }}
  onBackspace={index => { const next = [...digits]; if (next[index]) next[index] = ''; else if (index > 0) { next[index - 1] = ''; inputs.current[index - 1]?.focus(); } setDigits(next); }}
  onLocate={locate} onSubmit={submit} onCameraRetry={() => { setMessage(''); setCameraAttempt(n => n + 1); }}
  onRetry={() => { setDigits(['', '', '', '']); setSamples([]); move('choose'); }} />;
}

type ScreenProps = {
 homeHref?: string; step: Step; method: Method; message: string; busy: boolean; loading: boolean; available: boolean;
 unavailable: string; cameraState: CameraState; digits: string[]; accuracy?: number;
 subjectCode?: string; subjectName?: string; room?: string; period?: string; sessionDate?: string;
 onMove: (step: Step) => void; onNumeric: (value: string, index: number) => void;
 inputRef: (element: HTMLInputElement | null, index: number) => void; onBackspace: (index: number) => void;
 onLocate: () => void; onSubmit: () => void; onCameraRetry: () => void; onRetry: () => void;
};

// Presentation is independent of camera, GPS and API access, so every screen can be inspected offline.
export function CheckInScreen(props: ScreenProps) {
 const { homeHref='/', step, method, message, busy, loading, available, unavailable, cameraState, digits, accuracy, subjectCode, subjectName, room, period, sessionDate, onMove, onNumeric, inputRef, onBackspace, onLocate, onSubmit, onCameraRetry, onRetry } = props;
 const progress = ['choose', 'qr', 'code'].includes(step) ? 0 : step === 'gps' ? 1 : 2;
 return <div className="check-layout">
  <header className="flow-topbar"><Brand href={homeHref} /><a href={homeHref} className="text-button"><ArrowLeft size={16} />กลับหน้าหลัก</a></header>
  <main className="check-workspace">
   <nav className="flow-steps" aria-label="ขั้นตอนเช็คชื่อ">{['เลือกวิธี', 'ตรวจตำแหน่ง', 'ยืนยันเช็คชื่อ'].map((label, i) => <div key={label} className={`flow-step ${i === progress ? 'current' : i < progress ? 'complete' : ''}`} aria-current={i === progress ? 'step' : undefined}><span>{i < progress ? <Check size={14} /> : `0${i + 1}`}</span><strong>{label}</strong></div>)}</nav>
   <div className="check-columns">
    <aside className="session-context">
     <span className="section-label">คาบที่กำลังเช็คชื่อ</span>
     <div className="context-icon"><BookIcon /></div>
     <span className="subject-code">{subjectCode ?? 'รายละเอียดคาบเรียน'}</span>
     <h1>{subjectName ?? (loading ? 'กำลังโหลดคาบเรียน' : 'เช็คชื่อเข้าเรียน')}</h1>
     <dl className="context-details"><div><dt><Clock3 size={16} />เวลา</dt><dd>{period ?? '—'}</dd></div><div><dt><MapPin size={16} />ห้อง</dt><dd>{room ?? 'ไม่ระบุห้อง'}</dd></div></dl>
     {sessionDate && <p className="context-date">{sessionDate}</p>}
     {available && step !== 'result' && <span className="live-badge"><span className="small-dot" />กำลังเปิดเช็คชื่อ</span>}
     <div className="context-note"><ShieldCheck size={18} /><p>อ่านตำแหน่งเฉพาะตอนเช็คชื่อ<br />ไม่มีการติดตามระหว่างวัน</p></div>
    </aside>
    <section className="panel check-panel flow-panel" aria-busy={busy}>
     {loading ? <div className="flow-state"><span className="state-icon"><Spinner size={26} /></span><h2>{message ? 'เข้าใช้งานก่อนเช็คชื่อ' : 'กำลังโหลดคาบเรียน'}</h2>{message ? <><Notice>{message}</Notice><a className="primary-button" href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/')}`}>เข้าสู่ระบบ<ArrowRight size={17} /></a></> : <p>รอสักครู่</p>}</div> : !available && step !== 'result' ? <div className="flow-state"><span className="state-icon"><Clock3 size={28} /></span><h2>{unavailable}</h2><p>กลับไปเลือกคาบที่หน้าหลักได้เลย</p><a className="primary-button" href={homeHref}>กลับหน้าหลัก<ArrowRight size={17} /></a></div> : <>
      <div key={step} className="step-content">
       {step === 'choose' && <><span className="section-label">ขั้นตอนที่ 1</span><h2>เช็คชื่อด้วยวิธีไหน</h2><p className="flow-description">เลือกวิธีที่สะดวก แล้วตรวจตำแหน่งในห้องเรียน</p><div className="method-buttons"><button onClick={() => onMove('qr')}><span className="method-icon"><ScanLine size={26} strokeWidth={1.6} /></span><strong>สแกน QR</strong><span>ใช้กล้องมือถือ</span><ArrowRight className="method-arrow" size={18} /></button><button onClick={() => onMove('code')}><span className="method-icon"><Hash size={26} strokeWidth={1.6} /></span><strong>ใส่เลข 4 ตัว</strong><span>จากหน้าจออาจารย์</span><ArrowRight className="method-arrow" size={18} /></button></div><p className="flow-footnote">เลข 4 ตัวดูได้จากหน้าจอหน้าห้องหรือที่อาจารย์ฉาย</p></>}
       {step === 'qr' && <><div className="flow-title-row"><div><span className="section-label">ขั้นตอนที่ 1</span><h2>สแกน QR หน้าห้อง</h2></div><button className="text-button compact-switch" onClick={() => onMove('code')}><Hash size={15} />ใส่เลขแทน</button></div><p className="flow-description">วาง QR ให้อยู่ในกรอบ ระบบจะอ่านให้เอง</p>{message && <Notice>{message}</Notice>}<div className={`scanner-frame ${cameraState === 'error' ? 'scanner-error' : ''}`}><div id="qr-reader" />{cameraState !== 'ready' && <div className="scanner-placeholder">{cameraState === 'starting' ? <Spinner size={28} /> : <Camera size={32} strokeWidth={1.5} />}<span>{cameraState === 'starting' ? 'กำลังเปิดกล้อง' : 'ยังเปิดกล้องไม่ได้'}</span></div>}<div className="scanner-guides" aria-hidden="true"><i /><i /><i /><i />{cameraState === 'ready' && <span className="scan-sweep" />}</div></div>{cameraState === 'error' && <button className="text-button" onClick={onCameraRetry}><RotateCcw size={15} />ลองเปิดกล้องอีกครั้ง</button>}<div className="method-switch"><span>ใช้กล้องไม่ได้?</span><button onClick={() => onMove('code')}>ใส่เลข 4 ตัวแทน<ArrowRight size={15} /></button></div></>}
       {step === 'code' && <><span className="section-label">ขั้นตอนที่ 1</span><h2>ใส่เลข 4 ตัว</h2><p className="flow-description">ดูเลขจากหน้าจออาจารย์ แล้วกรอกด้านล่าง</p><div className="code-inputs" role="group" aria-label="รหัสเช็คชื่อ 4 หลัก">{digits.map((digit, index) => <input key={index} ref={element => inputRef(element, index)} className={digit ? 'filled' : ''} aria-label={`เลขตัวที่ ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} pattern="[0-9]*" value={digit} onFocus={e => e.currentTarget.select()} onChange={e => onNumeric(e.target.value, index)} onPaste={e => { e.preventDefault(); onNumeric(e.clipboardData.getData('text'), index); }} onKeyDown={e => { if (e.key === 'Backspace') { e.preventDefault(); onBackspace(index); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const target = e.currentTarget.parentElement?.children[index + (e.key === 'ArrowLeft' ? -1 : 1)] as HTMLInputElement | undefined; target?.focus(); } }} />)}</div><p className="code-hint"><Clock3 size={14} />เลขเปลี่ยนทุก 30 วินาที</p><p className="flow-footnote">ครบ 4 ตัวแล้ว ระบบจะไปตรวจตำแหน่งต่อ</p><div className="method-switch"><span>สะดวกใช้กล้อง?</span><button onClick={() => onMove('qr')}>สแกน QR แทน<ScanLine size={16} /></button></div></>}
       {step === 'gps' && <div className="flow-state"><div className={`location-visual ${busy ? 'locating' : ''}`} aria-hidden="true"><span /><span /><LocateFixed size={36} strokeWidth={1.4} /></div><span className="section-label">ขั้นตอนที่ 2</span><h2>ตรวจตำแหน่งในห้องเรียน</h2><p>เปิด GPS และอนุญาตตำแหน่ง<br />เมื่อคุณอยู่ในห้องแล้ว</p><button className="primary-button wide-button" disabled={busy} onClick={onLocate}>{busy ? <><Spinner />กำลังอ่านตำแหน่ง</> : <><LocateFixed size={18} />อ่านตำแหน่ง GPS</>}</button><button className="text-button" disabled={busy} onClick={() => onMove('choose')}>เปลี่ยนวิธีเช็คชื่อ</button></div>}
       {step === 'confirm' && <div className="flow-state"><span className="state-icon state-success"><Check size={30} strokeWidth={1.6} /></span><span className="section-label">ขั้นตอนที่ 3</span><h2>พร้อมยืนยันเช็คชื่อ</h2><p>ระบบจะตรวจรหัสและระยะจากห้องเรียน<br />เมื่อกดยืนยัน</p><dl className="confirmation-details"><div><dt>วิธีเช็คชื่อ</dt><dd>{method === 'qr_gps' ? 'สแกน QR' : 'เลข 4 ตัว'}</dd></div><div><dt>ความแม่นยำ GPS</dt><dd>{accuracy===undefined?'ยังไม่ได้อ่านตำแหน่ง':`${Math.round(accuracy)} เมตร`}</dd></div></dl><button className="primary-button wide-button" disabled={busy} onClick={onSubmit}>{busy ? <><Spinner />กำลังตรวจสอบ</> : <>ยืนยันเช็คชื่อ<ArrowRight size={17} /></>}</button><button className="text-button" disabled={busy} onClick={() => onMove('gps')}><RotateCcw size={14} />อ่านตำแหน่งใหม่</button></div>}
       {step === 'result' && <div className="flow-state result-state"><span className="result-check"><CircleCheck size={52} strokeWidth={1.3} /></span><span className="section-label">บันทึกการเข้าเรียนแล้ว</span><h2>เช็คชื่อเรียบร้อย</h2><p>{message || 'ดูรายการนี้ได้ในประวัติการเข้าเรียน'}</p><a className="primary-button wide-button" href={homeHref}>กลับหน้าหลัก<ArrowRight size={17} /></a></div>}
       {step === 'failed' && <div className="flow-state"><span className="state-icon"><RotateCcw size={28} /></span><h2>ยังเช็คชื่อไม่สำเร็จ</h2><p>ตรวจข้อความด้านล่าง แล้วลองอีกครั้ง</p><button className="primary-button wide-button" onClick={onRetry}>ลองอีกครั้ง<ArrowRight size={17} /></button></div>}
      </div>
      {message && step !== 'result' && step !== 'qr' && <Notice>{message}</Notice>}
     </>}
    </section>
   </div>
   <footer className="flow-footer">เข้าห้อง<span>เช็คชื่อเมื่ออยู่ในห้องเรียนเท่านั้น</span></footer>
  </main>
 </div>;
}
function BookIcon() { return <ScanLine size={23} strokeWidth={1.5} aria-hidden="true" />; }
