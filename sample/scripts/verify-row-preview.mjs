import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function verifyRowPreview(browser,output,origin='http://127.0.0.1:3085') {
 await mkdir(output,{recursive:true});const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'}),page=await context.newPage(),errors=[],probes=[];
 page.on('pageerror',error=>errors.push(error.message));
 const nav=n=>page.locator('.step-nav [data-go-step="'+n+'"]');
 const ready=()=>page.waitForFunction(()=>document.querySelector('#state').textContent==='Model ready for review');
 const parse=selector=>page.locator(selector).textContent().then(JSON.parse);
 try {
  await page.goto(origin);await page.locator('[data-example="tickets"]').click();
  await page.waitForFunction(()=>document.querySelector('#input-status').textContent.startsWith('Schema read.'));
  await page.locator('#source').fill('CREATE TABLE tickets (id UUID PRIMARY KEY, event_name VARCHAR(24), seat_number INTEGER, used BOOLEAN, buyer_email TEXT);');
  await page.locator('#analyze').click();await page.locator('#field-0-1').selectOption('attribute');await ready();
  await page.locator('#generate').click();await ready();
  assert.match(await page.locator('.creation-flags dt').textContent(),/🚩/);
  assert.equal(await page.locator('.creation-flags dt span').getAttribute('aria-hidden'),'true');
  await page.locator('#open-deploy').click();
  const row=JSON.parse(await page.locator('#entity-row').inputValue());Object.assign(row,{buyer_email:'test@gmail.com',event_name:'My workshop',seat_number:27,used:false});
  await page.locator('#entity-row').fill(JSON.stringify(row,null,2));
  assert.match(await page.locator('#row-attributes').textContent(),/My workshop/);
  assert.doesNotMatch(await page.locator('#row-attributes').textContent(),/buyer_email/);
  assert.equal((await parse('#row-payload')).buyer_email,'test@gmail.com');
  assert.equal((await parse('#row-payload')).seat_number,27);
  assert.ok(!Object.hasOwn(await parse('#row-payload'),'event_name'));
  await page.locator('#deploy-consent').check();
  await page.locator('#entity-row').fill('{ broken');
  assert.equal(await page.locator('#row-mapping').isVisible(),false);assert.equal(await page.locator('#row-attributes').count(),0);
  assert.equal(await page.locator('#deploy').isDisabled(),true);assert.equal(await page.locator('#deploy-consent').isChecked(),false);
  await page.locator('#entity-row').fill(JSON.stringify(row,null,2));
  await nav(2).click();await page.locator('#field-0-4').selectOption('attribute');await ready();await nav(3).click();
  assert.match(await page.locator('#row-attributes').textContent(),/test@gmail.com/);
  assert.ok(!Object.hasOwn(await parse('#row-payload'),'buyer_email'));
  assert.equal(JSON.parse(await page.locator('#entity-row').inputValue()).buyer_email,'test@gmail.com');
  // User-visible destinations agree with the same encoder output consumed by createEntity.
  const full=await parse('#transaction-preview');assert.deepEqual(await parse('#row-payload'),full.payload);
  assert.equal(await page.locator('#row-attributes>div').count(),Object.keys(full.attributes).length);
  await nav(2).click();await page.locator('#field-0-4').selectOption('exclude');await ready();await nav(3).click();
  assert.doesNotMatch(await page.locator('#row-mapping').textContent(),/buyer_email|test@gmail.com/);
  for(const theme of ['dark','light'])for(const width of [320,390,519,520,521,682,683,684,768,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await page.locator('#row-mapping').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
   const probe=await page.locator('#row-mapping').evaluate(e=>({overflow:document.documentElement.scrollWidth>innerWidth,innerOverflow:e.scrollWidth>e.clientWidth,font:getComputedStyle(e.querySelector('pre')).fontFamily,codeSize:getComputedStyle(e.querySelector('pre')).fontSize}));
   assert.equal(probe.overflow,false);assert.equal(probe.innerOverflow,false);assert.match(probe.font,/IBM Plex Mono/);assert.equal(probe.codeSize,'14px');probes.push({theme,width,...probe});
   if([390,768,1440].includes(width))await page.screenshot({path:join(output,`${theme}-${width}.png`)});
  }
  await page.setViewportSize({width:768,height:1000});await page.evaluate(()=>document.documentElement.style.zoom='2');await page.locator('#row-mapping').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(output,'zoom-200.png')});
  await page.evaluate(()=>document.documentElement.style.zoom='1');await page.locator('.creation-flags').scrollIntoViewIfNeeded();await page.screenshot({path:join(output,'flags.png')});
  assert.deepEqual(errors,[]);const result={origin,checks:'flag icon, edited values, attribute/payload/exclude moves, malformed JSON removes stale preview, review reset, 20 theme/viewport probes, zoom 200%',probes,errors};
  await writeFile(join(output,'row-preview-evidence.json'),JSON.stringify(result,null,2));return result;
 } finally {await context.close();}
}
