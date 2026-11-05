import { cpSync, mkdirSync, copyFileSync, existsSync, rmSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root,'dist');
if (!existsSync(path.join(root,'node_modules','leaflet','dist','leaflet.js'))) throw new Error('먼저 npm ci로 의존성을 설치해주세요.');
// Only replace this project's generated output; never follow a linked directory.
if(path.dirname(dist)!==root||path.basename(dist)!=='dist')throw Error('빌드 출력 경로가 올바르지 않습니다.');
if(existsSync(dist)){if(lstatSync(dist).isSymbolicLink())throw Error('dist가 링크입니다. 실제 프로젝트 출력 폴더를 사용해주세요.');rmSync(dist,{recursive:true});}
mkdirSync(dist,{recursive:true});
cpSync(path.join(root,'public'),dist,{recursive:true});
cpSync(path.join(root,'node_modules','leaflet','dist'),path.join(dist,'vendor'),{recursive:true});
copyFileSync(path.join(root,'supabase','schema.sql'),path.join(dist,'setup.sql'));
copyFileSync(path.join(root,'supabase','ai.sql'),path.join(dist,'setup-ai.sql'));
copyFileSync(path.join(root,'node_modules','leaflet','LICENSE'),path.join(dist,'vendor','LICENSE'));
console.log('Vercel 정적 화면 준비 완료 · dist (비밀 키와 로컬 데이터 제외)');
