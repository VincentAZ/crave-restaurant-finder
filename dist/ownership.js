import {milesBetween} from './core.js';

// A deliberately small evidence register. Missing brand tags are NOT ownership evidence.
// Review dates expire so a permanent badge cannot silently outlive its source check.
const reviewedOn='2026-10-28';
const phoenix={lat:33.4484,lng:-112.074};
const records=[
 {names:['Someburros','Someburros Mexican Food'],domains:['someburros.com'],center:phoenix,radius:55,
  summary:'The Arizona-based Vasquez family identifies Someburros as locally owned and family operated, with family members managing the business.',
  sources:[{title:'Someburros: ownership and operations',url:'https://www.someburros.com/news/someburros-a-true-family-owned-and-operated-business'},{title:'Someburros: local ownership',url:'https://www.someburros.com/40thanniversary'}]},
 {names:["Sardella's","Sardella's Pizza","Sardella's Pizza & Wings","Sardellas Pizza and Wings"],domains:['sardellaspizza.com'],center:phoenix,radius:40,
  summary:'Sardella’s describes itself as a local, family-owned and operated business serving the northwest Phoenix area.',
  sources:[{title:'Sardella’s: local ownership and operations',url:'https://pizzacamp.sardellaspizza.com/school-coupons/'},{title:'Sardella’s family and locations',url:'https://sardellaspizza.com/about/'}]},
 {names:['Osteria Mia','Osteria Mia Surprise'],domains:['osteriamia.com','osteriamiasurprise.com'],center:phoenix,radius:40,
  summary:'Mario and Kayla Rana own and operate Osteria Mia. Their published story places the family in Surprise, with restaurants in the Phoenix area.',
  sources:[{title:'Osteria Mia: family owners and operators',url:'https://www.osteriamiasurprise.com/about'},{title:'Owners’ Surprise community connection',url:'https://www.citylifestyle.com/articles/bringing-a-slice-of-italy-home'}]},
];
const normalize=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const unknown=()=>({local:false,label:'Local ownership unverified',summary:'We haven’t confirmed local ownership and operation for this restaurant. This does not mean it is non-local. Franchise ownership is not assumed.',sources:[]});

export function ownershipFor(place,now=new Date()){
 const age=now.getTime()-Date.parse(reviewedOn+'T00:00:00Z');
 if(!Number.isFinite(age)||age<0||age>180*86400000||!Number.isFinite(place.lat)||!Number.isFinite(place.lng))return unknown();
 const name=normalize(place.name);
 const record=records.find(r=>r.names.some(n=>normalize(n)===name)&&milesBetween(r.center,place)<=r.radius);
 if(!record)return unknown();
 // A conflicting website means we cannot confidently identify the business.
 if(place.website){try{const host=new URL(place.website).hostname.toLowerCase().replace(/^www\./,'');if(!record.domains.some(d=>host===d||host.endsWith('.'+d)))return unknown();}catch{return unknown();}}
 return {local:true,label:'Local',summary:record.summary,sources:record.sources,reviewedOn};
}
