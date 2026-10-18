/* Nonblocking, fixed loopback read of the existing wifi.state API.
 * Include after local_http.h (tf_http_decode); no writes, threads or files.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_WIFI_STATE_RUNTIME_H
#define TF_WIFI_STATE_RUNTIME_H
#include "wifi_state.h"
#ifndef TF_WIFI_RUNTIME_TEST_IO
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>
#endif

#define TF_WIFI_RESPONSE_LIMIT 65536
#define TF_WIFI_IO_BUDGET 8192
typedef struct {
    tf_wifi_state state;
    int fd, phase, scheduled, enabled;
    uint32_t started_at,next_at;
    unsigned long long sequence;
    size_t sent,received,request_size;
    char request[256];
    char *raw;
} tf_wifi_runtime;

static void tf_wifi_runtime_init(tf_wifi_runtime*r) { memset(r,0,sizeof *r);r->fd=-1;tf_wifi_state_reset(&r->state); }
static void tf_wifi_runtime_drop(tf_wifi_runtime*r) {
    if(r->fd>=0)close(r->fd);r->fd=-1;r->phase=0;r->sent=r->received=0;free(r->raw);r->raw=NULL;
}
static void tf_wifi_runtime_close(tf_wifi_runtime*r) { tf_wifi_runtime_drop(r);r->enabled=r->scheduled=0;tf_wifi_state_reset(&r->state); }
static void tf_wifi_runtime_invalidate(tf_wifi_runtime*r) { tf_wifi_runtime_drop(r);tf_wifi_state_reset(&r->state);r->scheduled=0; }
static int tf_wifi_runtime_fail(tf_wifi_runtime*r,uint32_t now) { tf_wifi_runtime_drop(r);tf_wifi_state_reset(&r->state);r->next_at=now+3000;r->scheduled=1;return 1; }
static int tf_wifi_runtime_refresh(tf_wifi_runtime*r,uint32_t now,int active) {
    if(!active){int changed=r->enabled||r->state.valid||r->fd>=0;tf_wifi_runtime_close(r);return changed;}
    r->enabled=1;if(r->fd>=0||(r->scheduled&&(int32_t)(now-r->next_at)<0))return 0;
    r->next_at=now+3000;r->scheduled=1;r->started_at=now;r->sent=r->received=0;
    static const char payload[]="{\"action\":\"wifi.state\",\"params\":{}}";
    int count=snprintf(r->request,sizeof r->request,"POST /control HTTP/1.0\r\nHost: 127.0.0.1:9460\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: %zu\r\n\r\n%s",strlen(payload),payload);
    if(count<=0||(size_t)count>=sizeof r->request)return tf_wifi_runtime_fail(r,now);r->request_size=(size_t)count;
    r->raw=malloc(TF_WIFI_RESPONSE_LIMIT+1);if(!r->raw)return tf_wifi_runtime_fail(r,now);
    r->fd=socket(AF_INET,SOCK_STREAM,0);if(r->fd<0)return tf_wifi_runtime_fail(r,now);
    if(fcntl(r->fd,F_SETFD,FD_CLOEXEC)<0||fcntl(r->fd,F_SETFL,O_NONBLOCK)<0)return tf_wifi_runtime_fail(r,now);
    struct sockaddr_in a;memset(&a,0,sizeof a);a.sin_family=AF_INET;a.sin_port=htons(9460);
    if(inet_pton(AF_INET,"127.0.0.1",&a.sin_addr)!=1)return tf_wifi_runtime_fail(r,now);
    int result=connect(r->fd,(struct sockaddr*)&a,sizeof a);
    if(result<0&&errno!=EINPROGRESS&&errno!=EWOULDBLOCK&&errno!=EINTR)return tf_wifi_runtime_fail(r,now);
    r->phase=result==0?2:1;return 0;
}
/* One zero-time poll and at most one 8 KiB send/receive per call. */
static int tf_wifi_runtime_poll(tf_wifi_runtime*r,uint32_t now) {
    int expired=r->state.valid&&!tf_wifi_state_fresh(&r->state,now);if(expired)tf_wifi_state_reset(&r->state);
    if(r->fd<0)return expired;
    if(!r->enabled||(uint32_t)(now-r->started_at)>=2500)return tf_wifi_runtime_fail(r,now);
    struct pollfd p={r->fd,r->phase<3?POLLOUT:POLLIN,0};int ready=poll(&p,1,0);
    if(ready<0)return errno==EINTR?expired:tf_wifi_runtime_fail(r,now);
    if(!ready)return expired;if(p.revents&POLLNVAL)return tf_wifi_runtime_fail(r,now);
    if(r->phase==1){
        if(!(p.revents&(POLLOUT|POLLERR|POLLHUP)))return expired;int error=0;socklen_t size=sizeof error;
        if(getsockopt(r->fd,SOL_SOCKET,SO_ERROR,&error,&size)<0||error)return tf_wifi_runtime_fail(r,now);r->phase=2;
    }
    if(r->phase==2){
        if(!(p.revents&POLLOUT))return p.revents&(POLLERR|POLLHUP)?tf_wifi_runtime_fail(r,now):expired;
        size_t left=r->request_size-r->sent;if(left>TF_WIFI_IO_BUDGET)left=TF_WIFI_IO_BUDGET;
        ssize_t n=send(r->fd,r->request+r->sent,left,MSG_NOSIGNAL);
        if(n>0){r->sent+=(size_t)n;if(r->sent==r->request_size)r->phase=3;return expired;}
        if(n<0&&(errno==EAGAIN||errno==EWOULDBLOCK||errno==EINTR))return expired;return tf_wifi_runtime_fail(r,now);
    }
    if(!(p.revents&(POLLIN|POLLHUP|POLLERR)))return expired;
    if(r->received==TF_WIFI_RESPONSE_LIMIT)return tf_wifi_runtime_fail(r,now);
    size_t room=TF_WIFI_RESPONSE_LIMIT-r->received;if(room>TF_WIFI_IO_BUDGET)room=TF_WIFI_IO_BUDGET;
    ssize_t n=recv(r->fd,r->raw+r->received,room,0);
    if(n>0){r->received+=(size_t)n;return expired;}
    if(n<0)return errno==EAGAIN||errno==EWOULDBLOCK||errno==EINTR?expired:tf_wifi_runtime_fail(r,now);
    r->raw[r->received]=0;
    /* Reject embedded NUL before calling the existing bounded HTTP decoder. */
    if(memchr(r->raw,0,r->received))return tf_wifi_runtime_fail(r,now);
    char*body=malloc(TF_WIFI_RESPONSE_LIMIT+1);if(!body)return tf_wifi_runtime_fail(r,now);
    int okay=tf_http_decode(r->raw,r->received,body,TF_WIFI_RESPONSE_LIMIT+1)==200;
    if(okay)okay=tf_wifi_state_parse(body,now,r->sequence+1,&r->state);free(body);
    if(!okay)return tf_wifi_runtime_fail(r,now);
    r->sequence++;tf_wifi_runtime_drop(r);return 1;
}
#endif
