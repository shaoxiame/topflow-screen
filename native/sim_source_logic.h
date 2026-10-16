/* TopFlow physical SIM source, separate from provision slots and APN ids. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SIM_SOURCE_LOGIC_H
#define TF_SIM_SOURCE_LOGIC_H
#include "control_logic.h"
/* Verified factory UI/SDK contract: 0 = removable pSIM; 1 = built-in eSIM.
 * The external modem order is intentionally reversed: 4G1 = v3t_2 / num 1,
 * 4G2 = v3t_1 / num 0. Do not use datad's normalized empty-slot fallback. */
static int tf_source_index(const char*id){return id&&!strcmp(id,"5G")?0:id&&!strcmp(id,"4G1")?1:id&&!strcmp(id,"4G2")?2:-1;}
static const char*tf_source_id(int i){return i==0?"5G":i==1?"4G1":i==2?"4G2":"";}
static const char*tf_source_name(int source){return source==0?"插拔卡":source==1?"内置卡":"尚未确认";}
static int tf_source_parse(const char*raw,int index){
 if(!raw||index<0||index>2)return-1;tf_json d;if(!tf_parse(&d,raw))return-1;
 const char*key=index==0?"st_slot":index==1?"v3t_2_st_slot":"v3t_1_st_slot";
 long long n;int valid=tf_int(&d,tf_key(&d,0,key),&n)&&n>=0&&n<=1;tf_free(&d);return valid?(int)n:-1;
}
static int tf_source_payload(int index,int source,char*method,size_t methodcap,char*payload,size_t cap){
 if(index<0||index>2||source<0||source>1||!method||!payload||methodcap<24||cap<96)return 0;
 snprintf(method,methodcap,"%s",index==0?"sim_switch_slot":"sub_modem_switch_slot");
 if(index==0)snprintf(payload,cap,"{\"slot\":%d}",source);
 else snprintf(payload,cap,"{\"sub_modem_num\":%d,\"sub_modem_slot\":%d}",index==1?1:0,source);
 return 1;
}
static int tf_source_permitted(int index,int current,int wanted,int external_enabled){
 /* The factory setter selects an absolute source, not a toggle. Empty-slot
  * reads may omit st_slot: retain unknown (-1), but let the user explicitly
  * choose either verified target. Never infer the old source from SIM presence.
  * Disabled/unknown external modules still require a separate enable action. */
 return index>=0&&index<=2&&current>=-1&&current<=1&&wanted>=0&&wanted<=1&&current!=wanted&&(index==0||external_enabled==1);
}
#endif
