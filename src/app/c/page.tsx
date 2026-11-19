import { CheckIn } from '@/components/check-in';
export default async function Page({searchParams}:{searchParams:Promise<{session?:string;token?:string}>}) { const p=await searchParams;return <CheckIn sessionId={p.session??''} token={p.token}/>; }
