import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function verifyConcepts(browser,output,origin='http://127.0.0.1:3085') {
  await mkdir(output,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark',hasTouch:true});
  const page=await context.newPage(),errors=[],probes=[];
  page.on('pageerror',e=>errors.push(e.message));
  const trigger=part=>page.getByRole('button',{name:'Preview entity '+part,exact:true});
  const closed=()=>page.waitForFunction(()=>!document.querySelector('.visual-help'));
  const ready=()=>page.waitForFunction(()=>document.querySelector('#state').textContent==='Model ready for review');
  try {
    await page.goto(origin);await page.locator('[data-example="tickets"]').click();
    await page.waitForFunction(()=>document.querySelector('#input-status').textContent.startsWith('Schema read.'));
    await page.locator('#analyze').click();
    // The entire concept area opens the excerpt; it stays available when hovered.
    await page.locator('.concept-pair h3').first().hover();
    await page.locator('.visual-help').waitFor();await page.locator('.visual-help').hover();
    assert.match(await page.locator('.visual-help').textContent(),/Friday concert/);
    await page.keyboard.press('Escape');await closed();await page.mouse.move(0,0);
    await trigger('attributes').focus();await page.locator('.visual-help').waitFor();
    await page.keyboard.press('Escape');await closed();
    await trigger('attributes').press('Enter');await page.locator('.visual-help').waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await trigger('attributes').getAttribute('aria-expanded'),'false');
    assert.equal(await trigger('payload').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('.mini-highlight').getAttribute('data-mini-section'),'payload');
    await page.keyboard.press('Tab');await closed();
    await trigger('payload').tap();await page.locator('.visual-help').waitFor();
    assert.equal(await page.locator('.mini-highlight').getAttribute('data-mini-section'),'payload');
    await page.locator('#configure-title').tap();await closed();
    for(const theme of ['dark','light'])for(const width of [320,390,519,520,521,682,683,684,768,1440]){
      await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      for(const part of ['attributes','payload']){
        await trigger(part).scrollIntoViewIfNeeded();await trigger(part).focus();await trigger(part).press('Enter');
        const probe=await page.locator('.visual-help').evaluate(b=>{
          const r=b.getBoundingClientRect(),a=b.querySelector('[data-mini-section=attributes]').getBoundingClientRect(),p=b.querySelector('[data-mini-section=payload]').getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,vertical:a.bottom<=p.top,overflow:document.documentElement.scrollWidth>innerWidth,innerOverflow:b.scrollWidth>b.clientWidth,font:getComputedStyle(b).fontFamily,fontSize:getComputedStyle(b).fontSize,viewWidth:innerWidth,viewHeight:innerHeight};
        });
        assert.ok(probe.left>=0&&probe.right<=width+1&&probe.top>=0&&probe.bottom<=1001,JSON.stringify(probe));
        assert.equal(probe.vertical,true);assert.equal(probe.overflow,false);assert.equal(probe.innerOverflow,false);assert.equal(probe.fontSize,'14px');assert.match(probe.font,/IBM Plex Mono/);
        probes.push({theme,width,part,...probe});
        if([390,768,1440].includes(width))await page.screenshot({path:join(output,`${theme}-${width}-${part}.png`)});
        await page.keyboard.press('Escape');await closed();
      }
    }
    await page.setViewportSize({width:768,height:1000});await page.evaluate(()=>document.documentElement.style.zoom='2');
    await trigger('payload').scrollIntoViewIfNeeded();await trigger('payload').press('Enter');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:join(output,'zoom-200.png')});await page.keyboard.press('Escape');
    await page.evaluate(()=>document.documentElement.style.zoom='1');
    // Replacing a preview must not leave old hover listeners or stale field content.
    await page.locator('#field-0-1').selectOption('payload');await ready();
    await trigger('payload').focus();await trigger('payload').press('Enter');
    assert.match(await page.locator('.mini-entity pre').textContent(),/event_name/);
    assert.doesNotMatch(await page.locator('.mini-entity dl').textContent(),/event_name/);
    assert.equal(await page.locator('.visual-help').count(),1);
    await page.keyboard.press('Escape');await page.locator('#generate').click();await ready();
    assert.equal(await page.locator('#handoff').getAttribute('open'),null);
    await page.locator('#open-deploy').click();
    assert.equal(await page.locator('#testnet-demo').getAttribute('open'),'');
    assert.equal(await page.locator('#handoff').getAttribute('open'),null);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'entity-row');
    assert.equal(await page.locator('#deploy-consent').isChecked(),false);
    await page.screenshot({path:join(output,'deploy-review.png')});
    assert.deepEqual(errors,[]);
    const result={origin,checks:'hover, keyboard, touch, Escape, excerpt updates, primary deploy opens review, handoff closed, 40 geometry/theme probes, CSS zoom 200%',probes,errors};
    await writeFile(join(output,'concept-evidence.json'),JSON.stringify(result,null,2));return result;
  } finally { await context.close(); }
}
