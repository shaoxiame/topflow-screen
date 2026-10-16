/* zwrt-datad battery.charging is the vendor charge_status enum, not a bool.
 * Verified against zwrt-datad 0.10.79 state.rs and sms_forward.rs. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_BATTERY_STATE_H
#define TF_BATTERY_STATE_H
static int tf_battery_charging(int status,int connected){
 if(status==1)return connected==0?-1:1;
 if(status>=2&&status<=4)return 0;
 return connected==0?0:-1;
}
static const char*tf_battery_class(int status,int connected){
 if(status==1)return connected==0?"unknown":"charging";
 if(status==4)return "full";
 if(connected==1)return "plugged";
 if(status==2||connected==0)return "discharging";
 return status==3?"idle":"unknown";
}
static const char*tf_battery_label(int status,int connected){
 if(status==1)return connected==0?"充电状态待确认":"充电中";
 if(status==4)return "已充满";
 if(status==2)return connected==1?"已插电 · 电池供电":"电池供电";
 if(status==3)return connected==1?"已插电 · 未充电":"未充电";
 if(connected==1)return "已插电 · 充电状态未知";
 return connected==0?"电池供电":"充电状态未知";
}
static const char*tf_battery_mark(int status,int connected){
 if(status==1)return connected==0?"?":"";
 if(status==4)return "满";
 if(connected==1)return "+";
 return status==2||status==3||connected==0?"":"?";
}
static int tf_battery_fill(int percent){return percent>=0&&percent<=100?(percent*10+50)/100:0;}
#endif
