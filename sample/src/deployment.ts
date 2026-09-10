import { createWalletClient, createPublicClient, jsonToPayload, ExpirationTime, ENTITY_EVENTS_ABI } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { custom, http, isAddress, decodeEventLog, type EIP1193Provider, type Address } from 'viem';
import type { EntityDesign, EntityModel } from 'postgres-to-entity';
import { prepareRow } from './row';
import { exampleValue } from './entity-preview';

type Provider=EIP1193Provider & {on?:(event:string,callback:(...args:unknown[])=>void)=>void};
const rpc=createPublicClient({chain:tiramisu,transport:http(undefined,{timeout:15000,retryCount:1})});
const chainHex='0x'+tiramisu.id.toString(16);
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const needsRuleReview=(e:EntityDesign)=>e.applicationConstraints.some(rule=>!/^[^\s]+\s+[a-z0-9]+(?:\([^)]*\))?\s+(?:PRIMARY\s+KEY|NOT\s+NULL)\s*$/i.test(rule));
const short=(v:string)=>v.slice(0,8)+'…'+v.slice(-6);
const message=(error:unknown)=>{
 let cause=error;const seen=new Set<unknown>();
 while(cause&&typeof cause==='object'&&!seen.has(cause)){
  seen.add(cause);const detail=cause as {code?:number;name?:string;cause?:unknown};
  if(detail.code===4001||detail.name==='UserRejectedRequestError')return 'Transaction rejected in your wallet. No entity was created.';
  cause=detail.cause;
 }
 return error instanceof Error?error.message:String(error);
};
const link=(label:string,url:string)=>{const a=document.createElement('a');a.textContent=label+' ↗';a.href=url;a.target='_blank';a.rel='noreferrer';return a;};
export function initDeployment(){
 let provider:Provider|undefined;
 let account:Address|undefined;
 let entity:EntityDesign|undefined,model:EntityModel|undefined,policy:{owner:string;expiration:string}|undefined;
 let fresh=false,busy=false,epoch=0;let submittedHash:string|undefined;
 const editedRows=new Map<string,Record<string,unknown>>();
 const connect=$<HTMLButtonElement>('connect-wallet'),deploy=$<HTMLButtonElement>('deploy');
 const row=$<HTMLTextAreaElement>('entity-row'),consent=$<HTMLInputElement>('deploy-consent');
 const status=$('wallet-status'),eligibility=$('deploy-eligibility'),preview=$('transaction-preview');
 const resolve=$<HTMLButtonElement>('deploy-resolve'),history=$<HTMLDetailsElement>('creation-history');
 let reviewTarget='generate';
 function review(target:string,label:string){reviewTarget=target;resolve.textContent=label;resolve.hidden=false;}
 resolve.addEventListener('click',()=>{
  if(busy)return;
  const target=$(reviewTarget);if(!target)return;
  for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
  target.scrollIntoView({block:'center'});target.focus({preventScroll:true});
 });
 function clearPreviousFeedback(){
  if(submittedHash)return;
  status.textContent='';
  if(history.hidden)return;
  history.open=false;$('creation-history-label').textContent='Previous creation';
 }
 const lockedControls=new Map<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement,boolean>();
 function lockInputs(locked:boolean){
  if(locked){
   for(const control of document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>('#form input,#form select,#form textarea,#form button,#entity-picker,#entity-row,#deploy-consent,#constraints-consent')){
    lockedControls.set(control,control.disabled);control.disabled=true;
   }
  }else{for(const [control,disabled] of lockedControls)control.disabled=disabled;lockedControls.clear();}
 }
 function refresh(){
  let reason='The model changed. Rebuild it before deploying.';let valid=false;
  resolve.hidden=true;resolve.disabled=busy;
  if(!fresh)review($('configure').hidden?'analyze':'generate',$('configure').hidden?'Read schema':'Review and rebuild model');
  if(submittedHash){reason='Transaction submitted. Check its Block Explorer receipt before starting another creation.';}
  else if(fresh&&entity&&model&&policy){
   try{
    const prepared=prepareRow(entity,model,row.value);preview.textContent=JSON.stringify(prepared.display,null,2);
    if(policy.owner!=='Connected wallet'){reason='Another wallet is an example only. Choose Connected wallet and rebuild to deploy.';review('refine','Review ownership');}
    else if(new Date(policy.expiration).getTime()<=Date.now()||!Number.isFinite(new Date(policy.expiration).getTime())){reason='Choose a future expiration and rebuild.';review('refine','Review expiration');}
    else if(model.decisions.some(d=>!['privacy','attribute-limit','cross-entity-query','constraints'].includes(d.code))){reason='Resolve the model decisions before deploying: '+model.decisions.filter(d=>!['privacy','attribute-limit','cross-entity-query','constraints'].includes(d.code)).map(d=>d.message).join(' ');review('issues','Review model decisions');}
    else if(needsRuleReview(entity)&&!$<HTMLInputElement>('constraints-consent').checked){reason='Check this row against the retained PostgreSQL rules and confirm the rules checkbox above.';review('constraints-consent','Review SQL rules');}
    else if(!account){reason='Connect your wallet to create this entity.';review('connect-wallet','Go to wallet connection');}
    else if(!consent.checked)reason='Review the fields and values, then check the confirmation above to enable deployment.';
    else {reason='One entity on Tiramisu · owner '+short(account)+'.';valid=true;}
   }catch(error){reason=model.blockers.length?model.blockers.map(b=>(b.field?b.field.column+': ':'')+b.message).join(' '):message(error);preview.textContent=reason;review(model.blockers.length?'issues':'entity-row',model.blockers.length?'Fix model issues':'Review source row');}
  } else preview.textContent='Rebuild to review current values.';
  if(submittedHash||busy)resolve.hidden=true;
  eligibility.textContent=busy?'Waiting for the wallet or transaction confirmation…':reason;
  eligibility.dataset.ready=String(valid&&!busy);deploy.disabled=!valid||busy;
 }
 function changed(){epoch++;account=undefined;connect.textContent='Connect wallet';consent.checked=false;clearPreviousFeedback();$('connection-status').textContent='Wallet account or network changed. Connect again to verify Tiramisu.';refresh();}
 async function ensureNetwork(p:Provider){
   const current=await p.request({method:'eth_chainId'});
   if(BigInt(current)!==BigInt(tiramisu.id)){
    try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex}]});}
    catch(error){if((error as {code?:number}).code!==4902)throw error;await p.request({method:'wallet_addEthereumChain',params:[{chainId:chainHex,chainName:tiramisu.name,nativeCurrency:tiramisu.nativeCurrency,rpcUrls:[tiramisu.rpcUrls.default.http[0]],blockExplorerUrls:['https://tiramisu.explorer.arkiv.network']}]});}
   }
   if(BigInt(await p.request({method:'eth_chainId'}))!==BigInt(tiramisu.id))throw Error('Select Tiramisu in your wallet.');
   if(await rpc.getChainId()!==tiramisu.id)throw Error('RPC network mismatch.');
 }
 connect.addEventListener('click',async()=>{
  if(busy)return;connect.disabled=true;
  try{
   const injected=(window as unknown as {ethereum?:Provider}).ethereum;
   if(!injected)throw Error('Install or open this page in an EVM wallet such as MetaMask, then connect.');
   if(provider!==injected){provider=injected;provider.on?.('accountsChanged',changed);provider.on?.('chainChanged',changed);provider.on?.('disconnect',changed);}
   await ensureNetwork(provider);
   const accounts=await provider.request({method:'eth_requestAccounts'});
   if(!accounts[0]||!isAddress(accounts[0]))throw Error('No wallet account selected.');
   account=accounts[0];connect.textContent=short(account);status.textContent='Connected to Tiramisu. Your wallet will ask before sending a transaction.';
  }catch(error){status.textContent=message(error);}finally{const feedback=$('connection-status');feedback.textContent=status.textContent;feedback.hidden=false;connect.disabled=false;refresh();}
 });
 row.addEventListener('input',()=>{consent.checked=false;$<HTMLInputElement>('constraints-consent').checked=false;epoch++;clearPreviousFeedback();refresh();});
 $('constraints-consent').addEventListener('change',()=>{consent.checked=false;epoch++;refresh();});consent.addEventListener('change',()=>{epoch++;refresh();});
 deploy.addEventListener('click',async()=>{
  refresh();if(deploy.disabled||!provider||!account||!entity||!model||!policy)return;
  const p=provider,owner=account,selected=entity,contract=model,expires=new Date(policy.expiration),prepared=prepareRow(selected,contract,row.value),version=epoch;
  async function showCreated(result:{entityKey: `0x${string}`;txHash: `0x${string}`}) {
    history.hidden=false;history.open=true;$('creation-history-label').textContent='Creation result';
    const output=$('deploy-result');const title=document.createElement('h3');title.textContent='Entity created';
    const key=document.createElement('p');key.textContent='Entity key: '+result.entityKey;
    const links=document.createElement('div');links.className='actions';links.append(link('Block Explorer · transaction','https://tiramisu.explorer.arkiv.network/tx/'+result.txHash),link('Block Explorer · entity','https://tiramisu.explorer.arkiv.network/entity/'+result.entityKey),link('Data Explorer - entity','https://data.arkiv.network/?q='+encodeURIComponent('$key = key('+result.entityKey+')')));
    const note=document.createElement('p');note.className='hint';note.textContent='The Data Explorer link opens the entity-key query. Select Tiramisu and press Execute. The read below also verifies it directly.';
    const verification=document.createElement('p');verification.className='hint';verification.textContent='Reading the created entity from Tiramisu…';
    output.replaceChildren(title,key,links,note,verification);
    status.textContent='Transaction confirmed. Checking the stored entity…';
    try{
      const actual=await rpc.getEntity(result.entityKey);
      const expected=JSON.stringify(prepared.payload);
      const canonical=(a:object)=>JSON.stringify(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)),(_,v)=>typeof v==='bigint'?v.toString():v);
      if(actual.key!==result.entityKey||actual.owner.toLowerCase()!==owner.toLowerCase()||actual.creator.toLowerCase()!==owner.toLowerCase()||actual.contentType!=='application/json'||canonical(actual.attributes)!==canonical(prepared.attributes)||new TextDecoder().decode(actual.payload)!==expected)throw Error('Returned entity content differs from the submitted example.');
      verification.textContent='Verified from Tiramisu: entity key, owner, creator, attributes and payload match the submitted values.';
      const data=document.createElement('pre');data.tabIndex=0;data.textContent=JSON.stringify({key:actual.key,owner:actual.owner,creator:actual.creator,createdAt:actual.createdAt.toString(),updatedAt:actual.updatedAt.toString(),expiresAt:actual.expiresAt.toString(),contentType:actual.contentType,attributes:actual.attributes,payload:JSON.parse(new TextDecoder().decode(actual.payload))},(_,v)=>typeof v==='bigint'?v.toString():v,2);output.append(data);
      status.textContent='Entity created and read back successfully.';
    }catch(error){verification.textContent='Creation confirmed, but read verification is pending: '+message(error);status.textContent='Entity created. Use its transaction link to inspect the confirmed write.';}
  }
  busy=true;lockInputs(true);refresh();connect.disabled=true;status.textContent='Checking wallet and test GLM balance…';
  try{
    await ensureNetwork(p);
    const accounts=await p.request({method:'eth_accounts'});
    if(accounts[0]?.toLowerCase()!==owner.toLowerCase()||version!==epoch||!fresh)throw Error('Your account or model changed. Review it before signing.');
    if(await rpc.getBalance({address:owner})===0n)throw Error('Your wallet needs test GLM. Use the faucet link below, then try again.');
    if(version!==epoch||!fresh)throw Error('Inputs changed. Review before signing.');
    const guarded = { request: async (args: {method:string;params?:readonly unknown[]}) => {
      if(args.method === 'eth_sendTransaction') {
        if(version!==epoch||!fresh||!consent.checked||new Date(expires).getTime()<=Date.now())throw Error('Inputs changed before signing. Review and try again.');
        if(BigInt(await p.request({method:'eth_chainId'}))!==BigInt(tiramisu.id))throw Error('Wallet network changed before signing.');
        const selectedAccounts=await p.request({method:'eth_accounts'});
        if(selectedAccounts[0]?.toLowerCase()!==owner.toLowerCase())throw Error('Wallet account changed before signing.');
      }
      const response=await (p.request as (input:{method:string;params?:readonly unknown[]})=>Promise<unknown>)(args);
      if(args.method==='eth_sendTransaction'&&typeof response==='string')submittedHash=response;
      return response;
    }} as Provider;
    const wallet=createWalletClient({account:owner,chain:tiramisu,transport:custom(guarded)});
    status.textContent='Confirm creation in your wallet. This sends the reviewed values to Tiramisu.';
    const result=await wallet.createEntity({attributes:prepared.attributes,payload:jsonToPayload(prepared.payload),contentType:'application/json',expires:ExpirationTime.atDate(expires),flags:{readonly:false,permissionlessExtension:false}});
    await showCreated(result);
    submittedHash=undefined;consent.checked=false;
  }catch(error){status.textContent=message(error);consent.checked=false;if(submittedHash){history.hidden=false;history.open=true;$('creation-history-label').textContent='Transaction awaiting confirmation';const output=$('deploy-result');const note=document.createElement('p');note.textContent='A transaction was submitted. Its outcome needs verification; do not send it again.';const hash=submittedHash as `0x${string}`;
      const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.id='check-transaction';retry.textContent='Check confirmation again';
      retry.addEventListener('click',async()=>{
       if(busy)return;busy=true;retry.disabled=true;refresh();
       try{
        const receipt=await rpc.getTransactionReceipt({hash});
        if(receipt.status==='reverted'){submittedHash=undefined;status.textContent='Transaction reverted. No entity was created. Review before trying again.';note.textContent=status.textContent;output.replaceChildren(note,link('View reverted transaction','https://tiramisu.explorer.arkiv.network/tx/'+hash));}
        else{
         let entityKey:`0x${string}`|undefined;
         for(const log of receipt.logs){if(log.address.toLowerCase()!=='0x4400000000000000000000000000000000000044')continue;try{const event=decodeEventLog({abi:ENTITY_EVENTS_ABI,topics:log.topics,data:log.data});if(event.eventName==='EntityCreated'&&event.args.owner.toLowerCase()===owner.toLowerCase())entityKey=event.args.entityKey;}catch{}}
         if(!entityKey)throw Error('Confirmed transaction has no matching creation event. Inspect its explorer; do not resend.');
         await showCreated({entityKey,txHash:hash});submittedHash=undefined;
        }
       }catch(error){status.textContent='Confirmation still pending: '+message(error);}
       finally{busy=false;retry.disabled=false;consent.checked=false;refresh();}
      });
      output.replaceChildren(note,link('Check transaction','https://tiramisu.explorer.arkiv.network/tx/'+hash),retry);}}finally{busy=false;lockInputs(false);connect.disabled=false;refresh();}
 });
 return {
  invalidate(){fresh=false;epoch++;consent.checked=false;clearPreviousFeedback();refresh();},
  setModel(e:EntityDesign|undefined,m:EntityModel,p:{owner:string;expiration:string}|undefined){
   const previousSource=entity?.source;let invalidRow=false;
   if(previousSource){try{const values=JSON.parse(row.value);if(values&&typeof values==='object'&&!Array.isArray(values))editedRows.set(previousSource,{...editedRows.get(previousSource),...values});else invalidRow=true;}catch{invalidRow=true;}}
   const keepRaw=invalidRow&&previousSource===e?.source;
   entity=e;model=m;policy=p?{...p}:undefined;fresh=true;epoch++;consent.checked=false;
   const fields=e?[...e.payload.map(f=>[f.source.column,exampleValue(f.source.table,f.source.column,f.sourceType)] as const),...e.attributes.filter(a=>a.source).map(a=>[a.source!.column,exampleValue(a.source!.table,a.source!.column,a.sourceType??a.type,a.encoding)] as const)]:[];
   const saved=e?editedRows.get(e.source):undefined;
   if(!keepRaw)row.value=JSON.stringify(Object.fromEntries(fields.map(([name,fallback])=>[name,saved&&Object.hasOwn(saved,name)?saved[name]:fallback])),null,2);
   if(e&&!keepRaw)editedRows.set(e.source,JSON.parse(row.value));
   clearPreviousFeedback();
   const constraints=e&&needsRuleReview(e)?e.applicationConstraints:[];$('constraint-review').hidden=!constraints.length;$<HTMLInputElement>('constraints-consent').checked=false;$('constraint-list').replaceChildren(...constraints.map(rule=>{const li=document.createElement('li');li.textContent=rule;return li;}));refresh();
  }
 };
}
