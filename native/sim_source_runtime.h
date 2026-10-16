/* Demand-only reads and single explicit factory SIM source requests. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SIM_SOURCE_RUNTIME_H
#define TF_SIM_SOURCE_RUNTIME_H
#include "sim_source_logic.h"
static int source_current[3]={-1,-1,-1};
static uint32_t source_read_at[2]={0,0};static unsigned char source_read_once[2]={0,0};
/* Reads only on card entry, user refresh, confirmation or its bounded verifier.
 * No background poll, shell, configuration write, persistent file or logging. */
static int tf_source_refresh(int index,int force){
 if(tf_http_cancelled||index<0||index>2)return 0;int group=index?1:0;uint32_t now=tick();
 if(!force&&source_read_once[group]&&(uint32_t)(now-source_read_at[group])<3000)return source_current[index]>=0;
 source_read_once[group]=1;source_read_at[group]=now;if(group)source_current[1]=source_current[2]=-1;else source_current[0]=-1;
 char response[16384];char*const args[]={"ubus","-t","1","call","zwrt_zte_mdm.api",group?"get_v3t_sim_info":"get_sim_info","{}",NULL};
 int ok=vendor_exec("/bin/ubus",args,NULL,response,sizeof response)==0;
 if(ok){if(group){source_current[1]=tf_source_parse(response,1);source_current[2]=tf_source_parse(response,2);}else source_current[0]=tf_source_parse(response,0);}
 memset(response,0,sizeof response);return source_current[index]>=0;
}
static int tf_source_set(int index,int source){
 if(tf_http_cancelled)return 0;
 char method[32],payload[128],response[4096];if(!tf_source_payload(index,source,method,sizeof method,payload,sizeof payload))return 0;
 char*const args[]={"ubus","-t","1","call","zwrt_zte_mdm.api",method,payload,NULL};
 int accepted=vendor_exec("/bin/ubus",args,NULL,response,sizeof response)==0;memset(response,0,sizeof response);
 /* Exit status is transport acceptance only. Caller must verify raw st_slot. */
 source_read_once[index?1:0]=0;return accepted;
}
#endif
