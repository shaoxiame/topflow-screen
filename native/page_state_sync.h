/* Active-page observations, never setters. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * One short-lived child reads existing APIs. The renderer only drains a
 * nonblocking pipe; it never waits for HTTP, ubus or child completion. Results
 * belong to the exact page/card/group that requested them. No file or daemon.
 * Include after advanced_controls.h and the display runtime helpers. */
#ifndef TF_PAGE_STATE_SYNC_H
#define TF_PAGE_STATE_SYNC_H
#include <stddef.h>
#include <stdint.h>
#define TF_PS_INTERVAL 5000u
#define TF_PS_DEADLINE 4000u
#define TF_PS_STALE 15000u
#define TF_PS_MAGIC 0x54505331u
enum {TF_PS_DISPLAY,TF_PS_AOYOU,TF_PS_SOURCE,TF_PS_APN,TF_PS_POWER,TF_PS_GUEST,TF_PS_FORWARD,TF_PS_DUAL,TF_PS_EXTRA};
typedef struct {int kind,page,source,extra;char card[8],group[513];} tf_ps_context;
typedef struct {char id[65],name[129],apn[129],username[257];int auth,pdp;} tf_ps_apn_profile;
typedef struct {int count,mode;char enabled[65];tf_ps_apn_profile profiles[16];} tf_ps_apn;
typedef struct {int count,selected,members;char mode[16],identity[256],message[192];ay_group groups[AY_MAX_GROUPS];char nodes[AY_MAX_MEMBERS][513];} tf_ps_aoyou;
typedef struct {int enabled,power,live;char method[24];} tf_ps_forward;
typedef struct {char mode[32];int quick,reboot,poweroff;} tf_ps_power;
typedef struct {int valid,kind;tf_extra_sim sim;int present[2],remaining[2],count;char wps[2][48],net_state[64],net_result[64];tf_extra_operator operators[20];} tf_ps_extra;
typedef struct {
 uint32_t magic,bytes;tf_ps_context context;int okay,display_valid,display_requested;
 tf_display_config display;
 union {tf_ps_aoyou aoyou;int sources[3];tf_ps_apn apn;tf_ps_power power;char guest[32768];tf_ps_forward forwarding;int dual[2];tf_ps_extra extra;} data;
} tf_ps_result;
_Static_assert(sizeof(tf_ps_result)<=524288,"page observation result remains bounded");
static size_t tf_ps_size(int kind){
 size_t n=0;switch(kind){case TF_PS_AOYOU:n=sizeof(tf_ps_aoyou);break;case TF_PS_SOURCE:n=sizeof(int)*3;break;case TF_PS_APN:n=sizeof(tf_ps_apn);break;case TF_PS_POWER:n=sizeof(tf_ps_power);break;case TF_PS_GUEST:n=32768;break;case TF_PS_FORWARD:n=sizeof(tf_ps_forward);break;case TF_PS_DUAL:n=sizeof(int)*2;break;case TF_PS_EXTRA:n=sizeof(tf_ps_extra);break;case TF_PS_DISPLAY:break;default:return 0;}return offsetof(tf_ps_result,data)+n;
}
static int tf_ps_context_equal(const tf_ps_context*a,const tf_ps_context*b){return a->kind==b->kind&&a->page==b->page&&a->source==b->source&&a->extra==b->extra&&!strcmp(a->card,b->card)&&!strcmp(a->group,b->group);}
static tf_ps_context tf_ps_context_now(int eligible){
 tf_ps_context c={0};c.page=advanced_page;if(!eligible)return c;
 switch(advanced_page){
 case 3:c.kind=TF_PS_AOYOU;if(ay_selected>=0&&ay_selected<ay_count)snprintf(c.group,sizeof c.group,"%s",ay_groups[ay_selected].name);break;
 case 4:c.kind=TF_PS_SOURCE;c.source=tf_source_index(modem_selected);snprintf(c.card,sizeof c.card,"%s",modem_selected);break;
 case 5:c.kind=TF_PS_APN;snprintf(c.card,sizeof c.card,"%s",modem_selected);break;
 case 8:c.kind=TF_PS_POWER;break;case 11:c.kind=TF_PS_GUEST;break;case 13:c.kind=TF_PS_FORWARD;break;case 20:c.kind=TF_PS_DUAL;break;
 case 17:case 19:/* PIN input belongs to the user, even outside its keyboard. */
  if(fx.values[0][0]||fx.values[1][0]||fx.values[2][0])break;
  c.kind=TF_PS_EXTRA;c.extra=fx.kind;snprintf(c.card,sizeof c.card,"%s",modem_selected);break;
 default:break;
 }return c;
}
/* Guest status APIs need not promise to exclude future secret fields. Only
 * copy the fields this page displays, never an arbitrary backend JSON blob. */
static int tf_ps_guest_public(char*out,size_t cap){
 tf_json d;if(!guest_valid||!tf_parse(&d,guest_json))return 0;size_t used=0;int okay=1;
 int time_supported=tf_bool(&d,tf_key(&d,0,"active_time_supported")),management=tf_bool(&d,tf_key(&d,0,"management_access"));long long minutes=-1;tf_int(&d,tf_key(&d,0,"active_time_minutes"),&minutes);
 int n=snprintf(out,cap,"{\"active_time_supported\":%s,\"management_access\":%s,\"active_time_minutes\":%lld,\"guests\":[",time_supported<0?"null":time_supported?"true":"false",management<0?"null":management?"true":"false",minutes);if(n<0||(size_t)n>=cap)okay=0;else used=(size_t)n;
 const char*sections[]={"guest_2g","guest_5g"};int count=0;
 for(int k=0;k<2&&okay;k++){int i=guest_find(&d,sections[k]);if(i<0)continue;char ssid[128]="",enc[64]="",ssid_q[800],enc_q[400];tf_gets(&d,i,"ssid",ssid,sizeof ssid);tf_gets(&d,i,"encryption",enc,sizeof enc);if(!tf_quote(ssid_q,sizeof ssid_q,ssid)||!tf_quote(enc_q,sizeof enc_q,enc)){okay=0;break;}
  int enabled=tf_bool(&d,tf_key(&d,i,"enabled")),supported=tf_bool(&d,tf_key(&d,i,"supported"));long long clients=-1,left=-1,active=-1;tf_int(&d,tf_key(&d,i,"clients"),&clients);tf_int(&d,tf_key(&d,i,"left_seconds"),&left);tf_int(&d,tf_key(&d,i,"active_time_minutes"),&active);
  n=snprintf(out+used,cap-used,"%s{\"section\":\"%s\",\"supported\":%s,\"enabled\":%s,\"ssid\":%s,\"encryption\":%s,\"clients\":%lld,\"left_seconds\":%lld,\"active_time_minutes\":%lld}",count?",":"",sections[k],supported<0?"null":supported?"true":"false",enabled<0?"null":enabled?"true":"false",ssid_q,enc_q,clients,left,active);if(n<0||(size_t)n>=cap-used)okay=0;else{used+=(size_t)n;count++;}
 }
 if(okay){n=snprintf(out+used,cap-used,"]}");okay=n>=0&&(size_t)n<cap-used;}tf_free(&d);return okay;
}
/* Invoked only inside the isolated observation child. Each callee below is a
 * fixed existing getter. Do not add actions, authorization or test messages. */
static void tf_ps_collect(tf_ps_result*r,int display_eligible){
 r->magic=TF_PS_MAGIC;r->bytes=(uint32_t)tf_ps_size(r->context.kind);r->display_requested=display_eligible!=0;
 if(display_eligible)r->display_valid=display_read_settings_config(&r->display);
 switch(r->context.kind){
 case TF_PS_DISPLAY:r->okay=1;break;
 case TF_PS_SOURCE:r->okay=tf_source_refresh(r->context.source,1);memcpy(r->data.sources,source_current,sizeof source_current);break;
 case TF_PS_GUEST:r->okay=guest_load()&&tf_ps_guest_public(r->data.guest,sizeof r->data.guest);break;
 case TF_PS_DUAL:r->okay=wireless_dual_read();r->data.dual[0]=wireless_dual_supported;r->data.dual[1]=wireless_dual;break;
 case TF_PS_POWER:
  power_refresh();snprintf(r->data.power.mode,sizeof r->data.power.mode,"%s",power_mode);r->data.power.quick=power_quick;r->data.power.reboot=power_reboot_supported;r->data.power.poweroff=power_off_supported;r->okay=1;break;
 case TF_PS_FORWARD:
  r->okay=tf_ufi_live()&&sf_overview_load();r->data.forwarding.enabled=sf.enabled;r->data.forwarding.power=sf.power;r->data.forwarding.live=tf_ufi_live();snprintf(r->data.forwarding.method,sizeof r->data.forwarding.method,"%s",sf.method);break;
 case TF_PS_APN:
  r->okay=apn_load();r->data.apn.count=apn_count;r->data.apn.mode=apn_mode;snprintf(r->data.apn.enabled,sizeof r->data.apn.enabled,"%s",apn_enabled);
  for(int i=0;i<apn_count&&i<16;i++){tf_ps_apn_profile*p=&r->data.apn.profiles[i];tf_apn_profile*q=&apn_profiles[i];snprintf(p->id,sizeof p->id,"%s",q->id);snprintf(p->name,sizeof p->name,"%s",q->name);snprintf(p->apn,sizeof p->apn,"%s",q->apn);snprintf(p->username,sizeof p->username,"%s",q->username);p->auth=q->auth;p->pdp=q->pdp;}break;
 case TF_PS_AOYOU:{
  r->okay=ay_refresh();if(r->okay&&*r->context.group){int found=-1;for(int i=0;i<ay_count;i++)if(!strcmp(ay_groups[i].name,r->context.group)){found=i;break;}if(found>=0&&!strcmp(ay_groups[found].type,"Selector"))r->okay=ay_open_group(found);}
  tf_ps_aoyou*a=&r->data.aoyou;a->count=ay_count;a->selected=ay_selected;a->members=ay_member_count;snprintf(a->mode,sizeof a->mode,"%s",ay_mode);snprintf(a->identity,sizeof a->identity,"%s",ay_identity);snprintf(a->message,sizeof a->message,"%s",ay_message);memcpy(a->groups,ay_groups,sizeof ay_groups);memcpy(a->nodes,ay_members,sizeof ay_members);break;}
 case TF_PS_EXTRA:{
  r->okay=fx_load();tf_ps_extra*x=&r->data.extra;x->valid=fx.valid;x->kind=fx.kind;x->sim=fx.sim;x->count=fx.operator_count;memcpy(x->present,fx.wps_present,sizeof x->present);memcpy(x->remaining,fx.wps_remaining,sizeof x->remaining);memcpy(x->wps,fx.wps_state,sizeof x->wps);snprintf(x->net_state,sizeof x->net_state,"%s",fx.net_state);snprintf(x->net_result,sizeof x->net_result,"%s",fx.net_result);memcpy(x->operators,fx.operators,sizeof x->operators);break;}
 }
}
static void tf_ps_unknown(const tf_ps_context*c){
 switch(c->kind){
 case TF_PS_SOURCE:if(c->source>=0&&c->source<3)source_current[c->source]=-1;break;
 case TF_PS_GUEST:guest_valid=0;guest_json[0]=0;break;
 case TF_PS_DUAL:wireless_dual=wireless_dual_supported=-1;break;
 case TF_PS_POWER:power_mode[0]=0;power_quick=-1;power_reboot_supported=power_off_supported=0;break;
 case TF_PS_FORWARD:sf.enabled=sf.power=-1;sf.method[0]=0;break;
 case TF_PS_APN:apn_valid=0;snprintf(apn_message,sizeof apn_message,"APN 状态暂不可用，等待同步");break;
 case TF_PS_AOYOU:ay_mode[0]=ay_identity[0]=0;snprintf(ay_message,sizeof ay_message,"遨游状态暂不可用，等待同步");break;
 case TF_PS_EXTRA:fx.valid=0;break;
 }
}
static int tf_ps_display_unknown(void){int changed=display_settings_valid;display_settings_valid=0;display_settings_error="DISPLAY_SYNC_UNAVAILABLE";return changed&&advanced_page==16;}
static int tf_ps_apply(tf_ps_result*r,const tf_ps_context*current,uint32_t now){
 if(r->magic!=TF_PS_MAGIC||r->bytes!=tf_ps_size(current->kind)||!tf_ps_context_equal(&r->context,current))return 0;
 int changed=0;if(r->display_valid){int status=display_runtime_accept_observed(&r->display);if(status<0)return 1;if(running&&(status==0||status==1))changed=display_settings_observe(&r->display)||status==1;}else if(r->display_requested)changed=tf_ps_display_unknown();
 if(!running)return changed;
 if(current->kind==TF_PS_FORWARD&&!r->data.forwarding.live)tf_ufi_revoke();
 if(!r->okay){tf_ps_unknown(current);return 1;}
 switch(current->kind){
 case TF_PS_DISPLAY:break;
 case TF_PS_SOURCE:for(int i=0;i<3;i++)if(r->data.sources[i]<-1||r->data.sources[i]>1)return 0;memcpy(source_current,r->data.sources,sizeof source_current);source_read_once[current->source?1:0]=1;source_read_at[current->source?1:0]=now;changed=1;break;
 case TF_PS_GUEST:if(!memchr(r->data.guest,0,sizeof r->data.guest))return 0;snprintf(guest_json,sizeof guest_json,"%s",r->data.guest);guest_valid=1;changed=1;break;
 case TF_PS_DUAL:if(r->data.dual[0]<0||r->data.dual[0]>1||r->data.dual[1]<0||r->data.dual[1]>1)return 0;wireless_dual_supported=r->data.dual[0];wireless_dual=r->data.dual[1];changed=1;break;
 case TF_PS_POWER:{tf_ps_power*p=&r->data.power;if(!memchr(p->mode,0,sizeof p->mode)||p->quick<-1||p->quick>1)return 0;snprintf(power_mode,sizeof power_mode,"%s",p->mode);power_quick=p->quick;power_reboot_supported=p->reboot==1;power_off_supported=p->poweroff==1;changed=1;break;}
 case TF_PS_FORWARD:{tf_ps_forward*s=&r->data.forwarding;if(!memchr(s->method,0,sizeof s->method)||s->enabled<-1||s->enabled>1||s->power<-1||s->power>1)return 0;if(!s->live){tf_ufi_revoke();tf_ps_unknown(current);}else{sf.enabled=s->enabled;sf.power=s->power;snprintf(sf.method,sizeof sf.method,"%s",s->method);}changed=1;break;}
 case TF_PS_APN:{tf_ps_apn*a=&r->data.apn;if(a->count<0||a->count>16||a->mode<0||a->mode>1||!memchr(a->enabled,0,sizeof a->enabled))return 0;for(int i=0;i<a->count;i++){tf_ps_apn_profile*p=&a->profiles[i];if(!memchr(p->id,0,sizeof p->id)||!memchr(p->name,0,sizeof p->name)||!memchr(p->apn,0,sizeof p->apn)||!memchr(p->username,0,sizeof p->username))return 0;}memset(apn_profiles,0,sizeof apn_profiles);for(int i=0;i<a->count;i++){tf_ps_apn_profile*p=&a->profiles[i];tf_apn_profile*q=&apn_profiles[i];snprintf(q->id,sizeof q->id,"%s",p->id);snprintf(q->name,sizeof q->name,"%s",p->name);snprintf(q->apn,sizeof q->apn,"%s",p->apn);snprintf(q->username,sizeof q->username,"%s",p->username);q->auth=p->auth;q->pdp=p->pdp;}apn_count=a->count;apn_mode=a->mode;snprintf(apn_enabled,sizeof apn_enabled,"%s",a->enabled);apn_valid=1;snprintf(apn_message,sizeof apn_message,"当前卡 APN 已同步");changed=1;break;}
 case TF_PS_AOYOU:{tf_ps_aoyou*a=&r->data.aoyou;if(a->count<0||a->count>AY_MAX_GROUPS||a->selected<-1||a->selected>=a->count||a->members<0||a->members>AY_MAX_MEMBERS||!memchr(a->identity,0,sizeof a->identity)||!memchr(a->mode,0,sizeof a->mode)||!memchr(a->message,0,sizeof a->message))return 0;for(int i=0;i<a->count;i++)if(!memchr(a->groups[i].name,0,sizeof a->groups[i].name)||!memchr(a->groups[i].type,0,sizeof a->groups[i].type)||!memchr(a->groups[i].now,0,sizeof a->groups[i].now))return 0;for(int i=0;i<a->members;i++)if(!memchr(a->nodes[i],0,sizeof a->nodes[i]))return 0;ay_count=a->count;ay_selected=a->selected;ay_member_count=a->members;memcpy(ay_groups,a->groups,sizeof ay_groups);memcpy(ay_members,a->nodes,sizeof ay_members);snprintf(ay_mode,sizeof ay_mode,"%s",a->mode);snprintf(ay_identity,sizeof ay_identity,"%s",a->identity);snprintf(ay_message,sizeof ay_message,"%s",a->message);if(ay_offset>=(ay_selected<0?ay_count:ay_member_count))ay_offset=0;changed=1;break;}
 case TF_PS_EXTRA:{tf_ps_extra*x=&r->data.extra;if(x->kind!=current->extra||x->count<0||x->count>20)return 0;fx.valid=x->valid;fx.sim=x->sim;fx.operator_count=x->count;memcpy(fx.wps_present,x->present,sizeof x->present);memcpy(fx.wps_remaining,x->remaining,sizeof x->remaining);memcpy(fx.wps_state,x->wps,sizeof x->wps);memcpy(fx.net_state,x->net_state,sizeof x->net_state);memcpy(fx.net_result,x->net_result,sizeof x->net_result);memcpy(fx.operators,x->operators,sizeof x->operators);fx_loaded_at=now;changed=1;break;}
 }return changed;
}
/* The platform transport is injected only by native computer tests. */
#ifndef TF_PAGE_STATE_TEST_TRANSPORT
#include <dirent.h>
#include <sys/wait.h>
#include <sys/prctl.h>
static pid_t tf_ps_pid;static int tf_ps_fd=-1,tf_ps_status,tf_ps_exited;
static void tf_ps_child_close_fds(int keep){
 int nullfd=open("/dev/null",O_RDWR);if(nullfd<0)_exit(125);for(int fd=0;fd<3;fd++)if(dup2(nullfd,fd)<0)_exit(125);if(nullfd>2&&nullfd!=keep)close(nullfd);
 DIR*d=opendir("/proc/self/fd");if(d){int own=dirfd(d);struct dirent*e;while((e=readdir(d))){char*end;long fd=strtol(e->d_name,&end,10);if(*e->d_name&&!*end&&fd>=3&&fd!=keep&&fd!=own)close((int)fd);}closedir(d);}else{long limit=sysconf(_SC_OPEN_MAX);if(limit<0||limit>1048576)limit=1048576;for(int fd=3;fd<limit;fd++)if(fd!=keep)close(fd);}
}
static int tf_ps_spawn(tf_ps_result*r,size_t bytes,int display_eligible){
 int fds[2];if(pipe(fds))return 0;fcntl(fds[0],F_SETFD,FD_CLOEXEC);fcntl(fds[1],F_SETFD,FD_CLOEXEC);pid_t parent=getpid(),child=fork();
 if(child==0){
  if(prctl(PR_SET_PDEATHSIG,SIGKILL)<0||getppid()!=parent||setpgid(0,0))_exit(125);
  signal(SIGTERM,SIG_DFL);signal(SIGINT,SIG_DFL);signal(SIGALRM,SIG_DFL);signal(SIGPIPE,SIG_DFL);alarm(4);
  struct rlimit no_core={0,0};if(setrlimit(RLIMIT_CORE,&no_core)||prctl(PR_SET_DUMPABLE,0))_exit(125);
  tf_http_wait_hook=NULL;tf_http_cancelled=0;tf_ps_child_close_fds(fds[1]);
  /* mlock is not inherited across fork. Keep the session pinned in this
   * process before any authenticated read. Neither draft nor PIN is needed. */
  tf_ufi_wipe(&sf_storage,sizeof sf_storage);tf_pin_clear(&pin_policy);tf_ufi_wipe(fx.values,sizeof fx.values);tf_ufi_wipe(form_values,sizeof form_values);tf_ufi_wipe(form_original,sizeof form_original);tf_ufi_wipe(form_payload,sizeof form_payload);for(int i=0;i<16;i++)tf_ufi_wipe(apn_profiles[i].password,sizeof apn_profiles[i].password);
  if(r->context.kind==TF_PS_FORWARD){if(mlock(&tf_ufi_storage,sizeof tf_ufi_storage))_exit(125);tf_ufi_memory_locked=1;}else tf_ufi_revoke();
  tf_ps_collect(r,display_eligible);for(int i=0;i<16;i++)tf_ufi_wipe(apn_profiles[i].password,sizeof apn_profiles[i].password);size_t sent=0;while(sent<bytes){ssize_t n=write(fds[1],(char*)r+sent,bytes-sent);if(n>0)sent+=(size_t)n;else if(n<0&&errno==EINTR)continue;else break;}
  tf_ufi_revoke();tf_ufi_wipe(r,bytes);close(fds[1]);_exit(sent==bytes?0:126);
 }
 close(fds[1]);if(child<0){close(fds[0]);return 0;}/* The child sets its own group before any getter forks. */
 setpgid(child,child);int flags=fcntl(fds[0],F_GETFL);if(flags<0||fcntl(fds[0],F_SETFL,flags|O_NONBLOCK)<0){kill(child,SIGKILL);close(fds[0]);tf_ps_pid=child;tf_ps_fd=-1;return 0;}
 tf_ps_pid=child;tf_ps_fd=fds[0];tf_ps_status=tf_ps_exited=0;return 1;
}
static void tf_ps_stop(void){if(tf_ps_pid>0&&!tf_ps_exited){kill(-tf_ps_pid,SIGKILL);kill(tf_ps_pid,SIGKILL);}if(tf_ps_fd>=0){close(tf_ps_fd);tf_ps_fd=-1;}}
static int tf_ps_reap(void){if(!tf_ps_pid)return 1;int status;pid_t n=waitpid(tf_ps_pid,&status,WNOHANG);if(n==tf_ps_pid||(n<0&&errno==ECHILD)){tf_ps_status=n==tf_ps_pid?status:-1;tf_ps_exited=1;tf_ps_pid=0;return 1;}return 0;}
static int tf_ps_read(void*out,size_t size){ssize_t n=read(tf_ps_fd,out,size);if(n>0)return(int)n;if(!n)return-1;if(errno==EAGAIN||errno==EINTR)return 0;return-2;}
static int tf_ps_success(void){return tf_ps_exited&&tf_ps_status>=0&&WIFEXITED(tf_ps_status)&&WEXITSTATUS(tf_ps_status)==0;}
#endif
static struct {tf_ps_context context;tf_ps_result*reply;size_t bytes,received;uint32_t started,last_attempt,last_good;int observed,active,stale,reaping,display_requested;} tf_page_sync;
static void tf_ps_release_reply(void){if(tf_page_sync.reply){tf_ufi_wipe(tf_page_sync.reply,tf_page_sync.bytes);free(tf_page_sync.reply);}tf_page_sync.reply=NULL;tf_page_sync.bytes=tf_page_sync.received=0;tf_page_sync.active=0;}
static void tf_page_state_cancel(void){if(tf_page_sync.active){tf_ps_stop();tf_ps_release_reply();tf_page_sync.reaping=!tf_ps_reap();}else if(tf_page_sync.reaping&&tf_ps_reap())tf_page_sync.reaping=0;tf_page_sync.last_attempt=tick();}
static void tf_page_state_close(void){tf_page_state_cancel();tf_ps_reap();}
/* eligible excludes editing, confirmation, gestures, sleep and locked pages.
 * display_eligible additionally permits a locked-but-awake settings sample. */
static int tf_page_state_poll(uint32_t now,int eligible,int display_eligible){
 int dirty=0;tf_ps_context context=tf_ps_context_now(eligible);if(!eligible&&!display_eligible){tf_page_state_cancel();return 0;}
 if(!tf_page_sync.observed||!tf_ps_context_equal(&context,&tf_page_sync.context)){tf_page_state_cancel();tf_page_sync.context=context;tf_page_sync.last_attempt=now-TF_PS_INTERVAL;tf_page_sync.last_good=now;tf_page_sync.observed=1;tf_page_sync.stale=0;}
 if(tf_page_sync.reaping){if(!tf_ps_reap())return 0;tf_page_sync.reaping=0;}
 if(tf_page_sync.active){
  if((uint32_t)(now-tf_page_sync.started)>=TF_PS_DEADLINE){tf_ps_stop();tf_ps_release_reply();tf_page_sync.reaping=!tf_ps_reap();tf_ps_unknown(&context);if(tf_page_sync.display_requested)tf_ps_display_unknown();tf_page_sync.stale=1;return 1;}
  /* Bound each UI pass to 64 KiB even for a large strategy-group result. */
  size_t budget=65536;int failed=0;while(budget&&tf_page_sync.received<tf_page_sync.bytes){size_t remaining=tf_page_sync.bytes-tf_page_sync.received;if(remaining>budget)remaining=budget;int n=tf_ps_read((char*)tf_page_sync.reply+tf_page_sync.received,remaining);if(n>0){tf_page_sync.received+=(size_t)n;budget-=(size_t)n;}else{if(n<0&&tf_page_sync.received!=tf_page_sync.bytes)failed=1;break;}}
  int reaped=tf_ps_reap();if(failed||(reaped&&!tf_ps_success())||(reaped&&tf_page_sync.received<tf_page_sync.bytes&&budget)){tf_ps_stop();tf_ps_release_reply();tf_page_sync.reaping=!tf_ps_reap();tf_ps_unknown(&context);if(tf_page_sync.display_requested)tf_ps_display_unknown();tf_page_sync.stale=1;return 1;}
  if(reaped&&tf_page_sync.received==tf_page_sync.bytes){dirty=tf_ps_apply(tf_page_sync.reply,&context,now);tf_page_sync.last_good=now;tf_page_sync.stale=!tf_page_sync.reply->okay;tf_ps_stop();tf_ps_release_reply();}
 }
 if(!tf_page_sync.stale&&(uint32_t)(now-tf_page_sync.last_good)>=TF_PS_STALE){tf_ps_unknown(&context);tf_page_sync.stale=1;dirty=1;}
 if(!tf_page_sync.active&&!tf_page_sync.reaping&&(uint32_t)(now-tf_page_sync.last_attempt)>=TF_PS_INTERVAL){
  tf_page_sync.last_attempt=tf_page_sync.started=now;tf_page_sync.display_requested=display_eligible!=0;tf_page_sync.bytes=tf_ps_size(context.kind);tf_page_sync.reply=calloc(1,tf_page_sync.bytes);
  if(!tf_page_sync.reply){tf_ps_unknown(&context);return 1;}tf_page_sync.reply->context=context;
  if(!tf_ps_spawn(tf_page_sync.reply,tf_page_sync.bytes,display_eligible)){tf_ps_release_reply();tf_page_sync.reaping=!tf_ps_reap();tf_ps_unknown(&context);return 1;}tf_page_sync.active=1;
 }return dirty;
}
#endif
