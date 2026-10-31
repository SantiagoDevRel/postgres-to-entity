import { createWalletClient, createPublicClient, ExpirationTime, ENTITY_EVENTS_ABI } from '@arkiv-network/sdk';
import { rabdiBrowser as rabdi } from './network';
import {toSdkSchema} from 'postgres-to-entity';
import {sourceColumns} from './model-columns';
import { custom, http, isAddress, decodeEventLog, type EIP1193Provider, type Address } from 'viem';
import type { EntityDesign, EntityModel } from 'postgres-to-entity';
import { prepareRow } from './row';
import { exampleValue } from './entity-preview';
import { defaultFlags, type DemoFlags } from './creation-flags';
import { renderRowPreview } from './row-preview';
import { sendWithPolicy, WritePolicyError } from './write-policy';
import { executeWrite, reconcileWrite, newWriteOperation, operationKey, type WriteOperation, type Hash } from './write-operation';

type Provider=EIP1193Provider & {on?:(event:string,callback:(...args:unknown[])=>void)=>void};
const rpc=createPublicClient({chain:rabdi,transport:http('/api/rpc',{timeout:15000,retryCount:1})});
const chainHex='0x'+rabdi.id.toString(16);
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const needsRuleReview=(e:EntityDesign)=>e.applicationConstraints.some(rule=>!/^[^\s]+\s+[a-z0-9]+(?:\([^)]*\))?\s+(?:PRIMARY\s+KEY|NOT\s+NULL)\s*$/i.test(rule));
const short=(v:string)=>v.slice(0,8)+'…'+v.slice(-6);
const message=(error:unknown)=>{
 let cause=error;const seen=new Set<unknown>();
 while(cause&&typeof cause==='object'&&!seen.has(cause)){
  seen.add(cause);const detail=cause as {code?:number;name?:string;message?:string;cause?:unknown};
  if(detail.code===4001||detail.name==='UserRejectedRequestError')return 'Transaction rejected in your wallet. No entity was created.';
  if(detail.name==='WritePolicyError'&&typeof detail.message==='string')return detail.message;
  cause=detail.cause;
 }
 return error instanceof Error?error.message:String(error);
};
const link=(label:string,url:string)=>{const a=document.createElement('a');a.textContent=label+' ↗';a.href=url;a.target='_blank';a.rel='noreferrer';return a;};
export function initDeployment(){
 let provider:Provider|undefined;
 let account:Address|undefined;
 let entity:EntityDesign|undefined,model:EntityModel|undefined,policy:{owner:string;expiration:string}|undefined;
 let fresh=false,busy=false,epoch=0;
 const operations=new Map<string,WriteOperation>();
 let lastOperation:WriteOperation|undefined;
 const keyFor=(selected:EntityDesign,owner:Address,values:ReturnType<typeof prepareRow>['values'])=>{
  const columns=sourceColumns(selected),identity=columns.filter(c=>selected.identity.includes(c.source.column));
  return operationKey(owner,selected.source,(identity.length?identity:columns).map(c=>{
   const value=values[c.name]?.value;
   return [c.source.column,c.sourceType==='uuid'&&typeof value==='string'?value.toLowerCase():value] as [string,unknown];
  }));
 };
 let flags=defaultFlags();
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
  document.dispatchEvent(new CustomEvent('journey-reveal',{detail:target}));
  for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
  target.scrollIntoView({block:'center'});target.focus({preventScroll:true});
 });
 function clearPreviousFeedback(){
  if(lastOperation&&lastOperation.phase!=='idle')return;
  status.textContent='';
  if(history.hidden)return;
  history.open=false;$('creation-history-label').textContent='Previous creation';
 }
 const lockedControls=new Map<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement,boolean>();
 function lockInputs(locked:boolean){
  if(locked){
   for(const control of document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>('#form input,#form select,#form textarea,#form button,#entity-picker,#entity-row,#deploy-consent,#constraints-consent,[data-creation-flag],[data-go-step]')){
    lockedControls.set(control,control.disabled);control.disabled=true;
   }
  }else{for(const [control,disabled] of lockedControls)control.disabled=disabled;lockedControls.clear();}
 }
 function refresh(){
  const mappedRow=$('row-mapping');mappedRow.hidden=true;mappedRow.replaceChildren();
  let reason='The model changed. Rebuild it before deploying.';let valid=false,operationLocked=false;
  resolve.hidden=true;resolve.disabled=busy;
  if(!fresh)review($('configure').hidden?'analyze':'generate',$('configure').hidden?'Read schema':'Review and rebuild model');
  if(fresh&&entity&&model&&policy){
   try{
    const prepared=prepareRow(entity,model,row.value);preview.textContent=JSON.stringify({...prepared.display,flags},null,2);
    renderRowPreview(mappedRow,prepared.display);
    const prior=account?operations.get(keyFor(entity,account,prepared.values)):undefined;
    operationLocked=policy.owner==='Connected wallet'&&!!prior&&prior.phase!=='idle';
    if(operationLocked){reason=prior!.message||'This operation is already sending. No other send is allowed.';}
    else if(policy.owner!=='Connected wallet'){reason='Another wallet is an example only. Choose Connected wallet and rebuild to deploy.';review('refine','Review ownership');}
    else if(new Date(policy.expiration).getTime()<=Date.now()||!Number.isFinite(new Date(policy.expiration).getTime())){reason='Choose a future expiration and rebuild.';review('refine','Review expiration');}
    else if(Math.ceil((new Date(policy.expiration).getTime()-Date.now())/2000)>7883970){reason='Choose Entity Expiration within 7,883,970 blocks; use authorized Lifetime Extension for longer retention.';review('refine','Review expiration');}
    else if(model.decisions.some(d=>!['privacy','attribute-limit','cross-entity-query','constraints'].includes(d.code))){reason='Resolve the model decisions before deploying: '+model.decisions.filter(d=>!['privacy','attribute-limit','cross-entity-query','constraints'].includes(d.code)).map(d=>d.message).join(' ');review('issues','Review model decisions');}
    else if(needsRuleReview(entity)&&!$<HTMLInputElement>('constraints-consent').checked){reason='Check this row against the retained PostgreSQL rules and confirm the rules checkbox above.';review('constraints-consent','Review SQL rules');}
    else if(!account){reason='Connect your wallet to create this entity.';review('connect-wallet','Go to wallet connection');}
    else if(!consent.checked)reason='Review the fields and values, then check the confirmation above to enable deployment.';
    else {reason='One entity on Rabdi · owner '+short(account)+'.';valid=true;}
   }catch(error){reason=model.blockers.length?model.blockers.map(b=>(b.field?b.field.column+': ':'')+b.message).join(' '):message(error);preview.textContent=reason;review(model.blockers.length?'issues':'entity-row',model.blockers.length?'Fix model issues':'Review source row');}
  } else preview.textContent='Rebuild to review current values.';
  if(operationLocked||busy)resolve.hidden=true;
  eligibility.textContent=busy?'Waiting for the wallet or transaction confirmation…':reason;
  eligibility.dataset.ready=String(valid&&!busy);deploy.disabled=!valid||busy;
 }
 function changed(){epoch++;account=undefined;connect.textContent='Connect wallet';consent.checked=false;clearPreviousFeedback();$('connection-status').textContent='Wallet account or network changed. Connect again to verify Rabdi.';refresh();}
 async function ensureNetwork(p:Provider){
   const current=await p.request({method:'eth_chainId'});
   if(BigInt(current)!==BigInt(rabdi.id)){
    try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex}]});}
    catch(error){if((error as {code?:number}).code!==4902)throw error;throw Error('Add Rabdi (chain 7794095) in your wallet using your own access key from hub.arkiv.network/access-keys, then connect again.');}
   }
   if(BigInt(await p.request({method:'eth_chainId'}))!==BigInt(rabdi.id))throw Error('Select Rabdi in your wallet.');
   if(await rpc.getChainId()!==rabdi.id)throw Error('RPC network mismatch.');
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
   account=accounts[0];connect.textContent=short(account);status.textContent='Connected to Rabdi. Your wallet will ask before sending a transaction.';
  }catch(error){status.textContent=message(error);}finally{const feedback=$('connection-status');feedback.textContent=status.textContent;feedback.hidden=false;connect.disabled=false;refresh();}
 });
 row.addEventListener('input',()=>{consent.checked=false;$<HTMLInputElement>('constraints-consent').checked=false;epoch++;clearPreviousFeedback();refresh();});
 $('constraints-consent').addEventListener('change',()=>{consent.checked=false;epoch++;refresh();});consent.addEventListener('change',()=>{epoch++;refresh();});
 deploy.addEventListener('click',async()=>{
  refresh();if(deploy.disabled||!provider||!account||!entity||!model||!policy)return;
  const p=provider,owner=account,selected=entity,contract=model,expires=new Date(policy.expiration),prepared=prepareRow(selected,contract,row.value),version=epoch,submittedFlags={...flags};
  async function showCreated(result:{entityKey: `0x${string}`;txHash: `0x${string}`}) {
    history.hidden=false;history.open=true;$('creation-history-label').textContent='Creation result';
    const output=$('deploy-result');const title=document.createElement('h3');title.textContent='Entity created';
    const key=document.createElement('p');key.textContent='Entity key: '+result.entityKey;
    const links=document.createElement('div');links.className='actions';links.append(link('Block Explorer · transaction','https://rabdi.explorer.arkiv.network/tx/'+result.txHash),link('Block Explorer · entity','https://rabdi.explorer.arkiv.network/entity/'+result.entityKey),link('Data Explorer - entity','https://data.arkiv.network/?q='+encodeURIComponent('$key = key('+result.entityKey+')')));
    const note=document.createElement('p');note.className='hint';note.textContent='The Data Explorer link opens the entity-key query. Select Rabdi and press Execute. The read below also verifies it directly.';
    const verification=document.createElement('p');verification.className='hint';verification.textContent='Reading the created entity from Rabdi…';
    output.replaceChildren(title,key,links,note,verification);
    status.textContent='Transaction confirmed. Checking the stored entity…';
    try{
      const schema=toSdkSchema(selected);
      const actual=await rpc.getEntity(result.entityKey);
      const canonical=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
      if(actual.$key!==result.entityKey||actual.$owner.toLowerCase()!==owner.toLowerCase()||actual.$creator.toLowerCase()!==owner.toLowerCase())throw Error('Returned entity identity differs from the reviewed write.');
      for(const column of selected.schema.columns){
        if(canonical(actual.$attributes[column.name])!==canonical(prepared.values[column.name]))throw Error('Returned column differs from the submitted value: '+column.name);
      }
      if(actual.$attributes['arkiv.schema']?.value!==schema.name)throw Error('Returned schema namespace differs from the reviewed model.');
      if(actual.$creationFlags.readonly!==submittedFlags.readonly||actual.$creationFlags.permissionlessExtension!==submittedFlags.permissionlessExtension)throw Error('Returned creation flags differ from the submitted settings.');
      verification.textContent='Verified from Rabdi: key, owner, creator, typed columns and creation flags match.';
      const data=document.createElement('pre');data.tabIndex=0;data.textContent=JSON.stringify(actual,(_,v)=>typeof v==='bigint'?v.toString():v,2);output.append(data);
      status.textContent='Entity created and read back successfully.';
    }catch(error){verification.textContent='Creation confirmed, but read verification is pending: '+message(error);status.textContent='Entity created. Use its transaction link to inspect the confirmed write.';}
  }
  const key=keyFor(selected,owner,prepared.values);
  const operation=operations.get(key)??newWriteOperation();operations.set(key,operation);lastOperation=operation;
  busy=true;lockInputs(true);refresh();connect.disabled=true;
  const lookup=async(hash:Hash)=>rpc.getTransactionReceipt({hash});
  async function showOutcome(){
    status.textContent=operation.message;status.dataset.writePhase=operation.phase;
    if(operation.phase==='confirmed'&&operation.result){await showCreated(operation.result);return;}
    history.hidden=false;history.open=true;$('creation-history-label').textContent='Transaction outcome';
    const output=$('deploy-result'),note=document.createElement('p');
    note.textContent=operation.message+(operation.phase==='uncertain'&&!operation.hash?' The wallet did not return a transaction hash. Inspect its activity; do not send again.':'');
    output.replaceChildren(note);
    if(operation.previousHash)output.append(link('Previous confirmed reverted transaction','https://rabdi.explorer.arkiv.network/tx/'+operation.previousHash));
    if(!operation.hash)return;
    const hash=operation.hash;output.append(link('Block Explorer - transaction','https://rabdi.explorer.arkiv.network/tx/'+hash));
    if(operation.phase==='terminal')return;
    const check=document.createElement('button');check.type='button';check.className='secondary';check.id='check-transaction';check.textContent='Check confirmation again';
    check.addEventListener('click',async()=>{
      if(busy)return;busy=true;check.disabled=true;refresh();
      try{
        let observed:Awaited<ReturnType<typeof lookup>>|undefined;
        await reconcileWrite(operation,async currentHash=>{observed=await lookup(currentHash);return observed;});status.dataset.writePhase=operation.phase;
        if(operation.phase==='confirmed'){
          const receipt=observed;if(!receipt||receipt.status!=='success')throw Error('Confirmation pending; do not resend.');
          let entityKey=operation.result?.entityKey;
          if(!entityKey)for(const log of receipt.logs){if(log.address.toLowerCase()!=='0x4400000000000000000000000000000000000044')continue;try{const event=decodeEventLog({abi:ENTITY_EVENTS_ABI,topics:log.topics,data:log.data});if(event.eventName==='EntityCreated'&&event.args.owner.toLowerCase()===owner.toLowerCase())entityKey=event.args.entityKey;}catch{}}
          if(!entityKey)throw Error('Confirmed transaction has no matching creation event. Inspect its explorer; do not resend.');
          operation.result={entityKey,txHash:hash};await showCreated(operation.result);
        }else{note.textContent=operation.message;status.textContent=operation.message;}
      }catch(error){status.textContent='Confirmation pending: '+message(error);}
      finally{busy=false;check.disabled=false;consent.checked=false;refresh();}
    });output.append(check);
  }
  try{
    await executeWrite(operation,{
      message,
      receipt:lookup,
      async send(minimumGas,attempted,hashed){
        status.textContent='Checking wallet and estimating the reviewed creation...';
        await ensureNetwork(p);
        const accounts=await p.request({method:'eth_accounts'});
        if(accounts[0]?.toLowerCase()!==owner.toLowerCase()||version!==epoch||!fresh)throw new WritePolicyError('Your account or model changed. Review it before signing.');
        if(await rpc.getBalance({address:owner,blockTag:'latest'})===0n)throw new WritePolicyError('Your wallet needs test GLM. Use the faucet link below, then try again.');
        const remaining=Math.ceil((expires.getTime()-Date.now())/2000);
        if(remaining<1||remaining>7883970)throw new WritePolicyError('Entity Expiration is outside the supported lifetime. Review it again.');
        let sendTaken=false;
        const guarded={request:async(args:{method:string;params?:readonly unknown[]})=>{
          if(args.method==='wallet_sendTransaction'||args.method==='eth_sendRawTransaction')throw Error('Alternate write methods are disabled; inspect the first attempt.');
          if(args.method==='eth_sendTransaction'){
            if(sendTaken)throw Error('This attempt already requested a send.');sendTaken=true;
            return sendWithPolicy(p as unknown as import('./write-policy').PolicyProvider,args.params?.[0] as Record<string,unknown>,async quote=>{
              if(version!==epoch||!fresh||!consent.checked||expires.getTime()<=Date.now())throw new WritePolicyError('Inputs changed before signing. Review and try again.');
              if(BigInt(await p.request({method:'eth_chainId'}))!==BigInt(rabdi.id))throw new WritePolicyError('Wallet network changed before signing.');
              const current=await p.request({method:'eth_accounts'});
              if(current[0]?.toLowerCase()!==owner.toLowerCase())throw new WritePolicyError('Wallet account changed before signing.');
              attempted(quote.gas);status.textContent=operation.attempts===2?'Confirm the single gas-exhaustion retry in your wallet.':'Confirm creation in your wallet. This sends the reviewed values to Rabdi.';
            },hash=>hashed(hash as Hash),undefined,minimumGas);
          }
          return (p.request as (input:{method:string;params?:readonly unknown[]})=>Promise<unknown>)(args);
        }} as Provider;
        const wallet=createWalletClient({account:owner,chain:rabdi,transport:custom(guarded,{retryCount:0})});
        return wallet.createEntity(toSdkSchema(selected),prepared.values,{expiration:ExpirationTime.atDate(expires),flags:submittedFlags});
      },
    });
    await showOutcome();
  }catch(error){status.textContent=message(error);}
  finally{busy=false;lockInputs(false);connect.disabled=false;consent.checked=false;refresh();}
 });
 return {
  setFlags(next:DemoFlags){flags={...next};epoch++;consent.checked=false;clearPreviousFeedback();refresh();},
  invalidate(){fresh=false;epoch++;consent.checked=false;clearPreviousFeedback();refresh();},
  setModel(e:EntityDesign|undefined,m:EntityModel,p:{owner:string;expiration:string}|undefined){
   const previousSource=entity?.source;let invalidRow=false;
   if(previousSource){try{const values=JSON.parse(row.value);if(values&&typeof values==='object'&&!Array.isArray(values))editedRows.set(previousSource,{...editedRows.get(previousSource),...values});else invalidRow=true;}catch{invalidRow=true;}}
   const keepRaw=invalidRow&&previousSource===e?.source;
   entity=e;model=m;policy=p?{...p}:undefined;fresh=true;epoch++;consent.checked=false;
   const fields=e?sourceColumns(e).map(f=>[f.source.column,exampleValue(f.source.table,f.source.column,f.sourceType,f.encoding)] as const):[];
   const saved=e?editedRows.get(e.source):undefined;
   if(!keepRaw)row.value=JSON.stringify(Object.fromEntries(fields.map(([name,fallback])=>[name,saved&&Object.hasOwn(saved,name)?saved[name]:fallback])),null,2);
   if(e&&!keepRaw)editedRows.set(e.source,JSON.parse(row.value));
   clearPreviousFeedback();
   const constraints=e&&needsRuleReview(e)?e.applicationConstraints:[];$('constraint-review').hidden=!constraints.length;$<HTMLInputElement>('constraints-consent').checked=false;$('constraint-list').replaceChildren(...constraints.map(rule=>{const li=document.createElement('li');li.textContent=rule;return li;}));refresh();
  }
 };
}
