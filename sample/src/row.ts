import type { EntityDesign, EntityModel } from 'postgres-to-entity';
import { i32, dec, str, bool, type AttributeInputs } from '@arkiv-network/sdk';

export function validateValue(value: unknown, type: string, nullable: boolean, name: string): unknown {
  const fail = (reason:string):never=>{throw Error(name + ': ' + reason);};
  if(value===null) return nullable ? null : fail('a value is required.');
  const t=type.toLowerCase().trim();
  if(/\[\d*\]$/.test(t)) {
    if(!Array.isArray(value))return fail('use a JSON array.');
    return value.map((v,i)=>validateValue(v,t.replace(/\[\d*\]$/,''),true,name+'['+i+']'));
  }
  if(/^(bool|boolean)$/.test(t))return typeof value==='boolean'?value:fail('use true or false, without quotes.');
  if(/^(smallint|int2|smallserial|integer|int|int4|serial)$/.test(t)) {
    const bound=/^(smallint|int2|smallserial)$/.test(t)?32768:2147483648;
    return typeof value==='number'&&Number.isSafeInteger(value)&&value>=-bound&&value<bound?value:fail('use an integer within the PostgreSQL type bounds.');
  }
  if(/^(bigint|int8|bigserial)$/.test(t)){
    if(typeof value!=='string'||!/^[-+]?\d+$/.test(value))return fail('use an exact integer string, e.g. "123".');
    const n=BigInt(value);return n>=-(2n**63n)&&n<2n**63n?value:fail('outside PostgreSQL bigint bounds.');
  }
  if(/^(numeric|decimal)/.test(t)){
    if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?$/.test(value))return fail('use an exact decimal string, e.g. "12.50".');
    const params=t.match(/\((\d+)\s*,\s*(\d+)\)/);
    if(params){const [whole,fraction='']=value.replace(/^[-+]/,'').split('.');if(whole.replace(/^0+/,'').length>Number(params[1])-Number(params[2])||fraction.length>Number(params[2]))return fail('exceeds the declared precision or scale.');}
    return value;
  }
  const validDate=(date:string)=>{const parsed=new Date(date+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!date.startsWith('0000')&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;};
  if(t==='date')return typeof value==='string'&&validDate(value)?value:fail('use a valid date in YYYY-MM-DD format.');
  if(/^(timestamp|timestamptz)/.test(t)){
    if(typeof value!=='string')return fail('use an ISO timestamp string.');
    const match=value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})?$/);
    const timezone=t.startsWith('timestamptz')||t.includes('with time zone');const precision=Number(t.match(/\((\d+)\)/)?.[1]??6);
    if(!match||!validDate(match[1])||Number(match[2])>23||Number(match[3])>59||Number(match[4])>59||(match[5]?.length??0)>precision)return fail('use a valid timestamp with the declared precision (up to six fractional digits).');
    if(timezone&&!match[6])return fail('include a timezone, e.g. 2026-09-18T18:00:00-05:00.');
    if(!timezone&&match[6])return fail('this timestamp has no timezone; omit Z or the offset to preserve local time.');
    if(match[6]&&match[6]!=='Z'&&(Number(match[6].slice(1,3))>15||Number(match[6].slice(4))>59))return fail('invalid timezone offset.');
    return value;
  }
  if(t==='uuid')return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value.toLowerCase():fail('use a UUID, e.g. 00000000-0000-4000-8000-000000000001.');
  if(/^(text|varchar|character varying|char|character)(\(\d+\))?$/.test(t)){
    if(typeof value!=='string')return fail('use a string.');const bound=t.match(/\((\d+)\)/);if(bound&&[...value].length>Number(bound[1]))return fail('text exceeds the declared character limit.');return value;
  }
  if(t==='json'||t==='jsonb'){
    const inspect=(v:unknown):void=>{if(typeof v==='number'&&(!Number.isFinite(v)||(Number.isInteger(v)&&!Number.isSafeInteger(v))))fail('large JSON integers must be exact strings.');if(v&&typeof v==='object')Object.values(v).forEach(inspect);};inspect(value);return value;
  }
  if(t==='bytea')return typeof value==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)?value:fail('use base64 text.');
  return fail('the model supports this payload type, but this demo has no verified row encoder for '+type+'. Use the agent handoff.');
}

export function prepareRow(entity:EntityDesign, model:EntityModel, raw:string) {
  if(model.status==='blocked')throw Error('Resolve model blockers first.');
  if(entity.cardinality.startsWith('One relationship'))throw Error('Relationship projections require the parent entity first.');
  if(new TextEncoder().encode(raw).length>100*1024)throw Error('Row exceeds 100 KiB.');
  const row:unknown=JSON.parse(raw);
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Provide one source row as a JSON object.');
  const values=row as Record<string,unknown>;
  const columns=new Map(entity.payload.map(p=>[p.source.column,{type:p.sourceType,nullable:p.nullable}]));
  entity.attributes.forEach(a=>{if(a.source)columns.set(a.source.column,{type:a.sourceType??a.type,nullable:a.nullable??false});});
  for(const name of Object.keys(values))if(!columns.has(name))throw Error(name+': unknown or excluded field. Remove it before deploying.');
  const checked=new Map<string,unknown>();
  columns.forEach((spec,name)=>{if(!Object.hasOwn(values,name))throw Error(name+': supply a value or explicit null.');checked.set(name,validateValue(values[name],spec.type,spec.nullable,name));});
  const pairs: Array<[string,unknown]>=[];
  const attributes:Record<string, AttributeInputs[string]>=Object.create(null);
  for(const a of entity.attributes){
    const value=a.source?checked.get(a.source.column):a.encoding;
    if(value===null)continue;
    if(a.type==='i32')attributes[a.name]=i32(value as number);
    else if(a.type==='dec')attributes[a.name]=dec(value as string);
    else if(a.type==='bool')attributes[a.name]=bool(value as boolean);
    else if(a.type==='str'){
      const bound=a.encoding.match(/maximum (\d+) bytes/),length=new TextEncoder().encode(value as string).length;
      if(bound&&length>Number(bound[1]))throw Error(a.name+': '+length+' UTF-8 bytes; this attribute allows '+bound[1]+'. Shorten the value or change this field to Payload above. Nothing was truncated.');
      attributes[a.name]=str(value as string);
    }else throw Error('This example cannot resolve '+a.type+' attributes.');
    pairs.push([a.name,(attributes[a.name] as {value:unknown}).value]);
  }
  const payload=Object.fromEntries(entity.payload.map(p=>[p.source.column,checked.get(p.source.column)]));
  return {attributes,payload,display:{attributes:Object.fromEntries(pairs),payload,contentType:'application/json'}};
}
