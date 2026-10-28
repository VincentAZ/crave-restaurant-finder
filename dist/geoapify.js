import {getJSON} from './api.js';
import {milesBetween} from './core.js';

const endpoint='https://api.geoapify.com';
const storageKey='crave-geoapify-key';
const cacheKey='crave-geoapify-places-v1';
const TTL=15*60*1000;
let sessionKey;
export function getGeoapifyKey(){try{return sessionKey??localStorage.getItem(storageKey)??'';}catch{return sessionKey??'';}}
export function saveGeoapifyKey(value){
 const key=value.trim();
 if(key&&!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw Error('Paste the API key only, without a URL or spaces.');
 sessionKey=key;
 clearGeoapifyCache();
 try{if(key)localStorage.setItem(storageKey,key);else localStorage.removeItem(storageKey);}catch{}
}
export function clearGeoapifyCache(){try{localStorage.removeItem(cacheKey);}catch{}}

const text=value=>typeof value==='string'?value:'';
export function normalizeGeoapify(data,origin){
 if(!Array.isArray(data?.features))throw Error('Invalid place response');
 const seen=new Set();
 const places=data.features.flatMap(feature=>{
  const p=feature?.properties||{},raw=p.datasource?.raw||{};
  const name=text(p.name)||text(raw.name);
  const lat=p.lat??feature?.geometry?.coordinates?.[1],lng=p.lon??feature?.geometry?.coordinates?.[0];
  if(!name||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)return [];
  const type={n:'node',w:'way',r:'relation',node:'node',way:'way',relation:'relation'}[raw.osm_type];
  const osmId=Number(raw.osm_id);
  const id=type&&Number.isSafeInteger(osmId)&&osmId>0?`${type}/${osmId}`:p.place_id?`geoapify/${encodeURIComponent(p.place_id)}`:null;
  if(!id||seen.has(id))return [];seen.add(id);
  const cuisine=text(raw.cuisine)||text(p.catering?.cuisine);
  const cuisines=cuisine.toLowerCase().split(';').map(v=>v.trim()).filter(Boolean);
  // Only explicit provider cuisine categories, never guesses from a business name.
  if(!cuisines.length)for(const category of p.categories||[]){const match=/^catering\.(?:restaurant|fast_food)\.([a-z_]+)$/.exec(category);if(match)cuisines.push(match[1]);}
  return [{id,name,lat,lng,cuisines,address:[p.housenumber,p.street,p.city].filter(Boolean).join(' ')||text(p.address_line2),website:text(p.website)||text(raw.website)||text(raw['contact:website']),phone:text(p.contact?.phone)||text(raw.phone)||text(raw['contact:phone']),hours:text(p.opening_hours)||text(raw.opening_hours),vegetarian:text(raw['diet:vegetarian']),vegan:text(raw['diet:vegan']),miles:milesBetween(origin,{lat,lng}),minutes:null,roadMiles:null}];
 });
 if(data.features.length&&!places.length)throw Error('Invalid place response');
 return places;
}

function providerError(error,signal){
 signal?.throwIfAborted();
 if(error.status===401||error.status===403)return Error('Geoapify could not authorize this key. Open Restaurant search settings and check your key and allowed website origins.');
 if(error.status===429)return Error('Geoapify’s request limit was reached. Wait before searching again, or check your Geoapify quota. Your food choices are saved.');
 return Error('Geoapify could not complete the request. Your food choices are saved. Please try again shortly.');
}

export function createGeoapifyServices(apiKey){
 if(!apiKey)throw Error('Connect Geoapify in Restaurant search settings before searching.');
 const keyParam=encodeURIComponent(apiKey);
 return {
  async findRestaurants(origin,radiusMiles,signal){
   signal?.throwIfAborted();
   const area=`${origin.lat}:${origin.lng}:${radiusMiles}`;
   try{
    const saved=JSON.parse(localStorage.getItem(cacheKey));
    if(saved?.area===area&&Date.now()>=saved.at&&Date.now()-saved.at<TTL)return normalizeGeoapify(saved.data,origin);
   }catch{}
   try{
    const params=new URLSearchParams({categories:'catering.restaurant,catering.fast_food,catering.cafe,catering.ice_cream,catering.food_court',filter:`circle:${origin.lng},${origin.lat},${Math.ceil(radiusMiles*1609.344)}`,bias:`proximity:${origin.lng},${origin.lat}`,limit:'200',apiKey});
    const data=await getJSON(`${endpoint}/v2/places?${params}`,{signal,timeout:8000,referrerPolicy:'strict-origin-when-cross-origin'});
    const places=normalizeGeoapify(data,origin);
    signal?.throwIfAborted();
    try{localStorage.setItem(cacheKey,JSON.stringify({area,at:Date.now(),data}));}catch{}
    return places;
   }catch(error){throw providerError(error,signal);}
  },
  async addDriveTimes(places,origin,signal,onProgress){
   signal?.throwIfAborted();
   if(!places.length)return 0;
   places.forEach(p=>{p.minutes=null;p.roadMiles=null;});
   try{
    const data=await getJSON(`${endpoint}/v1/routematrix?apiKey=${keyParam}`,{signal,timeout:8000,method:'POST',headers:{'Content-Type':'application/json'},referrerPolicy:'strict-origin-when-cross-origin',body:JSON.stringify({mode:'drive',units:'metric',sources:[{location:[origin.lng,origin.lat]}],targets:places.map(p=>({location:[p.lng,p.lat]}))})});
    const rows=data.sources_to_targets?.[0];
    if(!Array.isArray(rows))throw Error('Invalid route response');
    for(const [index,row] of rows.entries()){
     const target=row?.target_index??index,p=places[target];
     if(!p||!Number.isInteger(target)||(row?.source_index!=null&&row.source_index!==0))continue;
     if(Number.isFinite(row?.time)&&row.time>=0)p.minutes=row.time/60;
     if(Number.isFinite(row?.distance)&&row.distance>=0)p.roadMiles=row.distance/1609.344;
    }
    signal?.throwIfAborted();
    onProgress?.(places.length,places.length);
    return places.filter(p=>p.minutes===null).length;
   }catch(error){throw providerError(error,signal);}
  }
 };
}
