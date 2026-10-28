export function progressModel(stage,mode='distance',completed=0,total=0){
 const steps=[{id:'location',label:'Set the table',icon:'📍'},{id:'restaurants',label:'Explore the menu',icon:'🍔'},{id:'routes',label:mode==='time'?'Check the drive':'Plate your matches',icon:mode==='time'?'🚗':'🍽️'}];
 const active=stage==='complete'?steps.length:Math.max(0,steps.findIndex(s=>s.id===stage));
 const count=stage==='routes'&&mode==='time'&&Number.isFinite(total)&&total>0?`${Math.max(0,Math.min(completed,total))} of ${total} routes checked`:null;
 return {steps,active,count,title:stage==='location'?'Setting the table…':stage==='restaurants'?'Finding something delicious…':stage==='complete'?'Your matches are ready!':mode==='time'?'Checking the trip to your next bite…':'Plating up your matches…'};
}
