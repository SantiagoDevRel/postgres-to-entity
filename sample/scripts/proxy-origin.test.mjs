import {test} from 'node:test';
import assert from 'node:assert/strict';
import rpc from '../api/rpc.mjs';
import sample from '../api/sample.mjs';
const same = {host: 'sample.example', origin: 'https://sample.example', 'content-type': 'application/json'};
const cases = [
  ['foreign JSON origin', {...same, origin: 'https://foreign.example'}, 403],
  ['foreign plain-text origin', {...same, origin: 'https://foreign.example', 'content-type': 'text/plain'}, 403],
  ['same-origin plain text', {...same, 'content-type': 'text/plain'}, 415],
  ['missing content type', {host: same.host, origin: same.origin}, 415],
  ['odd content type', {...same, 'content-type': 'application/jsonp'}, 415],
  ['ambiguous content type', {...same, 'content-type': 'application/json, text/plain'}, 415],
  ['array content type', {...same, 'content-type': ['application/json']}, 415],
  ['cross-site without origin', {host: same.host, 'content-type': 'application/json', 'sec-fetch-site': 'cross-site'}, 403],
  ['cross-site despite matching origin', {...same, 'sec-fetch-site': 'cross-site'}, 403],
  ['cross-site metadata with whitespace and case', {...same, 'sec-fetch-site': ' Cross-Site '}, 403],
  ['malformed origin', {...same, origin: 'invalid-origin'}, 403],
  ['opaque origin', {...same, origin: 'null'}, 403],
  ['empty origin', {...same, origin: ''}, 403],
  ['different origin port', {...same, origin: 'https://sample.example:444'}, 403],
  ['origin with no request host', {origin: same.origin, 'content-type': 'application/json'}, 403],
];


async function invoke(endpoint, headers) {
 const previousFetch=globalThis.fetch, names=['ARKIV_ACCESS_KEY','P2E_SAMPLE_OWNER'], previous=names.map(n=>process.env[n]);let calls=0;
 process.env.ARKIV_ACCESS_KEY='example-test';process.env.P2E_SAMPLE_OWNER='0x'+'11'.repeat(20);
 globalThis.fetch=async(input,options)=>{calls++;const text=options?.body??(input instanceof Request?await input.clone().text():'{}'),body=JSON.parse(text);return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:body.method==='arkiv_query'?{data:[],blockNumber:'0x1'}:'0x76edaf'}),{headers:{'content-type':'application/json'}});};
 const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
 try {await (endpoint==='rpc'?rpc:sample)({method:endpoint==='rpc'?'POST':'GET',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})},res);return{status:res.statusCode,calls};}
 finally {globalThis.fetch=previousFetch;names.forEach((n,i)=>{if(previous[i]===undefined)delete process.env[n];else process.env[n]=previous[i];});}
}
for(const endpoint of ['rpc','sample'])for(const[name,headers,expected]of cases.filter(c=>endpoint==='rpc'||c[2]===403))test(endpoint+' rejects '+name+' before spending a key',async()=>{
 const result=await invoke(endpoint,headers);console.log(JSON.stringify({originCase:endpoint+' '+name,expected,status:result.status,upstreamCalls:result.calls}));assert.equal(result.calls,0,'rejected request must not reach upstream');assert.equal(result.status,expected);
});
const controls=[['same-origin JSON',same],['JSON with charset',{...same,'content-type':'application/json; charset=utf-8'}],['origin absent',{host:same.host,'content-type':'application/json'}],['matching port',{...same,host:'sample.example:444',origin:'https://sample.example:444'}]];
for(const endpoint of ['rpc','sample'])for(const[name,headers]of controls)test(endpoint+' allows '+name,async()=>{const result=await invoke(endpoint,headers);assert.equal(result.status,200);assert.equal(result.calls,1);});
test('sample GET allows missing and odd content type',async()=>{for(const headers of [{host:same.host,origin:same.origin},{...same,'content-type':'application/jsonp'}]){const result=await invoke('sample',headers);assert.equal(result.status,200);assert.equal(result.calls,1);}});
