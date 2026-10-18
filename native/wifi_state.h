/* Read-only Wi-Fi state semantics from the existing datad wifi.state API.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_WIFI_STATE_H
#define TF_WIFI_STATE_H
#include "control_logic.h"
#include <stdint.h>

typedef struct {
    int present, enabled, radio_enabled, ap_enabled, active;
    char state[24];
} tf_wifi_band_state;
typedef struct {
    int valid, busy, module_enabled, module_user_enabled;
    tf_wifi_band_state bands[2];
    uint32_t sampled_at;
    unsigned long long sequence;
} tf_wifi_state;
enum tf_wifi_display_status { TF_WIFI_UNKNOWN, TF_WIFI_OFF, TF_WIFI_STARTING, TF_WIFI_ON, TF_WIFI_UNAVAILABLE };

static void tf_wifi_state_reset(tf_wifi_state *s) {
    memset(s,0,sizeof *s);s->busy=s->module_enabled=s->module_user_enabled=-1;
    for(int i=0;i<2;i++)s->bands[i].enabled=s->bands[i].radio_enabled=s->bands[i].ap_enabled=s->bands[i].active=-1;
}
static int tf_wifi_band_index(const char *band) { return band&&!strcmp(band,"2g")?0:band&&!strcmp(band,"5g")?1:-1; }
static int tf_wifi_state_parse(const char *reply,uint32_t now,unsigned long long sequence,tf_wifi_state *out) {
    tf_wifi_state s;tf_wifi_state_reset(&s);tf_json d;
    if(!tf_control_success(reply,"{\"action\":\"wifi.state\"}")||!tf_parse(&d,reply))return 0;
    int r=tf_key(&d,0,"result"),m=tf_key(&d,r,"module"),radios=tf_key(&d,r,"radios"),aps=tf_key(&d,r,"aps"),good=0;
    if(r<0||d.t[r].type!='{'||m<0||d.t[m].type!='{'||radios<0||d.t[radios].type!='['||aps<0||d.t[aps].type!='[')goto done;
    s.busy=tf_bool(&d,tf_key(&d,r,"busy"));s.module_enabled=tf_bool(&d,tf_key(&d,m,"enabled"));s.module_user_enabled=tf_bool(&d,tf_key(&d,m,"user_enabled"));
    int seen_radio[2]={0,0},seen_ap[2]={0,0};
    for(int i=radios+1;i<d.t[radios].next;i=d.t[i].next){
        char band[16];if(!tf_gets(&d,i,"band",band,sizeof band))goto done;int k=tf_wifi_band_index(band);if(k<0)continue;if(seen_radio[k]++)goto done;
        tf_wifi_band_state*b=&s.bands[k];b->present=1;b->enabled=tf_bool(&d,tf_key(&d,i,"enabled"));b->radio_enabled=tf_bool(&d,tf_key(&d,i,"radio_enabled"));
    }
    for(int i=aps+1;i<d.t[aps].next;i=d.t[i].next){
        char section[32],band[16];if(!tf_gets(&d,i,"section",section,sizeof section))goto done;
        int k=!strcmp(section,"main_2g")?0:!strcmp(section,"main_5g")?1:-1;if(k<0)continue;
        if(seen_ap[k]++||!tf_gets(&d,i,"band",band,sizeof band)||tf_wifi_band_index(band)!=k)goto done;
        tf_wifi_band_state*b=&s.bands[k];b->present=1;b->ap_enabled=tf_bool(&d,tf_key(&d,i,"enabled"));b->active=tf_bool(&d,tf_key(&d,i,"active"));
        if(!tf_gets(&d,i,"state",b->state,sizeof b->state))b->state[0]=0;
        if(b->active>=0&&(!*b->state||b->active!=!strcmp(b->state,"up")))goto done;
    }
    /* The API's band switch combines radio and main AP configuration.
     * Never substitute the snapshot's main-SSID-only wlan.bands flag. */
    for(int i=0;i<2;i++){
        tf_wifi_band_state*b=&s.bands[i];
        int combined=b->radio_enabled==0||b->ap_enabled==0?0:b->radio_enabled==1&&b->ap_enabled==1?1:-1;
        if(b->enabled>=0&&combined>=0&&b->enabled!=combined)goto done;
    }
    s.valid=1;s.sampled_at=now;s.sequence=sequence;*out=s;good=1;
done:tf_free(&d);return good;
}
static int tf_wifi_state_fresh(const tf_wifi_state*s,uint32_t now) { return s&&s->valid&&(uint32_t)(now-s->sampled_at)<=6000; }
static int tf_wifi_configured(const tf_wifi_state*s,const char*band,uint32_t now) {
    int k=tf_wifi_band_index(band);return k>=0&&tf_wifi_state_fresh(s,now)&&s->bands[k].present?s->bands[k].enabled:-1;
}
/* Broadcasting is distinct from the persisted switch. During reload the
 * temporary module flag must not be interpreted as a user's off request. */
static int tf_wifi_effective(const tf_wifi_state*s,const char*band,uint32_t now) {
    int k=tf_wifi_band_index(band);if(k<0||!tf_wifi_state_fresh(s,now)||!s->bands[k].present||s->busy!=0)return-1;
    const tf_wifi_band_state*b=&s->bands[k];
    if(s->module_user_enabled==0||s->module_enabled==0||b->enabled==0)return b->active==1?-1:0;
    if(s->module_enabled==1&&b->enabled==1&&b->active==1)return 1;
    if(b->active==0)return 0;return-1;
}
static enum tf_wifi_display_status tf_wifi_status(const tf_wifi_state*s,const char*band,uint32_t now) {
    int k=tf_wifi_band_index(band);if(k<0||!tf_wifi_state_fresh(s,now)||!s->bands[k].present)return TF_WIFI_UNKNOWN;
    const tf_wifi_band_state*b=&s->bands[k];if(s->busy==1)return TF_WIFI_STARTING;
    if(s->busy<0)return TF_WIFI_UNKNOWN;
    if(s->module_user_enabled==0||b->enabled==0)return b->active==1?TF_WIFI_UNKNOWN:TF_WIFI_OFF;
    if(s->module_enabled==0){
        if(b->active==1)return TF_WIFI_UNKNOWN;
        if(s->module_user_enabled==1&&b->enabled==1)return TF_WIFI_UNAVAILABLE;
        return TF_WIFI_UNKNOWN;
    }
    if(tf_wifi_effective(s,band,now)==1)return TF_WIFI_ON;
    if(b->enabled==1&&b->active==0)return TF_WIFI_UNAVAILABLE;
    return TF_WIFI_UNKNOWN;
}
static const char*tf_wifi_status_label(enum tf_wifi_display_status status) {
    switch(status){case TF_WIFI_OFF:return "已关闭";case TF_WIFI_STARTING:return "正在应用";case TF_WIFI_ON:return "已开启";case TF_WIFI_UNAVAILABLE:return "尚未广播";default:return "状态未知";}
}
/* Confirms configuration only. Callers separately show pending broadcast
 * recovery while busy/active is not ready; never repeat the write. */
static int tf_wifi_verify_radio(const char*payload,const tf_wifi_state*s,uint32_t now,unsigned long long after_sequence) {
    if(!tf_wifi_state_fresh(s,now)||s->sequence<=after_sequence)return 0;
    tf_json p;if(!tf_parse(&p,payload))return 0;int params=tf_key(&p,0,"params"),ok=0;char action[64],band[16];
    if(tf_gets(&p,0,"action",action,sizeof action)&&!strcmp(action,"wifi.radio.set")&&tf_gets(&p,params,"band",band,sizeof band)){
        int desired=tf_bool(&p,tf_key(&p,params,"enabled"));ok=desired>=0&&tf_wifi_configured(s,band,now)==desired;
    }
    tf_free(&p);return ok;
}
#endif
