// Local, disposable UI verification only. Never publish this audit build.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const tempRoot=path.resolve(__dirname,'../.tmp');
const root = process.env.KODA_AUDIT_ROOT ? path.resolve(process.env.KODA_AUDIT_ROOT) : path.join(tempRoot,'koda2-audit');
if(!root.startsWith(tempRoot+path.sep))throw new Error('Preview root must stay inside workspace .tmp');
const port = Number(process.env.KODA_AUDIT_PORT || 8088);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local audit port');
const apiPort = process.env.KODA_AUDIT_API_PORT ? Number(process.env.KODA_AUDIT_API_PORT) : null;
if (apiPort !== null && (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535)) throw new Error('Invalid local API port');
const apiRoutes = new Set(['/api/health', '/api/onboarding', '/api/goal-plan', '/api/chat']);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2' };
http.createServer(async (req,res)=>{
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (pathname.startsWith('/api/')) {
      if (!apiPort || !apiRoutes.has(pathname)) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Local audit API is not configured.'})); return; }
      if (!['GET','POST'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const upstream = http.request({ hostname:'127.0.0.1', port:apiPort, path:pathname, method:req.method, headers:{'Content-Type':'application/json'} }, response => {
        res.writeHead(response.statusCode || 502, {'Content-Type':response.headers['content-type'] || 'application/json','Cache-Control':'no-store'});
        response.pipe(res);
      });
      upstream.setTimeout(55000, () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Local API unavailable.'})); });
      req.on('aborted', () => upstream.destroy());
      req.pipe(upstream); return;
    }
    let file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    let bytes;
    try { bytes=await fs.readFile(file); }
    catch { if (path.extname(pathname)) { res.writeHead(404);res.end();return; } file=path.join(root,'index.html');bytes=await fs.readFile(file); }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  } catch { res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('Audit build is not ready.'); }
}).listen(port,'127.0.0.1',()=>console.log(`Disposable audit preview: http://127.0.0.1:${port}`));
