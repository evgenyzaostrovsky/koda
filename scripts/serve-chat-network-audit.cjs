// Local-only fault injection. Never publish or use ordinary user accounts here.
const http=require('node:http'),https=require('node:https'),fs=require('node:fs/promises'),path=require('node:path');
require('dotenv').config({path:'.env.local',quiet:true});require('dotenv').config({quiet:true});
if(process.env.KODA_CHAT_NETWORK_AUDIT!=='1')throw new Error('Explicit network audit opt-in required');
const target=new URL(process.env.EXPO_PUBLIC_SUPABASE_URL),root=path.resolve('.tmp/koda-chat-network-audit'),control=path.resolve('.tmp/chat-network-control.json');
const allowed=new Set(['http://127.0.0.1:8096','http://127.0.0.1:8097']);
const apiSockets=new Set();
async function state(){try{return JSON.parse(await fs.readFile(control,'utf8'))}catch{return {offline:false}}}
require('node:fs').watchFile(control,{interval:100},()=>{void state().then(mode=>{if(mode.offline)for(const socket of apiSockets)socket.destroy();});});
const server=async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&!allowed.has(origin)){res.writeHead(403);res.end();return;}
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept-profile,content-profile,range');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/auth/v1/')||pathname.startsWith('/rest/v1/')||pathname==='/api/chat'){
    apiSockets.add(req.socket);res.on('close',()=>apiSockets.delete(req.socket));
    const mode=await state();
    if(mode.offline){req.socket.destroy();return;}
    const ai=pathname==='/api/chat';
    const upstream=(ai?http:https).request({hostname:ai?'127.0.0.1':target.hostname,port:ai?3337:443,path:req.url,method:req.method,headers:{...req.headers,host:ai?'127.0.0.1:3337':target.host}},async r=>{
      if(mode.dropChatWriteAck&&req.method==='POST'&&pathname==='/rest/v1/chat_messages'&&r.statusCode<300){
        r.resume();await fs.writeFile(control,JSON.stringify({...mode,dropChatWriteAck:false}));
        console.log('Fault injected: committed chat write response dropped');res.destroy();return;
      }
      const headers={...r.headers};delete headers['access-control-allow-origin'];delete headers['access-control-allow-headers'];
      res.writeHead(r.statusCode,headers);r.pipe(res);
    });
    upstream.on('error',()=>res.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);return;
  }
  try{let file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
    let bytes;try{bytes=await fs.readFile(file)}catch{file=path.join(root,'index.html');bytes=await fs.readFile(file)}
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.ico')?'image/x-icon':'text/html','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(503);res.end('Local audit build pending');}
};
for(const port of [8096,8097])http.createServer((req,res)=>{void server(req,res).catch(()=>res.destroy());}).listen(port,'127.0.0.1',()=>console.log('Local network audit listening on '+port));
