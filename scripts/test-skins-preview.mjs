import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const origin = process.env.SKIN_QA_ORIGIN || 'http://127.0.0.1:4326';
const out = resolve(import.meta.dirname, '../.wrangler/skins-qa');
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report = [];
const canvasHash = async view => createHash('sha256').update(await view.locator('canvas').evaluate(c=>c.toDataURL())).digest('hex');
try {
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const page = await browser.newPage({viewport,deviceScaleFactor:viewport.width<500?2:1});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/tienda/skins/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('.skin-product').count(),3);
    for (let index=0;index<3;index++) {
      const view=page.locator('skin-preview').nth(index);
      await view.scrollIntoViewIfNeeded();
      await view.locator('canvas').waitFor();
      await page.waitForFunction(i=>document.querySelectorAll('skin-preview')[i].dataset.ready==='true',index);
      await page.waitForTimeout(150);
      const pixels=await view.locator('canvas').evaluate(canvas=>{
        const gl=canvas.getContext('webgl2'); const rgba=new Uint8Array(canvas.width*canvas.height*4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
        let visible=0,lit=0;
        for(let i=0;i<rgba.length;i+=4)if(rgba[i+3]>0){visible++;if(rgba[i]+rgba[i+1]+rgba[i+2]>60)lit++;}
        return {visible,lit,total:canvas.width*canvas.height,width:canvas.width,height:canvas.height};
      });
      assert(pixels.visible/pixels.total>.03 && pixels.lit/pixels.total>.02,'Blank/untextured canvas');
      const original=await canvasHash(view);
      await view.locator('[data-view=right]').click();await page.waitForTimeout(100);
      assert.notEqual(await canvasHash(view),original,'Rotation must visibly change the model');
      const rotated=await canvasHash(view);
      await view.locator('[data-view=in]').click();await page.waitForTimeout(100);
      assert.notEqual(await canvasHash(view),rotated,'Zoom must visibly change the model');
      await view.locator('[data-view=reset]').click();
      const clipping=await view.evaluate(el=>[...el.querySelectorAll('button')].some(b=>b.getBoundingClientRect().right>el.getBoundingClientRect().right+1));
      assert(!clipping,'Controls clipped');
      report.push({viewport,index,pixels,rotation:true,zoom:true});
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
    assert.deepEqual(errors,[]);
    await page.locator('h1').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:resolve(out,`collection-${viewport.width}.png`),fullPage:true});
    await page.goto(origin+'/tienda/skin-armadura-mewtwo/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('skin-preview')?.dataset.ready==='true');
    await page.waitForTimeout(150);
    assert(await page.locator('#purchase-submit').isDisabled(),'Disabled payments must not accept orders');
    assert((await page.locator('body').textContent()).includes('Pago único'));
    assert(!(await page.locator('.skin-detail').textContent()).includes('Renovación mensual'));
    await page.screenshot({path:resolve(out,`product-${viewport.width}.png`),fullPage:true});
    await page.close();
  }
  const fallback=await browser.newPage();
  await fallback.route('**/models/skins/*.json',r=>r.abort());
  await fallback.goto(origin+'/tienda/skins/');
  await fallback.waitForFunction(()=>[...document.querySelectorAll('skin-preview')].every(e=>e.dataset.failed==='true'));
  assert.equal(await fallback.locator('skin-preview img:visible').count(),3);
  report.push({fallback:true});await fallback.close();
  await writeFile(resolve(out,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:true,checks:report,out},null,2));
} finally { await browser.close(); }
