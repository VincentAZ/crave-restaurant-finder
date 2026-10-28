import {dishes} from './core.js';
const validIds=new Set(dishes.map(d=>d.id));

export function updateRating(votes,history,id,value){
 if(!validIds.has(id)||![null,-2,1,3].includes(value))return {votes,history,changed:false};
 const previous=Object.hasOwn(votes,id)?votes[id]:null;
 if(previous===value)return {votes,history,changed:false};
 const next={...votes};
 if(value===null)delete next[id];else next[id]=value;
 return {votes:next,history:[...history,{id,previous}].slice(-100),changed:true};
}

export function undoRating(votes,history){
 if(!history.length)return {votes,history,changed:false};
 const {id,previous}=history.at(-1),next={...votes};
 if(previous===null)delete next[id];else next[id]=previous;
 return {votes:next,history:history.slice(0,-1),changed:true};
}
