import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../../apps/api/src/app.ts';
import { hashOpaqueValue, sessionCsrfToken } from '../../apps/api/src/security.ts';
import { deliverOutbox, recoverExpiredOutbox } from '../../apps/worker/src/outbox.ts';

const uid = (suffix: number) => `01988c36-6880-7000-8000-${String(suffix).padStart(12, '0')}`;
let time = new Date('2026-09-25T00:00:00Z');
const hashKey = Buffer.alloc(32,1);
const sessionId = uid(4);
let identity = {
  userId: uid(1), username: 'admin', displayName: 'QC Admin', passwordHash: 'unused',
  passwordChangedAt: new Date('2026-09-24T00:00:00Z'), userStatus: 'active',
  membershipId: uid(2), role: 'super_admin', permissionOverrides: {grant: [], deny: []},
  tenantId: uid(3), tenantSlug: 'qc-tenant', tenantName: 'QC', tenantStatus: 'active',
  sessionId, sessionCreatedAt: time, expiresAt: new Date(time.getTime()+8*3600000),
  idleExpiresAt: new Date(time.getTime()+30*60000), revokedAt: null,
  csrfSecretHash: hashOpaqueValue(sessionCsrfToken(hashKey, sessionId))
};
let waState = {adapter:'baileys', state:'connected', connectedAt: time,
  lastHeartbeatAt:time, lastErrorCode:null, revision:0, updatedAt:time};
let disconnectCalls = 0;
let reconnectCalls = 0;
const repository:any = {
  findSession: async () => ({...identity}),
  touchSession: async (_:string, expires:Date) => {identity.idleExpiresAt=expires},
  ping: async () => {},
  getWhatsAppState: async () => ({...waState}),
  updateWhatsAppState: async (input:any) => {waState={...waState,state:input.state,revision:waState.revision+1};return waState},
  getSafetyState: async () => ({sendingPaused:false,killSwitch:false,revision:0,riskLevel:'low'}),
  updateSafetyState: async () => ({sendingPaused:true,killSwitch:false,revision:1,updatedAt:time})
};
// Restrict optional health probes to this isolated fixture rather than live services.
process.env.REDIS_HOST='127.0.0.1';
const server=createServer(createApp({repository,hashKey,production:false,now:()=>time,
  storageProbe:async()=>{},whatsappSessionController:{disconnect:async()=>{disconnectCalls++},reconnect:async()=>{reconnectCalls++}}
}));
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address() as any;
const origin=`http://127.0.0.1:${address.port}`;
process.env.WORKER_HEALTH_URL=`${origin}/health/live`;
process.env.WHATSAPP_HEALTH_URL=`${origin}/health/live`;
const cookie='raho_session=isolated-qc-fixture';
const get=(path:string,activity=false)=>fetch(origin+path,{headers:{cookie,...(activity?{'x-session-activity':'1'}:{})}});
const post=(path:string,token:string,body:unknown)=>fetch(origin+path,{method:'POST',headers:{cookie,'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(body)});
try {
  const a=await (await get('/api/admin/v1/me')).json();
  const b=await (await get('/api/admin/v1/me')).json();
  assert.equal(a.data.csrfToken,b.data.csrfToken);
  const firstTabMutation=await post('/api/admin/v1/safety/pause',a.data.csrfToken,{expectedRevision:0,reason:'isolated QC check'});
  assert.equal(firstTabMutation.status,200);
  console.log(JSON.stringify({check:'two_tabs_csrf',tabAAfterTabBStatus:firstTabMutation.status,tokensMatch:true}));
  const reset=await post('/api/admin/v1/session/reset',b.data.csrfToken,{expectedRevision:0,reason:'isolated QC check',confirmation:'RESET SESI'});
  assert.equal(reset.status,200);assert.equal(waState.state,'logged_out');assert.equal(disconnectCalls,0);assert.equal(reconnectCalls,0);
  console.log(JSON.stringify({check:'session_reset',status:reset.status,state:waState.state,disconnectCalls,reconnectCalls}));
  const activity:number[]=[];
  for (const minute of [10,20,29,31]) {
    time=new Date(`2026-09-25T00:${minute}:00Z`);
    activity.push((await get('/api/admin/v1/session',true)).status);
  }
  assert.deepEqual(activity,[200,200,200,200]);
  console.log(JSON.stringify({check:'active_session_idle_expiry',requestMinutes:[10,20,29,31],statuses:activity}));
} finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}

let clock=new Date('2026-09-25T01:00:00Z');
const row:any={id:uid(10),tenantId:uid(3),messageId:uid(11),status:'queued',attemptCount:0,maxAttempts:5,
  availableAt:clock,leaseExpiresAt:null,message:{content:'isolated fake message',conversation:{channel:'whatsapp',contact:{id:uid(12),providerJid:'6281234567890@s.whatsapp.net'}}}};
let unblock!:()=>void;let reached!:()=>void;
const stalled=new Promise<void>(resolve=>unblock=resolve);
const reachedGate=new Promise<void>(resolve=>reached=resolve);
let stateReads=0;
const apply=(data:any)=>{for(const [k,v] of Object.entries(data))row[k]=typeof v==='object'&&v!==null&&'increment' in v?row[k]+(v as any).increment:v};
const matches=(where:any)=>{
  if(where.status && typeof where.status==='string' && row.status!==where.status)return false;
  if(where.status?.in && !where.status.in.includes(row.status))return false;
  if(where.availableAt?.lte && row.availableAt>where.availableAt.lte)return false;
  if(where.leaseExpiresAt?.lt && (!row.leaseExpiresAt||row.leaseExpiresAt>=where.leaseExpiresAt.lt))return false;
  return true;
};
const prisma:any={
  outboxMessage:{
    findFirst:async({where}:any)=>matches(where)?structuredClone(row):null,
    findMany:async({where}:any)=>matches(where)?[structuredClone(row)]:[],
    updateMany:async({where,data}:any)=>{if(!matches(where))return {count:0};apply(data);return {count:1}},
    update:async({data}:any)=>{apply(data);return structuredClone(row)}
  },
  message:{update:async()=>{}},messageEvent:{create:async()=>{}},contact:{update:async()=>{}},
  whatsAppSessionState:{findUnique:async()=>{stateReads++;if(stateReads===1){reached();await stalled}return {state:'connected'}}}
};
prisma.$transaction=async(fn:any)=>fn(prisma);
const sends:string[]=[];
const provider={send:async(input:any)=>{sends.push(input.deliveryAttemptId);return {providerMessageId:`fake-${sends.length}`}}};
const job:any={kind:'outbound.delivery',tenantId:uid(3),outboxMessageId:uid(10)};
const a=deliverOutbox(prisma,provider,job,'worker-a',()=>clock);
await reachedGate;
clock=new Date(clock.getTime()+31_000);
const recovered=await recoverExpiredOutbox(prisma,clock);
const b=await deliverOutbox(prisma,provider,job,'worker-b',()=>clock);
unblock();const aResult=await a;
assert.equal(recovered.retryable,1);assert.equal(sends.length,2);
console.log(JSON.stringify({check:'expired_lease_stale_worker',recovered,workerB:b.status,workerA:aResult.status,providerSendCount:sends.length}));
