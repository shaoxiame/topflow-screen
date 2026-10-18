/* Pure bounded parsing/validation for native controls. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_CONTROL_LOGIC_H
#define TF_CONTROL_LOGIC_H
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include "json.h"

typedef struct { int start,end,next,count; char type; } tf_jtoken;
typedef struct { const char *s; size_t len,pos; tf_jtoken *t; int n,cap,error; } tf_json;
static void tf_ws(tf_json*d){while(d->pos<d->len&&strchr(" \t\r\n",d->s[d->pos]))d->pos++;}
static int tf_jvalue(tf_json*d,int depth){
 tf_ws(d);if(d->error||depth>48||d->pos>=d->len||d->n>=d->cap)return d->error=1,-1;
 int i=d->n++;tf_jtoken*t=&d->t[i];memset(t,0,sizeof *t);t->start=(int)d->pos;t->type=d->s[d->pos++];
 if(t->type=='{'||t->type=='['){char close=t->type=='{'?'}':']';tf_ws(d);if(d->pos<d->len&&d->s[d->pos]==close)d->pos++;else while(!d->error){
  if(t->type=='{'){tf_ws(d);if(d->pos>=d->len||d->s[d->pos]!='"'){d->error=1;break;}if(tf_jvalue(d,depth+1)<0)break;tf_ws(d);if(d->pos>=d->len||d->s[d->pos++]!=':'){d->error=1;break;}}
  if(tf_jvalue(d,depth+1)<0)break;t->count++;tf_ws(d);if(d->pos>=d->len){d->error=1;break;}char c=d->s[d->pos++];if(c==close)break;if(c!=','){d->error=1;break;}
 }}else if(t->type=='"'){
  int closed=0;while(d->pos<d->len){unsigned char c=(unsigned char)d->s[d->pos++];if(c=='"'){closed=1;break;}if(c<32){d->error=1;break;}if(c=='\\'){if(d->pos>=d->len){d->error=1;break;}char e=d->s[d->pos++];if(e=='u'){for(int k=0;k<4;k++){if(d->pos>=d->len||!isxdigit((unsigned char)d->s[d->pos++])){d->error=1;break;}}}else if(!strchr("\"\\/bfnrt",e)){d->error=1;break;}}}if(!closed)d->error=1;
 }else{
  d->pos--;size_t s=d->pos;while(d->pos<d->len&&!strchr(" \t\r\n,]}:",d->s[d->pos]))d->pos++;size_t n=d->pos-s;
  if((n==4&&!memcmp(d->s+s,"true",4))||(n==5&&!memcmp(d->s+s,"false",5))||(n==4&&!memcmp(d->s+s,"null",4)))t->type='v';
  else {size_t p=s;if(p<d->pos&&d->s[p]=='-')p++;if(p>=d->pos)d->error=1;else if(d->s[p]=='0')p++;else if(d->s[p]>='1'&&d->s[p]<='9'){while(p<d->pos&&isdigit((unsigned char)d->s[p]))p++;}else d->error=1;
   if(p<d->pos&&d->s[p]=='.'){p++;size_t a=p;while(p<d->pos&&isdigit((unsigned char)d->s[p]))p++;if(p==a)d->error=1;}if(p<d->pos&&(d->s[p]=='e'||d->s[p]=='E')){p++;if(p<d->pos&&(d->s[p]=='+'||d->s[p]=='-'))p++;size_t a=p;while(p<d->pos&&isdigit((unsigned char)d->s[p]))p++;if(p==a)d->error=1;}if(p!=d->pos)d->error=1;t->type='n';}
 }
 t->end=(int)d->pos;t->next=d->n;return d->error?-1:i;
}
/* A JSON token consumes at least two source bytes on average, including its
 * delimiter. Small RPC replies therefore need not allocate 32768 tokens. */
static int tf_parse(tf_json*d,const char*s){memset(d,0,sizeof *d);if(!s)return 0;d->s=s;d->len=strlen(s);d->cap=d->len>=65532?32768:(int)(d->len/2+2);if(d->cap<32)d->cap=32;d->t=calloc((size_t)d->cap,sizeof *d->t);if(!d->t)return 0;int ok=tf_jvalue(d,0)==0;tf_ws(d);if(!ok||d->error||d->pos!=d->len){free(d->t);d->t=NULL;return 0;}return 1;}
static void tf_free(tf_json*d){free(d->t);d->t=NULL;}
static int tf_string(const tf_json*d,int i,char*out,size_t cap){
 if(!out||cap<2)return 0;out[0]=0;if(i<0||i>=d->n||d->t[i].type!='"')return 0;
 int n=d->t[i].end-d->t[i].start;if(n<2||n>32768||(size_t)n>cap*6)return 0;for(int p=d->t[i].start+1;p<d->t[i].end-1;p++)if(d->s[p]=='\\'){if(d->s[p+1]=='u'&&!memcmp(d->s+p+2,"0000",4))return 0;p++;}char*tmp=malloc((size_t)n+8);if(!tmp)return 0;memcpy(tmp,"{\"v\":",5);memcpy(tmp+5,d->s+d->t[i].start,(size_t)n);tmp[n+5]='}';tmp[n+6]=0;int ok=json_get(tmp,"v",out,cap)&&strlen(out)<cap-1;free(tmp);if(!ok)out[0]=0;return ok;
}
static int tf_key(const tf_json*d,int obj,const char*key){if(obj<0||obj>=d->n||d->t[obj].type!='{')return-1;int found=-1;for(int i=obj+1;i<d->t[obj].next;){int v=i+1;char k[1024];if(v>=d->n)return-1;if(tf_string(d,i,k,sizeof k)&&!strcmp(k,key)){if(found>=0)return-1;found=v;}i=d->t[v].next;}return found;}
static int tf_gets(const tf_json*d,int obj,const char*key,char*out,size_t cap){return tf_string(d,tf_key(d,obj,key),out,cap);}
static int tf_int(const tf_json*d,int i,long long*out){char s[64],*end;int n;if(i<0||i>=d->n||(d->t[i].type!='n'&&d->t[i].type!='"'))return 0;if(d->t[i].type=='"'){if(!tf_string(d,i,s,sizeof s))return 0;}else{n=d->t[i].end-d->t[i].start;if(n<1||n>60)return 0;memcpy(s,d->s+d->t[i].start,(size_t)n);s[n]=0;}if(!*s)return 0;for(const char*p=s;*p;p++)if(!isdigit((unsigned char)*p)&&!(p==s&&*p=='-'))return 0;errno=0;long long x=strtoll(s,&end,10);if(errno||end==s||*end)return 0;*out=x;return 1;}
static int tf_bool(const tf_json*d,int i){if(i<0)return-1;int n=d->t[i].end-d->t[i].start;const char*s=d->s+d->t[i].start;if(n==4&&!memcmp(s,"true",4))return 1;if(n==5&&!memcmp(s,"false",5))return 0;long long v;if(tf_int(d,i,&v)&&(v==0||v==1))return(int)v;return-1;}
static int tf_no_error(const tf_json*d,int i){if(i<0)return 0;if(d->t[i].type=='v'&&d->t[i].end-d->t[i].start==4&&!memcmp(d->s+d->t[i].start,"null",4))return 1;char value[512];return tf_string(d,i,value,sizeof value)&&!*value;}
static int tf_control_success(const char*body,const char*payload){tf_json d;if(!tf_parse(&d,body))return 0;int k=tf_key(&d,0,"ok");char got[96],sent[96];int ok=k>=0&&d.t[k].type=='v'&&d.t[k].end-d.t[k].start==4&&!memcmp(d.s+d.t[k].start,"true",4)&&tf_gets(&d,0,"action",got,sizeof got)&&json_get(payload,"action",sent,sizeof sent)&&!strcmp(got,sent);tf_free(&d);return ok;}
static int tf_safe_name(const char*s){size_t n=strlen(s);if(!n||n>512||!strcmp(s,".")||!strcmp(s,".."))return 0;for(;*s;s++)if((unsigned char)*s<32||(unsigned char)*s==127)return 0;return 1;}
static int tf_quote(char*out,size_t cap,const char*s){size_t n=0;if(cap<3)return 0;out[n++]='"';for(;*s;s++){unsigned char c=(unsigned char)*s;if(c<32||c==127)return 0;if(c=='"'||c=='\\'){if(n+3>=cap)return 0;out[n++]='\\';}if(n+2>=cap)return 0;out[n++]=(char)c;}out[n++]='"';out[n]=0;return 1;}
static int tf_uri(char*out,size_t cap,const char*s){static const char hex[]="0123456789ABCDEF";size_t n=0;if(!tf_safe_name(s))return 0;for(;*s;s++){unsigned char c=(unsigned char)*s;if((isalnum(c)&&c<128)||strchr("-_.~",c)){if(n+1>=cap)return 0;out[n++]=(char)c;}else{if(n+3>=cap)return 0;out[n++]='%';out[n++]=hex[c>>4];out[n++]=hex[c&15];}}out[n]=0;return 1;}
#define TF_BANDS 513
static int tf_band_csv(const char*s,unsigned char*out){memset(out,0,TF_BANDS);int count=0;while(*s){while(*s==' '||*s==',')s++;if(!*s)break;if(!isdigit((unsigned char)*s))return 0;char*end;long n=strtol(s,&end,10);if(n<1||n>=TF_BANDS||(*end&&*end!=','&&*end!=' '))return 0;if(!out[n])count++;out[n]=1;s=end;}return count;}
static int tf_band_value(const tf_json*d,int i,unsigned char*out){memset(out,0,TF_BANDS);if(i<0)return 0;if(d->t[i].type=='"'){char s[4096];return tf_string(d,i,s,sizeof s)?tf_band_csv(s,out):0;}if(d->t[i].type!='[')return 0;int count=0;for(int j=i+1;j<d->t[i].next;j=d->t[j].next){long long n;if(!tf_int(d,j,&n)||n<1||n>=TF_BANDS)return 0;if(!out[n])count++;out[n]=1;}return count;}
static int tf_band_snapshot(const tf_json*d,int rat,unsigned char*allowed,unsigned char*selected){
 const char*capkeys[]={"lte","nr_sa","nr_nsa"};const char*support[]={"lte_supported_bands","nr_sa_supported_bands","nr_nsa_supported_bands"};const char*select[]={"lte_bands","nr5g_sa_band_lock","nr5g_nsa_band_lock"};
 if(rat<0||rat>2)return 0;int net=tf_key(d,0,"net"),caps=tf_key(d,net,"band_capabilities"),n=tf_band_value(d,tf_key(d,caps,capkeys[rat]),allowed);if(!n)n=tf_band_value(d,tf_key(d,net,support[rat]),allowed);if(!n)n=tf_band_value(d,tf_key(d,0,support[rat]),allowed);tf_band_value(d,tf_key(d,net,select[rat]),selected);return n;
}
static int tf_band_payload(char*out,size_t cap,int rat,const unsigned char*allowed,const unsigned char*selected){const char*a[]={"band.set_lte","band.set_nr_sa","band.set_nr_nsa"};if(rat<0||rat>2)return 0;char csv[4096];size_t n=0;for(int i=1;i<TF_BANDS;i++)if(selected[i]){if(!allowed[i])return 0;int k=snprintf(csv+n,sizeof csv-n,"%s%d",n?",":"",i);if(k<0||(size_t)k>=sizeof csv-n)return 0;n+=(size_t)k;}if(!n)return 0;int k=snprintf(out,cap,"{\"action\":\"%s\",\"params\":{\"bands\":\"%s\"}}",a[rat],csv);return k>0&&(size_t)k<cap;}
static int tf_current_cell(const tf_json*d,int nr,long long*pci,long long*channel,long long*band){
 int net=tf_key(d,0,"net");char wan[96],type[40],s[32];if(!tf_gets(d,net,"wan_status",wan,sizeof wan)||!strstr(wan,"connected")||strstr(wan,"disconnected"))return 0;if(!tf_gets(d,net,"type",type,sizeof type))return 0;
 if(nr&&!strstr(type,"SA")&&!strstr(type,"5G"))return 0;if(!nr&&(!strcmp(type,"SA")||!strcmp(type,"5G SA")))return 0;
 if(!tf_int(d,tf_key(d,net,nr?"nr_pci":"lte_pci"),pci)||*pci<0||*pci>(nr?1007:503))return 0;
 if(!tf_int(d,tf_key(d,net,nr?"nr_channel":"lte_channel"),channel)||*channel<=0||*channel>(nr?3279165:262143))return 0;
 *band=0;if(nr){if(!tf_gets(d,net,"nr_band",s,sizeof s)||s[0]!='n')return 0;char*end;*band=strtoll(s+1,&end,10);if(end==s+1||*end||*band<1||*band>=TF_BANDS)return 0;}return 1;
}
static int tf_cell_payload(char*out,size_t cap,const tf_json*d,int nr){long long p,c,b;if(!tf_current_cell(d,nr,&p,&c,&b))return 0;int n=nr?snprintf(out,cap,"{\"action\":\"cell.lock_nr\",\"params\":{\"pci\":%lld,\"arfcn\":%lld,\"band\":%lld}}",p,c,b):snprintf(out,cap,"{\"action\":\"cell.lock_lte\",\"params\":{\"pci\":%lld,\"earfcn\":%lld}}",p,c);return n>0&&(size_t)n<cap;}
/* Return 1 only when the actual state contains the exact desired setting. */
static int tf_verify_datad(const char*payload,const char*state){
 tf_json p,d;if(!tf_parse(&p,payload))return 0;if(!tf_parse(&d,state)){tf_free(&p);return 0;}char action[64];int ok=0,params=tf_key(&p,0,"params"),net=tf_key(&d,0,"net");
 if(!tf_gets(&p,0,"action",action,sizeof action))goto done;
 const char*bands[]={"band.set_lte","band.set_nr_sa","band.set_nr_nsa"};for(int r=0;r<3;r++)if(!strcmp(action,bands[r])){unsigned char desired[TF_BANDS],actual[TF_BANDS],supported[TF_BANDS];ok=tf_band_value(&p,tf_key(&p,params,"bands"),desired)>0&&tf_band_snapshot(&d,r,supported,actual)>0&&!memcmp(desired,actual,TF_BANDS);goto done;}
 if(!strcmp(action,"aggregation.set")){int v=tf_bool(&p,tf_key(&p,params,"enabled")),actual=tf_bool(&d,tf_key(&d,tf_key(&d,0,"aggregation"),"enabled"));ok=v>=0&&v==actual;}
 else if(!strcmp(action,"network.set_mode")){char wanted[96],actual[96];ok=tf_gets(&p,params,"mode",wanted,sizeof wanted)&&tf_gets(&d,net,"net_select",actual,sizeof actual)&&!strcmp(wanted,actual);}
 /* wlan.bands.enabled describes the AP only, not the TopFlow radio switch.
  * This operation is verified separately against a new wifi.state sample. */
 else if(!strcmp(action,"wifi.radio.set")){ok=0;}
 else if(!strcmp(action,"wifi.configure")){char section[32];int array=tf_key(&d,tf_key(&d,0,"wlan"),"bands");if(tf_gets(&p,params,"section",section,sizeof section)&&(!strcmp(section,"main_2g")||!strcmp(section,"main_5g"))&&array>=0&&d.t[array].type=='[')for(int i=array+1;i<d.t[array].next;i=d.t[i].next){char actual[128],wanted[128];if(!tf_gets(&d,i,"band",actual,sizeof actual)||strcmp(actual,section+5))continue;ok=1;const char*keys[]={"ssid","encryption"},*gotkeys[]={"ssid","enc"};for(int k=0;k<2;k++)if(tf_key(&p,params,keys[k])>=0)ok=ok&&tf_gets(&p,params,keys[k],wanted,sizeof wanted)&&tf_gets(&d,i,gotkeys[k],actual,sizeof actual)&&!strcmp(actual,wanted);break;}}
 else if(!strcmp(action,"cellular.connect")||!strcmp(action,"cellular.disconnect")){int a=tf_key(&d,0,"modems");if(a>=0&&d.t[a].type=='[')for(int i=a+1;i<d.t[a].next;i=d.t[i].next){char id[16],status[96];if(tf_gets(&d,i,"id",id,sizeof id)&&!strcmp(id,"5G")&&tf_gets(&d,tf_key(&d,i,"wwan"),"status",status,sizeof status)){const char*w=!strcmp(action,"cellular.connect")?"connected":"disconnected";size_t n=strlen(w);for(const char*s=status;(s=strstr(s,w));s++)if((s==status||s[-1]=='_')&&(!s[n]||s[n]=='_')){ok=1;break;}}}}
 else if(!strcmp(action,"cellular.set")){int wanted=tf_bool(&p,tf_key(&p,params,"roaming")),got=tf_bool(&d,tf_key(&d,net,"roaming_allowed"));if(got<0)got=tf_bool(&d,tf_key(&d,tf_key(&d,tf_key(&d,0,"interfaces"),"cellular"),"roam_enable"));ok=wanted>=0&&wanted==got;}
 else if(!strcmp(action,"sim.set_slot")){long long wanted,got;ok=tf_int(&p,tf_key(&p,params,"slot"),&wanted)&&wanted>=1&&wanted<=2&&tf_int(&d,tf_key(&d,tf_key(&d,0,"sim"),"current_slot"),&got)&&wanted==got;}
 else if(!strcmp(action,"power.direct_supply.set")){int power=tf_key(&d,tf_key(&d,0,"power"),"direct_supply"),wanted=tf_bool(&p,tf_key(&p,params,"enabled"));ok=wanted>=0&&tf_bool(&d,tf_key(&d,power,"supported"))==1&&tf_bool(&d,tf_key(&d,power,"enabled"))==wanted;}
 else if(!strcmp(action,"sleep.set")){int sleep=tf_key(&d,0,"sleep");long long wanted,got;ok=tf_int(&p,tf_key(&p,params,"seconds"),&wanted)&&tf_bool(&d,tf_key(&d,sleep,"supported"))==1&&tf_int(&d,tf_key(&d,sleep,"minutes"),&got)&&got==(wanted?wanted/60:-1);}
 else if(!strcmp(action,"client.block")||!strcmp(action,"client.unblock")){char wanted[32],mode[32];int c=tf_key(&d,0,"clients"),a=tf_key(&d,c,"blocked");if(tf_gets(&d,c,"acl_mode",mode,sizeof mode)&&!strcmp(mode,"deny")&&tf_gets(&p,params,"mac",wanted,sizeof wanted)&&a>=0&&d.t[a].type=='['){int blocked=0;for(int i=a+1;i<d.t[a].next;i=d.t[i].next){char mac[32];if(tf_string(&d,i,mac,sizeof mac)&&!strcasecmp(mac,wanted))blocked=1;}ok=blocked==!strcmp(action,"client.block");}}
 else if(!strcmp(action,"traffic.calibrate")){long long wanted,rx,tx;int t=tf_key(&d,0,"traffic");ok=tf_int(&p,tf_key(&p,params,"value"),&wanted)&&wanted>=0&&wanted<=109951162777600LL&&tf_int(&d,tf_key(&d,t,"month_rx_bytes"),&rx)&&rx>=0&&rx<=wanted&&tf_int(&d,tf_key(&d,t,"month_tx_bytes"),&tx)&&tx>=0&&tx==wanted-rx;}
 else if(!strcmp(action,"traffic.set_clear_day")){int clear=tf_key(&d,tf_key(&d,0,"traffic"),"clear_day");long long wanted,actual;int enabled=tf_bool(&p,tf_key(&p,params,"enabled"));ok=enabled>=0&&tf_bool(&d,tf_key(&d,clear,"enable"))==enabled&&tf_int(&p,tf_key(&p,params,"day"),&wanted)&&tf_int(&d,tf_key(&d,clear,"clearday"),&actual)&&wanted==actual;}
 else if(!strcmp(action,"traffic.set_limit")){int l=tf_key(&d,tf_key(&d,0,"traffic"),"limit"),enabled=tf_bool(&p,tf_key(&p,params,"enabled"));ok=enabled>=0&&tf_bool(&d,tf_key(&d,l,"enable"))==enabled;const char*keys[]={"value","type","ratio"};for(int i=0;i<3;i++){long long wanted,actual;ok=ok&&tf_int(&p,tf_key(&p,params,keys[i]),&wanted)&&tf_int(&d,tf_key(&d,l,keys[i]),&actual)&&wanted==actual;}}
 else if(!strcmp(action,"cooling.fan.set_enabled")||!strcmp(action,"cooling.liquid.set_enabled")){int fan=!strcmp(action,"cooling.fan.set_enabled"),c=tf_key(&d,0,"cooling"),part=tf_key(&d,c,fan?"fan":"liquid"),wanted=tf_bool(&p,tf_key(&p,params,"enabled"));char mode[40];ok=wanted>=0&&tf_bool(&d,tf_key(&d,part,"always_on"))==wanted&&tf_gets(&d,part,"mode",mode,sizeof mode)&&!strcmp(mode,fan?(wanted?"always_on":"custom"):(wanted?"high":"automatic"))&&tf_no_error(&d,tf_key(&d,c,"vendor_sync_error"));if(fan){int policy=tf_key(&d,part,"policy");ok=ok&&tf_bool(&d,tf_key(&d,policy,"applied"))==1&&tf_no_error(&d,tf_key(&d,policy,"error"));}else ok=ok&&tf_bool(&d,tf_key(&d,part,"thermal_enabled"))==1&&(!wanted||tf_bool(&d,tf_key(&d,part,"driver_playing"))!=0);}
 else if(!strcmp(action,"cell.lock_nr")||!strcmp(action,"cell.lock_lte")){int nr=!strcmp(action,"cell.lock_nr");char lock[128],tail;long long pci,channel,band=0,a,b,c=0;if(tf_gets(&d,net,nr?"lock_nr_cell":"lock_lte_cell",lock,sizeof lock)&&tf_int(&p,tf_key(&p,params,"pci"),&pci)&&tf_int(&p,tf_key(&p,params,nr?"arfcn":"earfcn"),&channel)&&(!nr||tf_int(&p,tf_key(&p,params,"band"),&band))){int n=nr?sscanf(lock,"%lld,%lld,%lld%c",&a,&b,&c,&tail):sscanf(lock,"%lld,%lld%c",&a,&b,&tail);ok=n==(nr?3:2)&&a==pci&&b==channel&&c==band;}}
 else if(!strcmp(action,"cell.unlock_all")){char lte[128],nr[128];if(tf_gets(&d,net,"lock_lte_cell",lte,sizeof lte)&&tf_gets(&d,net,"lock_nr_cell",nr,sizeof nr))ok=(!*lte||!strcmp(lte,"0,0"))&&(!*nr||!strcmp(nr,"0,0,0")||!strcmp(nr,"0,0"));}
 done:tf_free(&p);tf_free(&d);return ok;
}
#endif
