import test from 'node:test';
import assert from 'node:assert/strict';
import {locateZip,getJSON} from '../dist/api.js';

test('ZIP lookup preserves coordinates and leading zero ZIPs',async()=>{
 const original=global.fetch;
 global.fetch=async url=>{assert.match(url,/\/02108$/);return Response.json({places:[{latitude:'42.36',longitude:'-71.06','place name':'Boston','state abbreviation':'MA'}]});};
 try{assert.deepEqual(await locateZip('02108'),{lat:42.36,lng:-71.06,label:'Boston, MA',zip:'02108'});}finally{global.fetch=original;}
});
test('missing ZIP and service outage produce different guidance',async()=>{
 const original=global.fetch;
 try{global.fetch=async()=>new Response('',{status:404});await assert.rejects(locateZip('00000'),/wasn’t found/);global.fetch=async()=>new Response('',{status:503});await assert.rejects(locateZip('85004'),/service is unavailable/);}finally{global.fetch=original;}
});
test('malformed ZIP geometry is rejected before any restaurant request',async()=>{
 const original=global.fetch;global.fetch=async()=>Response.json({places:[{latitude:'bad',longitude:'-112','place name':'Phoenix','state abbreviation':'AZ'}]});
 try{await assert.rejects(locateZip('85004'),/service is unavailable/);}finally{global.fetch=original;}
});
test('HTTP deadline cancels a stalled request',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const original=global.fetch;let aborted=false;
 global.fetch=async(_, {signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));
 try{const pending=assert.rejects(getJSON('https://example.test',{timeout:8000}));t.mock.timers.tick(8000);await pending;assert.equal(aborted,true);}finally{global.fetch=original;t.mock.timers.reset();}
});
test('cancelled requests never reach the provider',async()=>{
 const original=global.fetch;let called=false;global.fetch=async()=>{called=true;};
 try{const c=new AbortController();c.abort();await assert.rejects(getJSON('https://example.test',{signal:c.signal}));assert.equal(called,false);}finally{global.fetch=original;}
});
