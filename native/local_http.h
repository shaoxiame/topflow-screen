/* Bounded, loopback-only HTTP client; no shell or credential files. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_LOCAL_HTTP_H
#define TF_LOCAL_HTTP_H
#include <fcntl.h>
#include <poll.h>
#include <strings.h>
static volatile sig_atomic_t tf_http_cancelled=0;
static void(*tf_http_wait_hook)(void)=NULL;
static long long tf_http_hook_at=0;
static long long tf_monotonic_ms(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return(long long)t.tv_sec*1000+t.tv_nsec/1000000;}
static int tf_poll_fd(int fd,short events,long long deadline){struct pollfd p={fd,events,0};for(;;){long long now=tf_monotonic_ms();if(tf_http_wait_hook&&(now<tf_http_hook_at||now-tf_http_hook_at>=125)){tf_http_hook_at=now;tf_http_wait_hook();now=tf_monotonic_ms();}int ms=(int)(deadline-now);if(ms<=0||tf_http_cancelled)return 0;if(tf_http_wait_hook&&ms>125)ms=125;int n=poll(&p,1,ms);if(tf_http_cancelled)return 0;if(n<0&&errno==EINTR)continue;if(!n)continue;return n>0&&(p.revents&(events|POLLHUP));}}
static int tf_http_decode(char*raw,size_t n,char*out,size_t cap){
 if(n<12||memcmp(raw,"HTTP/1.",7))return-1;int status=0;if(sscanf(raw,"HTTP/1.%*d %d",&status)!=1||status<100||status>599)return-1;
 char*h=strstr(raw,"\r\n\r\n");if(!h||(size_t)(h-raw)>16384)return-1;size_t off=(size_t)(h-raw)+4,body_n=n-off;int chunked=0;long long length=-1;
 for(char*p=strstr(raw,"\r\n")+2;p<h;){char*e=strstr(p,"\r\n");if(!e||e>h)return-1;size_t l=(size_t)(e-p);if(l>=18&&!strncasecmp(p,"Transfer-Encoding:",18)){char v[96];size_t k=l-18;if(k>=sizeof v)return-1;memcpy(v,p+18,k);v[k]=0;char*q=v;while(*q==' ')q++;if(strcasecmp(q,"chunked"))return-1;chunked=1;}else if(l>=15&&!strncasecmp(p,"Content-Length:",15)){char v[32],*end;size_t k=l-15;if(k>=sizeof v)return-1;memcpy(v,p+15,k);v[k]=0;char*start=v;while(*start==' ')start++;if(!isdigit((unsigned char)*start))return-1;errno=0;long long x=strtoll(start,&end,10);while(*end==' ')end++;if(errno||end==start||*end||x<0||(length>=0&&x!=length))return-1;length=x;}p=e+2;}
 if(chunked&&length>=0)return-1;
 if(chunked){size_t pos=off,dst=0;for(;;){char*e=strstr(raw+pos,"\r\n"),*end;if(!e||e-raw>(long)n||e-(raw+pos)>16)return-1;char line[20];size_t l=(size_t)(e-(raw+pos));memcpy(line,raw+pos,l);line[l]=0;if(!l)return-1;for(size_t i=0;i<l;i++)if(!isxdigit((unsigned char)line[i]))return-1;unsigned long bytes=strtoul(line,&end,16);if(*end||bytes>cap)return-1;pos=(size_t)(e-raw)+2;if(!bytes){if(pos+2!=n||memcmp(raw+pos,"\r\n",2))return-1;break;}if(pos+bytes+2>n||dst+bytes>=cap||memcmp(raw+pos+bytes,"\r\n",2))return-1;memcpy(out+dst,raw+pos,bytes);dst+=bytes;pos+=bytes+2;}out[dst]=0;
 }else{if(length>=0&&(unsigned long long)length!=body_n)return-1;if(body_n>=cap)return-1;memcpy(out,raw+off,body_n);out[body_n]=0;}
 return status;
}
static int tf_http_timeout(int port,const char*method,const char*path,const char*secret,const char*body,char*out,size_t cap,int timeout_ms);
typedef struct {size_t request_bytes,sent_bytes,received_bytes;int cancelled;} tf_http_transfer;
/* A cancelled power request may already have a complete reply. Only explicit
 * framing permits decoding before EOF; a close-delimited prefix never does. */
static int tf_http_framed_status(char*raw,size_t n,char*out,size_t cap){
 raw[n]=0;char*h=strstr(raw,"\r\n\r\n"),*p=strstr(raw,"\r\n");if(!h||!p||(size_t)(h-raw)>16384)return -1;
 int framed=0;for(p+=2;p<h;){char*e=strstr(p,"\r\n");if(!e||e>h)return -1;size_t l=(size_t)(e-p);
  if((l>=15&&!strncasecmp(p,"Content-Length:",15))||(l>=18&&!strncasecmp(p,"Transfer-Encoding:",18)))framed=1;p=e+2;
 }
 if(!framed)return -1;int status=tf_http_decode(raw,n,out,cap);if(status<0)out[0]=0;return status;
}
/* Four fixed UFI header names; callers cannot inject arbitrary HTTP headers. */
static int tf_http_request_internal(int port,const char*method,const char*path,const char*secret,const char*const headers[4],const char*body,char*out,size_t cap,int timeout_ms,tf_http_transfer*transfer){
 if(transfer){memset(transfer,0,sizeof *transfer);transfer->cancelled=tf_http_cancelled!=0;}
 if(tf_http_cancelled||port<1||port>65535||!path||path[0]!='/'||strchr(path,'\r')||strchr(path,'\n')||strchr(path,' ')||!out||cap<2)return-1;out[0]=0;
 if(strcmp(method,"GET")&&strcmp(method,"POST")&&strcmp(method,"PUT")&&strcmp(method,"PATCH"))return-1;
 if(secret){size_t n=strlen(secret);if(n>1024)return-1;for(size_t i=0;i<n;i++)if((unsigned char)secret[i]<33||(unsigned char)secret[i]>126)return-1;}
 size_t header_bytes=0;if(headers){if(secret)return-1;for(int i=0;i<4;i++){if(!headers[i])return-1;size_t l=strlen(headers[i]);if(!l||l>(i?64:20)||(i&&l!=64))return-1;for(size_t j=0;j<l;j++)if(i?!isxdigit((unsigned char)headers[i][j]):!isdigit((unsigned char)headers[i][j]))return-1;header_bytes+=l+32;}}
 const char*payload=body?body:"";size_t reqcap=strlen(path)+strlen(payload)+(secret?strlen(secret):0)+header_bytes+512;char*req=malloc(reqcap),*raw=malloc(cap+16385);if(!req||!raw){free(req);free(raw);return-1;}
 /* The existing UFI goform dispatcher accepts an URL-encoded form, unlike
  * datad and forwarding JSON. No caller-controlled header or MIME value. */
 const char*type=port==2333&&!strcmp(method,"POST")&&!strcmp(path,"/api/goform/goform_set_cmd_process")?"application/x-www-form-urlencoded":"application/json";
 int n=snprintf(req,reqcap,"%s %s HTTP/1.0\r\nHost: 127.0.0.1:%d\r\nConnection: close\r\nContent-Type: %s\r\nContent-Length: %zu\r\n",method,path,port,type,strlen(payload));if(secret&&*secret)n+=snprintf(req+n,reqcap-(size_t)n,"Authorization: Bearer %s\r\n",secret);if(headers){const char*names[]={"kano-t","kano-sign","X-Device-Token","Authorization"};for(int i=0;i<4;i++)n+=snprintf(req+n,reqcap-(size_t)n,"%s: %s\r\n",names[i],headers[i]);}n+=snprintf(req+n,reqcap-(size_t)n,"\r\n%s",payload);
 size_t sent=0,got=0;if(transfer)transfer->request_bytes=(size_t)n;
 int fd=socket(AF_INET,SOCK_STREAM,0),result=-1;if(fd<0)goto done;fcntl(fd,F_SETFD,FD_CLOEXEC);fcntl(fd,F_SETFL,O_NONBLOCK);if(timeout_ms<1||timeout_ms>55000)timeout_ms=2500;long long deadline=tf_monotonic_ms()+timeout_ms;
 struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons((uint16_t)port);inet_pton(AF_INET,"127.0.0.1",&a.sin_addr);int c=connect(fd,(struct sockaddr*)&a,sizeof a);if(c&&errno!=EINPROGRESS)goto done;if(c){if(!tf_poll_fd(fd,POLLOUT,deadline))goto done;int err=0;socklen_t len=sizeof err;if(getsockopt(fd,SOL_SOCKET,SO_ERROR,&err,&len)||err)goto done;}
 while(sent<(size_t)n){if(!tf_poll_fd(fd,POLLOUT,deadline))goto done;ssize_t k=send(fd,req+sent,(size_t)n-sent,MSG_NOSIGNAL);if(k>0)sent+=(size_t)k;else if(errno!=EAGAIN&&errno!=EINTR)goto done;}
 while(got<cap+16384){if(!tf_poll_fd(fd,POLLIN,deadline))goto done;ssize_t k=recv(fd,raw+got,cap+16384-got,0);if(k>0){got+=(size_t)k;if(transfer&&(result=tf_http_framed_status(raw,got,out,cap))>=0)goto done;}else if(!k)break;else if(errno!=EAGAIN&&errno!=EINTR)goto done;}if(got>=cap+16384)goto done;raw[got]=0;result=tf_http_decode(raw,got,out,cap);
 done:if(transfer){transfer->sent_bytes=sent;transfer->received_bytes=got;transfer->cancelled=tf_http_cancelled!=0;
  if(result<0&&got<cap+16384&&got)result=tf_http_framed_status(raw,got,out,cap);
 }if(fd>=0)close(fd);{volatile unsigned char*p=(volatile unsigned char*)req;for(size_t i=0;i<reqcap;i++)p[i]=0;p=(volatile unsigned char*)raw;for(size_t i=0;i<cap+16385;i++)p[i]=0;}free(req);free(raw);return result;
}
static int tf_http_request_timeout(int port,const char*method,const char*path,const char*secret,const char*const headers[4],const char*body,char*out,size_t cap,int timeout_ms){return tf_http_request_internal(port,method,path,secret,headers,body,out,cap,timeout_ms,NULL);}
static int tf_http_timeout(int port,const char*method,const char*path,const char*secret,const char*body,char*out,size_t cap,int timeout_ms){return tf_http_request_timeout(port,method,path,secret,NULL,body,out,cap,timeout_ms);}
/* Fixed power actions only. A positive sent_bytes is not an execution receipt;
 * callers must never retry or fall back after an unconfirmed transmission. */
static int tf_http_power_timeout(int port,const char*method,const char*path,const char*secret,const char*body,char*out,size_t cap,int timeout_ms,tf_http_transfer*transfer){
 if(!transfer)return -1;memset(transfer,0,sizeof *transfer);transfer->cancelled=tf_http_cancelled!=0;if(out&&cap)out[0]=0;
 if(port!=9460||!method||strcmp(method,"POST")||!path||strcmp(path,"/control")||secret||!body||
  (strcmp(body,"{\"action\":\"device.poweroff\",\"params\":{}}")&&strcmp(body,"{\"action\":\"device.reboot\",\"params\":{}}")))return -1;
 return tf_http_request_internal(port,method,path,NULL,NULL,body,out,cap,timeout_ms,transfer);
}
static int tf_http_headers_timeout(int port,const char*method,const char*path,const char*const headers[4],const char*body,char*out,size_t cap,int timeout_ms){return tf_http_request_timeout(port,method,path,NULL,headers,body,out,cap,timeout_ms);}
static int tf_http(int port,const char*method,const char*path,const char*secret,const char*body,char*out,size_t cap){return tf_http_timeout(port,method,path,secret,body,out,cap,2500);}
#endif
