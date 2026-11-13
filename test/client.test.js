import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {deploymentUrl} from '../src/attachments.js';
import {fixture} from './helpers.js';

test('deployment URL preserves root, subdirectory and trailing slash',()=>{
  for(const base of ['https://example.test','https://example.test/','https://example.test/zentao','https://example.test/zentao/']){
    assert.equal(deploymentUrl(base,'/api.php/v2/files').href,base.replace(/\/+$/,'')+'/api.php/v2/files');
  }
});

test('deployment path rejects external URLs, traversal and credentials',()=>{
  for(const path of ['//evil.test/files','https://evil.test/files','../files','/%2e%2e/files','/a\\b','/files?secret=1'])assert.throws(()=>deploymentUrl('https://example.test/zentao',path));
  assert.throws(()=>deploymentUrl('https://user:secret@example.test','/files'));
});

test('API authentication, cached tokens and bug read work under subdirectory deployment',async t=>{
  const {client,requests}=await fixture(t,{prefix:'/zentao'});
  const detail=await client.getBugDetail({id:7});
  assert.equal(detail.found,true);
  assert.equal(detail.files[0].id,9);
  assert.equal(detail.files[0].name,'fixture.txt');
  await client.getBugActions({id:7});
  assert.equal(requests.filter(r=>r.path.endsWith('/tokens')).length,1);
  assert.equal(requests[1].headers.token,'test-token-only');
  assert.equal(requests[1].path,'/zentao/api.php/v1/bugs/7');
});

test('upload sends one official multipart request with bug association and verifies read-back',async t=>{
  const {client,filePath,requests}=await fixture(t,{prefix:'/zentao'});
  const result=await client.uploadFile({bugId:7,filePath});
  assert.equal(result.verified,true);assert.equal(result.fileId,9);
  const upload=requests.find(r=>r.path==='/zentao/api.php/v2/files');
  assert.equal(upload.method,'POST');
  assert.match(upload.headers['content-type'],/^multipart\/form-data; boundary=/);
  assert.match(upload.body.toString(),/name="objectType"\r\n\r\nbug/);
  assert.match(upload.body.toString(),/name="objectID"\r\n\r\n7/);
  assert.match(upload.body.toString(),/fixture bytes/);
  assert.equal(requests.filter(r=>r.method==='POST'&&!r.path.endsWith('/tokens')).length,1);
  assert.equal(requests.at(-1).path,'/zentao/api.php/v1/bugs/7');
});

test('native FormData safely encodes display filenames',async t=>{
  const {client,filePath,requests}=await fixture(t);
  await client.uploadFile({bugId:7,filePath,fileName:'report "quoted".txt'});
  assert.match(requests.find(r=>r.path.endsWith('/v2/files')).body.toString(),/report %22quoted%22.txt/);
});

test('upload rejects invalid IDs, relative paths, directories and oversized files before writes',async t=>{
  const {client,filePath,directory,requests}=await fixture(t,{config:{maxUploadBytes:3}});
  for(const args of [{bugId:0,filePath},{bugId:1.5,filePath},{bugId:7,filePath:'relative.txt'},{bugId:7,filePath:directory},{bugId:7,filePath}])await assert.rejects(()=>client.uploadFile(args));
  assert.equal(requests.length,0);
});

test('upload refuses filename header injection',async t=>{
  const {client,filePath,requests}=await fixture(t);
  await assert.rejects(()=>client.uploadFile({bugId:7,filePath,fileName:'bad\r\nHeader.txt'}));
  assert.equal(requests.length,0);
});

for(const status of [401,403,404,500])test(`HTTP ${status} on upload is reported without leaking response body`,async t=>{
  const {client,filePath}=await fixture(t,{handler:(req,res)=>{if(!req.url.endsWith('/v2/files'))return false;res.writeHead(status);res.end('private-response');return true;}});
  await assert.rejects(()=>client.uploadFile({bugId:7,filePath}),error=>error.message.includes(`HTTP ${status}`)&&!error.message.includes('private-response'));
});

test('HTML login response and application-level rejection cannot count as upload success',async t=>{
  let content='<html>login</html>';
  const {client,filePath}=await fixture(t,{handler:(req,res)=>{if(!req.url.endsWith('/v2/files'))return false;res.end(content);return true;}});
  await assert.rejects(()=>client.uploadFile({bugId:7,filePath}),/non-JSON/);
  content=JSON.stringify({status:'fail',id:9});
  await assert.rejects(()=>client.uploadFile({bugId:7,filePath}),/rejected/);
  content=JSON.stringify({status:'success'});
  await assert.rejects(()=>client.uploadFile({bugId:7,filePath}),/no valid file ID/);
});

test('failed linkage read-back preserves uploaded ID and never claims verified success',async t=>{
  const {client,filePath}=await fixture(t,{handler:(req,res)=>{if(!req.url.endsWith('/v2/files'))return false;res.end(JSON.stringify({id:88}));return true;}});
  const result=await client.uploadFile({bugId:7,filePath});
  assert.equal(result.uploaded,true);assert.equal(result.linked,false);assert.equal(result.fileId,88);assert.equal(result.doNotRetryUpload,true);
});

test('upload timeout has no automatic retry',async t=>{
  const {client,filePath,requests}=await fixture(t,{config:{timeoutMs:40},handler:req=>req.url.endsWith('/v2/files')});
  await assert.rejects(()=>client.uploadFile({bugId:7,filePath}),/timed out/);
  assert.equal(requests.filter(r=>r.path.endsWith('/v2/files')).length,1);
});

test('upload rejects redirects rather than forwarding credentials or replaying a write',async t=>{
  const {client,filePath,requests}=await fixture(t,{handler:(req,res)=>{if(!req.url.endsWith('/v2/files'))return false;res.writeHead(307,{Location:'/other'});res.end();return true;}});
  await assert.rejects(()=>client.uploadFile({bugId:7,filePath}));
  assert.equal(requests.some(r=>r.path==='/other'),false);
});

test('download preserves byte content',async t=>{
  const {client,directory}=await fixture(t);const savePath=join(directory,'downloaded.txt');
  await client.downloadFile({fileId:9,savePath});assert.equal(await readFile(savePath,'utf8'),'fixture bytes');
});

test('resolve workflow uses resolve endpoint and structured explanation',async t=>{
  const {client,requests}=await fixture(t);
  await client.resolveBug({id:7,resolvedBuild:'trunk',solutionModules:{rootCause:'Invalid amount accepted',fixApproach:'Validate amounts',logicChange:'Reject invalid totals',impact:'Payment detail entry'}});
  const request=requests.find(r=>r.path.endsWith('/resolve'));
  assert.equal(request.method,'POST');const body=JSON.parse(request.body);
  assert.equal(body.resolvedBuild,'trunk');assert.match(body.comment,/根因/);assert.match(body.comment,/Invalid amount accepted/);
  assert.equal(body.assignedTo,'reporter');
  assert.equal(requests.some(r=>r.path.includes('/comments')||r.path.includes('f=comment')),false);
});

test('resolve explicit recipient and environment default override creator and are verified',async t=>{
  const {client,requests}=await fixture(t,{config:{defaultAssignedTo:'qa-default'}});
  const solutionModules={rootCause:'Cause',fixApproach:'Fix',logicChange:'Logic',impact:'Impact'};
  const first=await client.resolveBug({id:7,solutionModules});assert.equal(first.assignedTo,'qa-default');assert.equal(first.assignedToVerified,true);
  const second=await client.resolveBug({id:7,assignedTo:'qa-explicit',solutionModules});assert.equal(second.assignedToVerified,true);assert.equal(second.assignedTo,'qa-explicit');
  assert.equal(JSON.parse(requests.filter(r=>r.path.endsWith('/resolve')).at(-1).body).assignedTo,'qa-explicit');
});

test('invalid recipient never submits a resolve mutation',async t=>{
  const {client,requests}=await fixture(t);
  await assert.rejects(()=>client.resolveBug({id:7,assignedTo:'',solutionModules:{rootCause:'Cause'}}),/recipient/);
  assert.equal(requests.some(r=>r.path.endsWith('/resolve')),false);
});

test('ordinary remarks and editing use authenticated form endpoints and verified history',async t=>{
  const {client,requests}=await fixture(t,{prefix:'/zentao'});
  const result=await client.commentBug({id:7,comment:'Ordinary remark, no four-section template'});
  assert.equal(result.verified,true);assert.equal(result.actionId,101);
  const edited=await client.editBugComment({id:7,actionId:101,comment:'Updated remark'});assert.equal(edited.verified,true);assert.equal(edited.edited,true);
  const writes=requests.filter(r=>r.path.includes('m=action'));
  assert.equal(writes.length,2);assert.equal(writes[0].headers.cookie,'zentaosid=test-web-session');
  assert.match(writes[0].headers.referer,/\/zentao\/index.php$/);
  assert.equal(requests.some(r=>r.path.includes('/comments')),false);
  assert.equal(requests.filter(r=>r.path.includes('f=login')).length,1);
  assert.equal(requests.some(r=>r.path.includes('test-web-session')||r.path.includes('fake-password')),false);
});

test('editing an action outside this Bug or a non-comment action is rejected',async t=>{
  const {client,requests}=await fixture(t);
  await assert.rejects(()=>client.editBugComment({id:7,actionId:999,comment:'Wrong action'}),/belonging/);
  assert.equal(requests.some(r=>r.path.includes('m=action')),false);
});

test('a success response without saved comment is not reported as verified',async t=>{
  const {client}=await fixture(t,{handler:(req,res)=>{if(!req.url.includes('m=action'))return false;res.end('{"status":"success"}');return true;}});
  const result=await client.commentBug({id:7,comment:'Not persisted'});assert.equal(result.verified,false);assert.equal(result.doNotRetryWrite,true);
});

test('login rejection prevents any remark write',async t=>{
  const {client,requests}=await fixture(t,{handler:(req,res)=>{if(!req.url.includes('f=login'))return false;res.end('{"result":false,"load":"login"}');return true;}});
  await assert.rejects(()=>client.commentBug({id:7,comment:'Blocked'}),/rejected/);
  assert.equal(requests.some(r=>r.path.includes('m=action')),false);
});
