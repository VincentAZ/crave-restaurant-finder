import {validZip} from './core.js';

function checkAbort(signal){signal?.throwIfAborted();}
function validCoordinates(point){return Number.isFinite(point.lat)&&Math.abs(point.lat)<=90&&Number.isFinite(point.lng)&&Math.abs(point.lng)<=180;}

export async function getJSON(url,{timeout=20000,signal,...options}={}){
 checkAbort(signal);
 const controller=new AbortController();
 const abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,timeout);
 try{
  const res=await fetch(url,{...options,signal:controller.signal});
  if(!res.ok){const error=new Error(`Service returned ${res.status}`);error.status=res.status;throw error;}
  return await res.json();
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export async function locateZip(zip,signal){
 if(!validZip(zip))throw new Error('Enter a valid 5-digit US ZIP code.');
 try{
  const d=await getJSON(`https://api.zippopotam.us/us/${zip}`,{signal,timeout:6000});
  const p=d.places?.[0];
  if(!p)throw new Error('Missing ZIP center');
  const location={lat:Number(p.latitude),lng:Number(p.longitude),label:`${p['place name']}, ${p['state abbreviation']}`,zip};
  if(!validCoordinates(location)||p.latitude==null||p.longitude==null)throw new Error('Invalid ZIP center');
  return location;
 }catch(error){
  checkAbort(signal);
  if(error.status===404)throw new Error('That ZIP code wasn’t found. Check the 5 digits and try again.');
  throw new Error('The ZIP lookup service is unavailable. Please check your connection and try again.');
 }
}

// Remove cached results left by earlier versions when clearing browser data.
export function clearRestaurantCache(){try{localStorage.removeItem('crave-restaurants-v1');}catch{}}
