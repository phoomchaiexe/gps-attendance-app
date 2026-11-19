// Render the real UI components to offline HTML for layout review, without Supabase or a server.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
 return original.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, parent, ...rest);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
 const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
 module._compile(outputText, filename);
};
const { Login } = require('../src/components/login.tsx');
const { CheckInScreen } = require('../src/components/check-in.tsx');
const { AttendanceShell } = require('../src/components/attendance-shell.tsx');
const timetable = require('../src/data/timetable.json');
const out = path.join(root, 'output/playwright/ui');
fs.mkdirSync(out, { recursive: true });
const now = Date.parse('2026-11-10T11:20:00+07:00');
const data = {
 me: { user_id: 'student-preview', role: 'student', first_name: 'ธนกร', last_name: 'สุขเกษม' },
 subjects: timetable.subjects.map(([code, name, teacher]) => ({ subject_id: code, subject_code: code, subject_name: name, teacher_id: teacher })),
 rooms: timetable.rooms.map(name => ({ room_id: name, room_name: name, default_latitude: null, default_longitude: null })),
 schedules: timetable.schedules.map(([subject, day, start, end, room], i) => ({ schedule_id: `period-${i}`, subject_id: subject, day_of_week: day, start_time: start, end_time: end, room_id: room, term: timetable.term, term_start: timetable.term_start, term_end: timetable.term_end })),
 sessions: [{ session_id: 'session-preview', schedule_id: 'period-4', session_date: '2026-11-10', subject_id: 'CPE23267', room_id: '05-0901', start_time: '2026-11-10T11:00:00+07:00', end_time: '2026-11-10T12:50:00+07:00', status: 'active' }],
 records: [], enrollments: timetable.subjects.map(([code]) => ({ subject_id: code, student_id: 'student-preview', semester: timetable.term })),
 teachers: timetable.teachers.map(([user_id, first_name, last_name]) => ({ user_id, first_name, last_name })),
 students: [], settings: timetable.settings, suggestions: [], serverNow: now
};
const noop = () => {};
const screen = { step: 'choose', method: 'code_gps', message: '', busy: false, loading: false, available: true, unavailable: '', cameraState: 'starting', digits: ['', '', '', ''], accuracy: 12, subjectCode: 'CPE23267', subjectName: 'วิศวกรรมซอฟต์แวร์', room: '05-0901', period: '11:00 – 12:40', sessionDate: '10 พฤศจิกายน 2569', onMove: noop, onNumeric: noop, inputRef: noop, onBackspace: noop, onLocate: noop, onSubmit: noop, onCameraRetry: noop, onRetry: noop };
const pages = [
 ['login', 'เข้าสู่ระบบ', React.createElement(Login)],
 ['choose', 'เลือกวิธีเช็คชื่อ', React.createElement(CheckInScreen, screen)],
 ['scan', 'สแกน QR', React.createElement(CheckInScreen, { ...screen, step: 'qr' })],
 ['camera-denied', 'กล้องไม่ได้รับอนุญาต', React.createElement(CheckInScreen, { ...screen, step: 'qr', cameraState: 'error', message: 'เปิดกล้องไม่ได้ แตะการตั้งค่าเว็บไซต์ข้างแถบที่อยู่ แล้วอนุญาตกล้อง หรือสลับไปใส่เลข 4 ตัว' })],
 ['code', 'ใส่เลข 4 ตัว', React.createElement(CheckInScreen, { ...screen, step: 'code', digits: ['0', '4', '', ''] })],
 ['gps', 'ตรวจตำแหน่ง', React.createElement(CheckInScreen, { ...screen, step: 'gps' })],
 ['confirm', 'ยืนยันเช็คชื่อ', React.createElement(CheckInScreen, { ...screen, step: 'confirm' })],
 ['success', 'เช็คชื่อสำเร็จ', React.createElement(CheckInScreen, { ...screen, step: 'result' })],
 ['student', 'หน้าหลักนักศึกษา', React.createElement(AttendanceShell, { initialData: data })],
 ['week', 'ตารางเรียน', React.createElement(AttendanceShell, { initialData: data, initialView: 'week' })],
 ['teacher', 'หน้าหลักอาจารย์', React.createElement(AttendanceShell, { initialData: { ...data, me: { user_id: 'teacher01', role: 'teacher', first_name: 'สุภาวดี', last_name: 'ศรีสุวรรณ' } } })],
 ['open', 'เปิดเช็คชื่อ', React.createElement(AttendanceShell, { initialData: { ...data, me: { user_id: 'teacher01', role: 'teacher', first_name: 'สุภาวดี', last_name: 'ศรีสุวรรณ' } }, initialView: 'open' })]
];
(async () => {
 const postcss = require('postcss');
 const plugin = require('@tailwindcss/postcss');
 const cssFile = path.join(root, 'src/app/globals.css');
 const result = await postcss([plugin({ base: root })]).process(fs.readFileSync(cssFile, 'utf8'), { from: cssFile });
 fs.writeFileSync(path.join(out, 'style.css'), result.css);
 for (const [name, title, element] of pages) fs.writeFileSync(path.join(out, name + '.html'), '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + ' · ตัวอย่างหน้าจอ</title><link rel="stylesheet" href="style.css"></head><body>' + renderToStaticMarkup(element) + '</body></html>');
 const index = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เข้าห้อง · ตัวอย่างหน้าจอ</title><style>body{margin:0;background:#f5f7f9;color:#263746;font-family:Tahoma,sans-serif}header{padding:20px;border-bottom:1px solid #dfe5eb;background:white}h1{font-size:20px}p{font-size:12px;color:#71808e;line-height:1.8}nav{display:flex;gap:8px;flex-wrap:wrap}a,button{padding:10px 14px;background:#edf2f6;border:1px solid #dfe5eb;border-radius:6px;color:#3f607b;font:inherit;font-size:12px;text-decoration:none;cursor:pointer}iframe{display:block;width:100%;height:100vh;max-width:100%;margin:0 auto;border:0;background:white;transition:width 200ms}</style></head><body><header><h1>เข้าห้อง · ตัวอย่างหน้าจอ</h1><p>พรีวิวเลย์เอาต์จากคอมโพเนนต์จริง ใช้ข้อมูลตัวอย่างเพื่อดูหน้าตาเท่านั้น ปุ่มไม่บันทึกข้อมูล กล้องและ GPS ไม่ทำงานในพรีวิวนี้</p><nav>${pages.map(([name,title]) => `<a href="${name}.html" target="preview">${title}</a>`).join('')}<button onclick="document.querySelector('iframe').style.width='390px'">ขนาดมือถือ</button><button onclick="document.querySelector('iframe').style.width='100%'">ขนาดคอมพิวเตอร์</button></nav></header><iframe name="preview" title="ตัวอย่างหน้าจอ" src="login.html"></iframe></body></html>`;
 fs.writeFileSync(path.join(out, 'index.html'), index);
 console.log(`Rendered ${pages.length} screens: ${out}/index.html`);
})().catch(error => { console.error(error); process.exitCode = 1; });
