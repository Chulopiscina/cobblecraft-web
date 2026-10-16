import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,symlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const web=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const git=args=>execFileSync('git',args,{cwd:web,encoding:'utf8'}).trim();
const commit=git(['rev-parse','HEAD']);
const parent=join(web,'.wrangler','subscription-worker');await mkdir(parent,{recursive:true});
const stage=await mkdtemp(join(parent,'release-'));
const files=git(['ls-tree','-r','--name-only',commit,'--','worker/src','worker/migrations','worker/wrangler.toml','worker/package.json','shared','store']).split('\n');
for(const path of files) {
  const dest=join(stage,path);await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,execFileSync('git',['show',`${commit}:${path}`],{cwd:web,maxBuffer:16*1024*1024}));
}
await symlink(join(web,'node_modules'),join(stage,'node_modules'),process.platform==='win32'?'junction':'dir');
const wrangler=join(web,'node_modules/wrangler/bin/wrangler.js');
const run=args=>execFileSync(process.execPath,[wrangler,...args],{cwd:join(stage,'worker'),stdio:'inherit',env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
// Only our additive migration. Never apply another task's pending migrations or dirty code.
if(!process.argv.includes('--deploy')) {
  run(['deploy','--dry-run','--outdir',join(stage,'built')]);
  console.log(`CHECK OK ${commit} ${stage}`);
} else {
  if (!process.argv.includes('--catalog-only')) run(['d1','execute','cobblemon_store','--remote','--file','migrations/0008_subscriptions.sql']);
  run(['deploy','--keep-vars']);
  const origin='https://cobblemon-server-store.cobblemon-server.workers.dev';
  for(const [path,expected] of [['/api/health',200],['/api/store/status',200],['/api/delivery/subscriptions',401]]) {
    const r=await fetch(origin+path,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(r.status!==expected)throw Error(`${path}: HTTP ${r.status}, expected ${expected}`);
    if(path==='/api/store/status'&&(await r.json()).checkoutAvailable!==false)throw Error('Checkout must remain closed until private setup is verified.');
    console.log(`VERIFIED ${path} HTTP ${r.status}`);
  }
  await writeFile(join(stage,'verification.json'),JSON.stringify({commit,verifiedAt:new Date().toISOString(),checkoutAvailable:false},null,2));
}
