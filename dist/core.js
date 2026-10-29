export const dishes = [
  {id:'burger', name:'The classic cheeseburger', cuisine:'Burgers', tags:['burger'], emoji:'🍔', image:'burger', note:'Juicy patty. Melty cheese. Zero overthinking.'},
  {id:'pasta', name:'A little pasta therapy', cuisine:'Italian', tags:['italian','pasta'], emoji:'🍝', image:'pasta', note:'Twirl your way into a very good evening.'},
  {id:'thai', image:'thai', name:'Pad Thai kind of night', cuisine:'Thai', tags:['thai'], emoji:'🍜', note:'Sweet, tangy, nutty noodles. Yes, all of it.'},
  {id:'tacos', name:'Tacos are always an idea', cuisine:'Mexican', tags:['mexican','tex-mex','tacos'], emoji:'🌮', image:'tacos', note:'A squeeze of lime. A little heat. A happy you.'},
  {id:'sushi', name:'Let the good times roll', cuisine:'Sushi', tags:['sushi','japanese'], emoji:'🍣', image:'sushi', note:'Fresh bites, big flavor, one more roll.'},
  {id:'curry', name:'Your curry comfort zone', cuisine:'Indian', tags:['indian'], emoji:'🍛', image:'curry', note:'Rich, warming spices. Naan highly encouraged.'},
  {id:'pizza', name:'A slice of happiness', cuisine:'Pizza', tags:['pizza','italian'], emoji:'🍕', image:'pizza', note:'Crispy edges. Stretchy cheese. The whole pie?'},
  {id:'ramen', name:'A bowl worth slurping', cuisine:'Ramen', tags:['ramen','japanese'], emoji:'🍜', image:'ramen', note:'Deep broth and noodles for your soul.'},
  {id:'salad', name:'Fresh looks good on you', cuisine:'Salads', tags:['salad','vegetarian'], emoji:'🥗', image:'salad', note:'Bright, crunchy, colorful. Far from a side quest.'},
  {id:'bbq', name:'Low, slow, and smoky', cuisine:'Barbecue', tags:['barbecue','bbq'], emoji:'🍖', image:'bbq', note:'Smoky goodness. Extra napkins. No regrets.'},
  {id:'dumpling', image:'dumpling', name:'Little pockets of joy', cuisine:'Chinese', tags:['chinese','dumpling','dim_sum'], emoji:'🥟', note:'Steamed or crispy. Dip, bite, repeat.'},
  {id:'mediterranean', name:'Meet your mezze mood', cuisine:'Mediterranean', tags:['mediterranean','greek','lebanese','middle_eastern'], emoji:'🧆', note:'Falafel, hummus, warm pita. A very good spread.'},
  {id:'korean', name:'Bibimbap, big energy', cuisine:'Korean', tags:['korean'], emoji:'🍚', note:'A colorful bowl with a kick of gochujang.'},
  {id:'pho', image:'pho', name:'Pho the love of noodles', cuisine:'Vietnamese', tags:['vietnamese'], emoji:'🍲', note:'Fragrant broth, fresh herbs, all the comfort.'},
  {id:'breakfast', image:'breakfast', name:'Breakfast has no curfew', cuisine:'Breakfast', tags:['breakfast','brunch','pancake'], emoji:'🥞', note:'A fluffy stack and a drizzle of happiness.'},
  {id:'seafood', image:'seafood', name:'A taste of the coast', cuisine:'Seafood', tags:['seafood','fish'], emoji:'🍤', note:'A little ocean air, wherever you are.'},
  {id:'steak', name:'Make it a steak night', cuisine:'Steak', tags:['steak_house','steak'], emoji:'🥩', note:'A beautiful sear and your favorite sides.'},
  {id:'chicken', image:'chicken', name:'Crispy chicken calling', cuisine:'Chicken', tags:['chicken','fried_chicken'], emoji:'🍗', note:'That first crunchy bite. You know the one.'},
  {id:'sandwich', image:'sandwich', name:'Between two great slices', cuisine:'Sandwiches', tags:['sandwich','deli'], emoji:'🥪', note:'Stacked with the good stuff. Lunch, upgraded.'},
  {id:'ethiopian', name:'Injera and good company', cuisine:'Ethiopian', tags:['ethiopian'], emoji:'🍲', note:'Spiced stews, tangy injera, a meal to share.'},
  {id:'caribbean', name:'A little island flavor', cuisine:'Caribbean', tags:['caribbean','jamaican'], emoji:'🍗', note:'Jerk spices, plantains, and sunny-day energy.'},
  {id:'spanish', name:'One more little plate', cuisine:'Spanish', tags:['spanish','tapas'], emoji:'🥘', note:'Tapas or paella? Follow your appetite.'},
  {id:'french', image:'french', name:'A moment at the bistro', cuisine:'French', tags:['french'], emoji:'🥐', note:'Buttery, cozy, and worth slowing down for.'},
  {id:'dessert', image:'dessert', name:'Leave room for happy', cuisine:'Dessert', tags:['ice_cream','dessert','cake'], emoji:'🍨', note:'The sweetest way to finish your food adventure.'},
];
export function milesBetween(a,b){const r=Math.PI/180;const dlat=(b.lat-a.lat)*r,dlng=(b.lng-a.lng)*r;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;return 3958.7613*2*Math.asin(Math.min(1,Math.sqrt(h)));}
// A specific cuisine tag is better evidence than its broad family tag.
const cuisineFamilies={japanese:['sushi','ramen'],italian:['pizza','pasta']};
export function tasteProfile(votes={},cravings=[]){
 const selected=dishes.filter(d=>cravings.includes(d.id)).map(d=>d.id);
 const ratings=dishes.flatMap(d=>{
  const vote=selected.includes(d.id)?3:votes[d.id];
  return [-2,1,3].includes(vote)?[{...d,vote}]:[];
 });
 return {ratings,cravings:selected,yums:ratings.filter(d=>d.vote===3&&(!selected.length||selected.includes(d.id))).map(d=>d.id)};
}
function cuisineTaste(cuisines,profile){
 const specific=cuisines.filter(c=>!cuisineFamilies[c]?.some(child=>cuisines.includes(child)));
 const matches=profile.ratings.filter(d=>d.tags.some(t=>specific.includes(t)));
 const yums=matches.filter(d=>profile.yums.includes(d.id)).map(d=>d.id);
 return {blocked:matches.some(d=>d.vote===-2),yums,score:yums.length?3:matches.some(d=>d.vote===1)?1:0};
}
// Keep Meh candidates until travel times are known: a Yum may be out of reach.
export function tasteCandidates(places,profile){
 const hasPositive=profile.ratings.some(d=>d.vote>0);
 return places.flatMap(p=>{
  const taste=cuisineTaste(p.cuisines,profile);
  if(taste.blocked||(profile.cravings.length&&!taste.yums.length)||(hasPositive&&!taste.score))return [];
  return [{...p,score:taste.score,matchedYums:taste.yums,match:profile.cravings.length?'Craving right now':taste.score===3?'Yum match':taste.score===1?'Meh · backup option':'Not rated · explore the menu'}];
 });
}
export function normalizePlaces(elements,origin){const seen=new Set();return elements.flatMap(e=>{const t=e.tags||{},lat=e.lat??e.center?.lat,lng=e.lon??e.center?.lon;if(!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id)||e.id<1||!t.name||!Number.isFinite(lat)||!Number.isFinite(lng))return [];const key=t.name.toLowerCase()+':'+lat.toFixed(3)+':'+lng.toFixed(3);if(seen.has(key))return [];seen.add(key);return [{id:e.type+'/'+e.id,name:t.name,lat,lng,cuisines:(t.cuisine||'').toLowerCase().split(';').map(s=>s.trim()).filter(Boolean),address:[t['addr:housenumber'],t['addr:street'],t['addr:city']].filter(Boolean).join(' '),website:t.website||t['contact:website']||'',phone:t.phone||t['contact:phone']||'',hours:t.opening_hours||'',vegetarian:t['diet:vegetarian'],vegan:t['diet:vegan'],miles:milesBetween(origin,{lat,lng}),minutes:null}];});}
export function matchPlaces(places,{votes={},cravings=[],mode='distance',limit=5,diet='any',cuisine='all',savedOnly=false,saved=[],sort='match'}={}){
 const profile=tasteProfile(votes,cravings);
 const eligible=places.filter(p=>(mode==='time'?Number.isFinite(p.minutes)&&p.minutes>=0&&p.minutes<=limit:p.miles<=limit)&&(diet==='any'||['yes','only','designated'].includes(p[diet]))&&(cuisine==='all'||p.cuisines.includes(cuisine))&&(!savedOnly||saved.includes(p.id)));
 const candidates=tasteCandidates(eligible,profile);
 const missingYums=profile.yums.filter(id=>!candidates.some(p=>p.matchedYums.includes(id)));
 const allowMeh=!profile.yums.length||missingYums.length>0;
 const matches=candidates.filter(p=>p.score!==1||allowMeh).sort((a,b)=>
  b.score-a.score||(sort==='fastest'?(a.minutes??Infinity)-(b.minutes??Infinity):a.miles-b.miles)||a.miles-b.miles);
 return {places:matches,missingYums,showingMeh:matches.some(p=>p.score===1)};
}
export function rankPlaces(places,options){return matchPlaces(places,options).places;}
export function safeWebsite(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function validZip(zip){return /^\d{5}$/.test(zip);}
