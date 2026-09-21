import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv as parse } from 'node:util';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(web, '..');
const known = [];
for (const file of [resolve(root, 'discord-bot/.env'), resolve(web, 'worker/.dev.vars'), resolve(web, '.wrangler/operations.env')]) {
  try { for (const [name, value] of Object.entries(parse(readFileSync(file, 'utf8')))) if (/TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY/.test(name) && value.length >= 16 && !/^(test|example|change|replace|your|dummy|local)/i.test(value)) known.push({name,value}); } catch {}
}
const patterns = [
  ['DISCORD_TOKEN', /\b(?:[MN][A-Za-z0-9_-]{22,29}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,110}|mfa\.[A-Za-z0-9_-]{60,})\b/g],
  ['GITHUB_TOKEN', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{70,255})\b/g],
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/g],
  ['CREDENTIAL_ASSIGNMENT', /\b(?:DISCORD_TOKEN|PEBBLE_API_KEY|TEBEX_PRIVATE_KEY|(?:CLOUDFLARE|CF)_API_TOKEN|[A-Z0-9_]*(?:PASSWORD|SECRET|SERVER_TOKEN))\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{24,})/g],
];
const textFile = p => /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.dev\.vars)$|\.(?:ts|tsx|js|mjs|cjs|json|md|yml|yaml|toml|properties|ini|conf|config|ps1|sh|bat|cmd|txt|log|sql|kt|java|xml|html|astro)$/i.test(p);
const findings = [];
function scan(text, file, where, repo) {
  if (text.includes('\0')) return;
  const seen = new Set();
  for (const secret of known) if (text.includes(secret.value)) seen.add(`KNOWN_${secret.name}`);
  for (const [rule, expression] of patterns) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      const value = match[1] || match[0];
      if (rule === 'CREDENTIAL_ASSIGNMENT' && (/^(?:test|example|change|replace|your|dummy|process\.|env\.|config\.|development|placeholder)|\$\{|EXAMPLE|REPLACE|CHANGE|(?:x{8})/i.test(value) || new Set(value).size < 9)) continue;
      seen.add(rule);
    }
  }
  for (const rule of seen) findings.push({repo:repo===web?'web':'root',file,where,rule});
}
for (const repo of [root,web]) {
  const git = (args, input) => execFileSync('git', args, {cwd:repo,input,encoding:'utf8',maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe']});
  const tracked = git(['ls-files','-z']).split('\0').filter(p=>p&&textFile(p));
  let current=0,history=0,skipped=0;
  for(const file of tracked)try { if(statSync(resolve(repo,file)).size>2*1024*1024){skipped++;continue;}scan(readFileSync(resolve(repo,file),'utf8'),file,'worktree',repo);current++; }catch{}
  const objects=git(['rev-list','--objects','--all']).split('\n').map(line=>{const n=line.indexOf(' ');return {hash:line.slice(0,n),file:line.slice(n+1)};}).filter(x=>/^[a-f0-9]{40}$/.test(x.hash)&&textFile(x.file));
  const metadata=git(['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],objects.map(o=>o.hash).join('\n')+'\n').trim().split('\n');
  const blobs=objects.filter((o,i)=>{const [,type,size]=metadata[i].split(' ');if(type!=='blob')return false;if(Number(size)>2*1024*1024){skipped++;return false;}return true;});
  for(let offset=0;offset<blobs.length;offset+=25){
    const batch=blobs.slice(offset,offset+25);
    const output=execFileSync('git',['cat-file','--batch'],{cwd:repo,input:batch.map(o=>o.hash).join('\n')+'\n',maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});
    let at=0;
    for(const item of batch){const newline=output.indexOf(10,at);const length=Number(output.subarray(at,newline).toString().split(' ')[2]);at=newline+1;
      scan(output.subarray(at,at+length).toString('utf8'),item.file,`blob:${item.hash}`,repo);at+=length+1;history++;}
  }
  console.log(JSON.stringify({repo:repo===web?'web':'root',trackedTextFiles:current,historyBlobs:history,skippedLarge:skipped}));
}
// Never print matching text, secret values or source lines.
const distinct=[...new Map(findings.map(f=>[`${f.repo}:${f.file}:${f.where}:${f.rule}`,f])).values()];
console.log(JSON.stringify({findings:distinct},null,2));
if(distinct.length)process.exitCode=2;
