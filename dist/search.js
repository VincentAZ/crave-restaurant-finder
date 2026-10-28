import {preferences,cuisineScore,validZip} from './core.js';
import {locateZip} from './api.js';
import {createGeoapifyServices,getGeoapifyKey} from './geoapify.js';

export function sameSearchSettings(current,completed){
 return Boolean(completed)&&current.zip===completed.zip&&current.mode===completed.mode&&current.limit===completed.limit;
}

// Build a complete search before replacing the results currently on screen.
export async function runSearch(config,votes,{signal,onProgress=()=>{},services}={}){
 services??={locateZip,...createGeoapifyServices(getGeoapifyKey())};
 const deadline=new AbortController();
 const abort=()=>deadline.abort(signal.reason);
 signal?.throwIfAborted();
 signal?.addEventListener('abort',abort,{once:true});
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;deadline.abort();},15000);
 try{return await completeSearch(config,votes,{signal:deadline.signal,onProgress,services});}
 catch(error){
  signal?.throwIfAborted();
  if(timedOut)throw new Error('Search stopped after 15 seconds because a data service was too slow. Your food choices are saved. Try Distance if driving times are unavailable.');
  throw error;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

async function completeSearch(config,votes,{signal,onProgress,services}){
 signal?.throwIfAborted();
 const limits=config.mode==='time'?[5,10,15,20,30,45]:[1,3,5,10,15,25];
 if(!validZip(config.zip)||!['distance','time'].includes(config.mode)||!limits.includes(config.limit))throw new Error('Please choose a valid ZIP code and travel limit.');
 onProgress('Finding your neighborhood…',{stage:'location'});
 const origin=await services.locateZip(config.zip,signal);
 onProgress('Checking nearby restaurants… You can keep rating dishes.',{stage:'restaurants'});
 const radius=config.mode==='time'?Math.min(35,config.limit*1.2):config.limit;
 let places=await services.findRestaurants(origin,radius,signal);
 places=places.map(p=>({...p})).sort((a,b)=>a.miles-b.miles);
 let routeFailed=0,searchMeta='';
 if(config.mode==='time'){
  const pref=preferences(votes);
  places.sort((a,b)=>cuisineScore(b.cuisines,pref)-cuisineScore(a.cuisines,pref)||a.miles-b.miles);
  const total=places.length;
  places=places.slice(0,120);
  searchMeta=`Drive times checked for ${places.length} ${total>120?'candidates selected by your current taste and proximity':'places'} within a ${radius}-mile search area. `;
  onProgress(`Calculating road travel times for ${places.length} places…`,{stage:'routes',completed:0,total:places.length});
  routeFailed=await services.addDriveTimes(places,origin,signal,(n,total)=>onProgress(`Checking road routes… ${n} of ${total} places.`,{stage:'routes',completed:n,total}));
  if(places.length&&routeFailed===places.length)throw new Error('Driving times are unavailable right now. Switch to Distance to explore nearby places, or try again shortly.');
 }
 signal?.throwIfAborted();
 onProgress('Your restaurant matches are ready.',{stage:'complete'});
 return {origin,places,routeFailed,searchMeta,config:{...config}};
}
