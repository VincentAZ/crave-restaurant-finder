import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeoapifyServices,normalizeGeoapify,saveGeoapifyKey,getGeoapifyKey} from '../dist/geoapify.js';
const origin={lat:33.7352,lng:-112.1294};
const feature={type:'Feature',geometry:{type:'Point',coordinates:[-112.13,33.74]},properties:{name:'Fixture Kitchen',place_id:'fixture-id',categories:['catering.restaurant.thai'],datasource:{raw:{osm_type:'n',osm_id:123,cuisine:'thai;noodle',website:'https://example.test','diet:vegan':'yes'}}}};
const response={type:'FeatureCollection',features:[feature]};
const fixtureKey='fixture-key-not-real';

test('Geoapify preserves real cuisine, ownership evidence inputs, and OSM source identity',()=>{
 const [place]=normalizeGeoapify(response,origin);
 assert.equal(place.id,'node/123');assert.equal(place.website,'https://example.test');assert.equal(place.vegan,'yes');assert.deepEqual(place.cuisines,['thai','noodle']);assert.equal(place.minutes,null);assert.ok(place.miles>0);
});
test('unknown cuisine stays unknown and missing OSM ids retain a provider identity',()=>{
 const [place]=normalizeGeoapify({features:[{...feature,properties:{name:'Mystery Thai Name',place_id:'unique-123',categories:['catering.restaurant']}}]},origin);
 assert.deepEqual(place.cuisines,[]);assert.equal(place.id,'geoapify/unique-123');
 assert.deepEqual(normalizeGeoapify({features:[]},origin),[]);
 assert.throws(()=>normalizeGeoapify({features:[{properties:{name:'Broken'},geometry:{coordinates:[200,100]}}]},origin));
});
test('restaurant search sends the actual radius, coordinates and key to Geoapify only',async()=>{
 const original=global.fetch;
 global.fetch=async url=>{const u=new URL(url);assert.equal(u.origin,'https://api.geoapify.com');assert.equal(u.searchParams.get('apiKey'),fixtureKey);assert.equal(u.searchParams.get('filter'),'circle:-112.1294,33.7352,8047');assert.equal(u.searchParams.get('limit'),'200');return Response.json(response);};
 try{assert.equal((await createGeoapifyServices(fixtureKey).findRestaurants(origin,5))[0].name,'Fixture Kitchen');}finally{global.fetch=original;}
});
test('one matrix request calculates all road times; missing and negative times stay unavailable',async()=>{
 const original=global.fetch;let calls=0;
 global.fetch=async(url,options)=>{calls++;assert.match(url,/v1\/routematrix/);const body=JSON.parse(options.body);assert.equal(options.method,'POST');assert.deepEqual(body.sources,[{location:[-112.1294,33.7352]}]);assert.equal(body.targets.length,3);return Response.json({sources_to_targets:[[{target_index:2,time:300,distance:1609.344},{target_index:0,time:null,distance:null},{target_index:1,time:-1,distance:-1}]]});};
 try{const places=[0,1,2].map(()=>({...normalizeGeoapify(response,origin)[0],minutes:2}));assert.equal(await createGeoapifyServices(fixtureKey).addDriveTimes(places,origin),2);assert.deepEqual(places.map(p=>p.minutes),[null,null,5]);assert.equal(places[2].roadMiles,1);assert.equal(calls,1);}finally{global.fetch=original;}
});
test('authorization and quota errors give useful guidance without revealing the key',async()=>{
 const original=global.fetch;
 try{for(const [code,pattern] of [[401,/could not authorize/],[403,/allowed website origins/],[429,/request limit/]]){
 global.fetch=async()=>new Response('',{status:code});await assert.rejects(createGeoapifyServices(fixtureKey).findRestaurants(origin,5),error=>{assert.match(error.message,pattern);assert.ok(!error.message.includes(fixtureKey));return true;});
 }}finally{global.fetch=original;}
});
test('cached results survive a new service instance; expiry, key changes, and removal clear access',async()=>{
 const original=global.fetch,storage=global.localStorage;const entries=new Map();let calls=0;
 global.localStorage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
 global.fetch=async()=>{calls++;return Response.json(response);};
 try{
  saveGeoapifyKey(fixtureKey);assert.equal(getGeoapifyKey(),fixtureKey);
  await createGeoapifyServices(fixtureKey).findRestaurants(origin,5);
  await createGeoapifyServices(fixtureKey).findRestaurants(origin,5);assert.equal(calls,1);
  const cache=JSON.parse(entries.get('crave-geoapify-places-v1'));cache.at-=16*60000;entries.set('crave-geoapify-places-v1',JSON.stringify(cache));
  await createGeoapifyServices(fixtureKey).findRestaurants(origin,5);assert.equal(calls,2);
  saveGeoapifyKey('another-fixture-key');assert.equal(entries.has('crave-geoapify-places-v1'),false);
  saveGeoapifyKey('');assert.equal(getGeoapifyKey(),'');assert.equal(entries.has('crave-geoapify-key'),false);
 }finally{global.fetch=original;if(storage===undefined)delete global.localStorage;else global.localStorage=storage;}
});
test('cancellation propagates through Geoapify without becoming an outage message',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(createGeoapifyServices(fixtureKey).findRestaurants(origin,5,c.signal),{name:'AbortError'});
});

test('complete search uses ZIP → Geoapify places → Geoapify matrix and ranks real fields',async()=>{
 const {runSearch}=await import('../dist/search.js');const {rankPlaces}=await import('../dist/core.js');
 const original=global.fetch;const calls=[];
 global.fetch=async url=>{
  calls.push(new URL(url).pathname);
  if(url.includes('zippopotam'))return Response.json({places:[{latitude:String(origin.lat),longitude:String(origin.lng),'place name':'Phoenix','state abbreviation':'AZ'}]});
  if(url.includes('/v2/places'))return Response.json(response);
  if(url.includes('/v1/routematrix'))return Response.json({sources_to_targets:[[{time:240,distance:2100,target_index:0,source_index:0}]]});
  throw Error('Unexpected provider');
 };
 try{
  saveGeoapifyKey(fixtureKey);
  const result=await runSearch({zip:'85083',mode:'time',limit:5},{thai:3});
  const matches=rankPlaces(result.places,{votes:{thai:3},mode:'time',limit:5});
  assert.equal(matches.length,1);assert.equal(matches[0].minutes,4);assert.equal(matches[0].name,'Fixture Kitchen');
  assert.deepEqual(calls,['/us/85083','/v2/places','/v1/routematrix']);
 }finally{saveGeoapifyKey('');global.fetch=original;}
});
