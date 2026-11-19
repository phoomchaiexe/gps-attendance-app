import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
export const period = 30;
export function counterAt(now = Date.now()) { return Math.floor(now / 1000 / period); }
// Protocol v1: HMAC-SHA256(secret bytes, UTF8("attendance:v1:" + session UUID + ":") || uint64be(counter)).
// Code is RFC4226 dynamic truncation modulo 10000, padded to four digits. QR uses the same digest.
export function digest(secret, session, counter) {
 const count=Buffer.alloc(8); count.writeBigUInt64BE(BigInt(counter));
 return createHmac('sha256',secret).update(`attendance:v1:${session}:`).update(count).digest();
}
export function codeAt(secret, session, counter) {
 const h=digest(secret,session,counter), offset=h[h.length-1]&15;
 return String((h.readUInt32BE(offset)&0x7fffffff)%10000).padStart(4,'0');
}
export function qrAt(secret,session,counter) { return `${counter}.${digest(secret,session,counter).toString('hex')}`; }
function equal(a,b) { return a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b)); }
export function verify(secret,session,value,method,now=Date.now()) {
 const current=counterAt(now);
 return [current,current-1].some(c=>equal(value,method==='code_gps'?codeAt(secret,session,c):qrAt(secret,session,c)));
}
export function encryptSecret(secret,key) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
 const data=Buffer.concat([cipher.update(secret),cipher.final()]);
 return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),data.toString('base64')].join(':');
}
export function decryptSecret(value,key) {
 const [v,iv,tag,data]=value.split(':'); if(v!=='v1') throw new Error('Secret version');
 const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64'));
 cipher.setAuthTag(Buffer.from(tag,'base64')); return Buffer.concat([cipher.update(Buffer.from(data,'base64')),cipher.final()]);
}
