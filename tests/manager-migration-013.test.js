'use strict';
// Reuse only the local shell fixture definition, not its tests. All proc,
// service, runtime and plugin paths remain redirected to disposable PC files.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {spawnSync,spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..');
const dash=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh';
const unix=p=>p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const fixtureSource=fs.readFileSync(path.join(__dirname,'native-supervisor.test.js'),'utf8');
const begin=fixtureSource.indexOf('function fixture(t){');
const end=fixtureSource.indexOf("test('native scripts parse",begin);
assert(begin>0&&end>begin,'Shared local shell fixture anchors changed');
const fixture=vm.runInNewContext(fixtureSource.slice(begin,end)+'\nfixture;',{fs,os,path,assert,dash,unix,quote,spawnSync,spawn,process,project});
const plugin=require('../src/ufi-plugin.js');
const {tarMembers}=require('../tools/build.cjs');
const controller=fs.readFileSync(path.join(project,'native/screenctl.sh'),'utf8');
const payload={archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:controller,hardwareTested:false,members:['./','./topflow-screen.sha256','./ui/','./ui/index.html']};
const oldDigest='5448dad44f152a56eefaf694303cb0d99eb31a32858c88339a2e926b54a537fb';
const archive=fs.readFileSync(path.join(project,'analysis/trusted-release-0.1.3/topflow-native.tar.gz'));
assert.equal(crypto.createHash('sha256').update(archive).digest('hex'),oldDigest);
const members=tarMembers(archive);
function installed(t){
  const f=fixture(t);
  for(const member of members){
    const relative=member.name.replace(/^\.\//,'').replace(/\/$/,'');if(!relative)continue;
    const target=path.join(f.root,relative);
    if(member.type==='5')fs.mkdirSync(target,{recursive:true});
    else {fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,member.content);}
  }
  f.put('root/.topflow-install','TOPFLOW_SCREEN_INSTALL_V1\n'+oldDigest+'\n');
  f.put('root/.topflow-files',members.map(m=>m.name.replace(/^\.\//,'').replace(/\/$/,'')).filter(Boolean).join('\n')+'\n');
  f.put('factory');
  return f;
}
function run(f,action){return f.execute(plugin.buildScreenCommand(action,payload,action!=='status'),[],{realHash:true});}

test('installed 0.1.3 is readable and recoverable through the new controller without starting the old renderer',t=>{
  const f=installed(t);f.put('run/last-status','failure:RENDERER_EXITED:7:ADOPT_SENSOR_STATE\n');
  let result=run(f,'status');assert.equal(result.status,0,result.stderr+result.stdout);
  const state=plugin.parseScreenStatus(result.stdout);assert.equal(state.versionMismatch,true);assert.equal(state.failure,'RENDERER_EXITED');assert.equal(state.rendererFailure,'ADOPT_SENSOR_STATE');
  assert.doesNotMatch(result.events,/flock|kill|service delete|renderer-adopt/);
  result=run(f,'start');assert.notEqual(result.status,0);assert.match(result.stdout,/INSTALLED_VERSION_MISMATCH/);
  assert.doesNotMatch(result.events,/service delete|renderer-adopt/);
  result=run(f,'restore');assert.equal(result.status,0,result.stderr+result.stdout);assert(fs.existsSync(f.root));
  result=run(f,'uninstall');assert.equal(result.status,0,result.stderr+result.stdout);assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));
});

test('0.1.3 migration rejects modified executable bytes, an altered member list or unknown ownership before writes',t=>{
  for(const name of ['topflow-screen','topflow-factory-bus-aarch64','screenctl.sh','supervisor.sh','.topflow-files','.topflow-install']){
    const f=installed(t);fs.appendFileSync(path.join(f.root,name),'changed');
    const result=run(f,'uninstall');assert.notEqual(result.status,0,name);assert.match(result.stdout,/UNVERIFIED_|INSTALLED_VERSION_MISMATCH/);
    assert.doesNotMatch(result.events,/flock|kill|service delete|factory-start/);assert(fs.existsSync(f.root));
  }
});

test('an exactly owned interrupted 0.1.3 uninstall can finish without running a missing old entry point',t=>{
  const f=installed(t);f.put('root/.uninstalling','uninstalling\n');fs.unlinkSync(path.join(f.root,'supervisor.sh'));
  const result=run(f,'uninstall');assert.equal(result.status,0,result.stderr+result.stdout);assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));
});
