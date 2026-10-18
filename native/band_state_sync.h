/* Follow external band policy without overwriting a local draft.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_BAND_STATE_SYNC_H
#define TF_BAND_STATE_SYNC_H
static unsigned char band_original[TF_BANDS];
static int band_external=0,band_state_known=0;
static void band_observe(void){
 if(advanced_page!=2||pending[0]||verifying[0])return;
 tf_json d;unsigned char allowed[TF_BANDS],selected[TF_BANDS];
 if(!fresh_state(&d)){band_state_known=0;return;}
 int okay=tf_band_snapshot(&d,band_rat,allowed,selected);tf_free(&d);
 if(!okay){band_state_known=0;return;}band_state_known=1;
 int dirty=memcmp(band_selected,band_original,sizeof band_original)!=0;
 if(dirty){band_external=memcmp(allowed,band_allowed,sizeof allowed)||memcmp(selected,band_original,sizeof selected);}
 else{memcpy(band_allowed,allowed,sizeof allowed);memcpy(band_selected,selected,sizeof selected);memcpy(band_original,selected,sizeof selected);band_external=0;}
}
static int band_baseline_matches(const unsigned char*allowed,const unsigned char*selected){
 return !memcmp(allowed,band_allowed,sizeof band_allowed)&&!memcmp(selected,band_original,sizeof band_original);
}
#endif
