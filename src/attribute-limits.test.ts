import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateModel} from './postgres.ts';
const request={sql:'CREATE TABLE tickets (id UUID PRIMARY KEY, buyer_email TEXT);',filters:[{table:'tickets',column:'buyer_email',operator:'eq'}],attributeLimits:[{table:'tickets',column:'buyer_email',maxBytes:128}]};
test('explicit text byte limit enables an indexed column without changing or duplicating the SQL source',()=>{
 const result=generateModel(request);assert.deepEqual(result.blockers,[]);
 const entity=result.entities[0];const email=entity.schema.columns.filter(a=>a.indexed).find(a=>a.source?.column==='buyer_email')!;
 assert.equal(email.type,'str');assert.equal(email.sourceType,'text');assert.match(email.encoding,/maximum 128 bytes/);assert.match(email.encoding,/never truncate/);
 assert.ok(!entity.schema.columns.filter(p=>!p.indexed).some(p=>p.source.column==='buyer_email'));
 assert.ok(result.decisions.some(d=>d.code==='attribute-limit'&&d.field?.column==='buyer_email'));
 const unlimited=generateModel({...request,attributeLimits:undefined});assert.ok(unlimited.blockers.some(b=>b.code==='query-encoding'));
});
test('limits reject unknown fields, non-string types, duplicates, missing filters and invalid boundaries',()=>{
 for(const changes of [{attributeLimits:[{table:'tickets',column:'missing',maxBytes:128}]},{attributeLimits:[{table:'tickets',column:'id',maxBytes:128}]},{attributeLimits:[...request.attributeLimits,...request.attributeLimits]},{filters:[]},...[-1,0,129,1.5,'128'].map(maxBytes=>({attributeLimits:[{table:'tickets',column:'buyer_email',maxBytes}]}))])assert.equal(generateModel({...request,...changes}).status,'blocked');
});
test('moving bounded text to a stored column removes the index-specific limit',()=>{
 const result=generateModel({sql:request.sql,filters:[]});assert.deepEqual(result.blockers,[]);
 assert.ok(result.entities[0].schema.columns.filter(p=>!p.indexed).some(p=>p.source.column==='buyer_email'));assert.ok(!result.entities[0].schema.columns.filter(a=>a.indexed).some(a=>a.source?.column==='buyer_email'));
});
