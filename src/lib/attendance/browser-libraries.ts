const pending=new Map<string,Promise<void>>();
export function loadLibrary(src:string) {
 if(!pending.has(src)) pending.set(src,new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=src;script.async=true;const hash=integrity[src];if(hash)script.integrity=hash;script.crossOrigin='anonymous';
  script.onload=()=>resolve();script.onerror=()=>{pending.delete(src);script.remove();reject(new Error('โหลดเครื่องมือไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ต'));};
  document.head.appendChild(script);
 }));
 return pending.get(src)!;
}
export interface Scanner {start(camera:object,config:object,onSuccess:(text:string)=>void,onFailure:()=>void):Promise<void>;stop():Promise<void>;clear():void}
declare global {
 interface Window {
  Html5Qrcode:new(id:string)=>Scanner;
  QRCode:new(element:HTMLElement,options:{text:string;width:number;height:number})=>object;
 }
}
export const scannerLibrary='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
export const qrLibrary='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
// Subresource Integrity: the browser refuses the script if the CDN serves different bytes.
const integrity:Record<string,string>={
 [scannerLibrary]:'sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+',
 [qrLibrary]:'sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU',
};
