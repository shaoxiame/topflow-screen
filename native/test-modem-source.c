#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sim_source_logic.h"
static uint32_t now=1000;static int calls=0,failed=0,tf_http_cancelled=0;static char last_method[40],last_payload[128];static const char*reply;
static uint32_t tick(void){return now;}
static int vendor_exec(const char*path,char*const args[],const char*input,char*out,size_t cap){
 assert(!strcmp(path,"/bin/ubus")&&!strcmp(args[0],"ubus")&&!strcmp(args[1],"-t")&&!strcmp(args[2],"1")&&!strcmp(args[3],"call")&&!strcmp(args[4],"zwrt_zte_mdm.api")&&!args[7]&&!input);
 calls++;snprintf(last_method,sizeof last_method,"%s",args[5]);snprintf(last_payload,sizeof last_payload,"%s",args[6]);snprintf(out,cap,"%s",reply?reply:"");return failed?-1:0;
}
#include "sim_source_runtime.h"
static char*read_fixture(const char*path){FILE*f=fopen(path,"rb");assert(f);fseek(f,0,SEEK_END);long n=ftell(f);assert(n>0&&n<4096);rewind(f);char*s=calloc((size_t)n+1,1);assert(s&&fread(s,1,(size_t)n,f)==(size_t)n);fclose(f);return s;}
int main(int argc,char**argv){
 assert(argc==3);char*primary=read_fixture(argv[1]),*external=read_fixture(argv[2]);
 assert(tf_source_index("5G")==0&&tf_source_index("4G1")==1&&tf_source_index("4G2")==2&&tf_source_index("4G3")==-1);
 assert(tf_source_parse(primary,0)==0&&tf_source_parse(external,1)==-1&&tf_source_parse(external,2)==-1);
 assert(tf_source_parse("{\"sim\":{\"current_slot\":1},\"modems\":[{\"id\":\"4G1\",\"sim\":{\"slot\":0}}]}",1)==-1);
 const char*invalid[]={"{}","{\"st_slot\":\"\"}","{\"st_slot\":null}","{\"st_slot\":true}","{\"st_slot\":2}","{\"st_slot\":-1}","{\"st_slot\":1.5}","{\"st_slot\":\"1;reboot\"}","{\"st_slot\":0,\"st_slot\":1}"};
 for(size_t i=0;i<sizeof invalid/sizeof*invalid;i++)assert(tf_source_parse(invalid[i],0)==-1);
 assert(tf_source_parse("{\"st_slot\":\"1\",\"current_sim_slot\":\"1\"}",0)==1);
 assert(tf_source_parse("{\"v3t_1_st_slot\":\"0\",\"v3t_2_st_slot\":\"1\"}",1)==1);
 assert(tf_source_parse("{\"v3t_1_st_slot\":\"0\",\"v3t_2_st_slot\":\"1\"}",2)==0);
 assert(tf_source_permitted(0,0,1,-1)&&tf_source_permitted(1,1,0,1)&&tf_source_permitted(2,0,1,1));
 assert(!tf_source_permitted(1,0,1,0)&&!tf_source_permitted(2,0,1,-1)&&!tf_source_permitted(0,0,0,1));
 /* Empty source reads do not invent a source and do not block an absolute choice. */
 for(int i=0;i<3;i++)for(int wanted=0;wanted<2;wanted++){
  assert(tf_source_permitted(i,-1,wanted,1));
  assert(!tf_source_permitted(i,-2,wanted,1)&&!tf_source_permitted(i,2,wanted,1));
  if(i)assert(!tf_source_permitted(i,-1,wanted,0)&&!tf_source_permitted(i,-1,wanted,-1));
 }
 reply=primary;assert(tf_source_refresh(0,0)&&source_current[0]==0&&calls==1&&!strcmp(last_method,"get_sim_info")&&!strcmp(last_payload,"{}"));
 reply="{\"st_slot\":\"1\"}";assert(tf_source_refresh(0,0)&&source_current[0]==0&&calls==1);now+=3000;assert(tf_source_refresh(0,0)&&source_current[0]==1&&calls==2);
 reply=external;assert(!tf_source_refresh(1,0)&&source_current[1]==-1&&source_current[2]==-1&&calls==3&&!strcmp(last_method,"get_v3t_sim_info"));
 reply="{\"v3t_1_st_slot\":\"0\",\"v3t_2_st_slot\":\"1\"}";assert(tf_source_refresh(2,1)&&source_current[1]==1&&source_current[2]==0&&calls==4);
 failed=1;assert(!tf_source_refresh(1,1)&&source_current[1]==-1&&source_current[2]==-1);failed=0;
 reply="{}";assert(tf_source_set(0,1)&&!strcmp(last_method,"sim_switch_slot")&&!strcmp(last_payload,"{\"slot\":1}"));
 assert(tf_source_set(1,0)&&!strcmp(last_method,"sub_modem_switch_slot")&&!strcmp(last_payload,"{\"sub_modem_num\":1,\"sub_modem_slot\":0}"));
 assert(tf_source_set(2,1)&&!strcmp(last_method,"sub_modem_switch_slot")&&!strcmp(last_payload,"{\"sub_modem_num\":0,\"sub_modem_slot\":1}"));
 int before=calls;assert(!tf_source_set(3,1)&&!tf_source_set(1,2)&&calls==before);
 failed=1;assert(!tf_source_set(0,0)&&calls==before+1);assert(source_read_once[0]==0);
 before=calls;tf_http_cancelled=1;assert(!tf_source_set(0,1)&&!tf_source_refresh(0,1)&&calls==before);
 free(primary);free(external);puts("PASS: real raw SIM source observations, three-modem absolute selection including unknown source, disabled/unknown module guards, demand cache, exact bounded factory calls; no device access");return 0;
}
