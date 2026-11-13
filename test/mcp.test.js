import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fixture} from './helpers.js';
const cli=fileURLToPath(new URL('../bin/zentao-mcp-server.js',import.meta.url));
async function connect(t,config,readonly=false){
  const transport=new StdioClientTransport({command:process.execPath,args:[cli],stderr:'pipe',env:{...process.env,ZENTAO_BASE_URL:config.baseUrl,ZENTAO_ACCOUNT:'tester',ZENTAO_PASSWORD:'fake-password',ZENTAO_ALLOW_INSECURE_HTTP:'true',ZENTAO_READ_ONLY:String(readonly)}});
  const client=new Client({name:'zentao-protocol-test',version:'1.0.0'});t.after(()=>client.close());await client.connect(transport);return client;
}
test('MCP stdio exposes compatible tools and uploads through the tool handler',async t=>{
  const f=await fixture(t);const client=await connect(t,f.config);
  const tools=(await client.listTools()).tools;assert.equal(tools.length,14);
  const result=await client.callTool({name:'upload_attachment',arguments:{bugId:7,filePath:f.filePath}});
  assert.notEqual(result.isError,true);assert.equal(JSON.parse(result.content[0].text).verified,true);
  const detail=await client.callTool({name:'get_bug_detail',arguments:{id:7}});assert.equal(JSON.parse(detail.content[0].text).files[0].id,9);
});
test('readonly mode hides writes and rejects direct write calls before making requests',async t=>{
  const f=await fixture(t);const client=await connect(t,f.config,true);
  const tools=(await client.listTools()).tools;assert.equal(tools.some(t=>t.name==='upload_attachment'),false);
  const result=await client.callTool({name:'upload_attachment',arguments:{bugId:7,filePath:f.filePath}});
  assert.equal(result.isError,true);assert.equal(f.requests.length,0);
  const detail=await client.callTool({name:'get_bug_detail',arguments:{id:7}});assert.notEqual(detail.isError,true);
});
test('unverified attachment linkage is an MCP error with uploaded ID retained',async t=>{
  const f=await fixture(t,{handler:(req,res)=>{if(!req.url.endsWith('/v2/files'))return false;res.end('{"id":88}');return true;}});
  const client=await connect(t,f.config);const result=await client.callTool({name:'upload_attachment',arguments:{bugId:7,filePath:f.filePath}});
  assert.equal(result.isError,true);assert.equal(JSON.parse(result.content[0].text).fileId,88);
});

test('new remark tools and plain comment compatibility work through MCP',async t=>{
  const f=await fixture(t);const client=await connect(t,f.config);
  const result=await client.callTool({name:'add_bug_comment',arguments:{id:7,comment:'MCP remark'}});assert.notEqual(result.isError,true);
  const actionId=JSON.parse(result.content[0].text).actionId;
  const edited=await client.callTool({name:'edit_bug_comment',arguments:{id:7,actionId,comment:'Edited MCP remark'}});assert.notEqual(edited.isError,true);
  const schema=(await client.listTools()).tools.find(t=>t.name==='resolve_bug').inputSchema;assert.ok(schema.properties.assignedTo);
});

test('readonly mode hides both new remark tools and rejects direct calls',async t=>{
  const f=await fixture(t);const client=await connect(t,f.config,true);
  const names=(await client.listTools()).tools.map(t=>t.name);assert.equal(names.includes('add_bug_comment'),false);assert.equal(names.includes('edit_bug_comment'),false);
  const result=await client.callTool({name:'add_bug_comment',arguments:{id:7,comment:'Blocked'}});assert.equal(result.isError,true);assert.equal(f.requests.length,0);
});
