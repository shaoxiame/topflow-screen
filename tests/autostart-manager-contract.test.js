'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const plugin=require('../src/ufi-plugin.js');
const payload={archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:'#!/bin/sh\nprintf \'{"mode":"factory"}\\n\'\n',hardwareTested:false,members:['./','./topflow-screen','./screenctl.sh','./supervisor.sh','./ui/','./ui/index.html','./topflow-screen.sha256']};
const parsed=autostart=>plugin.parseScreenStatus('TOPFLOW_SCREEN='+JSON.stringify({installed:true,mode:'factory',autostart})).autostart;

test('autostart commands require explicit boolean confirmation and the signed current controller',()=>{
  for(const action of ['autostart-enable','autostart-disable']){
    for(const confirmed of [undefined,false,'true',1])assert.throws(()=>plugin.buildScreenCommand(action,payload,confirmed),{code:'CONFIRM_REQUIRED'});
    const command=plugin.buildScreenCommand(action,payload,true);
    assert.match(command,/TF_VERSION_MISMATCH.*false/);assert.match(command,/INSTALLED_VERSION_MISMATCH/);
    assert.match(command,/INSTALL_INCOMPLETE/);assert.match(command,/sha256sum -c -/);
    assert(command.includes(payload.screenctlSha256));
    assert(command.includes('sh "$TF_ROOT/screenctl.sh" '+action+' --confirmed'));
    assert.doesNotMatch(command,/rc\.local|crontab|reboot|screenctl\.sh" start --confirmed|tar -xzf/);
  }
  assert.throws(()=>plugin.buildScreenCommand('autostart-enable',{...payload,reviewOnly:true},true),{code:'RELEASE_BLOCKED'});
  assert.match(plugin.buildScreenCommand('autostart-disable',{...payload,reviewOnly:true},true),/autostart-disable --confirmed/);
  for(const action of ['autostart','autostart-start','boot','autostart-enable;reboot'])assert.throws(()=>plugin.buildScreenCommand(action,payload,true),{code:'INVALID_ACTION'});
});

test('autostart state parsing fails closed on incomplete and loosely typed data',()=>{
  const valid={enabled:false,hook:'absent',state:'disabled',reason:'NONE'};
  assert.deepEqual(parsed(valid),valid);
  for(const state of [undefined,null,{},[],{...valid,enabled:'false'},{...valid,enabled:0},{...valid,hook:'enabled'},{...valid,hook:true},{...valid,state:'running'},{...valid,state:''}])assert.equal(parsed(state),undefined,JSON.stringify(state));
  for(const state of ['disabled','enabled','waiting','starting','started','skipped','failed','cancelled'])assert.equal(parsed({...valid,state}).state,state);
  for(const hook of ['present','absent','conflict','unknown'])assert.equal(parsed({...valid,hook}).hook,hook);
});

test('autostart diagnostic parsing bounds values and never copies arbitrary transport fields',()=>{
  const valid={enabled:true,hook:'present',state:'failed'};
  for(const reason of ['<script>secret</script>','secret-token',1,'A'.repeat(65),'PRIVATE TOKEN','PRIVATE\nTOKEN'])assert.equal(parsed({...valid,reason}).reason,undefined);
  assert.deepEqual(parsed({...valid,reason:'SERVICE_TIMEOUT',password:'secret',command:'reboot',pid:123}),{...valid,reason:'SERVICE_TIMEOUT'});
  assert.equal(parsed({...valid,reason:'A'.repeat(64)}).reason.length,64);
  assert.throws(()=>plugin.parseScreenStatus('TOPFLOW_SCREEN={"mode":"factory"}\nTOPFLOW_SCREEN={"mode":"custom"}'),{code:'STATUS_UNCONFIRMED'});
});
