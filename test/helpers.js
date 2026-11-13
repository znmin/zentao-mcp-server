import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createZenTaoClient} from '../src/zentao.js';

export async function fixture(t, options={}) {
  const requests=[];
  let assignedTo='tester',status='active';
  const comments=[];
  const root=options.prefix || '';
  const server=http.createServer(async (req,res) => {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks);
    requests.push({method:req.method,path:req.url,headers:req.headers,body});
    if(options.handler && await options.handler(req,res,body))return;
    res.setHeader('Content-Type','application/json');
    if(req.url.startsWith(root+'/index.php?')) {
      const url=new URL(req.url,'http://fixture.test');const method=url.searchParams.get('f');
      if(method==='getSessionID'){res.end(JSON.stringify({status:'success',data:JSON.stringify({sessionName:'zentaosid',sessionID:'test-web-session'})}));return;}
      if(method==='login'){res.end(JSON.stringify({status:'success',data:JSON.stringify({status:'success',token:'test-web-session'})}));return;}
      const form=new URLSearchParams(body.toString());
      if(method==='comment'){comments.push({id:101,action:'commented',comment:form.get('comment')});res.end('<script>parent.location.reload()</script>');return;}
      if(method==='editComment'){const found=comments.find(a=>String(a.id)===url.searchParams.get('actionID'));if(found)found.comment=form.get('lastComment');res.end('{"status":"success"}');return;}
    }
    if(req.url===root+'/api.php/v1/tokens'){res.end(JSON.stringify({token:'test-token-only'}));return;}
    if(req.url===root+'/api.php/v2/files'){res.end(JSON.stringify({status:'success',id:9}));return;}
    if(req.url===root+'/api.php/v1/files/9'){res.end('fixture bytes');return;}
    if(req.url===root+'/api.php/v1/bugs/7'){
      res.end(JSON.stringify({id:7,title:'Fixture bug',status,openedBy:{account:'reporter'},assignedTo:{account:assignedTo},files:{9:{id:9,title:'fixture.txt',size:13}},actions:comments}));return;
    }
    if(req.url.includes('/resolve')){assignedTo=JSON.parse(body).assignedTo;status='resolved';res.end(JSON.stringify({id:7,status}));return;}
    if(req.url.includes('/close') || req.url.includes('/activate')){res.end(JSON.stringify({id:7,status:'resolved'}));return;}
    if(req.url===root+'/api.php/v1/projects'){res.end(JSON.stringify({projects:[]}));return;}
    res.writeHead(404);res.end(JSON.stringify({error:'not found'}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const directory=await mkdtemp(join(tmpdir(),'znmin-zentao-test-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const filePath=join(directory,'fixture.txt');await writeFile(filePath,'fixture bytes');
  const baseUrl=`http://127.0.0.1:${server.address().port}${root}`;
  const config={baseUrl,apiPrefix:'/api.php/v1',tokenPath:'/api.php/v1/tokens',timeoutMs:1000,tokenTtlMs:300000,defaultResolvedBuild:'trunk',allowInsecureHttp:true,auth:{account:'tester',password:'fake-password'},...options.config};
  return {requests,config,filePath,directory,client:createZenTaoClient(config)};
}
