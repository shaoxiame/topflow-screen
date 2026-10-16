/* UFI documented request signing. Credentials are only retained in RAM.
 * Existing local UFI hash may be read through the fixed read-only helper.
 * No new credential file, shell, cookie borrowing, login mutation or listener.
 * SHA256 / MD5 implement the published protocol; MD5 is not used as a password hash.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_UFI_AUTH_H
#define TF_UFI_AUTH_H
#include <stdint.h>
#include <time.h>
#include "control_logic.h"
#if defined(__linux__)
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#endif
static void tf_ufi_wipe(void *p,size_t n){volatile unsigned char*q=p;while(n--)*q++=0;}
#ifndef TF_UFI_LOCAL_LOAD
#include "ufi_local_credential.h"
#define TF_UFI_LOCAL_LOAD tf_ufi_local_load
#endif
static uint32_t tf_ror(uint32_t x,unsigned n){return(x>>n)|(x<<(32-n));}
static uint32_t tf_rol(uint32_t x,unsigned n){return(x<<n)|(x>>(32-n));}
static uint32_t tf_be32(const unsigned char*p){return(uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}
static uint32_t tf_le32(const unsigned char*p){return(uint32_t)p[3]<<24|(uint32_t)p[2]<<16|(uint32_t)p[1]<<8|p[0];}
static void tf_sha_block(uint32_t*h,const unsigned char*p){
 static const uint32_t k[]={0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
 uint32_t w[64],v[8];memcpy(v,h,sizeof v);for(int i=0;i<64;i++){if(i<16)w[i]=tf_be32(p+4*i);else{uint32_t a=w[i-15],b=w[i-2];w[i]=w[i-16]+(tf_ror(a,7)^tf_ror(a,18)^(a>>3))+w[i-7]+(tf_ror(b,17)^tf_ror(b,19)^(b>>10));}uint32_t a=v[0],b=v[1],c=v[2],e=v[4],f=v[5],g=v[6];uint32_t t=v[7]+(tf_ror(e,6)^tf_ror(e,11)^tf_ror(e,25))+((e&f)^(~e&g))+k[i]+w[i],u=(tf_ror(a,2)^tf_ror(a,13)^tf_ror(a,22))+((a&b)^(a&c)^(b&c));v[7]=g;v[6]=f;v[5]=e;v[4]=v[3]+t;v[3]=c;v[2]=b;v[1]=a;v[0]=t+u;}for(int i=0;i<8;i++)h[i]+=v[i];tf_ufi_wipe(w,sizeof w);tf_ufi_wipe(v,sizeof v);
}
static void tf_md5_block(uint32_t*h,const unsigned char*p){
 static const uint32_t k[]={0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391};
 static const unsigned shift[]={7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21};uint32_t w[16],a=h[0],b=h[1],c=h[2],d=h[3];for(int i=0;i<16;i++)w[i]=tf_le32(p+4*i);for(unsigned i=0;i<64;i++){uint32_t f;unsigned g;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}uint32_t old=d;d=c;c=b;b+=tf_rol(a+f+k[i]+w[g],shift[(i/16)*4+i%4]);a=old;}h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;tf_ufi_wipe(w,sizeof w);
}
static void tf_digest(const void*input,size_t len,unsigned char*out,int md5){
 const unsigned char*p=input;uint32_t h[8]={0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};if(md5){h[0]=0x67452301;h[1]=0xefcdab89;h[2]=0x98badcfe;h[3]=0x10325476;}size_t done=0;while(len-done>=64){if(md5)tf_md5_block(h,p+done);else tf_sha_block(h,p+done);done+=64;}unsigned char tail[128]={0};size_t remainder=len-done;memcpy(tail,p+done,remainder);tail[remainder]=0x80;size_t padded=remainder<56?64:128;uint64_t bits=(uint64_t)len*8;for(unsigned i=0;i<8;i++)tail[padded-8+i]=(unsigned char)(bits>>(md5?8*i:8*(7-i)));for(size_t off=0;off<padded;off+=64){if(md5)tf_md5_block(h,tail+off);else tf_sha_block(h,tail+off);}for(unsigned i=0;i<(md5?16u:32u);i++)out[i]=(unsigned char)(h[i/4]>>(md5?8*(i%4):8*(3-i%4)));tf_ufi_wipe(h,sizeof h);tf_ufi_wipe(tail,sizeof tail);
}
static void tf_hex(const unsigned char*in,size_t n,char*out){static const char h[]="0123456789abcdef";for(size_t i=0;i<n;i++){out[i*2]=h[in[i]>>4];out[i*2+1]=h[in[i]&15];}out[n*2]=0;}
static int tf_ufi_sign(const char*method,const char*path,const char*timestamp,char out[65]){
 if(strcmp(method,"GET")&&strcmp(method,"POST"))return 0;const char*q=strchr(path,'?');size_t plen=q?(size_t)(q-path):strlen(path);if(plen>200||strlen(timestamp)>20)return 0;
 const char key[]="minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd";unsigned char inner[384]={0},outer[80]={0},mac[16],parts[64],digest[32];for(int i=0;i<64;i++){unsigned char c=i<(int)strlen(key)?(unsigned char)key[i]:0;inner[i]=c^0x36;outer[i]=c^0x5c;}int n=snprintf((char*)inner+64,sizeof inner-64,"minikano%s%.*s%s",method,(int)plen,path,timestamp);if(n<0||(size_t)n>=sizeof inner-64)return 0;tf_digest(inner,64+(size_t)n,mac,1);memcpy(outer+64,mac,16);tf_digest(outer,sizeof outer,mac,1);tf_digest(mac,8,parts,0);tf_digest(mac+8,8,parts+32,0);tf_digest(parts,64,digest,0);tf_hex(digest,32,out);tf_ufi_wipe(inner,sizeof inner);tf_ufi_wipe(outer,sizeof outer);tf_ufi_wipe(mac,sizeof mac);tf_ufi_wipe(parts,sizeof parts);tf_ufi_wipe(digest,sizeof digest);return 1;
}
typedef struct {char device[66],authorization[65];long long expires;int active,required;} tf_ufi_session;
_Alignas(4096) static union {tf_ufi_session value;unsigned char pages[4096];} tf_ufi_storage;
#define tf_ufi_auth (tf_ufi_storage.value)
static int tf_ufi_memory_locked;
static long long tf_ufi_attempt_window;static int tf_ufi_attempts;
#ifndef TF_UFI_NOW
static long long tf_ufi_now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return(long long)t.tv_sec*1000+t.tv_nsec/1000000;}
#define TF_UFI_NOW tf_ufi_now
#endif
#ifndef TF_UFI_WALL
static long long tf_ufi_wall(void){struct timespec t;clock_gettime(CLOCK_REALTIME,&t);return(long long)t.tv_sec*1000+t.tv_nsec/1000000;}
#define TF_UFI_WALL tf_ufi_wall
#endif
#ifndef TF_UFI_HTTP
#define TF_UFI_HTTP tf_http_headers_timeout
#endif
static void tf_ufi_revoke(void){tf_ufi_wipe(&tf_ufi_storage,sizeof tf_ufi_storage);
#if defined(__linux__)
 if(tf_ufi_memory_locked)munlock(&tf_ufi_storage,sizeof tf_ufi_storage);
#endif
 tf_ufi_memory_locked=0;
}
static int tf_ufi_live(void){if(tf_ufi_auth.active&&TF_UFI_NOW()>=tf_ufi_auth.expires)tf_ufi_revoke();return tf_ufi_auth.active;}
static int tf_ufi_hex64(const char*s){if(strlen(s)!=64)return 0;for(;*s;s++)if(!isxdigit((unsigned char)*s))return 0;return 1;}
static int tf_ufi_allowed(const char*method,const char*path){
 const char*routes[]={"/api/sms_forward_mail","/api/sms_forward_curl","/api/sms_forward_dingtalk","/api/sms_forward_sms","/api/sms_forward_blacklist"};if(strcmp(method,"GET")&&strcmp(method,"POST"))return 0;for(unsigned i=0;i<sizeof routes/sizeof routes[0];i++)if(!strcmp(path,routes[i]))return 1;
 if(!strcmp(method,"GET"))return!strcmp(path,"/api/session")||!strcmp(path,"/api/sms_forward_method")||!strcmp(path,"/api/sms_forward_enabled")||!strcmp(path,"/api/power_status_forward_enabled");
 return!strcmp(path,"/api/sms_forward_enabled?enable=0")||!strcmp(path,"/api/sms_forward_enabled?enable=1")||!strcmp(path,"/api/power_status_forward_enabled?enable=0")||!strcmp(path,"/api/power_status_forward_enabled?enable=1");
}
static int tf_ufi_send(const char*method,const char*path,const char*body,char*out,size_t cap,int timeout){
 char t[24],sign[65];const char*headers[4]={t,sign,tf_ufi_auth.device,tf_ufi_auth.authorization};snprintf(t,sizeof t,"%lld",TF_UFI_WALL());if(!tf_ufi_sign(method,path,t,sign))return-1;int code=TF_UFI_HTTP(2333,method,path,tf_ufi_auth.required?headers:NULL,body,out,cap,timeout);tf_ufi_wipe(sign,sizeof sign);if(code==401||code==403)tf_ufi_revoke();return code;
}
static int tf_ufi_request(const char*method,const char*path,const char*body,char*out,size_t cap,int timeout,int write_confirmed){
 if(!tf_ufi_live()||!tf_ufi_allowed(method,path)||(!strcmp(method,"POST")&&!write_confirmed)){if(cap)out[0]=0;return-1;}return tf_ufi_send(method,path,body,out,cap,timeout);
}
/* Caller must erase its input buffer immediately after this returns. This only
 * reads need_token/session; it does not establish a vendor goform session. */
static inline int tf_ufi_authorize(const char*password){
 tf_ufi_revoke();long long now=TF_UFI_NOW();if(now-tf_ufi_attempt_window>=60000||now<tf_ufi_attempt_window){tf_ufi_attempt_window=now;tf_ufi_attempts=0;}if(tf_ufi_attempts>=3)return 0;tf_ufi_attempts++;
 size_t len=strlen(password);if(len>1024||strchr(password,'\r')||strchr(password,'\n'))return 0;
#if defined(__linux__)
 struct rlimit core={0,0};if(setrlimit(RLIMIT_CORE,&core)||prctl(PR_SET_DUMPABLE,0)||mlock(&tf_ufi_storage,sizeof tf_ufi_storage))return 0;tf_ufi_memory_locked=1;
#endif
 char response[4096];tf_json d;int ok=0,code=TF_UFI_HTTP(2333,"GET","/api/need_token",NULL,NULL,response,sizeof response,5000);
 if(code!=200||!tf_parse(&d,response))goto end;int needed=tf_bool(&d,tf_key(&d,0,"need_token"));if(needed>=0){tf_ufi_auth.required=needed;ok=!needed||(len&&tf_gets(&d,0,"device_token",tf_ufi_auth.device,sizeof tf_ufi_auth.device)&&tf_ufi_hex64(tf_ufi_auth.device));}tf_free(&d);if(!ok)goto end;
 if(needed){unsigned char digest[32];tf_digest(password,len,digest,0);tf_hex(digest,32,tf_ufi_auth.authorization);tf_ufi_wipe(digest,sizeof digest);}code=tf_ufi_send("GET","/api/session",NULL,response,sizeof response,5000);ok=0;if(code==200&&tf_parse(&d,response)){int i=tf_key(&d,0,"authenticated");ok=i>=0&&d.t[i].type=='v'&&tf_bool(&d,i)==1;tf_free(&d);}if(ok){tf_ufi_auth.active=1;tf_ufi_auth.expires=now+600000;}
 end:tf_ufi_wipe(response,sizeof response);if(!ok)tf_ufi_revoke();return ok;
}
/* Explicitly opening forwarding reuses only this machine's existing UFI hash.
 * No password prompt, browser session export or database/configuration change. */
static int tf_ufi_authorize_existing(void){
 tf_ufi_revoke();long long now=TF_UFI_NOW();if(now-tf_ufi_attempt_window>=60000||now<tf_ufi_attempt_window){tf_ufi_attempt_window=now;tf_ufi_attempts=0;}if(tf_ufi_attempts>=3)return 0;tf_ufi_attempts++;
#if defined(__linux__)
 struct rlimit core={0,0};if(setrlimit(RLIMIT_CORE,&core)||prctl(PR_SET_DUMPABLE,0)||mlock(&tf_ufi_storage,sizeof tf_ufi_storage))return 0;tf_ufi_memory_locked=1;
#endif
 char response[4096];tf_json d;int okay=0,code=TF_UFI_HTTP(2333,"GET","/api/need_token",NULL,NULL,response,sizeof response,5000);
 if(code!=200||!tf_parse(&d,response))goto end;int needed=tf_bool(&d,tf_key(&d,0,"need_token"));if(needed>=0){tf_ufi_auth.required=needed;okay=!needed||(tf_gets(&d,0,"device_token",tf_ufi_auth.device,sizeof tf_ufi_auth.device)&&tf_ufi_hex64(tf_ufi_auth.device));}tf_free(&d);if(!okay)goto end;
 if(needed&&!TF_UFI_LOCAL_LOAD(tf_ufi_auth.authorization)){okay=0;goto end;}if(needed&&!tf_ufi_hex64(tf_ufi_auth.authorization)){okay=0;goto end;}
 code=tf_ufi_send("GET","/api/session",NULL,response,sizeof response,5000);okay=0;if(code==200&&tf_parse(&d,response)){int i=tf_key(&d,0,"authenticated");okay=i>=0&&d.t[i].type=='v'&&tf_bool(&d,i)==1;tf_free(&d);}if(okay){tf_ufi_auth.active=1;tf_ufi_auth.expires=now+600000;}
 end:tf_ufi_wipe(response,sizeof response);if(!okay)tf_ufi_revoke();return okay;
}
#endif
