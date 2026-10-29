import test from 'node:test';
import assert from 'node:assert/strict';
import {runSearch,sameSearchSettings} from '../dist/search.js';
import {rankPlaces} from '../dist/core.js';

const config={zip:'85004',mode:'time',limit:15};
const origin={lat:33.4557,lng:-112.0686,zip:'85004',label:'Phoenix, AZ'};
const fixtures=[{id:'node/1',name:'Sushi',miles:1,cuisines:['sushi','japanese'],minutes:null},{id:'node/2',name:'Ramen',miles:2,cuisines:['ramen','japanese'],minutes:null}];
const base={locateZip:async()=>origin,findRestaurants:async()=>fixtures,addDriveTimes:async places=>{places.forEach(p=>p.minutes=5);return 0;}};

test('quiz matches require a first search and refresh changed travel settings',()=>{
 assert.equal(sameSearchSettings(config,null),false);
 assert.equal(sameSearchSettings(config,{...config}),true);
 for(const change of [{zip:'10001'},{mode:'distance'},{limit:30}])assert.equal(sameSearchSettings({...config,...change},config),false);
});

test('search returns a complete, independent result with cuisine-aware route ordering',async()=>{
 const result=await runSearch(config,{sushi:-2,ramen:3},{services:base});
 assert.equal(result.places[0].id,'node/2');
 assert.equal(result.places[0].minutes,5);
 assert.equal(fixtures[0].minutes,null);
 assert.notEqual(result.places,fixtures);
 assert.notEqual(result.config,config);
});
test('failed road lookup rejects the search instead of returning partial state',async()=>{
 await assert.rejects(runSearch(config,{}, {services:{...base,addDriveTimes:async p=>p.length}}),/Driving times are unavailable/);
 assert.equal(fixtures[0].minutes,null);
});
test('cancel after a provider resolves still prevents a completed result',async()=>{
 const controller=new AbortController();
 await assert.rejects(runSearch({...config,mode:'distance',limit:5},{},{signal:controller.signal,services:{...base,findRestaurants:async()=>{controller.abort();return fixtures;}}}),{name:'AbortError'});
});
test('distance searches do not depend on the routing provider',async()=>{
 const result=await runSearch({...config,mode:'distance',limit:5},{},{services:{...base,addDriveTimes:()=>{throw Error('Must not route');}}});
 assert.equal(result.places.length,2);
 assert.equal(result.places[0].minutes,null);
});
test('unreachable routes are reported while valid routes remain usable',async()=>{
 const result=await runSearch(config,{},{services:{...base,addDriveTimes:async p=>{p[0].minutes=10;return 1;}}});
 assert.equal(result.routeFailed,1);
 assert.equal(result.places[1].minutes,null);
});

test('one total deadline cancels slow work and preserves the failure boundary',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let observed;
 const pending=assert.rejects(runSearch(config,{}, {services:{...base,locateZip:(_,signal)=>{observed=signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}}}),/stopped after 15 seconds/);
 t.mock.timers.tick(15000);await pending;assert.equal(observed.aborted,true);
 t.mock.timers.reset();
});

test('routing excludes Nah places before spending the candidate budget',async()=>{
 const blocked=Array.from({length:130},(_,i)=>({id:'blocked-'+i,cuisines:['sushi','ramen'],miles:.1,minutes:null}));
 const result=await runSearch(config,{sushi:-2,ramen:3},{services:{...base,findRestaurants:async()=>[...blocked,fixtures[1]],addDriveTimes:async places=>{
  assert.deepEqual(places.map(p=>p.id),['node/2']);places[0].minutes=5;return 0;
 }}});
 assert.equal(result.places.length,1);
});
test('routing keeps Meh candidates until Yum travel times are known',async()=>{
 const result=await runSearch(config,{sushi:1,ramen:3},{services:{...base,addDriveTimes:async places=>{
  assert.equal(places.length,2);places.find(p=>p.id==='node/2').minutes=25;places.find(p=>p.id==='node/1').minutes=5;return 0;
 }}});
 assert.deepEqual(rankPlaces(result.places,{votes:{sushi:1,ramen:3},mode:'time',limit:15}).map(p=>p.id),['node/1']);
});
test('current cravings guide routing and leave the saved taste unchanged',async()=>{
 const votes=Object.freeze({sushi:3,ramen:1});
 const result=await runSearch(config,votes,{cravings:['ramen'],services:base});
 assert.deepEqual(result.places.map(p=>p.id),['node/2']);assert.equal(votes.ramen,1);
});
test('excluding every candidate returns empty results without a route request',async()=>{
 const result=await runSearch(config,{sushi:-2,ramen:-2},{services:{...base,addDriveTimes:()=>{throw Error('Must not route');}}});
 assert.deepEqual(result.places,[]);assert.equal(result.routeFailed,0);
});
