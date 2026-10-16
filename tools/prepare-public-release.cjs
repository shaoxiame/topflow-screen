'use strict';
// Local validation gate only. Does not grant hardware approval or publish anything.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),builder=require('./build.cjs');
const result=cp.spawnSync(process.execPath,[path.join(__dirname,'test-public.cjs')],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)throw Error('Public tests failed; release gate was not created');
const archive=fs.readFileSync(path.join(root,'native/topflow-native.tar.gz'));
const members=builder.tarMembers(archive);
const manifest=JSON.parse(members.find(m=>m.name==='./build-manifest.json').content);
builder.verifyNativeSources(manifest,members);
builder.verifyNativeBinaries(manifest,members);
builder.verifyBootIntegrity(manifest,members);
builder.verifyNativeLiveContract(manifest);
builder.verifyNativeReleaseContract(manifest,{});
const gate={schema:1,version:manifest.version,state:'device-acceptance-pending',code:'DEVICE_ACCEPTANCE_PENDING',hardwareVerified:false,
 localValidationPassed:true,localImplementationReviewed:true,adaptationFixCandidate:true,
 reason:'Public-source local tests, source/archive integrity and release contracts passed. No new hardware acceptance is asserted.',
 validationScope:['public-js-tests','native-source-hashes','native-ELF-architecture','boot-file-integrity','existing-release-contracts'],
 exclusions:['private-firmware-evidence-tests','device-installation','device-ABI-validation','display-touch-sleep-hardware-tests'],
 sourceSha256:Object.fromEntries(['src/ufi-plugin.js','src/manager.css','tools/build.cjs','tools/production-manager.cjs'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')])),
 checkedAt:new Date().toISOString()};
fs.mkdirSync(path.join(root,'analysis'),{recursive:true});
fs.writeFileSync(path.join(root,'analysis/release-gate.json'),JSON.stringify(gate,null,2)+'\n');
console.log('Local release gate prepared. hardwareVerified=false; package still requires device acceptance.');
