import {dishes,rankPlaces,safeWebsite,validZip,milesBetween} from './core.js';
import {runSearch,sameSearchSettings} from './search.js';
import {clearRestaurantCache,locateZip} from './api.js';
import {createGeoapifyServices,getGeoapifyKey,saveGeoapifyKey} from './geoapify.js';
import {ownershipFor} from './ownership.js';
import {progressModel} from './progress.js';
import {updateRating,undoRating} from './ratings.js';
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=s=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
const storedVotes=read('crave-votes',{});
let votes=Object.fromEntries(dishes.filter(d=>[-2,1,3].includes(storedVotes[d.id])).map(d=>[d.id,storedVotes[d.id]]));
let history=[],voteTimer=null,saved=read('crave-saved',[]);if(!Array.isArray(saved))saved=[];saved=saved.filter(p=>p&&typeof p.id==='string'&&/^(?:(node|way|relation)\/\d+|geoapify\/[a-zA-Z0-9_%.-]+)$/.test(p.id)&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Array.isArray(p.cuisines));
let places=[],visible=[],origin=null,searchConfig=null,cuisine='all',savedOnly=false,shown=9,busy=false,controller=null,toastTimer,voteBusy=false,routeFailed=0,searchMeta='';
let map,markers,originLayer,radiusLayer;const markerById=new Map();
function persist(){try{localStorage.setItem('crave-votes',JSON.stringify(votes));localStorage.setItem('crave-saved',JSON.stringify(saved));}catch{toast('Browser storage is unavailable. Favorites last for this visit.');}}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function updateConnectionStatus(){
 const configured=Boolean(getGeoapifyKey());
 $('#connection-status').textContent=configured?'Geoapify key saved in this browser. Search to find your matches.':'One-time setup: connect Geoapify to enable restaurant search.';
 $('#connection-button').textContent=configured?'Restaurant search settings':'Connect restaurant search';
}
function showSearchConnection(){
 if(busy){toast('Cancel the current search before changing the connection.');return;}
 $('#dialog-content').innerHTML=`<p class="eyebrow">LET’S STOCK THE KITCHEN</p><h2>Connect restaurant search</h2><p>Crave uses your Geoapify key to find places and calculate drive times. Set it up once in this browser.</p><ol class="connection-steps"><li><a href="https://myprojects.geoapify.com/" target="_blank" rel="noopener noreferrer">Create a free Geoapify account ↗</a> and create a project named Crave.</li><li>Open <strong>API Keys</strong> in that project. In the key’s restrictions, allow this website origin: <code>${escape(location.origin)}</code></li><li>Copy the key and paste it below. The free plan has a daily quota; drive-time searches use more credits than distance searches.</li></ol><form id="connection-form"><label for="geoapify-key">Geoapify API key</label><input id="geoapify-key" type="password" required autocomplete="off" spellcheck="false" placeholder="Paste your API key" aria-describedby="connection-note"><p id="connection-note" class="data-note">Saved only in this browser and sent directly to Geoapify when searching. Each browser needs its own setup. We will check it when you search.</p><p id="connection-error" role="alert"></p><button type="submit" class="primary">Save key & search</button>${getGeoapifyKey()?'<button type="button" class="outline-button" id="disconnect-provider">Remove saved key</button>':''}</form>`;
 $('#info-dialog').showModal();
 $('#connection-form').onsubmit=e=>{
  e.preventDefault();
  try{saveGeoapifyKey($('#geoapify-key').value);clearRestaurantCache();updateConnectionStatus();$('#info-dialog').close();search();}
  catch(error){$('#connection-error').textContent=error.message;}
 };
 const disconnect=$('#disconnect-provider');
 if(disconnect)disconnect.onclick=()=>{saveGeoapifyKey('');clearRestaurantCache();updateConnectionStatus();$('#info-dialog').close();toast('Geoapify key removed from this browser.');};
 $('#geoapify-key').focus();
}
$('#connection-button').onclick=showSearchConnection;
updateConnectionStatus();
function status(msg,error=false){$('#status').textContent=msg;$('#status').classList.toggle('error',error);$('#search-feedback').textContent=msg;$('#search-feedback').classList.toggle('error',error);}
let progressTimer=null,searchStarted=0;
function loading(msg,details={stage:'location'}){
 status(msg);
 const model=progressModel(details.stage,$('#mode').value,details.completed,details.total);
 $('#progress-title').textContent=model.title;
 $('#progress-message').textContent=msg;
 $('#progress-count').textContent=model.count||'You can keep rating dishes. No need to finish the whole quiz.';
 $('#progress-steps').innerHTML=model.steps.map((step,i)=>`<li class="${i<model.active?'done':i===model.active?'current':''}" ${i===model.active?'aria-current="step"':''}><span aria-hidden="true">${i<model.active?'✓':step.icon}</span> ${step.label}</li>`).join('');
}
function startProgress(){
 searchStarted=Date.now();$('#search-progress').hidden=false;$('#jump-results').hidden=true;$('#results').setAttribute('aria-busy','true');
 const tick=()=>{$('#progress-time').textContent=Math.floor((Date.now()-searchStarted)/1000)+'s elapsed';};tick();clearInterval(progressTimer);progressTimer=setInterval(tick,1000);
}
function stopProgress(){clearInterval(progressTimer);progressTimer=null;$('#search-progress').hidden=true;$('#results').setAttribute('aria-busy','false');$('#jump-results').hidden=!origin;}
function ownershipBadge(p){const info=ownershipFor(p);return info.local?`<button class="ownership-badge local" data-detail="${escape(p.id)}" title="Locally owned and operated · tap for sources">🌿 Local</button>`:'<span class="ownership-badge unknown">Local ownership unverified</span>';}
function ownershipDetails(p){const info=ownershipFor(p);return `<section class="ownership-detail"><h3>${info.local?'🌿 Local ownership & operation':'Local ownership unverified'}</h3><p>${escape(info.summary)}</p>${info.local?`<p class="data-note">Sources checked ${info.reviewedOn}. Best-effort evidence, not a guarantee of unchanged ownership.</p><ul>${info.sources.map(source=>`<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a></li>`).join('')}</ul>`:''}</section>`;}

function initializeMap(){if(!window.L){$('#map-prompt').innerHTML='<strong>The map couldn’t load.</strong><p>Restaurant search still works. Refresh to try the map again.</p>';return;}map=L.map('map',{zoomControl:false,scrollWheelZoom:false}).setView([33.4557,-112.0686],12);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map);L.control.zoom({position:'bottomright'}).addTo(map);markers=L.layerGroup().addTo(map);new ResizeObserver(()=>map.invalidateSize()).observe($('#map'));}
function currentDish(){return dishes.find(d=>!(d.id in votes));}
function renderRatings(){
 $('#rating-list-count').textContent=`${Object.keys(votes).length} / ${dishes.length} rated · Edit anytime`;
 $('#rating-list').innerHTML=dishes.map(d=>`<div class="rating-row" data-rating-state="${votes[d.id]??'none'}"><label for="rating-${d.id}"><span aria-hidden="true">${d.emoji}</span><span><strong>${escape(d.cuisine)}</strong><small>${escape(d.name)}</small></span></label><select id="rating-${d.id}" data-rating-id="${d.id}" aria-label="Your rating for ${escape(d.cuisine)}" ${voteBusy?'disabled':''}>${[['','Not rated'],['-2','Nah'],['1','Hmm, maybe'],['3','Yum!']].map(([value,label])=>`<option value="${value}" ${String(votes[d.id]??'')===value?'selected':''}>${label}</option>`).join('')}</select></div>`).join('');
}
function changeRating(id,value){
 const next=updateRating(votes,history,id,value);
 if(!next.changed)return false;
 votes=next.votes;history=next.history;persist();renderQuiz();renderResults();return true;
}
function renderQuiz(){renderRatings();const d=currentDish(),count=Object.keys(votes).length;$('#quiz-counter').textContent=`${Math.min(count+1,dishes.length)} / ${dishes.length}`;$('#undo').disabled=!history.length;$('#vote-buttons').hidden=!d;$('#food-card').classList.toggle('completion',!d);$('#more-food').hidden=count<3||!d;
 if(d){const art=$('#dish-art');art.className='dish-art'+(d.image?'':' illustration');art.replaceChildren();if(d.image){const img=new Image();img.src=`assets/${d.image}.jpg`;img.alt=d.cuisine+' food inspiration';img.onerror=()=>{art.classList.add('illustration');art.innerHTML=`<span class="big-emoji" aria-hidden="true">${d.emoji}</span>`;};art.append(img);}else{art.innerHTML=`<span class="big-emoji" aria-hidden="true">${d.emoji}</span>`;}$('#dish-category').textContent=d.cuisine;$('#dish-name').textContent=d.name;$('#dish-note').textContent=d.note;$('#food-card').setAttribute('aria-label',`${d.name}. ${d.note} Use left arrow for Nah, down arrow for Maybe, right arrow for Yum.`);const next=dishes[dishes.indexOf(d)+1];if(next?.image){const preload=new Image();preload.src=`assets/${next.image}.jpg`;}}
 else{$('#dish-art').className='dish-art';$('#dish-art').innerHTML='<div class="completion-art"><div><span>✦</span><h3>Good taste. Great choices.</h3><p>Your flavor profile is ready.<br>Your favorite cuisines rise to the top.</p><button class="primary" id="quiz-results">Show my matches ↗</button></div></div>';$('#food-card').setAttribute('aria-label','Taste quiz complete');$('#quiz-results').onclick=findMatchesFromQuiz;$('#quiz-counter').textContent='24 / 24 · Done';}
 const liked=dishes.filter(d=>votes[d.id]===3).map(d=>d.cuisine);$('#taste-title').textContent=count?`${count} cravings explored. ${liked.length} big yums.`:'Your taste, taking shape.';$('#taste-description').textContent=liked.length?liked.slice(-4).join(' · ')+(liked.length>4?' + more':''):count?'Still exploring? Maybes count too. Your next favorite is out there.':'Rate a few dishes to make your matches more you.';$('#quiz-hint').textContent=count>=6?'Your flavor profile is getting delicious.':'Rate as many or as few as you like. No need to finish all 24.';}
function vote(value){
 const d=currentDish();if(!d||voteBusy)return;
 voteBusy=true;renderRatings();
 const stamp=$('#vote-stamp');stamp.textContent=value===3?'YUM!':value===1?'MAYBE':'NAH';stamp.classList.add('show');
 voteTimer=setTimeout(()=>{
  voteBusy=false;changeRating(d.id,value);stamp.classList.remove('show');
  if(Object.keys(votes).length===6)toast('You can edit any answer in Your food choices below.');
 },220);
}
function undo(){
 if(voteBusy)return;
 const next=undoRating(votes,history);if(!next.changed)return;
 votes=next.votes;history=next.history;persist();renderQuiz();renderResults();toast('Last rating change undone.');
}
function directions(p){return `https://www.google.com/maps/dir/?api=1${origin?'&origin='+encodeURIComponent(origin.lat+','+origin.lng):''}&destination=${encodeURIComponent(p.lat+','+p.lng)}&travelmode=driving`;}
function cuisineInfo(p){const d=dishes.find(d=>d.tags.some(t=>p.cuisines.includes(t)));return {emoji:d?.emoji||'🍽',label:p.cuisines.length?p.cuisines.map(title).join(' · '):'Cuisine not listed'};}
function popup(p){const info=cuisineInfo(p);return `<div class="popup-title">${escape(p.name)}</div><div class="popup-details">${escape(info.label)}<br>${Number.isFinite(p.miles)?p.miles.toFixed(1):'—'} mi radius${Number.isFinite(p.minutes)?` · ~${Math.max(1,Math.round(p.minutes))} min drive`:''}<br><a href="${directions(p)}" target="_blank" rel="noopener noreferrer">Get directions ↗</a></div>`;}
function renderMap(fit=false){if(!map)return;if(radiusLayer){if(savedOnly)map.removeLayer(radiusLayer);else if(!map.hasLayer(radiusLayer))radiusLayer.addTo(map);}markers.clearLayers();markerById.clear();visible.slice(0,100).forEach((p,i)=>{const icon=L.divIcon({html:`<div class="restaurant-marker ${p.score>1?'hot':''}"><span>${i+1}</span></div>`,className:'',iconSize:[32,32],iconAnchor:[16,30]});const marker=L.marker([p.lat,p.lng],{icon,title:p.name}).bindPopup(popup(p)).addTo(markers);markerById.set(p.id,marker);marker.on('click',()=>highlight(p.id,false));});$('#map-legend').textContent=visible.length?`${Math.min(100,visible.length)} places on the map · orange = your kind of food`:origin?'ZIP center · blue pin':'Your neighborhood, deliciously mapped.';if(fit)fitMap();}
function fitMap(){if(!map)return;const bounds=visible.slice(0,100).map(p=>[p.lat,p.lng]);if(origin)bounds.push([origin.lat,origin.lng]);if(bounds.length>1)map.fitBounds(bounds,{padding:[55,60],maxZoom:14});else if(origin)map.setView([origin.lat,origin.lng],13);}
function highlight(id,scroll=true){const index=visible.findIndex(p=>p.id===id);if(index>=shown){shown=Math.ceil((index+1)/9)*9;renderResults();markerById.get(id)?.openPopup();}document.querySelectorAll('.restaurant-card.highlight').forEach(el=>el.classList.remove('highlight'));const card=document.getElementById('place-'+id.replace('/','-'));if(card){card.classList.add('highlight');if(scroll)card.scrollIntoView({behavior:'smooth',block:'center'});}}
function renderFilters(){const source=savedOnly?saved:places;const tags=[...new Set(source.flatMap(p=>p.cuisines))].sort();if(!tags.includes(cuisine))cuisine='all';$('#cuisine-filters').innerHTML=`<button class="chip ${cuisine==='all'?'selected':''}" data-cuisine="all">All cuisines</button>`+tags.map(c=>`<button class="chip ${cuisine===c?'selected':''}" data-cuisine="${escape(c)}">${escape(title(c))}</button>`).join('');}
function renderResults(fit=false){$('#saved-count').textContent=saved.length;$('#saved-nav').classList.toggle('active',savedOnly);$('#explore-nav').classList.toggle('active',!savedOnly);const source=savedOnly?saved.map(p=>{const live=places.find(x=>x.id===p.id);return live||{...p,miles:origin?milesBetween(origin,p):Infinity,minutes:null};}):places;const options={votes,mode:searchConfig?.mode||'distance',limit:searchConfig?.limit||5,diet:$('#diet').value,cuisine,sort:$('#sort').value};visible=savedOnly?rankPlaces(source,{...options,mode:'distance',limit:Infinity}):rankPlaces(source,options);
 $('#results-heading').textContent=savedOnly?'Your little black book.':places.length?(Object.keys(votes).length?'A little more your flavor.':'Good things are nearby.'):'Good things are nearby.';$('#results-description').textContent=savedOnly?`${visible.length} saved ${visible.length===1?'place':'places'}${cuisine!=='all'||$('#diet').value!=='any'?' matching your filters':''}. Saved on this browser.`:origin&&searchConfig?`${visible.length} ${visible.length===1?'place':'places'} within ${searchConfig.limit} ${searchConfig.mode==='time'?'min drive':'miles'} of ${origin.label} · ${origin.zip}`:'Set your neighborhood to discover real restaurants.';
 $('#jump-results').textContent=`See ${visible.length} restaurants ↓`;$('#jump-results').hidden=!origin||busy;$('#surprise').disabled=!visible.length||busy;$('#load-more').hidden=visible.length<=shown;
 if(!visible.length){const message=savedOnly?'Tap a heart on any restaurant to keep it here.':places.length?'Try another cuisine, a wider travel limit, or “Any menu.”':origin?'Try a wider travel limit or another ZIP code.':'Your matches will land here. Search above, then rate a few dishes.';$('#results').innerHTML=`<div class="empty-state"><span>${savedOnly?'♡':'🍽'}</span><h3>${savedOnly?'Room for a new favorite.':origin?'Let’s widen the menu.':'Big cravings. Local discoveries.'}</h3><p>${message}</p></div>`;}
 else{$('#results').innerHTML=visible.slice(0,shown).map((p,i)=>{const info=cuisineInfo(p),isSaved=saved.some(s=>s.id===p.id),isInSearch=places.some(x=>x.id===p.id);return `<article class="restaurant-card" id="place-${p.id.replace('/','-')}"><div class="restaurant-top"><div class="restaurant-emoji" aria-hidden="true">${info.emoji}</div><div><h3>${i+1}. ${escape(p.name)}</h3><p>${escape(info.label)}</p></div><button class="save-button ${isSaved?'saved':''}" data-save="${p.id}" aria-label="${isSaved?'Unsave':'Save'} ${escape(p.name)}" aria-pressed="${isSaved}">${isSaved?'♥':'♡'}</button></div><span class="match-label">${p.score>1?'✦ ':''}${p.cuisines.length?escape(p.match):'Cuisine unknown · explore the menu'}</span>${ownershipBadge(p)}<div class="restaurant-metrics"><span>⌖ ${isInSearch?p.miles.toFixed(1)+' mi radius':'Saved place'}</span><span>${Number.isFinite(p.minutes)?'↗ ~'+Math.max(1,Math.round(p.minutes))+' min drive':searchConfig?.mode==='time'&&isInSearch?'Drive time unavailable':'Check route ↗'}</span></div><div class="restaurant-address">${escape(p.address||'Street address not listed')}</div><div class="restaurant-actions"><button data-detail="${p.id}">Details & map</button><a href="${directions(p)}" target="_blank" rel="noopener noreferrer">Let’s go ↗</a></div></article>`;}).join('');}renderMap(fit);}
function showDetails(p){if(!p)return;const site=safeWebsite(p.website),info=cuisineInfo(p);const number=(p.phone||'').replace(/[^+\d;,#*]/g,'');$('#dialog-content').innerHTML=`<p class="eyebrow">${info.emoji} ${escape(info.label)}</p><h2>${escape(p.name)}</h2><p>${escape(p.address||'Street address not listed in OpenStreetMap.')}</p>${ownershipDetails(p)}<p><strong>Hours listed by the community</strong><br>${escape(p.hours||'Hours not available. Please check with the restaurant.')}</p>${p.phone?`<p>Phone: ${number?`<a href="tel:${escape(number)}">${escape(p.phone)}</a>`:escape(p.phone)}</p>`:''}${site?`<p><a href="${escape(site)}" target="_blank" rel="noopener noreferrer">Restaurant website / menu ↗</a></p>`:''}<p><a href="${directions(p)}" target="_blank" rel="noopener noreferrer">Open driving directions ↗</a> · ${/^(node|way|relation)\/\d+$/.test(p.id)?`<a href="https://www.openstreetmap.org/${p.id}" target="_blank" rel="noopener noreferrer">View source ↗</a>`:`<a href="https://www.geoapify.com/places-api/" target="_blank" rel="noopener noreferrer">Data: Geoapify ↗</a>`}</p><p class="data-note">Cuisine matches use community cuisine tags, not confirmed dishes on today’s menu. Verify dietary needs, hours, and availability directly.</p><button class="primary" id="detail-map">Show on map</button>`;$('#info-dialog').showModal();$('#detail-map').onclick=()=>{$('#info-dialog').close();$('#map').scrollIntoView({behavior:'smooth',block:'center'});if(map){map.setView([p.lat,p.lng],15);const marker=markerById.get(p.id)||L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="restaurant-marker hot"><span>♥</span></div>',iconSize:[32,32],iconAnchor:[16,30]})}).bindPopup(popup(p)).addTo(markers);marker.openPopup();}};}
function currentSearchSettings(){return {zip:$('#zip').value.trim(),mode:$('#mode').value,limit:Number($('#limit').value)};}
async function findMatchesFromQuiz(){
 if(busy){$('#search-form').scrollIntoView({behavior:'smooth',block:'center'});return;}
 const config=currentSearchSettings();
 if(!sameSearchSettings(config,searchConfig)){
  $('#search-form').scrollIntoView({behavior:'smooth',block:'center'});
  if(!(await search()))return;
 }
 savedOnly=false;shown=9;cuisine='all';renderFilters();renderResults(true);
 $('#results-section').scrollIntoView({behavior:'smooth',block:'start'});
}
async function search(e){
 e?.preventDefault();
 const zip=$('#zip').value.trim();
 if(!validZip(zip)){status('Enter a valid 5-digit US ZIP code.',true);$('#zip').focus();return;}
 if(busy)return;
 const apiKey=getGeoapifyKey();
 if(!apiKey){showSearchConnection();status('Connect your free Geoapify key to enable restaurant search.',true);return;}
 controller=new AbortController();
 const signal=controller.signal;
 const config=currentSearchSettings();
 busy=true;$('#retry-search').hidden=true;startProgress();
 $('#search-button').disabled=true;
 $('#search-button').textContent='Finding your next bite…';
 $('#cancel-search').hidden=false;
 $('#cancel-search').disabled=false;
 $('#surprise').disabled=true;
 for(const id of ['zip','mode','limit'])$('#'+id).disabled=true;
 try{
  const result=await runSearch(config,{...votes},{signal,onProgress:loading,services:{locateZip,...createGeoapifyServices(apiKey)}});
  // Commit together: a failed or canceled search cannot mix two neighborhoods.
  origin=result.origin;places=result.places;searchConfig=result.config;
  routeFailed=result.routeFailed;searchMeta=result.searchMeta;
  savedOnly=false;shown=9;cuisine='all';
  try{localStorage.setItem('crave-search',JSON.stringify(config));}catch{}
  $('#map-prompt').hidden=true;
  $('#map-location').textContent='⌖ '+origin.label+' · '+zip;
  if(map){
   if(originLayer)map.removeLayer(originLayer);
   if(radiusLayer){map.removeLayer(radiusLayer);radiusLayer=null;}
   originLayer=L.marker([origin.lat,origin.lng],{icon:L.divIcon({className:'',html:'<div class="origin-marker"></div>',iconSize:[16,16]}),title:'ZIP code center'}).bindPopup('Approximate center of ZIP '+zip).addTo(map);
   if(config.mode==='distance')radiusLayer=L.circle([origin.lat,origin.lng],{radius:config.limit*1609.344,color:'#8d9f75',weight:1,dashArray:'4 5',fillColor:'#afc591',fillOpacity:.05}).addTo(map);
   map.setView([origin.lat,origin.lng],12);
  }
  if(config.mode==='time')status('Geoapify · Up to 200 nearby places considered. '+searchMeta+'Estimates start at the ZIP center and exclude live traffic.'+(routeFailed?' Some routes could not be checked and are excluded.':''));
  else status(places.length?'Up to 200 nearby places from Geoapify. Rate dishes to move your favorite cuisines to the top.':'No restaurants were returned for this area. Try a wider radius.');
  renderFilters();renderResults(true);
  if($('#diet').value!=='any')toast('Dietary filters include only places explicitly tagged with those options.');
  return true;
 }catch(error){
  if(signal.aborted)status('Search canceled.'+(origin?' Your previous results are still shown.':' Your taste quiz is saved.'));
  else{$('#retry-search').hidden=false;status(error.message||'Search failed. Please try again.',true);if(origin)toast('Search failed. Your previous results are still shown.');}
 }finally{
  busy=false;stopProgress();
  $('#search-button').disabled=false;
  $('#search-button').innerHTML='Find restaurants <span>↗</span>';
  $('#cancel-search').hidden=true;
  for(const id of ['zip','mode','limit'])$('#'+id).disabled=false;
  $('#surprise').disabled=!visible.length;
 }
}
function setSaved(value){savedOnly=value;shown=9;cuisine='all';$('#diet').value='any';renderFilters();renderResults(true);$('#results-section').scrollIntoView({behavior:'smooth'});}
$('#search-form').addEventListener('submit',search);
$('#retry-search').onclick=search;
$('#rating-list').addEventListener('change',event=>{
 const select=event.target.closest('[data-rating-id]');if(!select)return;
 if(voteBusy){renderRatings();return;}
 const id=select.dataset.ratingId,focusId=select.id,value=select.value===''?null:Number(select.value);
 if(changeRating(id,value))toast(origin?'Choice saved. Loaded matches updated.':'Choice saved. It will guide your next search.');
 document.getElementById(focusId)?.focus({preventScroll:true});
});
$('#jump-results').onclick=()=>$('#results-section').scrollIntoView({behavior:'smooth',block:'start'});
$('#more-food').onclick=findMatchesFromQuiz;
$('#cancel-search').onclick=()=>{$('#cancel-search').disabled=true;controller?.abort();};
$('#mode').onchange=()=>{const time=$('#mode').value==='time';$('#limit').innerHTML=(time?[5,10,15,20,30,45]:[1,3,5,10,15,25]).map(n=>`<option value="${n}" ${n===(time?15:5)?'selected':''}>${n} ${time?'minutes':n===1?'mile':'miles'}</option>`).join('');};
document.querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>vote(Number(b.dataset.vote)));
$('#food-card').addEventListener('keydown',e=>{if(e.target!==$('#food-card'))return;const keys={ArrowLeft:-2,ArrowDown:1,ArrowRight:3};if(e.key in keys){e.preventDefault();vote(keys[e.key]);}});
let touchStart=null;$('#food-card').addEventListener('touchstart',e=>{touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});$('#food-card').addEventListener('touchend',e=>{if(!touchStart)return;const dx=e.changedTouches[0].clientX-touchStart.x,dy=e.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>85&&Math.abs(dx)>Math.abs(dy)*1.5)vote(dx>0?3:-2);touchStart=null;},{passive:true});
$('#undo').onclick=undo;$('#restart').onclick=()=>{if(voteBusy)return;votes={};history=[];persist();renderQuiz();renderResults();toast('Fresh cravings, fresh start.');};
$('#saved-nav').onclick=()=>setSaved(true);$('#explore-nav').onclick=()=>setSaved(false);$('#recenter').onclick=fitMap;
$('#diet').onchange=()=>{shown=9;renderResults(true);if($('#diet').value!=='any')status('Only restaurants explicitly tagged with these dietary options are included. Confirm ingredients and cross-contact with the restaurant.');else status(searchConfig?.mode==='time'?searchMeta+'Travel estimates exclude live traffic.':'');};$('#sort').onchange=()=>{if($('#sort').value==='fastest'&&searchConfig?.mode!=='time'){toast('Search by Drive time to compare road travel estimates.');$('#sort').value='nearest';}renderResults();};
$('#cuisine-filters').onclick=e=>{const b=e.target.closest('[data-cuisine]');if(!b)return;cuisine=b.dataset.cuisine;shown=9;renderFilters();renderResults(true);};
$('#results').onclick=e=>{const save=e.target.closest('[data-save]'),detail=e.target.closest('[data-detail]');if(save){const id=save.dataset.save,p=visible.find(p=>p.id===id);const exists=saved.some(x=>x.id===id);saved=exists?saved.filter(x=>x.id!==id):[...saved,p];persist();renderResults();toast(exists?'Removed from your saved places.':'Saved for your next food adventure.');}if(detail)showDetails(visible.find(p=>p.id===detail.dataset.detail));};
$('#load-more').onclick=()=>{shown+=9;renderResults();};$('#surprise').onclick=()=>{if(!visible.length)return;const positives=visible.filter(p=>p.score>0);const candidates=(positives.length?positives:visible).slice(0,12);const random=new Uint32Array(1);crypto.getRandomValues(random);const p=candidates[random[0]%candidates.length];showDetails(p);toast('Let’s make it '+p.name+'!');};
$('#how-button').onclick=()=>{$('#dialog-content').innerHTML='<h2>Dinner, step by step.</h2>'+$('#use-case-guide').innerHTML;$('#info-dialog').showModal();};
$('#sources-button').onclick=()=>{$('#dialog-content').innerHTML='<p class="eyebrow">A LITTLE TRANSPARENCY</p><h2>Real places. Honest details.</h2><p>Restaurant data: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors (ODbL)</a>, via <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a>. ZIP centers: Zippopotam.us. Road estimates: Geoapify. Map tiles: OpenStreetMap. Food photography: Unsplash. Fonts: Google Fonts.</p><p>Distance is straight-line radius from the ZIP center. Driving times follow roads, exclude live traffic, and are not estimates from your exact address. Time searches check up to 120 cuisine/proximity candidates within a bounded area, so results are not exhaustive.</p><p>Local badges use a small, source-checked ownership register, currently focused on selected Phoenix-area businesses. Missing or expired evidence is labeled unverified; franchises are not automatically labeled local. Community data can miss restaurants, cuisine tags, dietary options, and recent changes. We do not invent ratings, prices, opening status, or menu availability.</p><p>Your votes, favorites, and last successful restaurant search stay in this browser’s storage. Restaurant searches are cached for 15 minutes. ZIP codes and map coordinates are sent to the listed data providers to run your search. Restaurant search uses your Geoapify account key, stored only in this browser and sent to Geoapify. Clearing saved data removes the key too.</p><button class="outline-button" id="clear-data">Clear my saved data</button>';$('#info-dialog').showModal();$('#clear-data').onclick=()=>{clearTimeout(voteTimer);voteBusy=false;$('#vote-stamp').classList.remove('show');votes={};history=[];saved=[];clearRestaurantCache();saveGeoapifyKey('');updateConnectionStatus();try{localStorage.removeItem('crave-search');}catch{}persist();renderQuiz();renderResults();$('#info-dialog').close();toast('Your taste profile and saved places were cleared.');};};
$('.dialog-close').onclick=()=>$('#info-dialog').close();$('#info-dialog').addEventListener('click',e=>{if(e.target===$('#info-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
const lastSearch=read('crave-search',null);if(lastSearch&&validZip(lastSearch.zip)&&['distance','time'].includes(lastSearch.mode)){$('#zip').value=lastSearch.zip;$('#mode').value=lastSearch.mode;$('#mode').onchange();if([...$('#limit').options].some(o=>o.value===String(lastSearch.limit)))$('#limit').value=String(lastSearch.limit);}
initializeMap();renderQuiz();renderResults();
