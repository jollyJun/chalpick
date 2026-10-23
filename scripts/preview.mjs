import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const url='http://localhost:4173';
let running=false;
try { const response=await fetch(url,{signal:AbortSignal.timeout(1500)}); const html=await response.text(); if(!html.includes('YOUR NEXT STORY')) throw new Error('Port already used by a different app'); running=true; }
catch(error) { if(error.message==='Port already used by a different app') { console.error('Port 4173 is already used. Run with a different PORT.'); process.exit(1); } }
if(!running){ const child=spawn(process.execPath,['scripts/server.mjs'],{cwd:root,detached:true,stdio:'ignore',windowsHide:true}); child.unref(); for(let attempt=0;attempt<20;attempt++){try{await fetch(url);break;}catch{await new Promise(resolve=>setTimeout(resolve,150));}} }
const opener=spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'});
opener.unref();
console.log(url);
