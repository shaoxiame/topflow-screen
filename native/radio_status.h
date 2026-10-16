/* Current radio labels for the home and lock screen; no inference from CA. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_RADIO_STATUS_H
#define TF_RADIO_STATUS_H
#include "modem_logic.h"
static const char*tf_radio_label(const char*raw){
 char value[64];size_t n=0;if(!raw)return "—";
 for(const unsigned char*p=(const unsigned char*)raw;*p;p++){
  if(isspace(*p)||*p=='-'||*p=='_')continue;
  if(n>=sizeof value-1||*p>127)return "—";value[n++]=(char)toupper(*p);
 }value[n]=0;
 if(!strcmp(value,"5GA")||!strcmp(value,"5GADVANCED"))return "5G-A";
 if(!strcmp(value,"NSA")||!strcmp(value,"5GNSA")||!strcmp(value,"NR5GNSA")||!strcmp(value,"ENDC"))return "5G NSA";
 if(!strcmp(value,"SA")||!strcmp(value,"5GSA")||!strcmp(value,"NR5GSA"))return "5G SA";
 if(!strcmp(value,"5G")||!strcmp(value,"NR")||!strcmp(value,"NR5G"))return "5G";
 if(!strcmp(value,"4G+")||!strcmp(value,"LTE+")||!strcmp(value,"LTECA")||!strcmp(value,"LTEA"))return "4G+";
 if(!strcmp(value,"4G")||!strcmp(value,"LTE"))return "4G";
 if(!strcmp(value,"3G")||!strcmp(value,"WCDMA")||!strcmp(value,"UMTS")||!strcmp(value,"HSPA")||!strcmp(value,"HSDPA")||!strcmp(value,"HSUPA"))return "3G";
 if(!strcmp(value,"HSPA+")||!strcmp(value,"3G+"))return "3G+";
 if(!strcmp(value,"2G")||!strcmp(value,"GSM")||!strcmp(value,"GPRS")||!strcmp(value,"EDGE"))return "2G";
 return "—";
}
static int tf_modem_radio_current(const tf_json*d,const tf_modem*m){
 if(!m||m->presence!=1||m->conflict||m->locked||m->enabled==0||tf_mstate(m,"sim error",NULL)||tf_mstate(m,"sim destroy","modem_sim_destroy"))return 0;
 char id[16];if(!tf_gets(d,m->object,"id",id,sizeof id))return 0;
 return !strcmp(id,"5G")||((!strcmp(id,"4G1")||!strcmp(id,"4G2"))&&m->enabled==1);
}
#endif
