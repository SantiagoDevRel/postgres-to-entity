import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function verifyJourney(browser,output,origin='http://127.0.0.1:3085'){
 await mkdir(output,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'}),page=await context.newPage(),errors=[],geometry=[];
 page.on('pageerror',error=>errors.push(error.message));
 const nav=n=>page.locator('.step-nav [data-go-step="'+n+'"]');
 const settled=()=>page.waitForFunction(()=>document.querySelector('#state').textContent==='Model ready for review');
 const schemaReady=()=>page.waitForFunction(()=>document.querySelector('#input-status').textContent.startsWith('Schema read.'));
 const build=async()=>{await nav(2).click();await page.locator('#generate').click();await settled();};
 try{
  await page.goto(origin);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await nav(2).isDisabled(),true);assert.equal(await nav(3).isDisabled(),true);
  await page.locator('[data-example="tickets"]').click();await schemaReady();
  assert.equal(await page.locator('.workspace').getAttribute('data-current-step'),'1');
  await page.locator('#analyze').click();assert.equal(await nav(2).getAttribute('aria-current'),'step');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'configure-title');
  await page.locator('#generate').click();await settled();assert.equal(await nav(3).getAttribute('aria-current'),'step');
  assert.equal(await page.locator('#testnet-demo').getAttribute('open'),null);assert.equal(await page.locator('.system-fields').getAttribute('open'),null);
  await page.locator('#testnet-demo>summary').click();
  const edited=JSON.stringify({...JSON.parse(await page.locator('#entity-row').inputValue()),seat_number:27,event_name:'My event'});
  await page.locator('#entity-row').fill(edited);await page.locator('#flag-readonly').selectOption('true');
  await nav(1).click();assert.equal(await page.locator('[data-example="tickets"]').getAttribute('aria-pressed'),'true');
  await page.locator('#analyze').click();await build();
  assert.equal(JSON.parse(await page.locator('#entity-row').inputValue()).seat_number,27);assert.equal(await page.locator('#flag-readonly').inputValue(),'true');
  await nav(2).click();await page.locator('#field-0-2').selectOption('attribute');await settled();
  assert.equal(await nav(2).getAttribute('aria-current'),'step');assert.doesNotMatch(await page.locator('.concept-pair>div').nth(1).textContent(),/seat_number/);
  await nav(3).click();assert.ok(!Object.hasOwn(JSON.parse(await page.locator('#payload-json').textContent()),'seat_number'));
  assert.equal(JSON.parse(await page.locator('#entity-row').inputValue()).seat_number,27);
  assert.equal(await page.locator('#handoff').getAttribute('open'),null);
  await page.locator('#open-deploy').click();assert.equal(await page.locator('#testnet-demo').getAttribute('open'),'');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'entity-row');
  assert.equal(await page.locator('#handoff').getAttribute('open'),null);
  await page.locator('#handoff>summary').click();assert.equal(await page.locator('#handoff').getAttribute('open'),'');
  assert.match(await page.locator('#agent-prompt').inputValue(),/"readonly": true/);assert.ok(!(await page.locator('#agent-prompt').inputValue()).includes('My event'));
  await page.locator('#handoff>summary').click();await page.locator('#testnet-demo>summary').click();
  // Every panel is inspected at every viewport, in both themes.
  for(const theme of ['dark','light']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const width of [320,390,519,520,521,668,669,670,682,683,684,768,1440]){
    await page.setViewportSize({width,height:1000});
    for(const step of [1,2,3]){
     await nav(step).click();
     const probe=await page.evaluate(()=>{
      const panels=[...document.querySelectorAll('[data-step-panel]')].filter(e=>e.getBoundingClientRect().width>0);
      const nav=[...document.querySelectorAll('.step-nav button')].map(e=>e.getBoundingClientRect());
      return {step:document.querySelector('.workspace').dataset.currentStep,overflow:document.documentElement.scrollWidth>innerWidth,panels:panels.length,width:panels[0].getBoundingClientRect().width,navSameRow:nav.every(e=>e.top===nav[0].top),font:getComputedStyle(document.querySelector('#source')).fontFamily};
     });
     assert.equal(probe.overflow,false,JSON.stringify({width,theme,probe}));assert.equal(probe.panels,1);assert.equal(probe.navSameRow,true);assert.match(probe.font,/IBM Plex Mono/);
     geometry.push({width,theme,...probe});
     if([390,768,1440].includes(width)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(output,`journey-${theme}-${width}-step${step}.png`),fullPage:true});}
    }
   }
  }
  await page.evaluate(()=>document.documentElement.style.zoom='2');
  for(const step of [1,2,3]){await nav(step).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(output,'journey-zoom-step'+step+'.png'),fullPage:true});}
  await page.evaluate(()=>document.documentElement.style.zoom='1');
  await nav(2).click();await page.locator('#refine>summary').click();
  const expiration=await page.locator('#policy-0-expiration').inputValue();await page.locator('#policy-0-expiration').fill('2020-01-01T12:00');
  await page.locator('#refine>summary').click();await page.locator('#generate').click();
  assert.equal(await page.locator('#refine').getAttribute('open'),'');assert.equal(await page.evaluate(()=>document.activeElement.id),'policy-0-expiration');
  await page.locator('#policy-0-expiration').fill(expiration);
  // Changed SQL invalidates forward steps and removes the selected example marker.
  await nav(1).click();await page.locator('#source').fill('CREATE TABLE appointments (id UUID PRIMARY KEY, created_at TIMESTAMP);');
  assert.equal(await nav(2).isDisabled(),true);assert.equal(await nav(3).isDisabled(),true);assert.equal(await page.locator('[data-example][aria-pressed="true"]').count(),0);
  await page.locator('#analyze').click();await schemaReady();await page.locator('#field-0-1').selectOption('attribute');await page.waitForFunction(()=>document.querySelector('#state').textContent==='Conversion blocked');
  await nav(3).click();await page.locator('#issues button').first().click();assert.equal(await nav(2).getAttribute('aria-current'),'step');assert.equal(await page.evaluate(()=>document.activeElement.id),'field-0-1');
  await page.locator('#field-0-1').selectOption('payload');await settled();await nav(3).click();
  assert.doesNotMatch(await page.locator('.concept-pair').textContent(),/Friday concert|seat_number/);
  assert.deepEqual(errors,[]);const result={origin,checks:'guided navigation, edits and flags retained, model invalidation, blocker focus, handoff, 78 viewport/theme/step probes, CSS zoom',geometry,errors};await writeFile(join(output,'journey-evidence.json'),JSON.stringify(result,null,2));return result;
 }finally{await context.close();}
}
