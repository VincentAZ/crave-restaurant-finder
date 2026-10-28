import {milesBetween} from '../dist/core.js';

const limits=new Map();
const MAX_BODY=24000;
const categories='catering.restaurant,catering.fast_food,catering.cafe,catering.ice_cream,catering.food_court';
const fail=(status,message)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
const unavailable='Restaurant search is temporarily unavailable. Please try again later. Your food choices are saved.';
const validPoint=p=>p&&typeof p==='object'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180;

function allowRequest(request){
 // Best-effort per-instance throttling; provider quotas remain the global cap.
 const ip=request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')?.split(',')[0]||'local';
 const now=Date.now();
 if(limits.size>10000){for(const [key,value] of limits)if(now-value.start>=60000)limits.delete(key);if(limits.size>10000)return false;}
 let entry=limits.get(ip);
 if(!entry||now-entry.start>=60000){entry={start:now,count:0};limits.set(ip,entry);}
 return ++entry.count<=30;
}

async function readBody(request){
 if(Number(request.headers.get('content-length'))>MAX_BODY)throw Error('body');
 if(!request.headers.get('content-type')?.includes('application/json'))throw Error('body');
 const reader=request.body?.getReader();if(!reader)throw Error('body');
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw Error('body');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}

function placePayload(data){
 if(!Array.isArray(data?.features)||data.features.length>200)throw Error('invalid_data');
 const fields=['name','place_id','lat','lon','categories','housenumber','street','city','address_line2','website','opening_hours','contact','catering'];
 const rawFields=['name','osm_type','osm_id','cuisine','website','contact:website','phone','contact:phone','opening_hours','diet:vegetarian','diet:vegan'];
 return {type:'FeatureCollection',features:data.features.map(f=>{
  const p=f?.properties||{},raw=p.datasource?.raw||{};
  const properties=Object.fromEntries(fields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
  properties.datasource={raw:Object.fromEntries(rawFields.filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]))};
  return {type:'Feature',geometry:f?.geometry,properties};
 })};
}

function routePayload(data,count){
 const rows=data?.sources_to_targets?.[0];if(!Array.isArray(rows)||rows.length>count)throw Error('invalid_data');
 return {sources_to_targets:[rows.map((r,i)=>({source_index:0,target_index:Number.isInteger(r?.target_index)?r.target_index:i,time:Number.isFinite(r?.time)&&r.time>=0?r.time:null,distance:Number.isFinite(r?.distance)&&r.distance>=0?r.distance:null}))]};
}

export async function handleRestaurantRequest(request,operation){
 const expected=operation==='places'?'GET':'POST';
 if(request.method!==expected)return new Response(null,{status:405,headers:{Allow:expected,'Cache-Control':'no-store'}});
 if(request.headers.get('sec-fetch-site')==='cross-site')return fail(403,'Please search from Crave.');
 let origin,radius,targets;
 try{
  if(operation==='places'){
   const q=new URL(request.url).searchParams;
   if([...q.keys()].some(k=>!['lat','lng','radius'].includes(k))||['lat','lng','radius'].some(k=>q.getAll(k).length!==1||!q.get(k)?.trim()))throw Error('area');
   origin={lat:Number(q.get('lat')),lng:Number(q.get('lng'))};radius=Number(q.get('radius'));
   if(!validPoint(origin)||!Number.isFinite(radius)||radius<1||radius>35)throw Error('area');
  }else{
   const body=await readBody(request);origin=body.origin;targets=body.targets;
   if(!validPoint(origin)||!Array.isArray(targets)||targets.length<1||targets.length>120||targets.some(p=>!validPoint(p)||milesBetween(origin,p)>35.1))throw Error('routes');
  }
 }catch{return fail(400,'Please choose a valid search area and travel limit.');}
 const apiKey=process.env.GEOAPIFY_API_KEY?.trim();
 if(!apiKey){console.error('geoapify_not_configured');return fail(503,unavailable);}
 if(!allowRequest(request))return new Response(JSON.stringify({error:'You’re searching quickly. Please wait a minute and try again.'}),{status:429,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'60'}});
 const controller=new AbortController();const abort=()=>controller.abort();
 request.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,8000);
 try{
  request.signal?.throwIfAborted();
  const url=new URL(operation==='places'?'https://api.geoapify.com/v2/places':'https://api.geoapify.com/v1/routematrix');
  url.searchParams.set('apiKey',apiKey);
  const options={signal:controller.signal,redirect:'error'};
  if(operation==='places'){
   url.searchParams.set('categories',categories);url.searchParams.set('filter',`circle:${origin.lng},${origin.lat},${Math.ceil(radius*1609.344)}`);url.searchParams.set('bias',`proximity:${origin.lng},${origin.lat}`);url.searchParams.set('limit','200');
  }else{
   options.method='POST';options.headers={'Content-Type':'application/json'};
   options.body=JSON.stringify({mode:'drive',units:'metric',sources:[{location:[origin.lng,origin.lat]}],targets:targets.map(p=>({location:[p.lng,p.lat]}))});
  }
  const response=await fetch(url,options);
  if(!response.ok){
   // Never log upstream URLs, response bodies, or exception messages: they may contain the key.
   console.error('geoapify_response_error',{operation,status:response.status});
   if(response.status===429)return fail(429,'Restaurant search is busy right now. Please try again later. Your food choices are saved.');
   return fail(502,unavailable);
  }
  const data=await response.json();
  const payload=operation==='places'?placePayload(data):routePayload(data,targets.length);
  return Response.json(payload,{headers:{'Cache-Control':operation==='places'?'public, max-age=0, s-maxage=900':'no-store'}});
 }catch{
  console.error('geoapify_request_failed',{operation,aborted:controller.signal.aborted});
  return fail(controller.signal.aborted?504:502,unavailable);
 }finally{clearTimeout(timer);request.signal?.removeEventListener('abort',abort);}
}
