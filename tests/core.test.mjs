import test from 'node:test';
import assert from 'node:assert/strict';
import {dishes,milesBetween,normalizePlaces,rankPlaces,matchPlaces,tasteProfile,safeWebsite,validZip} from '../dist/core.js';
const origin={lat:33.45,lng:-112.07};
const restaurant=(id,cuisines,miles,minutes=null,extras={})=>({id,name:id,cuisines,miles,minutes,...extras});
test('quiz offers distinct broad cuisines including burgers, pasta, Thai',()=>{assert.equal(new Set(dishes.map(d=>d.id)).size,24);for(const tag of ['burger','pasta','thai','chinese','ethiopian','korean','vietnamese'])assert.ok(dishes.some(d=>d.tags.includes(tag)));});
test('ZIP validation preserves leading zeros and rejects malformed data',()=>{assert.equal(validZip('02108'),true);for(const zip of ['1234','123456','12e34','<script>','ABCDE'])assert.equal(validZip(zip),false);});
test('distance uses miles, not degrees or kilometers',()=>{assert.equal(milesBetween(origin,origin),0);assert.ok(Math.abs(milesBetween({lat:0,lng:0},{lat:0,lng:1})-69.093)<.01);});
test('OSM normalization accepts nodes and way centers, deduplicates and rejects absent geometry',()=>{const tags={name:'Test Cafe',cuisine:'thai; vegetarian','diet:vegetarian':'yes'};const result=normalizePlaces([{type:'node',id:1,lat:33.45,lon:-112.07,tags},{type:'way',id:2,center:{lat:33.45,lon:-112.07},tags},{type:'node',id:3,tags},{type:'node',id:4,lat:33.47,lon:-112.07,tags:{name:'Second'}}],origin);assert.equal(result.length,2);assert.deepEqual(result[0].cuisines,['thai','vegetarian']);assert.equal(result[0].vegetarian,'yes');assert.equal(result[0].miles,0);assert.deepEqual(result[1].cuisines,[]);});
test('Nah is excluded and Meh stays hidden when every Yum choice has a match',()=>{
 const data=[restaurant('burger',['burger'],1),restaurant('thai',['thai'],2),restaurant('pasta',['pasta'],3),restaurant('unknown',[],.1)];
 const result=rankPlaces(data,{votes:{burger:-2,thai:3,pasta:1},limit:5});
 assert.deepEqual(result.map(r=>r.id),['thai']);assert.equal(result[0].match,'Yum match');
});
test('distance and driving filters use their own measures, and missing routes never count as zero minutes',()=>{const data=[restaurant('close-slow',['thai'],2,25),restaurant('far-fast',['thai'],8,10),restaurant('unrouted',['thai'],1,null),restaurant('boundary',['thai'],5,15)];assert.deepEqual(rankPlaces(data,{mode:'time',limit:15}).map(p=>p.id).sort(),['boundary','far-fast']);assert.deepEqual(rankPlaces(data,{mode:'distance',limit:5}).map(p=>p.id).sort(),['boundary','close-slow','unrouted']);});
test('dietary filter excludes unknown and no; cuisine filter is exact',()=>{const data=[restaurant('vegan',['thai'],1,4,{vegan:'yes'}),restaurant('unknown',['thai'],1,4),restaurant('no',['thai'],1,4,{vegan:'no'}),restaurant('other',['italian'],1,4,{vegan:'only'})];assert.deepEqual(rankPlaces(data,{diet:'vegan',cuisine:'thai'}).map(p=>p.id),['vegan']);});
test('unsafe and invalid external URLs never become restaurant website links',()=>{for(const url of ['javascript:alert(1)','data:text/html,hi','//bad.com','not a url'])assert.equal(safeWebsite(url),null);assert.equal(safeWebsite('https://example.com/menu'),'https://example.com/menu');});
test('sort and favorites selection remain deterministic',()=>{const data=[restaurant('a',['thai'],4,4),restaurant('b',['burger'],1,8)];assert.deepEqual(rankPlaces(data,{sort:'fastest'}).map(p=>p.id),['a','b']);assert.deepEqual(rankPlaces(data,{savedOnly:true,saved:['b']}).map(p=>p.id),['b']);});
test('Nah vetoes mixed restaurants while specific tags distinguish sibling foods',()=>{
 const data=[restaurant('sushi',['sushi','japanese'],1),restaurant('ramen',['ramen','japanese'],2),restaurant('both',['sushi','ramen','japanese'],3),restaurant('pizza',['italian','pizza'],1),restaurant('pasta',['italian','pasta'],2),restaurant('broad',['italian'],1)];
 const result=rankPlaces(data,{votes:{sushi:-2,ramen:3,pizza:-2,pasta:3}});
 assert.deepEqual(result.map(p=>p.id),['ramen','pasta']);
});
test('an unrelated Nah also vetoes a Yum restaurant in all sort orders and saved results',()=>{
 const data=[restaurant('mixed',['burger','thai'],1,1),restaurant('thai',['thai'],2,2)];
 for(const sort of ['match','nearest','fastest'])for(const savedOnly of [false,true]){
  assert.deepEqual(rankPlaces(data,{votes:{burger:-2,thai:3},sort,savedOnly,saved:['mixed','thai']}).map(p=>p.id),['thai']);
 }
});
test('Meh is a backup when any Yum choice is missing, even when another Yum is available',()=>{
 const data=[restaurant('thai',['thai'],4,4),restaurant('pasta',['pasta'],1,1)];
 for(const sort of ['match','nearest','fastest']){
  const result=matchPlaces(data,{votes:{thai:3,burger:3,pasta:1},sort});
  assert.deepEqual(result.places.map(p=>p.id),['thai','pasta']);
  assert.deepEqual(result.missingYums,['burger']);assert.equal(result.showingMeh,true);
  assert.equal(result.places[1].match,'Meh · backup option');
 }
});
test('Meh becomes available after travel, dietary, cuisine, or saved filters remove a Yum',()=>{
 const data=[restaurant('yum',['thai'],6,20,{vegan:'no'}),restaurant('meh',['pasta','thai'],1,4,{vegan:'yes'})];
 // The backup must not also match the Yum being removed.
 const separate=[data[0],{...data[1],cuisines:['pasta']}];
 for(const options of [{limit:5},{mode:'time',limit:15},{limit:10,diet:'vegan'},{limit:10,cuisine:'pasta'},{limit:10,savedOnly:true,saved:['meh']}]){
  assert.deepEqual(rankPlaces(separate,{votes:{thai:3,pasta:1},...options}).map(p=>p.id),['meh']);
 }
 assert.deepEqual(rankPlaces(separate,{votes:{thai:3,pasta:1},limit:10}).map(p=>p.id),['yum']);
});
test('missing routes and Nah-vetoed places cannot count as available Yums',()=>{
 const data=[restaurant('no-route',['thai'],1,null),restaurant('veto',['thai','burger'],1,1),restaurant('backup',['pasta'],1,1)];
 const result=matchPlaces(data,{votes:{thai:3,burger:-2,pasta:1},mode:'time',limit:5});
 assert.deepEqual(result.places.map(p=>p.id),['backup']);assert.deepEqual(result.missingYums,['thai']);
});
test('Meh-only profiles work and unrated places remain explorable before positive ratings',()=>{
 const data=[restaurant('burger',['burger'],1),restaurant('pasta',['pasta'],2),restaurant('unknown',[],3)];
 assert.deepEqual(rankPlaces(data,{votes:{pasta:1,burger:-2}}).map(p=>p.id),['pasta']);
 assert.deepEqual(rankPlaces(data,{votes:{burger:-2}}).map(p=>p.id),['pasta','unknown']);
 assert.equal(rankPlaces(data,{}).length,3);
 assert.equal(rankPlaces(data,{votes:{burger:-2,pasta:-2}}).some(p=>p.id==='burger'),false);
});
test('current cravings override a saved Meh or Nah without changing the saved ratings',()=>{
 const data=[restaurant('burger',['burger'],1),restaurant('thai',['thai'],2),restaurant('mixed',['burger','sushi'],1)];
 for(const rating of [1,-2]){
  const votes=Object.freeze({burger:rating,thai:3,sushi:-2});
  const result=rankPlaces(data,{votes,cravings:['burger']});
  assert.deepEqual(result.map(p=>p.id),['burger']);assert.equal(result[0].match,'Craving right now');
  assert.equal(votes.burger,rating);
  assert.deepEqual(rankPlaces(data,{votes,cravings:[]}).map(p=>p.id),['thai']);
 }
});
test('multiple cravings work before rating and missing cravings do not broaden the meal',()=>{
 const data=[restaurant('burger',['burger'],1),restaurant('thai',['thai'],2),restaurant('pasta',['pasta'],3)];
 assert.deepEqual(rankPlaces(data,{cravings:['burger','thai']}).map(p=>p.id),['burger','thai']);
 const result=matchPlaces(data,{votes:{pasta:1,burger:3},cravings:['sushi']});
 assert.deepEqual(result.places,[]);assert.deepEqual(result.missingYums,['sushi']);
 assert.deepEqual(tasteProfile({},['invalid','burger','burger']).cravings,['burger']);
});
