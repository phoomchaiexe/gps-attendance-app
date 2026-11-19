export function bangkokDay(now = new Date()) {
 const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const day = new Date(`${date}T12:00:00+07:00`).getUTCDay();
 return { date, day: day === 0 ? 7 : day };
}
export function isToday(s: {day_of_week:number;term_start:string;term_end:string},now=new Date()) {
 const {date,day}=bangkokDay(now); return s.day_of_week===day && date>=s.term_start && date<=s.term_end;
}
export function sessionStatus(session: {status:string;end_time:string}|undefined,present:boolean, now=Date.now()) {
 if(present) return 'เช็คชื่อแล้ว';
 if(!session) return 'ยังไม่เปิด';
 return session.status==='active' && new Date(session.end_time).getTime()>now ? 'เปิดเช็คชื่ออยู่' : 'ปิดแล้ว (ไม่ได้เช็ค)';
}
// Terms whose date range contains today (Bangkok). Between terms, fall back to the most recently started term.
export function currentTerms(schedules: {term:string;term_start:string;term_end:string}[], now = new Date()): string[] {
 const {date}=bangkokDay(now);
 const active=[...new Set(schedules.filter(s=>date>=s.term_start&&date<=s.term_end).map(s=>s.term))];
 if(active.length) return active;
 const started=schedules.filter(s=>s.term_start<=date).sort((a,b)=>b.term_start.localeCompare(a.term_start));
 const latest=started[0]??[...schedules].sort((a,b)=>a.term_start.localeCompare(b.term_start))[0];
 return latest?[latest.term]:[];
}
// Sort key for "semester/year" terms such as "1/2569": year first, then semester.
export function termOrder(term: string): number { const [semester,year]=term.split('/').map(Number); return year*10+semester; }
