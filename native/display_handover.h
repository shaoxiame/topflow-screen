/* Strict, non-secret handover receipt and original lock-map parser. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_DISPLAY_HANDOVER_H
#define TF_DISPLAY_HANDOVER_H
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <limits.h>
#include "display_policy.h"
typedef struct { int pin,brightness,lcd_lock,automatic,level,timeout,periodic,sensor,lux,internal,auto_lock,direct; } tf_display_receipt;
static tf_display_config tf_receipt_config(const tf_display_receipt*r){tf_display_config c={r->pin,r->automatic,r->level,r->timeout,r->periodic,r->sensor,r->lux,r->brightness,255};return c;}
static int tf_receipt_format(char*out,size_t cap,const tf_display_receipt*r){
 if(!r||(r->pin!=0&&r->pin!=1)||r->brightness<0||r->brightness>255||(r->lcd_lock!=0&&r->lcd_lock!=1)||(r->brightness>0)!=r->lcd_lock)return 0;
 tf_display_config c=tf_receipt_config(r);
 if(!tf_display_policy_valid(&c)||r->periodic!=0||(r->sensor!=0&&r->sensor!=1)||r->lux < -1||r->lux>10000000||(r->internal!=0&&r->internal!=1)||(r->auto_lock!=0&&r->auto_lock!=1)||r->direct!=1)return 0;
 int n=snprintf(out,cap,"DISPLAY_PREFLIGHT_OK PIN_GUARD=%s BRIGHTNESS=%d LCDLOCK=%d AUTO=%d LEVEL=%d TIMEOUT=%d PERIODIC=%d SENSOR=%d LUX=%d INTERNAL=%d AUTOLOCK=%d DIRECT=1",r->pin?"initial-300s-v1":"none",r->brightness,r->lcd_lock,r->automatic,r->level,r->timeout,r->periodic,r->sensor,r->lux,r->internal,r->auto_lock);return n>0&&(size_t)n<cap;
}
static int tf_receipt_parse(const char*text,tf_display_receipt*r){
 if(!text||strlen(text)>320)return 0;char pin[32],trailer,canonical[384];tf_display_receipt v;
 if(sscanf(text,"DISPLAY_PREFLIGHT_OK PIN_GUARD=%31s BRIGHTNESS=%d LCDLOCK=%d AUTO=%d LEVEL=%d TIMEOUT=%d PERIODIC=%d SENSOR=%d LUX=%d INTERNAL=%d AUTOLOCK=%d DIRECT=%d%c",pin,&v.brightness,&v.lcd_lock,&v.automatic,&v.level,&v.timeout,&v.periodic,&v.sensor,&v.lux,&v.internal,&v.auto_lock,&v.direct,&trailer)!=12)return 0;
 int p=!strcmp(pin,"initial-300s-v1")?1:!strcmp(pin,"none")?0:-1;
 v.pin=p;if(!tf_receipt_format(canonical,sizeof canonical,&v)||strcmp(text,canonical))return 0;*r=v;return 1;
}
/* Syntax parser only. The caller must reject empty/unstable file snapshots;
 * a factory truncate/rewrite window is not proof that the factory is idle. */
static int tf_vendor_internal_lock(const char*map){
 if(!map)return -1;int found=0;const char*p=map;
 while(*p){while(*p=='\r'||*p=='\n')p++;if(!*p)break;const char*start=p;
  while(*p&&!isspace((unsigned char)*p)){if(!(isalnum((unsigned char)*p)||*p=='_'||*p=='-'))return -1;p++;}
  size_t n=(size_t)(p-start);if(!n||n>128)return -1;while(*p==' '||*p=='\t')p++;
  if(*p<'0'||*p>'9')return -1;unsigned long id=0;while(*p>='0'&&*p<='9'){if(id>((unsigned long)INT_MAX-9)/10)return -1;id=id*10+(unsigned)(*p++-'0');}
  if(id<=1)return -1;while(*p==' '||*p=='\t'||*p=='\r')p++;if(*p&&*p!='\n')return -1;
  if(n==strlen("zte_topsw_devui")&&!memcmp(start,"zte_topsw_devui",n))found=1;
 }return found;
}
#endif
