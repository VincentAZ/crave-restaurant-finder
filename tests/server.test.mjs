import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../api/restaurants.js';
import {POST} from '../api/routes.js';
const url='https://crave.test/api/restaurants?lat=33.7352&lng=-112.1294&radius=5';
const origin={lat:33.7352,lng:-112.1294};
const routeRequest=body=>new Request('https://crave.test/api/routes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const fixture={type:'FeatureCollection',query:{apiKey:'server-test-secret'},features:[{type:'Feature',geometry:{type:'Point',coordinates:[-112.13,33.74]},properties:{name:'Fixture Kitchen',place_id:'fixture',datasource:{raw:{osm_type:'n',osm_id:1,cuisine:'thai'}}}}]};
async function withService(mock,fn){const fetch=global.fetch,key=process.env.GEOAPIFY_API_KEY,log=console.error;global.fetch=mock;process.env.GEOAPIFY_API_KEY='server-test-secret';console.error=()=>{};try{await fn();}finally{global.fetch=fetch;console.error=log;if(key===undefined)delete process.env.GEOAPIFY_API_KEY;else process.env.GEOAPIFY_API_KEY=key;}}

test('server alone injects the key and returns only public restaurant fields',async()=>{
 await withService(async address=>{const u=new URL(address);assert.equal(u.origin,'https://api.geoapify.com');assert.equal(u.searchParams.get('apiKey'),'server-test-secret');assert.equal(u.searchParams.get('limit'),'200');assert.equal(u.searchParams.get('filter'),'circle:-112.1294,33.7352,8047');return Response.json(fixture);},async()=>{
  const r=await GET(new Request(url));assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/s-maxage=900/);const body=await r.text();assert.match(body,/Fixture Kitchen/);assert.doesNotMatch(body,/server-test-secret|apiKey|query/);
 });
});
test('missing server configuration fails without asking visitors to enter a key',async()=>{
 await withService(()=>{throw Error('Must not fetch');},async()=>{delete process.env.GEOAPIFY_API_KEY;const r=await GET(new Request(url));assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/key|GEOAPIFY_API_KEY/);assert.equal(r.headers.get('cache-control'),'no-store');});
});
test('invalid or oversized searches are rejected before spending provider credits',async()=>{
 let calls=0;await withService(()=>{calls++;},async()=>{
  for(const suffix of ['lat=&lng=0&radius=5','lat=91&lng=0&radius=5','lat=0&lng=0&radius=36','lat=0&lng=0&radius=5&limit=999','lat=0&lat=1&lng=0&radius=5'])assert.equal((await GET(new Request('https://crave.test/api/restaurants?'+suffix))).status,400);
  for(const body of [{origin,targets:Array(121).fill(origin)},{origin,targets:[{lat:0,lng:0}]},{origin,targets:[]}])assert.equal((await POST(routeRequest(body))).status,400);
  assert.equal((await POST(routeRequest({origin,targets:[origin],junk:'x'.repeat(25000)}))).status,400);assert.equal(calls,0);
 });
});
test('routing uses fixed mode and one source while omitting provider debug data',async()=>{
 await withService(async(address,options)=>{assert.equal(new URL(address).pathname,'/v1/routematrix');const body=JSON.parse(options.body);assert.equal(body.mode,'drive');assert.deepEqual(body.sources,[{location:[origin.lng,origin.lat]}]);assert.equal(body.targets.length,2);return Response.json({query:{apiKey:'server-test-secret'},sources_to_targets:[[{time:240,distance:1500,target_index:0},{time:null,distance:null,target_index:1}]]});},async()=>{const r=await POST(routeRequest({origin,targets:[origin,origin]}));assert.equal(r.status,200);const d=await r.json();assert.equal(d.sources_to_targets[0][0].time,240);assert.equal(d.sources_to_targets[0][1].time,null);assert.doesNotMatch(JSON.stringify(d),/server-test-secret/);});
});
test('upstream errors and exceptions do not expose credentials in responses or logs',async()=>{
 const logs=[];
 await withService(async()=>new Response('Rejected URL ?apiKey=server-test-secret',{status:403}),async()=>{console.error=(...args)=>logs.push(args);const r=await GET(new Request(url));assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/server-test-secret/);});
 await withService(async()=>{throw Error('https://provider/?apiKey=server-test-secret');},async()=>{console.error=(...args)=>logs.push(args);const r=await GET(new Request(url));assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/server-test-secret/);});
 assert.doesNotMatch(JSON.stringify(logs),/server-test-secret/);
});
test('fresh requests need no cookies, browser storage, or credentials',async()=>{
 await withService(async()=>Response.json(fixture),async()=>{for(let i=0;i<2;i++){const request=new Request(url);assert.equal(request.headers.get('cookie'),null);assert.equal(request.headers.get('authorization'),null);assert.equal((await GET(request)).status,200);}});
});
test('wrong methods and cross-site browser requests never call the provider',async()=>{
 let calls=0;await withService(()=>{calls++;},async()=>{assert.equal((await GET(new Request(url,{method:'POST'}))).status,405);assert.equal((await POST(new Request('https://crave.test/api/routes'))).status,405);assert.equal((await GET(new Request(url,{headers:{'sec-fetch-site':'cross-site'}}))).status,403);assert.equal(calls,0);});
});
