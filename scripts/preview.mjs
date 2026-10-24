import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4177);
const url=`http://localhost:${port}`;
let running=false;
try { const response=await fetch(url,{signal:AbortSignal.timeout(1500)}); const html=await response.text(); if(!html.includes('data-catalog-prerendered="true"') || !html.includes('name="chalpick-build" content="v10-20261024"')) throw new Error('Port already used by a different app'); running=true; }
catch(error) { if(error.message==='Port already used by a different app') { console.error('같은 포트에 이전 미리보기가 열려 있습니다. 이전 서버를 종료하거나 다른 PORT로 실행해주세요.'); process.exit(1); } }
if(!running){ await import('./build.mjs'); const child=spawn(process.execPath,['scripts/server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},detached:true,stdio:'ignore',windowsHide:true}); child.unref(); for(let attempt=0;attempt<20;attempt++){try{await fetch(url);running=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,150));}} }
if(!running)throw new Error('미리보기 서버를 시작하지 못했습니다.');
const opener=spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'});
opener.unref();
console.log(url);
