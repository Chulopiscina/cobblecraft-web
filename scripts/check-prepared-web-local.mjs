import { LinkChecker } from 'linkinator';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin='http://127.0.0.1:4386';
const checker=new LinkChecker();
const result=await checker.check({path:`${origin}/guia/`,recurse:true,concurrency:6,timeout:20000,
  linksToSkip:async link=>new URL(link).origin!==origin});
const checked=result.links.filter(link=>link.state!=='SKIPPED');
const broken=checked.filter(link=>link.state==='BROKEN');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const qa=resolve(root,'dist/qa/dark-market-0.18.11.86/web');
await mkdir(qa,{recursive:true});
await writeFile(resolve(qa,'links.json'),JSON.stringify({origin,checked:checked.length,broken,links:checked},null,2)+'\n');
console.log(JSON.stringify({checked:checked.length,broken},null,2));
assert(checked.length>100,'Crawler did not inspect the local site');
assert.equal(broken.length,0,'Local internal links/assets failed');
