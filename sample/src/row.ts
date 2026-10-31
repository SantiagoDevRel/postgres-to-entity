import type { EntityDesign, EntityModel } from 'postgres-to-entity';
import { i32, dec, str, bool, bytes, type ArkivValue } from '@arkiv-network/sdk/schema';
import {sourceColumns} from './model-columns.ts';

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
    if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==1 || !Object.hasOwn(value,'value')) return fail('use {value: ...} to distinguish JSON null from SQL NULL (null).');
    const inspect=(v:unknown):void=>{if(typeof v==='number'&&(!Number.isFinite(v)||(Number.isInteger(v)&&!Number.isSafeInteger(v))))fail('large JSON integers must be exact strings.');if(v&&typeof v==='object')Object.values(v).forEach(inspect);};inspect(value);return value;
  }
  if(t==='bytea')return typeof value==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)?value:fail('use base64 text.');
  return fail('the model preserves this source type, but this demo has no verified row encoder for '+type+'. Use the agent handoff.');
}

export function prepareRow(entity:EntityDesign, model:EntityModel, raw:string) {
  if(model.status==='blocked')throw Error('Resolve model blockers first.');
  if(entity.cardinality.startsWith('One relationship'))throw Error('Relationship projections require the parent entity first.');
  if(new TextEncoder().encode(raw).length>100*1024)throw Error('Row exceeds 100 KiB.');
  const row:unknown=JSON.parse(raw);
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Provide one source row as a JSON object.');
  const values=row as Record<string,unknown>,columns=sourceColumns(entity);
  for(const name of Object.keys(values))if(!columns.some(c=>c.source.column===name))throw Error(name+': unknown or excluded field. Remove it before deploying.');
  const encoded:Record<string,ArkivValue>=Object.create(null);
  const indexed:Record<string,unknown>=Object.create(null),stored:Record<string,unknown>=Object.create(null);
  for(const column of columns){
    const name=column.source.column;
    if(!Object.hasOwn(values,name))throw Error(name+': supply a value or explicit null.');
    // PostgreSQL array lower bounds cannot be inferred from a JSON array.
    let value:unknown;
    if(/\[/.test(column.sourceType)&&values[name]!==null){
      const envelope=values[name] as {values?:unknown;lowerBounds?:unknown};
      if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||!Array.isArray(envelope.lowerBounds)||!envelope.lowerBounds.every(Number.isSafeInteger)||!Object.hasOwn(envelope,'values')||Object.keys(envelope).some(k=>!['values','lowerBounds'].includes(k)))throw Error(name+': use {values: [...], lowerBounds: [...]} with the source array bounds.');
      const base=column.sourceType.replace(/\[\d*\]/g,'');
      const inspect=(input:unknown,depth=0):{shape:number[];value:unknown}=>{
        if(depth>20)throw Error(name+': array nesting is too deep for this demo.');
        if(!Array.isArray(input))return {shape:[],value:validateValue(input,base,true,name)};
        const parts=input.map(item=>inspect(item,depth+1));
        const shape=parts[0]?.shape??[];
        if(parts.some(part=>JSON.stringify(part.shape)!==JSON.stringify(shape)))throw Error(name+': PostgreSQL arrays must be rectangular.');
        return {shape:[input.length,...shape],value:parts.map(part=>part.value)};
      };
      if(!Array.isArray(envelope.values))throw Error(name+': values must be an array.');
      const checked=inspect(envelope.values);
      const dimensions=envelope.values.length===0?0:checked.shape.length;
      if(envelope.lowerBounds.length!==dimensions)throw Error(name+': supply one source lower bound per actual dimension; empty arrays have no bounds.');
      if(checked.shape.slice(1).includes(0))throw Error(name+': nested empty subarrays are not a PostgreSQL array shape.');
      for(let i=0;i<dimensions;i++){
        const lower=Number(envelope.lowerBounds[i]),upper=lower+checked.shape[i]-1;
        if(lower< -2147483648||lower>2147483647||upper>2147483647)throw Error(name+': array bounds exceed PostgreSQL limits.');
      }
      value={values:checked.value,lowerBounds:envelope.lowerBounds};
    }else value=validateValue(values[name],column.sourceType,column.nullable,name);
    if(value===null)continue;
    if(column.type==='i32')encoded[column.name]=i32(value as number);
    else if(column.type==='dec')encoded[column.name]=dec(value as string);
    else if(column.type==='bool')encoded[column.name]=bool(value as boolean);
    else if(column.type==='str'){
      const length=new TextEncoder().encode(value as string).length;
      if(length>(column.maxBytes??128))throw Error(name+': '+length+' UTF-8 bytes; this column allows '+(column.maxBytes??128)+'. Nothing was truncated.');
      encoded[column.name]=str(value as string);
    }else if(column.type==='bytes'){
      const binary=column.sourceType==='bytea'?Uint8Array.from(atob(value as string),c=>c.charCodeAt(0)):new TextEncoder().encode(JSON.stringify(value));
      encoded[column.name]=bytes(binary);
    }else throw Error('This demo cannot encode '+column.type+' columns.');
    (column.indexed?indexed:stored)[column.name]=column.type==='bytes'?value:encoded[column.name].value;
  }
  return {values:encoded,display:{indexed:Object.fromEntries(Object.entries(indexed)),stored:Object.fromEntries(Object.entries(stored))}};
}
