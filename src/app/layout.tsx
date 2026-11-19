import "./globals.css";
export const metadata = { title: "เช็คชื่อเข้าห้อง", description: "ระบบเช็คชื่อด้วย GPS" };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="th"><body>{children}</body></html>; }