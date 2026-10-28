import test from 'node:test';
import assert from 'node:assert/strict';
import {progressModel} from '../dist/progress.js';
import {runSearch} from '../dist/search.js';

test('unknown-duration lookup shows a stage, not a fabricated percentage',()=>{
 const m=progressModel('restaurants','distance');
 assert.equal(m.active,1);assert.equal(m.count,null);
 assert.ok(!('percent' in m));assert.equal(m.steps[2].label,'Plate your matches');
});
test('driving progress uses the actual route count and only completes after routing',async()=>{
 const updates=[];
 const services={locateZip:async()=>({lat:33,lng:-112}),findRestaurants:async()=>[{id:'node/1',cuisines:[],miles:1}],addDriveTimes:async(p,o,s,onProgress)=>{p[0].minutes=4;onProgress(1,1);return 0;}};
 await runSearch({zip:'85083',mode:'time',limit:15},{},{services,onProgress:(message,state)=>updates.push(state)});
 assert.equal(updates[0].stage,'location');assert.equal(updates[1].stage,'restaurants');
 assert.deepEqual(updates.at(-2),{stage:'routes',completed:1,total:1});
 assert.equal(updates.at(-1).stage,'complete');
 assert.equal(progressModel('routes','time',40,120).count,'40 of 120 routes checked');
});
test('a failed search never signals that the meal is ready',async()=>{
 const stages=[];
 const services={locateZip:async()=>{throw Error('offline');}};
 await assert.rejects(runSearch({zip:'85083',mode:'distance',limit:5},{},{services,onProgress:(message,state)=>stages.push(state.stage)}),/offline/);
 assert.deepEqual(stages,['location']);
});
