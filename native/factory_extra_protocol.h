/* Fixed private stdin protocol for existing factory APIs. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_FACTORY_EXTRA_PROTOCOL_H
#define TF_FACTORY_EXTRA_PROTOCOL_H
#include <stddef.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
enum tf_extra_op {TF_X_NONE,TF_X_SIM_READ,TF_X_PIN,TF_X_PUK,TF_X_WPS_READ,TF_X_WPS_START,TF_X_WPS_CANCEL,TF_X_NET_READ,TF_X_NET_SCAN,TF_X_NET_SELECT};
typedef struct {int op,slot,band;char pin[9],puk[9],plmn[8],rat[12];} tf_extra_command;
typedef struct {int status;char name[192],plmn[8],rat[12];} tf_extra_operator;
typedef struct {int valid,slot,pin_left,puk_left;char state[64],modem[64];} tf_extra_sim;
static void tf_extra_wipe(void*p,size_t n){volatile unsigned char*s=p;while(n--)*s++=0;}
static int tf_extra_digits(const char*s,size_t lo,size_t hi){size_t n=strlen(s);if(n<lo||n>hi)return 0;for(;*s;s++)if(*s<'0'||*s>'9')return 0;return 1;}
static int tf_extra_decode(const char*input,size_t len,tf_extra_command*out){
 memset(out,0,sizeof *out);if(!input||!len||len>128||input[len-1]!='\n'||memchr(input,0,len)||memchr(input,'\r',len))return 0;
 char copy[129];memcpy(copy,input,len);copy[len]=0;char*part[5];int count=0;char*p=copy;
 while(*p&&count<5){part[count++]=p;char*end=strchr(p,'\n');if(!end){tf_extra_wipe(copy,sizeof copy);return 0;}*end=0;p=end+1;}
 int ok=!*p;
 if(count==1&&!strcmp(part[0],"SIM_READ"))out->op=TF_X_SIM_READ;
 else if(count==1&&!strcmp(part[0],"NET_READ"))out->op=TF_X_NET_READ;
 else if(count==2&&!strcmp(part[0],"NET_SCAN")&&strlen(part[1])==1&&(*part[1]=='1'||*part[1]=='2')){out->op=TF_X_NET_SCAN;out->slot=*part[1]-'0';}
 else if(count==4&&!strcmp(part[0],"NET_SELECT")&&tf_extra_digits(part[1],5,6)&&tf_extra_digits(part[2],1,10)&&strtoul(part[2],NULL,10)<=2147483647UL&&strlen(part[3])==1&&(*part[3]=='1'||*part[3]=='2')){out->op=TF_X_NET_SELECT;out->slot=*part[3]-'0';strcpy(out->plmn,part[1]);strcpy(out->rat,part[2]);}
 else if(count==1&&!strcmp(part[0],"WPS_READ"))out->op=TF_X_WPS_READ;
 else if(count==1&&!strcmp(part[0],"WPS_CANCEL"))out->op=TF_X_WPS_CANCEL;
 else if(count==2&&!strcmp(part[0],"WPS_START")&&(!strcmp(part[1],"main_2g")||!strcmp(part[1],"main_5g"))){out->op=TF_X_WPS_START;out->band=!strcmp(part[1],"main_5g");}
 else if((count==3&&!strcmp(part[0],"PIN"))||(count==4&&!strcmp(part[0],"PUK"))){int puk=count==4;out->op=puk?TF_X_PUK:TF_X_PIN;const char*slot=part[count-1];ok=ok&&strlen(slot)==1&&(*slot=='1'||*slot=='2')&&tf_extra_digits(part[1],puk?8:4,8)&&(!puk||tf_extra_digits(part[2],4,8));if(ok){out->slot=*slot-'0';strcpy(out->pin,part[puk?2:1]);if(puk)strcpy(out->puk,part[1]);}}
 else ok=0;tf_extra_wipe(copy,sizeof copy);if(!ok)tf_extra_wipe(out,sizeof *out);return ok&&out->op;
}
static inline int tf_extra_operators_parse(const char*input,tf_extra_operator rows[20]){
 if(!input||strlen(input)>8191)return-1;char copy[8192];strcpy(copy,input);int count=0;char*record=copy;
 while(*record&&count<20){char*end=strchr(record,';');if(end)*end=0;char*field[4],*p=record;int n=0;while(n<4&&p){field[n++]=p;char*comma=strchr(p,',');if(comma){*comma=0;p=comma+1;}else p=NULL;}
  if(n>=4&&tf_extra_digits(field[0],1,8)&&strlen(field[1])>0&&strlen(field[1])<sizeof rows[0].name&&tf_extra_digits(field[2],5,6)&&tf_extra_digits(field[3],1,10)&&strtoul(field[3],NULL,10)<=2147483647UL){int safe=1;for(const char*s=field[1];*s;s++)if((unsigned char)*s<32||(unsigned char)*s==127)safe=0;if(safe){tf_extra_operator*r=&rows[count++];r->status=atoi(field[0]);strcpy(r->name,field[1]);strcpy(r->plmn,field[2]);snprintf(r->rat,sizeof r->rat,"%lu",strtoul(field[3],NULL,10));}}
  if(!end)break;record=end+1;
 }return count;
}
static int tf_extra_net_scan_allowed(const char*state){return!*state||!strcmp(state,"manual_selected")||!strcmp(state,"manual_search_fail");}
static int tf_extra_wps_start_allowed(const char*state,int remaining){return remaining==0&&!strcmp(state,"idle");}
static inline int tf_extra_operator_matches(const tf_extra_operator*rows,int count,const tf_extra_command*cmd){if(count<0||count>20||cmd->op!=TF_X_NET_SELECT)return 0;for(int i=0;i<count;i++)if(!strcmp(rows[i].plmn,cmd->plmn)&&!strcmp(rows[i].rat,cmd->rat))return 1;return 0;}
static int tf_extra_sim_allows(const tf_extra_sim*s,const tf_extra_command*c){
 if(!s->valid||s->slot!=c->slot||s->slot<1||s->slot>2)return 0;
 if(c->op==TF_X_PIN)return s->pin_left>0&&s->pin_left<=3&&!strcmp(s->state,"wait pin")&&(!*s->modem||!strcmp(s->modem,"modem_waitpin"));
 if(c->op==TF_X_PUK)return s->puk_left>0&&s->puk_left<=10&&!strcmp(s->state,"wait puk")&&(!*s->modem||!strcmp(s->modem,"modem_waitpuk"));
 return 0;
}
#endif
