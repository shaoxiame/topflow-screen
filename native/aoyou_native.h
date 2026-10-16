/* Existing AoYou Mihomo controller only. No service scripts/install/start. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_AOYOU_NATIVE_H
#define TF_AOYOU_NATIVE_H
#include <dirent.h>
#define AY_LIMIT 1048576
#define AY_MAX_GROUPS 128
#define AY_MAX_MEMBERS 512
typedef struct { char config[256],secret[1025];int port; } ay_endpoint;
typedef struct { char name[513],now[513],type[64]; } ay_group;
static ay_group ay_groups[AY_MAX_GROUPS];static int ay_count=0,ay_selected=-1,ay_offset=0,ay_member_count=0;
static char ay_members[AY_MAX_MEMBERS][513],ay_mode[16]="",ay_identity[256]="",ay_message[192]="尚未读取遨游状态";
static char ay_pending_group[513],ay_pending_member[513];
static int ay_config_path(const char*s){const char*base="/data/plugins/aoyou-world/generations/";size_t n=strlen(base);if(strncmp(s,base,n)||strlen(s)<n+24+13)return 0;const char*tail=s+n+24;if(strcmp(tail,"/runtime.json")&&strcmp(tail,"/runtime.self.json"))return 0;for(size_t i=n;i<n+24;i++)if(!(s[i]>='0'&&s[i]<='9')&&!(s[i]>='a'&&s[i]<='f'))return 0;return 1;}
static char*ay_read(const char*path,size_t cap){FILE*f=fopen(path,"rb");if(!f)return NULL;char*s=malloc(cap+1);if(!s){fclose(f);return NULL;}size_t n=fread(s,1,cap,f);int bad=ferror(f)||n==cap;fclose(f);if(bad){free(s);return NULL;}s[n]=0;return s;}
static int ay_discover(ay_endpoint*ep){
 memset(ep,0,sizeof *ep);DIR*d=opendir("/proc");if(!d)return 0;struct dirent*ent;char found[40]="";int count=0;
 while((ent=readdir(d))){const char*p=ent->d_name;if(!*p)continue;int numeric=1;for(;*p;p++)if(!isdigit((unsigned char)*p))numeric=0;if(!numeric||strlen(ent->d_name)>16)continue;char path[80],exe[512];snprintf(path,sizeof path,"/proc/%s/exe",ent->d_name);ssize_t n=readlink(path,exe,sizeof exe-1);if(n<0||n>=(ssize_t)sizeof exe-1)continue;exe[n]=0;if(!strcmp(exe,"/data/plugins/aoyou-world/mihomo")){count++;snprintf(found,sizeof found,"%s",ent->d_name);}}
 closedir(d);if(count!=1)return 0;char path[80],args[8192],resolved[4096];snprintf(path,sizeof path,"/proc/%s/cmdline",found);FILE*f=fopen(path,"rb");if(!f)return 0;size_t n=fread(args,1,sizeof args,f);int bad=ferror(f);fclose(f);if(bad||!n||n>=sizeof args||args[n-1])return 0;
 int matches=0;for(size_t i=0;i<n;){size_t l=strlen(args+i);if(!strcmp(args+i,"-f")){size_t next=i+l+1;if(next>=n)return 0;matches++;if(strlen(args+next)>=sizeof ep->config)return 0;snprintf(ep->config,sizeof ep->config,"%s",args+next);}i+=l+1;}
 if(matches!=1||!ay_config_path(ep->config)||!realpath(ep->config,resolved)||strcmp(resolved,ep->config))return 0;
 char*config=ay_read(ep->config,AY_LIMIT);if(!config)return 0;tf_json j;int ok=tf_parse(&j,config);char controller[96]="";
 if(ok){ok=tf_gets(&j,0,"external-controller",controller,sizeof controller)&&tf_gets(&j,0,"secret",ep->secret,sizeof ep->secret);tf_free(&j);}memset(config,0,strlen(config));free(config);
 const char*prefix="127.0.0.1:";if(!ok||strncmp(controller,prefix,strlen(prefix)))return 0;const char*p=controller+strlen(prefix);if(!*p)return 0;for(const char*q=p;*q;q++)if(!isdigit((unsigned char)*q))return 0;long port=strtol(p,NULL,10);if(port<1||port>65535)return 0;ep->port=(int)port;
 for(const char*q=ep->secret;*q;q++)if((unsigned char)*q<33||(unsigned char)*q>126)return 0;return 1;
}
static int ay_call(const ay_endpoint*ep,const char*method,const char*path,const char*body,char*out,size_t cap){return tf_http(ep->port,method,path,ep->secret,body,out,cap);}
static int ay_parse_groups(const char*body){
 tf_json d;if(!tf_parse(&d,body))return 0;int root=tf_key(&d,0,"proxies"),ok=root>=0&&d.t[root].type=='{',n=0;if(ok)for(int i=root+1;i<d.t[root].next;){int obj=i+1;if(obj>=d.n){ok=0;break;}int all=tf_key(&d,obj,"all");if(all>=0&&d.t[all].type=='['){if(n>=AY_MAX_GROUPS){ok=0;break;}ay_group*g=&ay_groups[n];if(!tf_string(&d,i,g->name,sizeof g->name)||!tf_safe_name(g->name)||!tf_gets(&d,obj,"type",g->type,sizeof g->type)||!tf_gets(&d,obj,"now",g->now,sizeof g->now)){ok=0;break;}n++;}i=d.t[obj].next;}
 tf_free(&d);ay_count=ok?n:0;return ok;
}
static int ay_parse_members(const char*body,const char*member,int save){
 tf_json d;if(!tf_parse(&d,body))return 0;char type[64],now[513];int list=tf_key(&d,0,"all"),ok=tf_gets(&d,0,"type",type,sizeof type)&&!strcmp(type,"Selector")&&list>=0&&d.t[list].type=='[';
 int n=0,found=member?0:1;if(ok)for(int i=list+1;i<d.t[list].next;i=d.t[i].next){char name[513];if(n>=AY_MAX_MEMBERS||!tf_string(&d,i,name,sizeof name)||!tf_safe_name(name)){ok=0;break;}if(member&&!strcmp(name,member))found=1;if(save)snprintf(ay_members[n],sizeof ay_members[n],"%s",name);n++;}
 if(save){ay_member_count=ok?n:0;if(ok&&ay_selected>=0&&tf_gets(&d,0,"now",now,sizeof now))snprintf(ay_groups[ay_selected].now,sizeof ay_groups[ay_selected].now,"%s",now);}
 tf_free(&d);return ok&&found;
}
static int ay_refresh(void){
 ay_endpoint ep;ay_selected=-1;ay_offset=0;ay_member_count=0;ay_count=0;ay_mode[0]=0;ay_identity[0]=0;
 if(!ay_discover(&ep)){snprintf(ay_message,sizeof ay_message,"未找到已运行的遨游引擎；请先在 UFI 启用");return 0;}char*body=malloc(AY_LIMIT);if(!body){memset(&ep,0,sizeof ep);return 0;}
 int ok=ay_call(&ep,"GET","/configs",NULL,body,AY_LIMIT)==200;tf_json d;if(ok){ok=tf_parse(&d,body);if(ok){ok=tf_gets(&d,0,"mode",ay_mode,sizeof ay_mode);tf_free(&d);}}if(ok)ok=ay_call(&ep,"GET","/proxies",NULL,body,AY_LIMIT)==200&&ay_parse_groups(body);
 if(ok){snprintf(ay_identity,sizeof ay_identity,"%s",ep.config);snprintf(ay_message,sizeof ay_message,"现有引擎 · %d 个策略组",ay_count);}else{ay_count=0;ay_mode[0]=0;snprintf(ay_message,sizeof ay_message,"控制器读取失败，未修改配置");}memset(&ep,0,sizeof ep);free(body);return ok;
}
static int ay_open_group(int index){
 if(index<0||index>=ay_count||strcmp(ay_groups[index].type,"Selector"))return 0;ay_endpoint ep;if(!ay_discover(&ep))return 0;if(strcmp(ay_identity,ep.config)){memset(&ep,0,sizeof ep);return 0;}char uri[1600],path[1632];if(!tf_uri(uri,sizeof uri,ay_groups[index].name)){memset(&ep,0,sizeof ep);return 0;}snprintf(path,sizeof path,"/proxies/%s",uri);char*body=malloc(AY_LIMIT);if(!body){memset(&ep,0,sizeof ep);return 0;}
 int old=ay_selected;ay_selected=index;ay_offset=0;int ok=ay_call(&ep,"GET",path,NULL,body,AY_LIMIT)==200&&ay_parse_members(body,NULL,1);if(!ok)ay_selected=old;memset(&ep,0,sizeof ep);free(body);return ok;
}
/* 1 verified, 0 rejected/failed, -1 request accepted but readback unavailable. */
static int ay_apply(const char*mode,const char*group,const char*member){
 ay_endpoint ep;if(!ay_discover(&ep))return 0;if(!ay_identity[0]||strcmp(ay_identity,ep.config)){memset(&ep,0,sizeof ep);return 0;}char*body=malloc(AY_LIMIT);if(!body){memset(&ep,0,sizeof ep);return 0;}int result=0;
 if(mode){if(strcmp(mode,"rule")&&strcmp(mode,"global")&&strcmp(mode,"direct"))goto done;char payload[64];snprintf(payload,sizeof payload,"{\"mode\":\"%s\"}",mode);int code=ay_call(&ep,"PATCH","/configs",payload,body,AY_LIMIT);if(code!=200&&code!=204)goto done;result=-1;if(ay_call(&ep,"GET","/configs",NULL,body,AY_LIMIT)==200){tf_json d;if(tf_parse(&d,body)){char actual[16];if(tf_gets(&d,0,"mode",actual,sizeof actual)&&!strcmp(actual,mode)){snprintf(ay_mode,sizeof ay_mode,"%s",actual);result=1;}tf_free(&d);}}}
 else {char uri[1600],path[1632],quoted[1200],payload[1240];if(!group||!member||!tf_uri(uri,sizeof uri,group)||!tf_safe_name(member)||!tf_quote(quoted,sizeof quoted,member))goto done;snprintf(path,sizeof path,"/proxies/%s",uri);if(ay_call(&ep,"GET",path,NULL,body,AY_LIMIT)!=200||!ay_parse_members(body,member,0))goto done;snprintf(payload,sizeof payload,"{\"name\":%s}",quoted);int code=ay_call(&ep,"PUT",path,payload,body,AY_LIMIT);if(code!=200&&code!=204)goto done;result=-1;if(ay_call(&ep,"GET",path,NULL,body,AY_LIMIT)==200){tf_json d;if(tf_parse(&d,body)){char actual[513];if(tf_gets(&d,0,"now",actual,sizeof actual)&&!strcmp(actual,member)){for(int i=0;i<ay_count;i++)if(!strcmp(ay_groups[i].name,group))snprintf(ay_groups[i].now,sizeof ay_groups[i].now,"%s",actual);result=1;}tf_free(&d);}}}
 done:memset(&ep,0,sizeof ep);free(body);return result;
}
#endif
