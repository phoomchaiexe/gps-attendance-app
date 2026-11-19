import timetable from '@/data/timetable.json';
import type { Data } from './types';

// Presentation fixtures only. Never sent to a check-in API or used as session credentials.
export function demoData(role: 'student' | 'teacher'): Data {
 const student='demo-student';
 return {
  me: role==='student'?{user_id:student,role,first_name:'ธนกร',last_name:'สุขเกษม'}:{user_id:'teacher01',role,first_name:'สุภาวดี',last_name:'ศรีสุวรรณ'},
  subjects:timetable.subjects.map(([code,name,teacher])=>({subject_id:code,subject_code:code,subject_name:name,teacher_id:teacher})),
  rooms:timetable.rooms.map(room=>({room_id:room,room_name:room,default_latitude:null,default_longitude:null})),
  schedules:timetable.schedules.map(row=>({schedule_id:`demo-${timetable.schedules.indexOf(row)}`,subject_id:String(row[0]),day_of_week:Number(row[1]),start_time:String(row[2]),end_time:String(row[3]),room_id:row[4]===null?null:String(row[4]),term:timetable.term,term_start:timetable.term_start,term_end:timetable.term_end})),
  sessions:[{session_id:'demo-session',subject_id:'CPE23267',room_id:'05-0901',schedule_id:'demo-4',session_date:'2026-11-10',start_time:'2026-11-10T11:00:00+07:00',end_time:'2026-11-10T12:50:00+07:00',status:'active'}],
  records:[],enrollments:timetable.subjects.map(([code])=>({subject_id:code,student_id:student,semester:timetable.term})),
  teachers:timetable.teachers.map(([id,first,last])=>({user_id:id,first_name:first,last_name:last})),
  students:[],settings:timetable.settings,suggestions:[],serverNow:Date.parse('2026-11-10T11:20:00+07:00')
 };
}
