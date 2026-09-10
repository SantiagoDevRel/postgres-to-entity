import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateModel} from 'postgres-to-entity';
import {eq,gt,gte,lt,lte,and,or,not,startsWith,render} from '@arkiv-network/sdk/query';
import {i32,u64,u256,dec} from '@arkiv-network/sdk';
import {filterExamples} from '../src/query-guide.ts';

const queryApi={eq,gt,gte,lt,lte,and,or,not,startsWith,i32,u64,u256,dec};
const attribute=(type:string)=>generateModel({sql:`CREATE TABLE t (value ${type});`,filters:[{table:'t',column:'value',operator:'eq'}]}).entities[0].attributes.find(a=>a.source?.column==='value');

test('numeric guide follows installed converter aliases and every example renders with SDK 0.8',()=>{
 for(const type of ['int2','integer','int8','bigserial','numeric(12,2)']){
  const a=attribute(type)!;assert.ok(a);
  const examples=filterExamples(a);assert.equal(examples.length,7);
  for(const example of examples){
   // Only this test's fixed examples are evaluated; production renders all strings as text.
   const predicate=Function(...Object.keys(queryApi),`return ${example.query}`)(...Object.values(queryApi));
   const expression=render(predicate);assert.ok(expression.includes(a.name));
   if(a.type==='dec')assert.match(expression,/dec\(/);
  }
  assert.match(examples.find(e=>e.name==='Between two values')!.query,/and\(gte\(.+lte\(/);
 }
});
test('string and boolean guides do not advertise numeric ordering',()=>{
 for(const type of ['varchar(24)','uuid','boolean']){
  const a=attribute(type)!;const examples=filterExamples(a);
  assert.ok(examples.every(e=>!/(?:gt|gte|lt|lte)\(/.test(e.query)));
  assert.equal(examples.some(e=>e.query.startsWith('startsWith(')),a.type==='str');
  for(const example of examples)assert.doesNotThrow(()=>render(Function(...Object.keys(queryApi),`return ${example.query}`)(...Object.values(queryApi))));
 }
});
test('unsupported encodings cannot masquerade as filterable strings or numbers',()=>{
 for(const type of ['text','numeric','timestamp','jsonb'])assert.equal(attribute(type),undefined);
});
test('NOT example explains missing attributes and unsafe SDK exports are never offered',()=>{
 const examples=filterExamples(attribute('integer')!);
 assert.match(examples.find(e=>e.query.startsWith('not('))!.explanation,/missing/);
 assert.ok(examples.every(e=>!/(?:ne|exists|hasType)\(/.test(e.query)));
});
test('hostile SQL names remain string arguments in generated SDK examples',()=>{
 const a={...attribute('integer')!,name:'x\"); throw Error(\"unsafe'};
 for(const example of filterExamples(a))assert.throws(()=>render(Function(...Object.keys(queryApi),`return ${example.query}`)(...Object.values(queryApi))),/Invalid attribute name/);
});
