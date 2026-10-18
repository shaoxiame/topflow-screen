/* Fixed private socketpair protocol; no sockets or RPC exposed to the network. */
#ifndef TF_FACTORY_BUS_PROTOCOL_H
#define TF_FACTORY_BUS_PROTOCOL_H
#include <stdint.h>
#define TF_BUS_MAGIC UINT32_C(0x54464231)
enum tf_bus_type {
 TF_BUS_LCD=1, TF_BUS_LOGIN=2, TF_BUS_PING=3, TF_BUS_STOP=4, TF_BUS_TOUCH=5,
 TF_BUS_QUICKEN_COMPLETE=6, TF_BUS_POWEROFF_COMPLETE=7,
 TF_BUS_READY=16, TF_BUS_ACK=17, TF_BUS_SLEEP=18, TF_BUS_WAKE=19,
 TF_BUS_RESYNC=20, TF_BUS_FATAL=21, TF_BUS_START_STAGE=22, TF_BUS_DEVICE_POWER=23
};
enum tf_device_power_flag { TF_DEVICE_ON=1,TF_DEVICE_OFF=2,TF_DEVICE_NORMAL=4,TF_DEVICE_QUICK=8 };
typedef struct {uint32_t magic,type,sequence,value;} tf_bus_packet;
static int tf_bus_command_valid(const tf_bus_packet*p){
 return p&&p->magic==TF_BUS_MAGIC&&p->sequence&&
  ((p->type==TF_BUS_LCD||p->type==TF_BUS_LOGIN)?p->value<=1:
   (p->type==TF_BUS_PING||p->type==TF_BUS_STOP)?p->value==0:
   p->type==TF_BUS_TOUCH?p->value==1:
   (p->type==TF_BUS_QUICKEN_COMPLETE||p->type==TF_BUS_POWEROFF_COMPLETE)?p->value>0:0);
}
static int tf_bus_response_valid(const tf_bus_packet*p){
 if(!p||p->magic!=TF_BUS_MAGIC)return 0;
 if(p->type==TF_BUS_ACK)return p->sequence>0&&p->value<=1;
 if(p->type==TF_BUS_DEVICE_POWER)return p->sequence>0&&(p->value==TF_DEVICE_ON||((p->value&TF_DEVICE_OFF)&&!(p->value&~(TF_DEVICE_OFF|TF_DEVICE_NORMAL|TF_DEVICE_QUICK))));
 if(p->type==TF_BUS_START_STAGE)return p->sequence==0&&p->value>=1&&p->value<=9;
 return p->sequence==0&&p->value==0&&p->type>=TF_BUS_READY&&p->type<=TF_BUS_FATAL;
}
#endif
