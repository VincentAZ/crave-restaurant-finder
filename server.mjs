import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep))throw Error();const data=await readFile(target);res.writeHead(200,{'Content-Type':({'html':'text/html','js':'text/javascript','css':'text/css','jpg':'image/jpeg','svg':'image/svg+xml','png':'image/png'})[target.split('.').pop()]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end('Not found')}}).listen(4387,'0.0.0.0',()=>console.log('Local: http://localhost:4387'));
