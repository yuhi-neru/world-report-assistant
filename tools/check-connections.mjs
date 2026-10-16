import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const binary=path.join(root,'src-tauri/target/release/world-review-assistant.exe');
const checks={};
for(const action of ['check-blog','check-photo']){
 const result=spawnSync(binary,['--cli',action],{cwd:root,windowsHide:true,encoding:'utf8',timeout:45000});
 checks[action]=result.status===0?JSON.parse(result.stdout):{ok:false,message:result.stderr?.trim()||'接続を確認できませんでした'};
}
const report={checkedAt:new Date().toISOString(),readOnly:true,checks};
await writeFile(path.join(root,'artifacts/connection-validation.json'),JSON.stringify(report,null,2),'utf8');
console.log(JSON.stringify(report,null,2));
if(Object.values(checks).some(c=>!c.ok))process.exitCode=1;
