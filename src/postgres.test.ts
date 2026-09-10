import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel } from './postgres.ts';
test('PostgreSQL public entry rejects document schemas and ambiguous mixed input',()=>{
 for(const input of [{schema:{tables:[]}}, {sql:'CREATE TABLE t (id INTEGER);',schema:{}},null]){
 const model=generateModel(input);assert.equal(model.status,'blocked');assert.equal(model.blockers[0]?.code,'postgres-required');
 }
});
test('PostgreSQL public entry produces scalar attribute without payload duplication',()=>{
 const model=generateModel({sql:'CREATE TABLE tickets (id UUID PRIMARY KEY, used BOOLEAN);',project:'tickets',filters:[{table:'tickets',column:'used',operator:'eq'}],privacyReviewed:true,policies:[{table:'tickets',owner:'Connected wallet',expiration:'At selected date; owner may extend'}]});
 assert.equal(model.status,'modelled');assert.ok(model.entities[0]?.attributes.some(a=>a.source?.column==='used'));assert.ok(!model.entities[0]?.payload.some(p=>p.source.column==='used'));
});
test('optional undefined schema is harmless in a normalized request object',()=>{
 const result=generateModel({sql:'CREATE TABLE t (id INTEGER PRIMARY KEY);',schema:undefined});assert.notEqual(result.status,'blocked');
});
