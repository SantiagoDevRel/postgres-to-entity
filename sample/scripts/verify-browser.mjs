import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAbi,parseAbiParameters,decodeFunctionData,decodeAbiParameters,encodeEventTopics,encodeAbiParameters,hexToString,toHex } from 'viem';
import {ENTITY_EVENTS_ABI,predictEntityKey} from '@arkiv-network/sdk';

// Host-provided Playwright, isolated wallet and intercepted RPC. Never uses a real account.
export async function verifyBrowser(hostPage,output,origin='http://127.0.0.1:3085'){
 await mkdir(output,{recursive:true});
 const context=await hostPage.context().browser().newContext({viewport:{width:1440,height:1000},colorScheme:'dark',hasTouch:true,permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();const errors=[],geometry=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 const address='0x1111111111111111111111111111111111111111',registry='0x4400000000000000000000000000000000000044',hash='0x'+'22'.repeat(32),blockHash='0x'+'33'.repeat(32);
 let expectedFlags=0;let includeEmail=false;let funds=true,reject=false,chain='0x7614d1',sent=0,stored,receipt,brokenReceipt=false;
 const rpc=async({method,params=[]})=>{
  calls.push(method);
  if(method==='eth_chainId')return '0x7614d1';
  if(method==='eth_getTransactionReceipt')return receipt;
  if(method==='eth_getBalance')return funds?'0xde0b6b3a7640000':'0x0';
  if(method==='arkiv_query'){assert.ok(stored);assert.match(params[0],new RegExp(stored.key));return {data:[stored],blockNumber:'0x101'};}
  throw Error('Unexpected public RPC '+method);
 };
 await context.route('https://rpc.tiramisu.db-chain.testnet.arkiv.network/**',async route=>{
  const body=route.request().postDataJSON();const reply=async x=>({jsonrpc:'2.0',id:x.id,result:await rpc(x)});
  await route.fulfill({contentType:'application/json',body:JSON.stringify(Array.isArray(body)?await Promise.all(body.map(reply)):await reply(body))});
 });
 await context.exposeFunction('fixtureRequest',async({method,params=[]})=>{try{
  calls.push(method);
  if(method==='eth_chainId')return chain;
  if(method==='eth_requestAccounts'||method==='eth_accounts')return [address];
  if(method==='wallet_switchEthereumChain'){chain=params[0].chainId;return null;}
  if(method==='eth_blockNumber')return '0x100';
  if(method==='eth_getTransactionReceipt')return brokenReceipt?{...receipt,logs:[]}:receipt;
  if(method==='eth_sendTransaction'){
   if(reject)return {fixtureError:4001};
   assert.equal(params[0].from.toLowerCase(),address);assert.equal(params[0].to.toLowerCase(),registry);
   const decoded=decodeFunctionData({abi:parseAbi(['function execute((uint8 operation, bytes operationData)[] ops) returns (bytes32[] keys)']),data:params[0].data});
   assert.equal(decoded.args[0].length,1);assert.equal(decoded.args[0][0].operation,1);
   const [creation]=decodeAbiParameters(parseAbiParameters('(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, (bytes32 name, uint8 typeId, bytes value)[] attributes)'),decoded.args[0][0].operationData);
   assert.equal(creation.creationFlags,expectedFlags);assert.ok(creation.expiresAt>256n);assert.equal(creation.minLifetime,0n);
   const key=predictEntityKey({chainId:7738577,owner:address,nonce:0n,salt:creation.salt});
   const cells=creation.attributes.map(a=>({...a,name:hexToString(a.name).replace(/\0+$/,'')}));
   const payload=cells.find(a=>a.name==='$payload').value;const decodedPayload=JSON.parse(hexToString(payload));
   assert.deepEqual(Object.keys(decodedPayload),['id','seat_number']);assert.equal(decodedPayload.seat_number,12);
   assert.equal(cells.some(a=>a.name==='buyer_email'),includeEmail);if(includeEmail)assert.equal(hexToString(cells.find(a=>a.name==='buyer_email').value),'test@gmail.com');
   const attributes=cells.filter(a=>!a.name.startsWith('$')).map(a=>({name:a.name,type:a.typeId===1?'bool':'str',value:a.typeId===1?BigInt(a.value)!==0n:hexToString(a.value)}));
   assert.equal(attributes.find(a=>a.name==='event_name').value,'Friday concert');
   stored={key,owner:address,creator:address,createdAt:'0x101',updatedAt:'0x101',expiresAt:toHex(creation.expiresAt),creationFlags:creation.creationFlags,contentType:'application/json',attributes,payload};
   const log={address:registry,topics:encodeEventTopics({abi:ENTITY_EVENTS_ABI,eventName:'EntityCreated',args:{entityKey:key,owner:address}}),data:encodeAbiParameters(parseAbiParameters('uint64,uint8'),[creation.expiresAt,creation.creationFlags]),blockHash,blockNumber:'0x101',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x0',removed:false};
   receipt={transactionHash:hash,transactionIndex:'0x0',blockHash,blockNumber:'0x101',from:address,to:registry,cumulativeGasUsed:'0x100',gasUsed:'0x100',effectiveGasPrice:'0x1',contractAddress:null,logs:[log],logsBloom:'0x'+'00'.repeat(256),status:'0x1',type:'0x2'};
   sent++;return hash;
  }
  throw Error('Unexpected wallet method '+method);
 }catch(e){console.error('FIXTURE ERROR',e.message);throw e;}
 });
 const inject=()=>page.evaluate(()=>{
  const handlers={};window.ethereum={request:async args=>{const value=await window.fixtureRequest(args);if(value?.fixtureError)throw Object.assign(new Error('User rejected the request.'),{code:value.fixtureError});return value;},on:(name,fn)=>{handlers[name]=fn;}};window.fixtureEmit=(name,...args)=>handlers[name]?.(...args);
 });
 // Navigate through visible step controls, then open details as a person would.
 const visit=async step=>{if(await page.locator('.workspace').getAttribute('data-current-step')!==String(step))await page.locator('.step-nav [data-go-step="'+step+'"]').click();};
 const reveal=async selector=>{
  const target=page.locator(selector).first();if(!await target.count())return;
  const step=await target.evaluate(e=>e.closest('[data-step-panel]')?.dataset.stepPanel);
  if(step)await visit(Number(step));
  for(const details of (await target.locator('xpath=ancestor::details').all()).reverse()){
   const isSummary=await target.evaluate((e,parent)=>e.tagName==='SUMMARY'&&e.parentElement===parent,await details.elementHandle());
   if(!isSummary&&await details.getAttribute('open')===null)await details.locator(':scope > summary').click();
  }
 };
 const ready=()=>page.waitForFunction(()=>document.querySelector('#input-status').textContent.startsWith('Schema read.'));
 const example=async name=>{await visit(1);await page.locator('[data-example="'+name+'"]').click();await ready();};
 const build=async()=>{await reveal('#generate');await page.locator('#generate').click();await page.waitForFunction(()=>!document.querySelector('.result-panel').hidden&&document.querySelector('#state').textContent!=='Processing…');};
 const shot=async(name,selector)=>{if(name.includes('source'))await visit(1);if(selector){await reveal(selector);await page.locator(selector).evaluate(e=>e.scrollIntoView({block:'start'}));}await page.screenshot({path:join(output,name+'.png'),fullPage:!selector});};
 try{
  await page.goto(origin);await page.evaluate(()=>document.fonts.ready);
  assert.match(await page.title(),/POSTGRES-TO-ENTITY/);assert.equal(await page.locator('#format,#question').count(),0);
  await reveal('#connect-wallet');await page.locator('#connect-wallet').click();assert.match(await page.locator('#wallet-status').textContent(),/EVM wallet/);
  await reveal('[data-example="tickets"]');await page.locator('[data-example="tickets"]').click();await ready();
  await visit(2);assert.equal(await page.locator('.concept-pair>div').count(),2);assert.match(await page.locator('.concept-pair').textContent(),/Attributes/);assert.match(await page.locator('.concept-pair').textContent(),/Payload/);
  assert.equal(await page.locator('#policy-0-owner option').count(),2);assert.equal(await page.locator('#policy-0-expiration').getAttribute('type'),'datetime-local');
  await build();assert.equal(await page.locator('#state').textContent(),'Model ready for review');
  assert.deepEqual(Object.keys(JSON.parse(await page.locator('#payload-json').textContent())),['id','seat_number']);
  await reveal('#handoff>summary');await page.locator('#handoff>summary').click();await reveal('#copy');await page.locator('#copy').click();const copied=(await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n');assert.equal(copied,await page.locator('#agent-prompt').inputValue());assert.ok(!copied.includes('Friday concert'));
  const download=page.waitForEvent('download');await reveal('#json');await page.locator('#json').click();await (await download).saveAs(join(output,'postgres-model.json'));await reveal('#handoff>summary');await page.locator('#handoff>summary').click();
  await reveal('#field-0-2');await page.locator('#field-0-2').selectOption('attribute');await page.waitForFunction(()=>document.querySelector('#state').textContent==='Model ready for review');
  const numericGuide=page.locator('.field-choice').filter({has:page.locator('#field-0-2')}).locator('.field-filters');await numericGuide.locator('summary').click();assert.equal(await numericGuide.locator('li').count(),7);
  assert.equal(await page.locator('.field-choice').filter({has:page.locator('#field-0-1')}).locator('.field-filters li').count(),3);
  assert.equal(await page.locator('.field-choice').filter({has:page.locator('#field-0-3')}).locator('.field-filters li').count(),2);
  assert.equal(await page.locator('select[aria-label^="Search "]').count(),0);
  for(const width of [320,390,519,520,521,668,669,670,682,683,684,768,1440]){
   await page.setViewportSize({width,height:1000});const g=await page.evaluate(()=>({viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,panels:[...document.querySelectorAll('.panel')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect().width),font:getComputedStyle(document.querySelector('#source')).fontFamily}));assert.equal(g.overflow,false,JSON.stringify(g));assert.ok(Math.max(...g.panels)-Math.min(...g.panels)<1);geometry.push(g);
   if([390,768,1440].includes(width)){await shot('postgres-source-'+width,'main');await shot('postgres-fields-'+width,'#configure');await numericGuide.screenshot({path:join(output,'postgres-filters-'+width+'.png')});await shot('postgres-deploy-'+width,'#deploy-panel');}
  }
  await page.evaluate(()=>document.documentElement.style.zoom='2');await shot('postgres-zoom-200','#configure');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.evaluate(()=>document.documentElement.style.zoom='1');
  await reveal('#theme');await page.locator('#theme').click();await shot('postgres-light','main');await reveal('#theme');await page.locator('#theme').click();
  await visit(3);await page.getByRole('button',{name:'About entity attributes',exact:true}).click();assert.equal(await page.locator('.help-bubble').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('.help-bubble').count(),0);
  await reveal('#field-0-2');await page.locator('#field-0-2').selectOption('payload');await page.waitForFunction(()=>document.querySelector('#state').textContent==='Model ready for review');
  await inject();await reveal('#connect-wallet');await page.locator('#connect-wallet').click();await page.waitForFunction(()=>document.querySelector('#connect-wallet').textContent.startsWith('0x'));
  await reveal('#policy-0-owner');await page.locator('#policy-0-owner').selectOption('Another wallet (example only)');assert.equal(await page.locator('#deploy').isDisabled(),true);await build();await reveal('#deploy-consent');await page.locator('#deploy-consent').check();assert.equal(await page.locator('#deploy').isDisabled(),true);assert.match(await page.locator('#deploy-eligibility').textContent(),/example only/);
  await reveal('#policy-0-owner');await page.locator('#policy-0-owner').selectOption('Connected wallet');await build();
  const original=await page.locator('#entity-row').inputValue();await reveal('#entity-row');await page.locator('#entity-row').fill(original.replace('"seat_number": 12','"seat_number": "wrong"'));assert.match(await page.locator('#deploy-eligibility').textContent(),/integer/);assert.equal(await page.locator('#deploy').isDisabled(),true);await reveal('#entity-row');await page.locator('#entity-row').fill(original);
  await reveal('#deploy-consent');await page.locator('#deploy-consent').check();funds=false;await reveal('#deploy');await page.locator('#deploy').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent.includes('needs test GLM'));assert.equal(sent,0);funds=true;await reveal('#deploy-consent');await page.locator('#deploy-consent').check();
  reject=true;await reveal('#deploy');await page.locator('#deploy').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent.includes('rejected'));assert.equal(sent,0);reject=false;await reveal('#deploy-consent');await page.locator('#deploy-consent').check();
  await reveal('#deploy');await page.locator('#deploy').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent==='Entity created and read back successfully.',{},{timeout:20000});assert.equal(sent,1);
  const links=await page.locator('#deploy-result a').evaluateAll(es=>es.map(a=>a.href));assert.ok(links.some(h=>h.endsWith('/tx/'+hash)));assert.ok(links.some(h=>new URL(h).searchParams.get('q')==='$key = key('+stored.key+')'));
  await shot('postgres-confirmed','#deploy-panel');assert.equal(await page.locator('#deploy').isDisabled(),true);
  // User's exact editing flow: excluded email -> attribute -> payload -> attribute.
  assert.equal(await page.locator('#privacy').count(),0);
  const settled=()=>page.waitForFunction(()=>document.querySelector('#state').textContent==='Model ready for review');
  const mapping=()=>page.locator('.comparison [data-source-field="buyer_email"] dd').textContent();
  const emailRow=JSON.stringify({...JSON.parse(original),buyer_email:'test@gmail.com'},null,2);
  await reveal('#entity-row');await page.locator('#entity-row').fill(emailRow);await reveal('#field-0-4');await page.locator('#field-0-4').selectOption('attribute');await settled();
  assert.match(await mapping(),/attributes.buyer_email/);assert.ok(!Object.hasOwn(JSON.parse(await page.locator('#payload-json').textContent()),'buyer_email'));
  assert.equal(JSON.parse(await page.locator('#entity-row').inputValue()).buyer_email,'test@gmail.com');
  assert.equal(await page.locator('#deploy-consent').isChecked(),false);await reveal('#deploy-consent');await page.locator('#deploy-consent').check();assert.equal(await page.locator('#deploy').isDisabled(),false);
  assert.equal(await page.locator('#issues').textContent(),'');assert.equal(await page.locator('#wallet-status').textContent(),'');assert.equal(await page.locator('#creation-history').getAttribute('open'),null);assert.equal(await page.locator('#creation-history-label').textContent(),'Previous creation');
  assert.match(await page.locator('#agent-prompt').inputValue(),/128 UTF-8 byte limit/);assert.ok(!(await page.locator('#agent-prompt').inputValue()).includes('test@gmail.com'));
  await reveal('#entity-row');await page.locator('#entity-row').fill(JSON.stringify({...JSON.parse(emailRow),buyer_email:'é'.repeat(65)}));
  assert.match(await page.locator('#deploy-eligibility').textContent(),/130 UTF-8 bytes.+128/);assert.equal(await page.locator('#deploy').isDisabled(),true);
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await page.locator('.deploy-actions').evaluate(e=>e.scrollIntoView({block:'center'}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(output,'postgres-text-limit-'+width+'.png')});}
  await reveal('#deploy-resolve');await page.locator('#deploy-resolve').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'entity-row');
  await reveal('#field-0-4');await page.locator('#field-0-4').selectOption('payload');await settled();assert.match(await mapping(),/payload.buyer_email/);
  assert.equal(JSON.parse(await page.locator('#entity-row').inputValue()).buyer_email,'é'.repeat(65));await reveal('#deploy-consent');await page.locator('#deploy-consent').check();assert.equal(await page.locator('#deploy').isDisabled(),false);
  await reveal('#field-0-4');await page.locator('#field-0-4').selectOption('attribute');await settled();assert.match(await page.locator('#deploy-eligibility').textContent(),/130 UTF-8 bytes.+128/);
  await reveal('#entity-row');await page.locator('#entity-row').fill(emailRow);await reveal('#deploy-consent');await page.locator('#deploy-consent').check();includeEmail=true;await reveal('#deploy');await page.locator('#deploy').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent==='Entity created and read back successfully.');assert.equal(sent,2);
  await reveal('#field-0-4');await page.locator('#field-0-4').selectOption('exclude');await settled();includeEmail=false;assert.ok(!Object.hasOwn(JSON.parse(await page.locator('#entity-row').inputValue()),'buyer_email'));
  brokenReceipt=true;await reveal('#deploy-consent');await page.locator('#deploy-consent').check();await reveal('#deploy');await page.locator('#deploy').click();await page.locator('#check-transaction').waitFor();assert.equal(sent,3);assert.equal(await page.locator('#deploy').isDisabled(),true);brokenReceipt=false;await reveal('#check-transaction');await page.locator('#check-transaction').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent==='Entity created and read back successfully.');assert.equal(sent,3);
  // Every flag combination reaches the actual SDK calldata, receipt and readback.
  for(const raw of [1,2,3,0]){
   const chosen={readonly:Boolean(raw&1),permissionlessExtension:Boolean(raw&2)};
   await reveal('#deploy-consent');await page.locator('#deploy-consent').check();
   await reveal('#flag-readonly');await page.locator('#flag-readonly').selectOption(String(chosen.readonly));
   await reveal('#flag-permissionlessExtension');await page.locator('#flag-permissionlessExtension').selectOption(String(chosen.permissionlessExtension));
   assert.equal(await page.locator('#deploy-consent').isChecked(),false);
   assert.equal(await page.locator('#deploy').isDisabled(),true);
   assert.deepEqual(JSON.parse(await page.locator('#transaction-preview').textContent()).flags,chosen);
   assert.match(await page.locator('#agent-prompt').inputValue(),new RegExp('"readonly": '+chosen.readonly));
   await build();assert.equal(await page.locator('#flag-readonly').inputValue(),String(chosen.readonly));
   assert.equal(await page.locator('#flag-permissionlessExtension').inputValue(),String(chosen.permissionlessExtension));
   expectedFlags=raw;await reveal('#deploy-consent');await page.locator('#deploy-consent').check();await reveal('#deploy');await page.locator('#deploy').click();
   await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent==='Entity created and read back successfully.');
   const actual=JSON.parse(await page.locator('#deploy-result pre').textContent());
   assert.deepEqual(actual.creationFlags,{...chosen,raw});
  }
  assert.equal(sent,7);
  assert.equal(await page.locator('.field-filters p,.field-filters code').count(),0);
  assert.doesNotMatch(await page.locator('.comparison').textContent(),/nullable|No duplicate|Queryable\./);
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await shot('postgres-flags-'+width,'[data-entity-field="creationFlags"]');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await reveal('#source');await page.locator('#source').fill('CREATE TABLE appointments (id UUID PRIMARY KEY, event_day DATE, created_at TIMESTAMP, confirmed BOOLEAN DEFAULT false);');await reveal('#analyze');await page.locator('#analyze').click();await ready();await build();assert.equal(await page.locator('#constraint-review').isVisible(),true);await reveal('#deploy-consent');await page.locator('#deploy-consent').check();assert.equal(await page.locator('#deploy').isDisabled(),true);await reveal('#constraints-consent');await page.locator('#constraints-consent').check();await reveal('#deploy-consent');await page.locator('#deploy-consent').check();assert.equal(await page.locator('#deploy').isDisabled(),false);await reveal('#entity-row');await page.locator('#entity-row').fill((await page.locator('#entity-row').inputValue()).replace('2026-09-18','2026-02-30'));assert.equal(await page.locator('#deploy').isDisabled(),true);
  await reveal('#field-0-2');await page.locator('#field-0-2').selectOption('attribute');await page.waitForFunction(()=>document.querySelector('#state').textContent==='Conversion blocked');
  assert.match(await page.locator('.comparison [data-source-field="created_at"] dd').textContent(),/Attribute mapping needs attention/);
  assert.match(await page.locator('#deploy-eligibility').textContent(),/created_at/);await reveal('#deploy-resolve');await page.locator('#deploy-resolve').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'issues');
  await page.locator('#issues button').first().click();assert.equal(await page.evaluate(()=>document.activeElement.id),'field-0-2');
  await reveal('#field-0-2');await page.locator('#field-0-2').selectOption('payload');await page.waitForFunction(()=>document.querySelector('#state').textContent.startsWith('Draft'));
  assert.match(await page.locator('.comparison [data-source-field="created_at"] dd').textContent(),/payload.created_at/);
  await page.evaluate(()=>window.fixtureEmit('accountsChanged',[]));assert.equal(await page.locator('#connect-wallet').textContent(),'Connect wallet');assert.equal(await page.locator('#deploy').isDisabled(),true);
  for(const name of ['social','tasks','notes']){await example(name);assert.match(await page.locator('#source').inputValue(),/^CREATE TABLE/);await build();assert.notEqual(await page.locator('#state').textContent(),'Conversion blocked');}
  await reveal('#source');await page.locator('#source').fill('CREATE TABLE bad (id INTEGER); ALTER TABLE bad ADD COLUMN x TEXT;');await reveal('#analyze');await page.locator('#analyze').click();await page.waitForFunction(()=>document.querySelector('#state').textContent==='Conversion blocked');assert.equal(await page.locator('#deploy').isDisabled(),true);
  await reveal('#source');await page.locator('#source').fill('{"tables":[]}');await reveal('#analyze');await page.locator('#analyze').click();await page.waitForFunction(()=>document.querySelector('#state').textContent==='Conversion blocked');
  assert.deepEqual(errors,[]);
  const evidence={mode:'isolated injected wallet + intercepted RPC; no real transaction',checks:'SQL-only, four examples, no scalar copies, two ownership options, date picker, readonly handoff, invalid input, private fields, wallet missing/funding/rejection/account change, ABI-decoded creation and SDK receipt/readback, explorers, responsive/themes/zoom/tooltips',sent,geometry,calls,pageErrors:errors};await writeFile(join(output,'postgres-browser-evidence.json'),JSON.stringify(evidence,null,2));return evidence;
 }catch(error){console.error('Browser failure:',await page.locator('#wallet-status').textContent(),await page.locator('#deploy-eligibility').textContent(),calls.slice(-16));throw error;}finally{await context.close();}
}
