import test from 'node:test';import assert from 'node:assert/strict';
import {generateModel} from 'postgres-to-entity';
import {prepareRow,validateValue} from '../src/row.ts';
const model=generateModel({sql:'CREATE TABLE tickets (id UUID PRIMARY KEY, seat SMALLINT, price NUMERIC(8,2), used BOOLEAN, secret TEXT);',filters:[{table:'tickets',column:'used',operator:'eq'},{table:'tickets',column:'price',operator:'range'}],privateFields:[{table:'tickets',column:'secret'}],privacyReviewed:true,project:'tickets',policies:[{table:'tickets',owner:'Connected wallet',expiration:'One day',expirationBlocks:43200}]});
const entity=model.entities[0];const row={id:'00000000-0000-4000-8000-000000000001',seat:12,price:'12.50',used:false};

test('explicit text limit measures UTF-8 bytes, preserves email, and does not constrain stored columns',()=>{
 const sql='CREATE TABLE tickets (buyer_email TEXT);';
 const m=generateModel({sql,filters:[{table:'tickets',column:'buyer_email',operator:'eq'}],attributeLimits:[{table:'tickets',column:'buyer_email',maxBytes:128}]});
 const encode=(buyer_email:string)=>prepareRow(m.entities[0],m,JSON.stringify({buyer_email}));
 assert.equal(encode('test@gmail.com').display.indexed.buyer_email,'test@gmail.com');assert.deepEqual(encode('test@gmail.com').display.stored,{});
 assert.doesNotThrow(()=>encode('é'.repeat(64)));assert.throws(()=>encode('é'.repeat(65)),/130 UTF-8 bytes.+128/);
 const storedModel=generateModel({sql,filters:[]});assert.equal(prepareRow(storedModel.entities[0],storedModel,JSON.stringify({buyer_email:'é'.repeat(65)})).display.stored.buyer_email,'é'.repeat(65));
});
test('encodes real SDK values without scalar copies',()=>{const result=prepareRow(entity,model,JSON.stringify(row));assert.deepEqual(result.display.stored,{id:row.id,seat:12});assert.deepEqual(result.display.indexed,{price:'12.5',used:false});});
test('explicit null omits nullable indexed column; missing is not silently null',()=>{const result=prepareRow(entity,model,JSON.stringify({...row,used:null}));assert.ok(!Object.hasOwn(result.values,'used'));const {used,...missing}=row;assert.throws(()=>prepareRow(entity,model,JSON.stringify(missing)),/supply a value/);});
test('excluded source fields cannot leak to the transaction',()=>{assert.throws(()=>prepareRow(entity,model,JSON.stringify({...row,secret:'private'})),/excluded/);});
test('rejects precision loss, incompatible values and bounds before signing',()=>{for(const change of [{id:'wrong'},{seat:32768},{price:12.5},{price:'0.001'},{price:'1234567.00'},{used:'false'}])assert.throws(()=>prepareRow(entity,model,JSON.stringify({...row,...change})));});
test('large signed integers remain exact and respect source bounds',()=>{assert.equal(validateValue('-9223372036854775808','bigint',false,'id'),'-9223372036854775808');assert.throws(()=>validateValue('9223372036854775808','bigint',false,'id'));});
test('nested JSON and arrays reject unsafe integers and retain nulls',()=>{assert.deepEqual(validateValue([[1,null]],'integer[][]',false,'matrix'),[[1,null]]);assert.throws(()=>validateValue({x:9007199254740992},'jsonb',false,'meta'));});
test('hostile property names stay own properties, never prototype mutations',()=>{const m=generateModel({sql:'CREATE TABLE t (id UUID PRIMARY KEY, "__proto__" JSONB);',filters:[]});const p=prepareRow(m.entities[0],m,'{"id":"00000000-0000-4000-8000-000000000001","__proto__":{"value":{"x":1}}}');assert.ok(Object.hasOwn(p.values,m.entities[0].schema.columns.find(c=>c.source.column==='__proto__').name));assert.equal({}.x,undefined);});
test('validates dates, timezones, leap days and timestamp precision without guessing UTC',()=>{
 assert.equal(validateValue('2028-02-29','date',false,'day'),'2028-02-29');assert.throws(()=>validateValue('2026-02-29','date',false,'day'));
 assert.equal(validateValue('2026-09-18T18:00:00.123456','timestamp',false,'time'),'2026-09-18T18:00:00.123456');
 assert.throws(()=>validateValue('2026-09-18T18:00:00Z','timestamp',false,'time'));
 assert.throws(()=>validateValue('2026-09-18T18:00:00','timestamptz',false,'time'));
 assert.equal(validateValue('2026-09-18T18:00:00-05:00','timestamptz',false,'time'),'2026-09-18T18:00:00-05:00');
 assert.throws(()=>validateValue('2026-09-18T18:00:00.1234','timestamp(3)',false,'time'));
});

test('JSON null is distinct from SQL NULL and binary empty stays present',()=>{
 const m=generateModel({sql:'CREATE TABLE t (meta JSONB, body BYTEA);',filters:[]});
 const encode=(meta:unknown,body:unknown)=>prepareRow(m.entities[0],m,JSON.stringify({meta,body}));
 assert.equal(Object.hasOwn(encode(null,null).values,'meta'),false);
 const jsonNull=encode({value:null},'');
 assert.equal(Object.hasOwn(jsonNull.values,'meta'),true);
 assert.equal(jsonNull.values.body.value,'0x');
 assert.notEqual(jsonNull.values.meta.value,'0x');
 assert.throws(()=>encode({x:1},''),/distinguish JSON null/);
});

test('arrays preserve actual dimensions and lower bounds, independently from declared dimension syntax',()=>{
 const m=generateModel({sql:'CREATE TABLE t (matrix INTEGER[]);',filters:[]});
 const encode=(matrix:unknown)=>prepareRow(m.entities[0],m,JSON.stringify({matrix}));
 const envelope={values:[[1,null],[2,3]],lowerBounds:[-2,4]};
 assert.deepEqual(encode(envelope).display.stored.matrix,envelope);
 assert.deepEqual(encode({values:[],lowerBounds:[]}).display.stored.matrix,{values:[],lowerBounds:[]});
 assert.equal(Object.hasOwn(encode(null).values,'matrix'),false);
 assert.throws(()=>encode({values:[[1],[2,3]],lowerBounds:[1,1]}),/rectangular/);
 assert.throws(()=>encode({values:[[1]],lowerBounds:[1]}),/actual dimension/);
 assert.throws(()=>encode([1,2]),/source array bounds/);
});
