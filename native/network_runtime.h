/* Bounded, read-only local network observations. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * No active probes, ubus setters, shell, configuration edits or log writes.
 * Aggregation visibility requires the exact existing factory executable,
 * unchanged PID birthtime and owned outbound established sockets. The factory
 * can receive server endpoints from the cloud, so cached config is not proof.
 */
#ifndef TF_NETWORK_RUNTIME_H
#define TF_NETWORK_RUNTIME_H
#include "network_status.h"
#include <stdint.h>
#include <dirent.h>
#include <time.h>
#include <unistd.h>

#ifndef TF_NETWORK_PROC_ROOT
#define TF_NETWORK_PROC_ROOT "/proc"
#endif
#ifndef TF_NETWORK_ETH_ROOT
#define TF_NETWORK_ETH_ROOT "/sys/class/net/eth0"
#endif
#ifndef TF_NETWORK_RUNTIME_NOW
static uint32_t tf_network_runtime_now(void) {
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}
#define TF_NETWORK_RUNTIME_NOW() tf_network_runtime_now()
#endif

typedef struct {
    int carrier, speed_mbps, factory_online, factory_tunnels;
    int sampled;
    uint32_t sampled_at, next_at;
} tf_network_runtime;
typedef struct { unsigned local_port, remote_port, state; uint32_t remote_ip; unsigned long long inode; } tf_network_tcp;

static void tf_network_runtime_init(tf_network_runtime *r) {
    memset(r, 0, sizeof *r);
    r->carrier = r->speed_mbps = r->factory_online = r->factory_tunnels = -1;
}
static int tf_network_deadline(uint32_t started) { return (uint32_t)(TF_NETWORK_RUNTIME_NOW() - started) < 32; }
static int tf_network_read_small(const char *path, char *out, size_t cap) {
    if (cap < 2) return 0; out[0] = 0;
    FILE *f = fopen(path, "rb"); if (!f) return 0;
    size_t n = fread(out, 1, cap - 1, f); int more = fgetc(f), bad = ferror(f); fclose(f);
    out[n] = 0; return !bad && more == EOF && n > 0;
}
static int tf_network_decimal(const char *text, unsigned long long *out) {
    if (!text || !isdigit((unsigned char)*text)) return 0;
    for (const char *p = text; *p; p++) if (!isdigit((unsigned char)*p)) return 0;
    errno = 0; char *end; *out = strtoull(text, &end, 10); return !errno && !*end;
}
static int tf_network_small_integer(const char *path, int low, int high) {
    char text[64]; if (!tf_network_read_small(path, text, sizeof text)) return -1;
    size_t n = strlen(text); while (n && isspace((unsigned char)text[n-1])) text[--n] = 0;
    unsigned long long value; return tf_network_decimal(text,&value) && value <= (unsigned)high && value >= (unsigned)low ? (int)value : -1;
}
static int tf_network_stat_start(const char *text, unsigned long long *birth) {
    /* comm may contain spaces or parentheses; starttime is field 22. */
    const char *p = strrchr(text, ')'); if (!p || p[1] != ' ') return 0; p += 2;
    for (int field = 3; field <= 22; field++) {
        while (*p == ' ') p++; const char *end = strchr(p, ' ');
        size_t len = end ? (size_t)(end-p) : strlen(p);
        if (field == 22) { char number[32]; if (!len || len >= sizeof number) return 0; memcpy(number,p,len);number[len]=0;return tf_network_decimal(number,birth); }
        if (!end || !len) return 0; p = end + 1;
    }
    return 0;
}
static int tf_network_factory_identity(const char *pid, unsigned long long *birth) {
    char path[256], comm[64], exe[256], stat[2048]; unsigned long long number;
    if (!tf_network_decimal(pid,&number) || !number || number > 4194304) return 0;
    snprintf(path,sizeof path,"%s/%s/comm",TF_NETWORK_PROC_ROOT,pid);
    if (!tf_network_read_small(path,comm,sizeof comm)) return 0;
    size_t n = strlen(comm); while (n && isspace((unsigned char)comm[n-1])) comm[--n] = 0;
    if (strcmp(comm,"zte_icg_agg")) return 0;
    snprintf(path,sizeof path,"%s/%s/exe",TF_NETWORK_PROC_ROOT,pid);
    ssize_t length = readlink(path,exe,sizeof exe-1); if (length < 0 || length >= (ssize_t)sizeof exe-1) return 0; exe[length]=0;
    if (strcmp(exe,"/usr/bin/zte_icg_agg")) return 0;
    snprintf(path,sizeof path,"%s/%s/stat",TF_NETWORK_PROC_ROOT,pid);
    return tf_network_read_small(path,stat,sizeof stat) && tf_network_stat_start(stat,birth);
}
static int tf_network_socket_inode(const char *text, unsigned long long *inode) {
    size_t n = strlen(text); if (n < 10 || n > 40 || memcmp(text,"socket:[",8) || text[n-1]!=']') return 0;
    char digits[32]; n-=9; memcpy(digits,text+8,n);digits[n]=0;
    return tf_network_decimal(digits,inode) && *inode > 0;
}
static int tf_network_hex(const char *text, size_t length, unsigned long long *number) {
    if (!length || length > 16) return 0;
    *number=0;
    for (size_t i=0;i<length;i++) { unsigned char c=(unsigned char)text[i]; int digit=c>='0'&&c<='9'?c-'0':c>='A'&&c<='F'?c-'A'+10:c>='a'&&c<='f'?c-'a'+10:-1; if(digit<0)return 0;*number=(*number<<4)|(unsigned)digit; }
    return 1;
}
static int tf_network_tcp_line(const char *line, tf_network_tcp *row) {
    /* Linux /proc/net/tcp inode is column 10, not the last column (refcounts
     * and timers follow it on real kernels). Never infer ownership by port. */
    char text[1024], *columns[10]; size_t len=strlen(line);if(len>=sizeof text)return 0;memcpy(text,line,len+1);
    char *p=text;for(int i=0;i<10;i++){while(isspace((unsigned char)*p))p++;if(!*p)return 0;columns[i]=p;while(*p&&!isspace((unsigned char)*p))p++;if(*p)*p++=0;}
    if(strlen(columns[1])!=13||strlen(columns[2])!=13||columns[1][8]!=':'||columns[2][8]!=':')return 0;
    unsigned long long local,remote,ip,state;
    if(!tf_network_hex(columns[1]+9,4,&local)||!tf_network_hex(columns[2]+9,4,&remote)||!tf_network_hex(columns[2],8,&ip)||!tf_network_hex(columns[3],strlen(columns[3]),&state)||!tf_network_decimal(columns[9],&row->inode))return 0;
    row->local_port=(unsigned)local;row->remote_port=(unsigned)remote;row->remote_ip=(uint32_t)ip;row->state=(unsigned)state;return 1;
}
static int tf_network_ipv4(const char *ip, uint32_t *encoded) {
    unsigned a,b,c,d; char tail;
    if(sscanf(ip,"%u.%u.%u.%u%c",&a,&b,&c,&d,&tail)!=4||a>223||a==0||a==127||b>255||c>255||d>255)return 0;
    *encoded=a|(b<<8)|(c<<16)|(d<<24);return 1;
}
static int tf_network_factory_enabled(const char *raw) {
    tf_json d;if(!tf_parse(&d,raw))return 0;
    int a=tf_key(&d,0,"aggregation");char source[32]="",transport[20]="";
    tf_gets(&d,a,"source",source,sizeof source);tf_gets(&d,a,"transport",transport,sizeof transport);
    int ok=tf_bool(&d,tf_key(&d,a,"enabled"))==1&&strcmp(source,"icg-v3")&&strcmp(transport,"quic");
    tf_free(&d);return ok;
}
static int tf_network_outbound(const tf_network_tcp *row,const tf_network_tcp *rows,int count){
    unsigned first=row->remote_ip&255;
    if(row->state!=1||!row->local_port||!row->remote_port||!first||first==127||first>=224)return 0;
    for(int j=0;j<count;j++)if(rows[j].state==10&&rows[j].local_port==row->local_port)return 0;
    return 1;
}
static int tf_network_owned(unsigned long long inode,const unsigned long long *owned,int count){for(int i=0;i<count;i++)if(inode==owned[i])return 1;return 0;}
static int tf_network_collect_sockets(const char *pid, unsigned long long *owned, int *count, uint32_t started) {
    char path[256],link[64];snprintf(path,sizeof path,"%s/%s/fd",TF_NETWORK_PROC_ROOT,pid);DIR *dir=opendir(path);if(!dir)return 0;
    int entries=0,ok=1;*count=0;struct dirent *entry;
    while((entry=readdir(dir))){if(!strcmp(entry->d_name,".")||!strcmp(entry->d_name,".."))continue;if(++entries>256||!tf_network_deadline(started)){ok=0;break;}
        unsigned long long fd;if(!tf_network_decimal(entry->d_name,&fd)||fd>1048576){ok=0;break;}
        snprintf(path,sizeof path,"%s/%s/fd/%s",TF_NETWORK_PROC_ROOT,pid,entry->d_name);
        ssize_t n=readlink(path,link,sizeof link-1);if(n<0||n>=(ssize_t)sizeof link-1){ok=0;break;}link[n]=0;
        unsigned long long inode;if(tf_network_socket_inode(link,&inode)&&!tf_network_owned(inode,owned,*count))owned[(*count)++]=inode;
    }
    closedir(dir);return ok;
}
static int tf_network_factory_tunnels(const char *raw, uint32_t started) {
    if(!tf_network_factory_enabled(raw)||!tf_network_deadline(started))return -1;
    DIR *dir=opendir(TF_NETWORK_PROC_ROOT);if(!dir)return -1;
    int entries=0,ok=1;char pid[24]="";unsigned long long birth=0;struct dirent *entry;
    while((entry=readdir(dir))){if(!tf_network_deadline(started)||++entries>4096){ok=0;break;}unsigned long long numeric;if(!tf_network_decimal(entry->d_name,&numeric))continue;
        unsigned long long candidate;if(tf_network_factory_identity(entry->d_name,&candidate)){if(*pid){ok=0;break;}snprintf(pid,sizeof pid,"%s",entry->d_name);birth=candidate;}
    }
    closedir(dir);if(!ok||!*pid)return -1;
    unsigned long long owned[256];int owned_count;if(!tf_network_collect_sockets(pid,owned,&owned_count,started)||!owned_count)return -1;
    char path[256];snprintf(path,sizeof path,"%s/net/tcp",TF_NETWORK_PROC_ROOT);FILE *file=fopen(path,"r");if(!file)return -1;
    tf_network_tcp rows[256];int row_count=0,lines=0;char line[1024];
    while(fgets(line,sizeof line,file)){if(++lines>8192||!tf_network_deadline(started)){ok=0;break;}if(!strchr(line,'\n')&&!feof(file)){ok=0;break;}tf_network_tcp row;
        if(tf_network_tcp_line(line,&row)&&tf_network_owned(row.inode,owned,owned_count)){if(row_count>=256){ok=0;break;}rows[row_count++]=row;}
    }
    if(ferror(file))ok=0;fclose(file);if(!ok||!tf_network_deadline(started))return -1;
    int tunnels=0;
    for(int i=0;i<row_count;i++)if(tf_network_outbound(&rows[i],rows,row_count))tunnels++;
    /* Re-read both process identity and fd ownership. Closing/reusing an fd or
     * a PID during the sample must never manufacture a positive connection. */
    unsigned long long after_birth,after_owned[256];int after_count;
    if(!tf_network_deadline(started)||!tf_network_factory_identity(pid,&after_birth)||after_birth!=birth||!tf_network_collect_sockets(pid,after_owned,&after_count,started))return -1;
    for(int i=0;i<row_count;i++)if(tf_network_outbound(&rows[i],rows,row_count)&&!tf_network_owned(rows[i].inode,after_owned,after_count))return -1;
    /* No proven connection is UNKNOWN, not a claim that the network is down.
     * Match the official STATE_SCHEMA ownership contract; no cached target pin. */
    return tf_network_deadline(started)&&tunnels>0?tunnels:-1;
}
static void tf_network_runtime_refresh(tf_network_runtime *r,const char *raw,uint32_t now_ms) {
    if(r->sampled&&(int32_t)(now_ms-r->next_at)<0)return;
    uint32_t started=TF_NETWORK_RUNTIME_NOW();r->sampled=1;r->sampled_at=now_ms;r->next_at=now_ms+3000;
    r->carrier=tf_network_small_integer(TF_NETWORK_ETH_ROOT "/carrier",0,1);
    r->speed_mbps=r->carrier==1?tf_network_small_integer(TF_NETWORK_ETH_ROOT "/speed",1,100000):-1;
    r->factory_tunnels=tf_network_factory_tunnels(raw,started);
    r->factory_online=r->factory_tunnels>0?1:-1;
}
static void tf_network_runtime_apply(tf_network_status *s,const tf_network_runtime *r,uint32_t now_ms) {
    if(!r->sampled||(uint32_t)(now_ms-r->sampled_at)>6000)return;
    if(s->enabled==1&&!s->aggregation_custom&&s->online<0&&r->factory_online==1){s->online=1;snprintf(s->aggregation_label,sizeof s->aggregation_label,"聚合在线");snprintf(s->aggregation_detail,sizeof s->aggregation_detail,"已确认原厂聚合出站连接");}
}
#endif
