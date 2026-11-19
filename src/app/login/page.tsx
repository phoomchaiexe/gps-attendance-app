import { Login } from '@/components/login';
export default async function Page({searchParams}:{searchParams:Promise<{next?:string}>}) {const p=await searchParams;return <Login next={p.next}/>;}
