/* One-shot fixed factory API adapter, entered only as --extra with pipe stdin.
 * It never registers an object/service, opens a listener, writes files, logs,
 * initializes the vendor SDK or passes PIN/PUK through argv. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_FACTORY_EXTRA_RPC_H
#define TF_FACTORY_EXTRA_RPC_H
#include "factory_extra_protocol.h"
#include <sys/mman.h>
#include <sys/resource.h>
#include <limits.h>
typedef struct {int present,remaining;char state[48];} tf_extra_wps;
static tf_extra_sim tf_xsim;
static tf_extra_wps tf_xwps[2];
static int tf_xresponse_error;
static int tf_xnumber(struct blob_attr*a,int max){
 if(!a)return-1;unsigned long n;
 if(blobmsg_type(a)==BLOBMSG_TYPE_INT32)n=blobmsg_get_u32(a);
 else if(blobmsg_type(a)==BLOBMSG_TYPE_STRING){const char*s=blobmsg_get_string(a);if(!tf_extra_digits(s,1,8))return-1;n=strtoul(s,NULL,10);}
 else return-1;return n<=(unsigned)max?(int)n:-1;
}
static int tf_xtext(struct blob_attr*a,char*out,size_t cap){
 if(blobmsg_type(a)!=BLOBMSG_TYPE_STRING)return 0;const char*s=blobmsg_get_string(a);size_t n=strnlen(s,cap);if(n>=cap)return 0;
 for(size_t i=0;i<n;i++)if((unsigned char)s[i]<32||(unsigned char)s[i]>=127||s[i]=='"'||s[i]=='\\')return 0;
 memcpy(out,s,n+1);return 1;
}
static void tf_xsim_reply(struct ubus_request*req,int type,struct blob_attr*msg){
 (void)req;(void)type;if(!msg||tf_xsim.valid){tf_xresponse_error=1;return;}tf_xsim.valid=1;
 unsigned seen=0;struct blob_attr*a;size_t rem;
 blobmsg_for_each_attr(a,msg,rem){const char*k=blobmsg_name(a);unsigned flag=0;
  if(!strcmp(k,"pinnumber")){flag=1;tf_xsim.pin_left=tf_xnumber(a,3);}
  else if(!strcmp(k,"puknumber")){flag=2;tf_xsim.puk_left=tf_xnumber(a,10);}
  else if(!strcmp(k,"current_sim_slot")){flag=4;tf_xsim.slot=tf_xnumber(a,2);}
  else if(!strcmp(k,"sim_states")){flag=8;if(!tf_xtext(a,tf_xsim.state,sizeof tf_xsim.state))tf_xresponse_error=1;}
  else if(!strcmp(k,"modem_main_state")){flag=16;if(!tf_xtext(a,tf_xsim.modem,sizeof tf_xsim.modem))tf_xresponse_error=1;}
  if(flag&&(seen&flag))tf_xresponse_error=1;seen|=flag;
 }
 if(!(seen&8)||tf_xsim.slot<1)tf_xresponse_error=1;
}
static int tf_xread_sim(struct ubus_context*ctx){
 memset(&tf_xsim,0,sizeof tf_xsim);tf_xsim.pin_left=tf_xsim.puk_left=tf_xsim.slot=-1;tf_xresponse_error=0;
 uint32_t id;if(ubus_lookup_id(ctx,"zwrt_zte_mdm.api",&id))return 0;struct blob_buf b={0};blob_buf_init(&b,0);
 int rc=ubus_invoke(ctx,id,"get_sim_info",b.head,tf_xsim_reply,NULL,1200);blob_buf_free(&b);tf_xsim.valid=tf_xsim.valid&&!tf_xresponse_error&&!rc;return tf_xsim.valid;
}
static void tf_xsim_output(int submitted,int accepted){printf("{\"ok\":%s,\"submitted\":%s,\"accepted\":%s,\"slot\":%d,\"pin_remaining\":%d,\"puk_remaining\":%d,\"sim_state\":\"%s\",\"modem_state\":\"%s\"}\n",tf_xsim.valid?"true":"false",submitted?"true":"false",accepted?"true":"false",tf_xsim.slot,tf_xsim.pin_left,tf_xsim.puk_left,tf_xsim.state,tf_xsim.modem);}
static void tf_xwps_reply(struct ubus_request*req,int type,struct blob_attr*msg){
 (void)req;(void)type;if(!msg){tf_xresponse_error=1;return;}struct blob_attr*a;size_t rem;int found=0;
 blobmsg_for_each_attr(a,msg,rem){if(strcmp(blobmsg_name(a),"wifi_wps_status_info"))continue;if(found++||blobmsg_type(a)!=BLOBMSG_TYPE_ARRAY){tf_xresponse_error=1;return;}
  struct blob_attr*item;size_t left;blobmsg_for_each_attr(item,a,left){if(blobmsg_type(item)!=BLOBMSG_TYPE_TABLE)continue;char section[32]="",status[48]="";int seconds=-1;unsigned seen=0;struct blob_attr*f;size_t fields;
   blobmsg_for_each_attr(f,item,fields){unsigned bit=0;const char*k=blobmsg_name(f);if(!strcmp(k,"section_name")){bit=1;if(!tf_xtext(f,section,sizeof section))tf_xresponse_error=1;}else if(!strcmp(k,"wps_status")){bit=2;if(!tf_xtext(f,status,sizeof status))tf_xresponse_error=1;}else if(!strcmp(k,"remaining")){bit=4;seconds=tf_xnumber(f,600);}if(bit&&(seen&bit))tf_xresponse_error=1;seen|=bit;}
   int i=!strcmp(section,"main_2g")?0:!strcmp(section,"main_5g")?1:-1;if(i<0)continue;if(tf_xwps[i].present||seen!=7||!*status||seconds<0){tf_xresponse_error=1;continue;}tf_xwps[i].present=1;tf_xwps[i].remaining=seconds;strcpy(tf_xwps[i].state,status);
  }
 }if(!found)tf_xresponse_error=1;
}
static int tf_xread_wps(struct ubus_context*ctx){
 memset(tf_xwps,0,sizeof tf_xwps);tf_xresponse_error=0;uint32_t id;if(ubus_lookup_id(ctx,"zwrt_wlan",&id))return 0;struct blob_buf b={0};blob_buf_init(&b,0);
 int rc=ubus_invoke(ctx,id,"get_wps_status",b.head,tf_xwps_reply,NULL,1200);blob_buf_free(&b);return!rc&&!tf_xresponse_error&&(tf_xwps[0].present||tf_xwps[1].present);
}
static void tf_xwps_output(int okay,int submitted,int accepted){
 printf("{\"ok\":%s,\"submitted\":%s,\"accepted\":%s,\"bands\":[",okay?"true":"false",submitted?"true":"false",accepted?"true":"false");int n=0;
 for(int i=0;i<2;i++)if(tf_xwps[i].present)printf("%s{\"section\":\"%s\",\"state\":\"%s\",\"remaining\":%d}",n++?",":"",i?"main_5g":"main_2g",tf_xwps[i].state,tf_xwps[i].remaining);puts("]}");
}
typedef struct {const char*key;char*out;size_t cap;int okay,seen;} tf_xfield;
static void tf_xfield_reply(struct ubus_request*req,int type,struct blob_attr*msg){
 (void)type;tf_xfield*f=req->priv;if(!msg){f->okay=0;return;}struct blob_attr*a;size_t rem;
 blobmsg_for_each_attr(a,msg,rem)if(!strcmp(blobmsg_name(a),f->key)){if(f->seen++||blobmsg_type(a)!=BLOBMSG_TYPE_STRING){f->okay=0;continue;}const char*s=blobmsg_get_string(a);size_t n=strnlen(s,f->cap);if(n>=f->cap){f->okay=0;continue;}memcpy(f->out,s,n+1);}
}
static int tf_xnet_get(struct ubus_context*ctx,const char*method,const char*key,char*out,size_t cap){
 out[0]=0;uint32_t id;if(ubus_lookup_id(ctx,"zte_nwinfo_api",&id))return 0;tf_xfield f={key,out,cap,1,0};struct blob_buf b={0};blob_buf_init(&b,0);blobmsg_add_string(&b,"moduleName","zte_topsw_devui");int rc=ubus_invoke(ctx,id,method,b.head,tf_xfield_reply,&f,1200);blob_buf_free(&b);return!rc&&f.okay&&f.seen==1;
}
static void tf_xprint_string(const char*s){putchar('"');for(;*s;s++){unsigned char c=(unsigned char)*s;if(c=='"'||c=='\\'){putchar('\\');putchar(c);}else if(c<32||c==127)printf("\\u%04x",c);else putchar(c);}putchar('"');}
static void tf_xnet_output(struct ubus_context*ctx){
 char state[64],result[64],contents[8192];tf_extra_operator rows[20];int okay=tf_xnet_get(ctx,"nwinfo_m_netselect_status","m_netselect_status",state,sizeof state);okay=tf_xnet_get(ctx,"nwinfo_m_netselect_result","m_netselect_result",result,sizeof result)&&okay;okay=tf_xnet_get(ctx,"nwinfo_m_netselect_contents","m_netselect_contents",contents,sizeof contents)&&okay;int n=okay?tf_extra_operators_parse(contents,rows):-1;
 printf("{\"ok\":%s,\"state\":",okay&&n>=0?"true":"false");tf_xprint_string(state);printf(",\"result\":");tf_xprint_string(result);printf(",\"operators\":[");for(int i=0;i<n;i++){if(i)putchar(',');printf("{\"status\":%d,\"name\":",rows[i].status);tf_xprint_string(rows[i].name);printf(",\"plmn\":\"%s\",\"rat\":\"%s\"}",rows[i].plmn,rows[i].rat);}puts("]}");
}
static void tf_xnet_submit(struct ubus_context*ctx,const tf_extra_command*cmd){
 int allowed=tf_xread_sim(ctx)&&tf_xsim.slot==cmd->slot&&!strcmp(tf_xsim.state,"sim ready")&&(!*tf_xsim.modem||!strcmp(tf_xsim.modem,"modem_init_complete")),written=0,accepted=0;
 if(allowed){char state[64];allowed=tf_xnet_get(ctx,"nwinfo_m_netselect_status","m_netselect_status",state,sizeof state)&&(cmd->op==TF_X_NET_SELECT?!strcmp(state,"manual_selected"):tf_extra_net_scan_allowed(state));}
 if(allowed&&cmd->op==TF_X_NET_SELECT){char contents[8192];tf_extra_operator rows[20];allowed=0;if(tf_xnet_get(ctx,"nwinfo_m_netselect_contents","m_netselect_contents",contents,sizeof contents)){int n=tf_extra_operators_parse(contents,rows);allowed=tf_extra_operator_matches(rows,n,cmd);}}
 if(allowed){uint32_t id;if(!ubus_lookup_id(ctx,"zte_nwinfo_api",&id)){struct blob_buf b={0};blob_buf_init(&b,0);blobmsg_add_string(&b,"moduleName","zte_topsw_devui");if(cmd->op==TF_X_NET_SELECT){blobmsg_add_string(&b,"m_mcc_mnc",cmd->plmn);blobmsg_add_string(&b,"m_rat",cmd->rat);}written=1;accepted=ubus_invoke(ctx,id,cmd->op==TF_X_NET_SCAN?"nwinfo_manual_scan":"nwinfo_manual_register",b.head,NULL,NULL,1200)==0;blob_buf_free(&b);}}
 printf("{\"ok\":true,\"submitted\":%s,\"accepted\":%s}\n",written?"true":"false",accepted?"true":"false");
}
static int tf_extra_rpc_main(void){
 struct stat st;if(fstat(0,&st)||!S_ISFIFO(st.st_mode))return 64;pid_t owner=getppid();struct rlimit core={0,0};
 if(owner<=1||prctl(PR_SET_PDEATHSIG,SIGKILL)||getppid()!=owner||setrlimit(RLIMIT_CORE,&core)||prctl(PR_SET_DUMPABLE,0))return 65;
 alarm(5);
 char input[130]={0};tf_extra_command cmd;if(mlock(input,sizeof input)||mlock(&cmd,sizeof cmd))return 65;size_t used=0;int bad=0;
 /* Parent closes stdin immediately after this one bounded command. */
 while(used<sizeof input-1){struct pollfd p={0,POLLIN,0};int ready=poll(&p,1,500);if(ready<=0){bad=1;break;}ssize_t n=read(0,input+used,sizeof input-1-used);if(n==0)break;if(n<0){if(errno==EINTR)continue;bad=1;break;}used+=(size_t)n;}
 if(bad||used>=sizeof input-1||!tf_extra_decode(input,used,&cmd)){tf_extra_wipe(input,sizeof input);tf_extra_wipe(&cmd,sizeof cmd);return 64;}tf_extra_wipe(input,sizeof input);
 struct ubus_context*ctx=ubus_connect(NULL);if(!ctx){tf_extra_wipe(&cmd,sizeof cmd);return 67;}
 int written=0,accepted=0;
 if(cmd.op==TF_X_SIM_READ){tf_xread_sim(ctx);tf_xsim_output(0,0);}
 else if(cmd.op==TF_X_NET_READ)tf_xnet_output(ctx);
 else if(cmd.op==TF_X_NET_SCAN||cmd.op==TF_X_NET_SELECT)tf_xnet_submit(ctx,&cmd);
 else if(cmd.op==TF_X_PIN||cmd.op==TF_X_PUK){
  if(tf_xread_sim(ctx)&&tf_extra_sim_allows(&tf_xsim,&cmd)){uint32_t id;if(!ubus_lookup_id(ctx,"zwrt_zte_mdm.api",&id)){struct blob_buf b={0};blob_buf_init(&b,0);blobmsg_add_string(&b,"puk_num",cmd.op==TF_X_PUK?cmd.puk:"");blobmsg_add_string(&b,"pin_num",cmd.pin);blobmsg_add_string(&b,"pin_encode_flag","0");written=1;accepted=ubus_invoke(ctx,id,"sim_verify_pin_puk",b.head,NULL,NULL,1200)==0;if(b.buf)tf_extra_wipe(b.buf,b.buflen);blob_buf_free(&b);}}
  tf_extra_wipe(cmd.pin,sizeof cmd.pin);tf_extra_wipe(cmd.puk,sizeof cmd.puk);if(written)tf_xread_sim(ctx);tf_xsim_output(written,accepted);
 }else if(cmd.op==TF_X_WPS_READ){tf_xwps_output(tf_xread_wps(ctx),0,0);}
 else if(cmd.op==TF_X_WPS_START||cmd.op==TF_X_WPS_CANCEL){int okay=tf_xread_wps(ctx);if(okay&&(cmd.op==TF_X_WPS_CANCEL||(tf_xwps[cmd.band].present&&tf_extra_wps_start_allowed(tf_xwps[cmd.band].state,tf_xwps[cmd.band].remaining)))){uint32_t id;if(!ubus_lookup_id(ctx,"zwrt_wlan",&id)){struct blob_buf b={0};blob_buf_init(&b,0);for(int i=0;i<2;i++)if(cmd.op==TF_X_WPS_CANCEL||cmd.band==i){void*t=blobmsg_open_table(&b,i?"main_5g":"main_2g");blobmsg_add_string(&b,"wps_action",cmd.op==TF_X_WPS_CANCEL?"cancel":"pbc");blobmsg_close_table(&b,t);}written=1;accepted=ubus_invoke(ctx,id,"set",b.head,NULL,NULL,1200)==0;blob_buf_free(&b);}}if(written)okay=tf_xread_wps(ctx);tf_xwps_output(okay,written,accepted);}
 ubus_free(ctx);tf_extra_wipe(&cmd,sizeof cmd);return 0;
}
#endif
