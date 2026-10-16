/* Factory-compatible four-digit PIN policy with conservative handover. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_PIN_POLICY_H
#define TF_PIN_POLICY_H
#include <stdint.h>
#include <stddef.h>
#include <string.h>
enum tf_pin_outcome { TF_PIN_INVALID=-2,TF_PIN_WAIT=-1,TF_PIN_WRONG=0,TF_PIN_OK=1 };
typedef struct {int enabled,locked,failures,handover_wait;uint64_t deadline;char input[5];unsigned input_len;} tf_pin_policy;
static void tf_pin_clear(tf_pin_policy*p){volatile char*s=p->input;for(size_t i=0;i<sizeof p->input;i++)s[i]=0;p->input_len=0;}
static int tf_pin_shape(const char*s){if(!s)return 0;for(int i=0;i<4;i++)if(s[i]<'0'||s[i]>'9')return 0;return !s[4];}
static void tf_pin_start(tf_pin_policy*p,int enabled,uint64_t now,int prior_failures,uint64_t prior_deadline){memset(p,0,sizeof *p);p->enabled=enabled;p->locked=enabled!=0;if(enabled){p->failures=prior_failures>=0&&prior_failures<=5?prior_failures:5;p->handover_wait=1;p->deadline=now+300000;if(prior_deadline>p->deadline)p->deadline=prior_deadline;}}
static unsigned tf_pin_seconds(const tf_pin_policy*p,uint64_t now){return p->deadline>now?(unsigned)((p->deadline-now+999)/1000):0;}
static int tf_pin_poll(tf_pin_policy*p,uint64_t now){if(p->deadline&&now>=p->deadline){p->deadline=0;p->failures=0;p->handover_wait=0;tf_pin_clear(p);return 1;}return 0;}
static int tf_pin_digit(tf_pin_policy*p,int digit,uint64_t now){tf_pin_poll(p,now);if(!p->enabled||!p->locked||tf_pin_seconds(p,now)||digit<0||digit>9||p->input_len>=4)return 0;p->input[p->input_len++]=(char)('0'+digit);p->input[p->input_len]=0;return 1;}
static int tf_pin_attempt(tf_pin_policy*p,const char*expected,uint64_t now){tf_pin_poll(p,now);if(tf_pin_seconds(p,now))return TF_PIN_WAIT;if(!p->enabled||!p->locked||p->input_len!=4||!tf_pin_shape(expected))return TF_PIN_INVALID;unsigned diff=0;for(int i=0;i<4;i++)diff|=(unsigned char)p->input[i]^(unsigned char)expected[i];tf_pin_clear(p);if(!diff){p->locked=0;p->failures=0;p->deadline=0;p->handover_wait=0;return TF_PIN_OK;}if(++p->failures>=5){p->failures=5;p->deadline=now+300000;p->handover_wait=0;}return TF_PIN_WRONG;}
/* Disabled factory PIN means no extra gesture screen on startup or wake. */
static void tf_pin_lock(tf_pin_policy*p){p->locked=p->enabled!=0;tf_pin_clear(p);}
static int tf_pin_record_read(const char*s,char boot[37],int*failures,uint64_t*deadline){if(!s||strlen(s)>127||strncmp(s,"TFPIN1 ",7))return 0;s+=7;for(int i=0;i<36;i++){char c=s[i];if(!c)return 0;if(i==8||i==13||i==18||i==23){if(c!='-')return 0;}else if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')||(c>='A'&&c<='F')))return 0;boot[i]=c;}boot[36]=0;s+=36;if(*s++!=' '||s[0]<'0'||s[0]>'5'||s[1]!=' ')return 0;*failures=*s-'0';s+=2;uint64_t n=0;int digits=0;while(*s>='0'&&*s<='9'){unsigned d=(unsigned)(*s++-'0');if(++digits>20||n>(UINT64_MAX-d)/10)return 0;n=n*10+d;}if(!digits||(*s&&strcmp(s,"\n")))return 0;*deadline=n;return 1;}
#endif
