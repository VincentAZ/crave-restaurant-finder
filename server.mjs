import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {GET} from './api/restaurants.js';
import {POST} from './api/routes.js';
const root=path.resolve('dist');
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost:4387');
  if(['/api/restaurants','/api/routes'].includes(url.pathname)){
   const abort=new AbortController();req.on('aborted',()=>abort.abort());
   res.on('close',()=>{if(!res.writableEnded)abort.abort();});
   const request=new Request(url,{method:req.method,headers:req.headers,signal:abort.signal,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
   const response=await (url.pathname==='/api/restaurants'?GET:POST)(request);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!target.startsWith(root+path.sep))throw Error();
  const data=await readFile(target);
  res.writeHead(200,{'Content-Type':({html:'text/html',js:'text/javascript',css:'text/css',jpg:'image/jpeg',svg:'image/svg+xml',png:'image/png'})[target.split('.').pop()]||'application/octet-stream'});res.end(data);
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found');}
}).listen(4387,'127.0.0.1',()=>console.log('Local: http://localhost:4387'));
