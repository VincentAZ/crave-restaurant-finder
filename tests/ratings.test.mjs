import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRating,undoRating} from '../dist/ratings.js';
import {rankPlaces} from '../dist/core.js';

test('changing Nah to Yum immediately reorders loaded restaurant matches',()=>{
 const votes={burger:-2,thai:1};
 const places=[{id:'burger',cuisines:['burger'],miles:1},{id:'thai',cuisines:['thai'],miles:2}];
 assert.equal(rankPlaces(places,{votes})[0].id,'thai');
 const next=updateRating(votes,[],'burger',3);
 assert.equal(rankPlaces(places,{votes:next.votes})[0].id,'burger');
 assert.equal(votes.burger,-2);assert.equal(next.votes.thai,1);
});
test('undo restores an edited answer instead of deleting it',()=>{
 let state=updateRating({},[],'burger',-2);
 state=updateRating(state.votes,state.history,'burger',3);
 state=undoRating(state.votes,state.history);
 assert.equal(state.votes.burger,-2);
 state=undoRating(state.votes,state.history);
 assert.equal(Object.hasOwn(state.votes,'burger'),false);
});
test('Not rated removes a preference and undo restores it',()=>{
 const state=updateRating({sushi:3,thai:1},[],'sushi',null);
 assert.deepEqual(state.votes,{thai:1});
 assert.deepEqual(undoRating(state.votes,state.history).votes,{sushi:3,thai:1});
});
test('invalid edits and unchanged choices do not add undo entries',()=>{
 const votes={burger:3};
 for(const [id,value] of [['__proto__',3],['burger',7],['burger',NaN],['burger',3]]){
  const state=updateRating(votes,[],id,value);assert.equal(state.changed,false);assert.deepEqual(state.history,[]);assert.deepEqual(state.votes,{burger:3});
 }
});
test('editing an earlier answer preserves all other ratings and undoes in edit order',()=>{
 let state=updateRating({burger:3,pasta:1,thai:-2},[],'burger',1);
 state=updateRating(state.votes,state.history,'thai',3);
 state=undoRating(state.votes,state.history);
 assert.deepEqual(state.votes,{burger:1,pasta:1,thai:-2});
 state=undoRating(state.votes,state.history);
 assert.deepEqual(state.votes,{burger:3,pasta:1,thai:-2});
});
