import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createZenTaoClient} from '../src/zentao.js';

export async function fixture(t, options={}) {
  const requests=[];
  const root=options.prefix || '';
  const server=http.createServer(async (req,res) => {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks);
    requests.push({method:req.method,path:req.url,headers:req.headers,body});
    if(options.handler && await options.handler(req,res,body))return;
    res.setHeader('Content-Type','application/json');
    if(req.url===root+'/api.php/v1/tokens'){res.end(JSON.stringify({token:'test-token-only'}));return;}
    if(req.url===root+'/api.php/v2/files'){res.end(JSON.stringify({status:'success',id:9}));return;}
    if(req.url===root+'/api.php/v1/files/9'){res.end('fixture bytes');return;}
    if(req.url===root+'/api.php/v1/bugs/7'){
      res.end(JSON.stringify({id:7,title:'Fixture bug',status:'active',assignedTo:{account:'tester'},files:{9:{id:9,title:'fixture.txt',size:13}},actions:[]}));return;
    }
    if(req.url.includes('/resolve') || req.url.includes('/close') || req.url.includes('/activate')){res.end(JSON.stringify({id:7,status:'resolved'}));return;}
    if(req.url===root+'/api.php/v1/projects'){res.end(JSON.stringify({projects:[]}));return;}
    res.writeHead(404);res.end(JSON.stringify({error:'not found'}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const directory=await mkdtemp(join(tmpdir(),'znmin-zentao-test-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const filePath=join(directory,'fixture.txt');await writeFile(filePath,'fixture bytes');
  const baseUrl=`http://127.0.0.1:${server.address().port}${root}`;
  const config={baseUrl,apiPrefix:'/api.php/v1',tokenPath:'/api.php/v1/tokens',timeoutMs:1000,tokenTtlMs:300000,allowInsecureHttp:true,auth:{account:'tester',password:'fake-password'},...options.config};
  return {requests,config,filePath,directory,client:createZenTaoClient(config)};
}
