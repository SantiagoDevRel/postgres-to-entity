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
 let funds=true,reject=false,chain='0x7614d1',sent=0,stored,receipt,brokenReceipt=false;
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
   assert.equal(creation.creationFlags,0);assert.ok(creation.expiresAt>256n);assert.equal(creation.minLifetime,0n);
   const key=predictEntityKey({chainId:7738577,owner:address,nonce:0n,salt:creation.salt});
   const cells=creation.attributes.map(a=>({...a,name:hexToString(a.name).replace(/\0+$/,'')}));
   const payload=cells.find(a=>a.name==='$payload').value;const decodedPayload=JSON.parse(hexToString(payload));
   assert.deepEqual(Object.keys(decodedPayload),['id','seat_number']);assert.equal(decodedPayload.seat_number,12);
   assert.ok(!cells.some(a=>a.name==='buyer_email'));
   const attributes=cells.filter(a=>!a.name.startsWith('$')).map(a=>({name:a.name,type:a.typeId===1?'bool':'str',value:a.typeId===1?BigInt(a.value)!==0n:hexToString(a.value)}));
   assert.equal(attributes.find(a=>a.name==='event_name').value,'Friday concert');
   stored={key,owner:address,creator:address,createdAt:'0x101',updatedAt:'0x101',expiresAt:toHex(creation.expiresAt),creationFlags:0,contentType:'application/json',attributes,payload};
   const log={address:registry,topics:encodeEventTopics({abi:ENTITY_EVENTS_ABI,eventName:'EntityCreated',args:{entityKey:key,owner:address}}),data:encodeAbiParameters(parseAbiParameters('uint64,uint8'),[creation.expiresAt,0]),blockHash,blockNumber:'0x101',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x0',removed:false};
   receipt={transactionHash:hash,transactionIndex:'0x0',blockHash,blockNumber:'0x101',from:address,to:registry,cumulativeGasUsed:'0x100',gasUsed:'0x100',effectiveGasPrice:'0x1',contractAddress:null,logs:[log],logsBloom:'0x'+'00'.repeat(256),status:'0x1',type:'0x2'};
   sent++;return hash;
  }
  throw Error('Unexpected wallet method '+method);
 }catch(e){console.error('FIXTURE ERROR',e.message);throw e;}
 });
 const inject=()=>page.evaluate(()=>{
  const handlers={};window.ethereum={request:async args=>{const value=await window.fixtureRequest(args);if(value?.fixtureError)throw Object.assign(new Error('User rejected the request.'),{code:value.fixtureError});return value;},on:(name,fn)=>{handlers[name]=fn;}};window.fixtureEmit=(name,...args)=>handlers[name]?.(...args);
 });
 const ready=()=>page.waitForFunction(()=>document.querySelector('#input-status').textContent.startsWith('Schema read.'));
 const example=async name=>{await page.locator('#example').selectOption(name);await ready();};
 const build=async()=>{await page.locator('#privacy').check();await page.locator('#generate').click();await page.waitForFunction(()=>!document.querySelector('.result-panel').hidden&&document.querySelector('#state').textContent!=='Processing…');};
 const shot=async(name,selector)=>{if(selector)await page.locator(selector).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:join(output,name+'.png'),fullPage:!selector});};
 try{
  await page.goto(origin);await page.evaluate(()=>document.fonts.ready);
  assert.match(await page.title(),/POSTGRES-TO-ENTITY/);assert.equal(await page.locator('#format,#question').count(),0);
  await page.locator('#connect-wallet').click();assert.match(await page.locator('#wallet-status').textContent(),/EVM wallet/);
  await page.locator('#try-example').click();await ready();
  const lines=await page.locator('.field-intro').evaluateAll(es=>es.map(e=>({text:e.textContent,y:e.getBoundingClientRect().y})));assert.equal(lines.length,2);assert.ok(lines[1].y>lines[0].y);
  assert.equal(await page.locator('#policy-0-owner option').count(),2);assert.equal(await page.locator('#policy-0-expiration').getAttribute('type'),'datetime-local');
  await build();assert.equal(await page.locator('#state').textContent(),'Model defined');
  assert.deepEqual(Object.keys(JSON.parse(await page.locator('#payload-json').textContent())),['id','seat_number']);
  await page.locator('#handoff>summary').click();await page.locator('#copy').click();const copied=(await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n');assert.equal(copied,await page.locator('#agent-prompt').inputValue());assert.ok(!copied.includes('Friday concert'));
  const download=page.waitForEvent('download');await page.locator('#json').click();await (await download).saveAs(join(output,'postgres-model.json'));await page.locator('#handoff>summary').click();
  for(const width of [320,390,519,520,521,668,669,670,682,683,684,768,1440]){
   await page.setViewportSize({width,height:1000});const g=await page.evaluate(()=>({viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,panels:[...document.querySelectorAll('.panel')].filter(e=>!e.hidden).map(e=>e.getBoundingClientRect().width),font:getComputedStyle(document.querySelector('#source')).fontFamily}));assert.equal(g.overflow,false,JSON.stringify(g));assert.ok(Math.max(...g.panels)-Math.min(...g.panels)<1);geometry.push(g);
   if([390,768,1440].includes(width)){await shot('postgres-source-'+width,'main');await shot('postgres-fields-'+width,'#configure');await shot('postgres-deploy-'+width,'#deploy-panel');}
  }
  await page.evaluate(()=>document.documentElement.style.zoom='2');await shot('postgres-zoom-200','#configure');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.evaluate(()=>document.documentElement.style.zoom='1');
  await page.locator('#theme').click();await shot('postgres-light','main');await page.locator('#theme').click();
  await page.getByRole('button',{name:'About attributes',exact:true}).click();assert.equal(await page.locator('.help-bubble').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('.help-bubble').count(),0);
  await inject();await page.locator('#connect-wallet').click();await page.waitForFunction(()=>document.querySelector('#connect-wallet').textContent.startsWith('0x'));
  await page.locator('#policy-0-owner').selectOption('Another wallet (example only)');assert.equal(await page.locator('#deploy').isDisabled(),true);await build();await page.locator('#deploy-consent').check();assert.equal(await page.locator('#deploy').isDisabled(),true);assert.match(await page.locator('#deploy-eligibility').textContent(),/example only/);
  await page.locator('#policy-0-owner').selectOption('Connected wallet');await build();
  const original=await page.locator('#entity-row').inputValue();await page.locator('#entity-row').fill(original.replace('"seat_number": 12','"seat_number": "wrong"'));assert.match(await page.locator('#deploy-eligibility').textContent(),/integer/);assert.equal(await page.locator('#deploy').isDisabled(),true);await page.locator('#entity-row').fill(original);
  await page.locator('#deploy-consent').check();funds=false;await page.locator('#deploy').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent.includes('needs test GLM'));assert.equal(sent,0);funds=true;await page.locator('#deploy-consent').check();
  reject=true;await page.locator('#deploy').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent.includes('rejected'));assert.equal(sent,0);reject=false;await page.locator('#deploy-consent').check();
  await page.locator('#deploy').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent==='Entity created and read back successfully.',{},{timeout:20000});assert.equal(sent,1);
  const links=await page.locator('#deploy-result a').evaluateAll(es=>es.map(a=>a.href));assert.ok(links.some(h=>h.endsWith('/tx/'+hash)));assert.ok(links.some(h=>new URL(h).searchParams.get('q')==='$key = key('+stored.key+')'));
  await shot('postgres-confirmed','#deploy-panel');assert.equal(await page.locator('#deploy').isDisabled(),true);
  brokenReceipt=true;await page.locator('#deploy-consent').check();await page.locator('#deploy').click();await page.locator('#check-transaction').waitFor();assert.equal(sent,2);assert.equal(await page.locator('#deploy').isDisabled(),true);brokenReceipt=false;await page.locator('#check-transaction').click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent==='Entity created and read back successfully.');assert.equal(sent,2);
  await page.locator('#source').fill('CREATE TABLE appointments (id UUID PRIMARY KEY, event_day DATE, created_at TIMESTAMP, confirmed BOOLEAN DEFAULT false);');await page.locator('#analyze').click();await ready();await build();assert.equal(await page.locator('#constraint-review').isVisible(),true);await page.locator('#deploy-consent').check();assert.equal(await page.locator('#deploy').isDisabled(),true);await page.locator('#constraints-consent').check();await page.locator('#deploy-consent').check();assert.equal(await page.locator('#deploy').isDisabled(),false);await page.locator('#entity-row').fill((await page.locator('#entity-row').inputValue()).replace('2026-09-18','2026-02-30'));assert.equal(await page.locator('#deploy').isDisabled(),true);
  await page.evaluate(()=>window.fixtureEmit('accountsChanged',[]));assert.equal(await page.locator('#connect-wallet').textContent(),'Connect wallet');assert.equal(await page.locator('#deploy').isDisabled(),true);
  for(const name of ['social','tasks','notes']){await example(name);assert.match(await page.locator('#source').inputValue(),/^CREATE TABLE/);await build();assert.notEqual(await page.locator('#state').textContent(),'Conversion blocked');}
  await page.locator('#source').fill('CREATE TABLE bad (id INTEGER); ALTER TABLE bad ADD COLUMN x TEXT;');await page.locator('#analyze').click();await page.waitForFunction(()=>document.querySelector('#state').textContent==='Conversion blocked');assert.equal(await page.locator('#deploy').isDisabled(),true);
  await page.locator('#source').fill('{"tables":[]}');await page.locator('#analyze').click();await page.waitForFunction(()=>document.querySelector('#state').textContent==='Conversion blocked');
  assert.deepEqual(errors,[]);
  const evidence={mode:'isolated injected wallet + intercepted RPC; no real transaction',checks:'SQL-only, four examples, no scalar copies, two ownership options, date picker, readonly handoff, invalid input, private fields, wallet missing/funding/rejection/account change, ABI-decoded creation and SDK receipt/readback, explorers, responsive/themes/zoom/tooltips',sent,geometry,calls,pageErrors:errors};await writeFile(join(output,'postgres-browser-evidence.json'),JSON.stringify(evidence,null,2));return evidence;
 }catch(error){console.error('Browser failure:',await page.locator('#wallet-status').textContent(),await page.locator('#deploy-eligibility').textContent(),calls.slice(-16));throw error;}finally{await context.close();}
}
