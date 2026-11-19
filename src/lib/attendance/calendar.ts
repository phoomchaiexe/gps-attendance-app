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
