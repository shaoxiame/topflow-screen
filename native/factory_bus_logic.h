/* Exact original service values, kept independently testable. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_FACTORY_BUS_LOGIC_H
#define TF_FACTORY_BUS_LOGIC_H
#include <stddef.h>
#include <string.h>
#include "factory_bus_protocol.h"
static const char*tf_bus_login_value(int logged_in){return logged_in==1?"ok":"";}
static int tf_bus_direct_value(const char*text,size_t length){
 if(!text||!length||length>3)return -1;
 while(length&&(text[length-1]=='\n'||text[length-1]=='\r'))length--;
 return length==1&&(text[0]=='0'||text[0]=='1')?text[0]-'0':-1;
}
static int tf_bus_direct_request(const char*text){return text&&!strcmp(text,"0")?0:text&&!strcmp(text,"1")?1:-1;}
static uint32_t tf_bus_power_action(const char*text){return text&&!strcmp(text,"gotoSleep")?TF_BUS_SLEEP:text&&!strcmp(text,"gotoWakeup")?TF_BUS_WAKE:0;}
static uint32_t tf_bus_power_broadcast_action(const char*text){return text&&!strcmp(text,"goToSleep")?TF_BUS_SLEEP:text&&!strcmp(text,"goToWakeup")?TF_BUS_WAKE:0;}
#endif
