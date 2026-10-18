'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
test('external band selection follows UFI while dirty drafts and confirmations stay protected',()=>{
 const native=path.resolve(__dirname,'../native'),dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'test-band-state-sync.c'),exe=path.join(dir,'test-band-state-sync.exe');
 fs.writeFileSync(file,String.raw`
#include <assert.h>
#include "control_logic.h"
static int advanced_page=2,band_rat=0,live=1;
static char pending[64],verifying[64],snapshot[512];
static unsigned char band_allowed[TF_BANDS],band_selected[TF_BANDS];
static int fresh_state(tf_json*d){return live&&tf_parse(d,snapshot);}
#include "band_state_sync.h"
static void source(const char*bands){snprintf(snapshot,sizeof snapshot,"{\"net\":{\"band_capabilities\":{\"lte\":[1,3,7]},\"lte_bands\":\"%s\"}}",bands);}
int main(void){
 source("1,3");band_observe();assert(band_state_known&&band_selected[1]&&band_selected[3]&&!band_selected[7]);
 source("3,7");band_observe();assert(!band_selected[1]&&band_selected[3]&&band_selected[7]&&!band_external);
 band_selected[1]=1;source("1,7");band_observe();assert(band_selected[1]&&band_selected[3]&&band_selected[7]&&band_external);
 unsigned char allowed[TF_BANDS],selected[TF_BANDS];tf_json d;assert(fresh_state(&d)&&tf_band_snapshot(&d,0,allowed,selected));tf_free(&d);assert(!band_baseline_matches(allowed,selected));
 memcpy(band_selected,band_original,sizeof band_selected);band_observe();assert(band_selected[1]&&!band_selected[3]&&band_selected[7]&&!band_external);
 live=0;band_observe();assert(!band_state_known&&band_selected[1]);live=1;
 strcpy(pending,"confirm");source("3");band_observe();assert(band_selected[1]);pending[0]=0;
 strcpy(verifying,"wait");band_observe();assert(band_selected[1]);verifying[0]=0;
 advanced_page=1;band_observe();assert(band_selected[1]);advanced_page=2;band_observe();assert(!band_selected[1]&&band_selected[3]);return 0;
}`);
 const build=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-std=c11','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),file,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});assert.equal(build.status,0,build.stdout+build.stderr);
 const result=cp.spawnSync(exe,[],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 const production=fs.readFileSync(path.join(native,'advanced_controls.h'),'utf8');assert.match(production,/tf_band_snapshot\(&d,band_rat,allowed,selected\)&&band_baseline_matches/);assert.match(production,/tf_band_snapshot\(&d,rat,allowed,selected\)&&band_baseline_matches/);
});
