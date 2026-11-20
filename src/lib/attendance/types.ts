export type Subject={subject_id:string;subject_code:string;subject_name:string;teacher_id:string};
export type Schedule={schedule_id:string;subject_id:string;day_of_week:number;start_time:string;end_time:string;room_id:string|null;term:string;term_start:string;term_end:string};
export type Session={session_id:string;subject_id:string;room_id:string;schedule_id:string|null;session_date:string;start_time:string;end_time:string;status:string};
export type RecordItem={record_id:string;student_id:string;session_id:string;status:string;method:string;flagged:boolean;flag_reasons:string[];is_late:boolean;timestamp:string;reject_reason:string|null};
export type Room={room_id:string;room_name:string;default_latitude:number|null;default_longitude:number|null};
export type Data={me:{user_id:string;role:string;first_name:string;last_name:string};subjects:Subject[];schedules:Schedule[];sessions:Session[];records:RecordItem[];rooms:Room[];teachers:{user_id:string;first_name:string;last_name:string}[];students:{user_id:string;user_code:string;first_name:string;last_name:string}[];settings:{open_early_minutes:number;late_after_minutes:number;close_grace_minutes:number};enrollments:{subject_id:string;student_id:string;semester:string}[];suggestions:{suggestion_id:string;room_id:string;latitude:number;longitude:number}[];terms?:string[];term?:string|null;serverNow:number};
export async function action(body:object) {
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),20000);
 try {
  const response=await fetch('/api/attendance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
  const result=await response.json();if(!response.ok) throw new Error(result.message);return result;
 } catch(error) {
  if(controller.signal.aborted) throw new Error('ระบบตอบกลับช้า กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง');
  throw error;
 } finally {clearTimeout(timer);}
}
