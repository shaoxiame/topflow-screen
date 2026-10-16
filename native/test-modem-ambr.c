#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "modem_logic.h"
static double get(const char*json,const char*id,const char*key){tf_json d;tf_modem m;assert(tf_parse(&d,json));assert(tf_modem_snapshot(&d,id,&m));double n=tf_modem_ambr(&d,&m,key);tf_free(&d);return n;}
static void single(const char*state,const char*status,const char*value,int enabled,int good){
 char snapshot[2048];snprintf(snapshot,sizeof snapshot,"{\"qos\":{\"ambr_dl\":9999},\"modems\":[{\"id\":\"4G1\",\"sim\":{\"state\":\"%s\"},\"wwan\":{\"status\":\"%s\"},\"usb\":{\"present\":false},\"qos\":{\"ambr_dl\":%s,\"sampled_at\":0}}]}",state,status,value);tf_external_enabled[0]=enabled;assert((get(snapshot,"4G1","ambr_dl")>0)==good);
}
int main(void){
 tf_external_enabled[0]=tf_external_enabled[1]=1;
 const char*three="{\"qos\":{\"ambr_dl\":99999,\"ambr_ul\":9999},\"modems\":[{\"id\":\"4G2\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"disconnected\"},\"qos\":{\"ambr_dl\":\"150.125\",\"ambr_ul\":75,\"sampled_at\":0}},{\"id\":\"5G\",\"sim\":{\"state\":\"sim ready\"},\"qos\":{\"ambr_dl\":\"2000.000\",\"ambr_ul\":\"200.000\",\"sampled_at\":0}},{\"id\":\"4G1\",\"sim\":{\"state\":\"sim ready\"},\"qos\":{\"ambr_dl\":100,\"ambr_ul\":50}}]}";
 assert(get(three,"5G","ambr_dl")==2000&&get(three,"5G","ambr_ul")==200);
 assert(get(three,"4G1","ambr_dl")==100&&get(three,"4G1","ambr_ul")==50);
 assert(get(three,"4G2","ambr_dl")==150.125&&get(three,"4G2","ambr_ul")==75);
 assert(get(three,"5G","qci")<0);
 const char*missing="{\"qos\":{\"ambr_dl\":9999},\"modems\":[{\"id\":\"5G\",\"sim\":{\"state\":\"sim ready\"},\"qos\":{\"ambr_ul\":10}},{\"id\":\"4G1\",\"sim\":{\"state\":\"sim ready\"}},{\"id\":\"4G2\",\"sim\":{\"state\":\"sim ready\"},\"qos\":{}}]}";
 assert(get(missing,"5G","ambr_dl")<0&&get(missing,"5G","ambr_ul")==10);
 assert(get(missing,"4G1","ambr_dl")<0&&get(missing,"4G2","ambr_ul")<0);
 const char*invalid[]={"0","\"0.000\"","\"\"","null","true","[]","{}","-1","\"-1\"","\"NaN\"","\"Infinity\"","\"inf\"","\"100Mbps\"","\"100 trailing\"","\"0x1p4\"","\" 100\"","\"100 \"","\"1e9999\"","\"1.2.3\""};
 for(size_t i=0;i<sizeof invalid/sizeof*invalid;i++)single("sim ready","disconnected",invalid[i],1,0);
 single("sim ready","disconnected","\"150.125\"",1,1);single("sim ready","disconnected","\"1e2\"",1,1);
 single("sim ready","disconnected","100",0,0);single("sim ready","disconnected","100",-1,0);
 const char*states[]={"sim undetected","modem_sim_undetected","wait pin","modem_waitpuk","sim lock","sim error","sim destroy","","unknown"};
 for(size_t i=0;i<sizeof states/sizeof*states;i++)single(states[i],"disconnected","100",1,0);
 single("sim undetected","ipv4_connected","100",1,0);single("sim ready","ipv4_connected","100",0,0);
 char value[96];tf_modem_ambr_text(value,sizeof value,2000);assert(!strcmp(value,"2000 Mbps"));tf_modem_ambr_text(value,sizeof value,150.125);assert(!strcmp(value,"150.125 Mbps"));tf_modem_ambr_text(value,sizeof value,-1);assert(strstr(value,"未提供")&&!strstr(value,"Mbps"));tf_modem_ambr_text(value,sizeof value,0.0001);assert(strstr(value,"0.0001"));tf_modem_ambr_text(value,sizeof value,1e300);assert(strstr(value,"e+300"));
 puts("PASS: three-card AMBR isolation, Mbps units, cached disconnected values, missing/invalid/disabled/absent/locked/conflicting states and numeric formatting; no device access");return 0;
}
