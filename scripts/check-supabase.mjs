import { createClient } from '@supabase/supabase-js';
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){console.error('Supabase 연결 설정이 없습니다. .env의 URL과 서버 전용 키를 설정해주세요.');process.exit(1);}
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}});
let failed=false;
for(const table of ['travel_profiles','travel_workspaces','travel_invites']){
 try{const {error}=await client.from(table).select('id').limit(0).retry(false);if(error){failed=true;console.log(`${table}: ${['42P01','PGRST205'].includes(error.code)?'아직 테이블이 없습니다. supabase/schema.sql을 실행하세요.':'연결 확인 실패 — 프로젝트 상태와 URL·서버 키를 확인하세요.'}`);}else console.log(`${table}: 준비 완료`);}catch{failed=true;console.log(`${table}: 서버 연결 실패`);}
}
if(!failed){const {error}=await client.rpc('travel_command',{p_action:'check',p_actor:null});if(error?.message?.includes('TRAVEL_UNAUTHORIZED'))console.log('travel_command: 준비 완료 (미인증 요청 거부 확인)');else{failed=true;console.log('travel_command: 함수 또는 권한 설정을 확인하세요.');}}
console.log('비밀 키와 회원·여행 데이터는 출력하지 않았습니다.');process.exitCode=failed?1:0;
