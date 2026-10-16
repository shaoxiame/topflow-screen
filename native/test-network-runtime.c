#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <sys/types.h>
#include <direct.h>

static uint32_t test_clock=1000,clock_step;
static uint32_t mock_now(void){test_clock+=clock_step;return test_clock;}
static ssize_t mock_readlink(const char *path,char *buffer,size_t cap);
#define readlink mock_readlink
#define TF_NETWORK_RUNTIME_NOW() mock_now()
#define TF_NETWORK_PROC_ROOT "native/build-preview/network-proc-018"
#define TF_NETWORK_ETH_ROOT "native/build-preview/network-eth-018"
#include "network_runtime.h"

static int identity_reads,change_birth,change_owner,fd_reads;
static void put(const char *path,const char *text){FILE*f=fopen(path,"wb");assert(f);assert(fwrite(text,1,strlen(text),f)==strlen(text));fclose(f);}
static void write_stat(const char *pid,unsigned birth){char path[256],text[1024];snprintf(path,sizeof path,"%s/%s/stat",TF_NETWORK_PROC_ROOT,pid);int n=snprintf(text,sizeof text,"%s (zte_icg_agg) S",pid);for(int i=4;i<22;i++)n+=snprintf(text+n,sizeof text-(size_t)n," 0");snprintf(text+n,sizeof text-(size_t)n," %u 0 0\n",birth);put(path,text);}
static ssize_t mock_readlink(const char *path,char *buffer,size_t cap){
    if(strstr(path,"/9999/exe")){identity_reads++;if(change_birth&&identity_reads==2)write_stat("9999",43);}
    if(strstr(path,"/9999/fd/4")){fd_reads++;if(change_owner&&fd_reads==2){const char *changed="socket:[99999]";size_t n=strlen(changed);if(n>cap)n=cap;memcpy(buffer,changed,n);return (ssize_t)n;}}
    FILE*f=fopen(path,"rb");if(!f)return -1;size_t n=fread(buffer,1,cap,f);fclose(f);return(ssize_t)n;
}
static const char *snapshot="{\"aggregation\":{\"enabled\":true,\"online\":false,\"controller\":{\"icg_process_running\":false},\"server\":{\"ip\":\"203.0.113.7\",\"tcp_port\":4444}}}";
static const char *tcp_header="  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n";
static const char *outgoing="   0: 0100000A:9C40 077100CB:115C 01 00000000:00000000 00:00000000 00000000 0 0 1234 1 0000000000000000 20 4 28 10 -1\n";
static void tcp(const char *rows){char text[4096];snprintf(text,sizeof text,"%s%s",tcp_header,rows);put(TF_NETWORK_PROC_ROOT "/net/tcp",text);}
static void reset(void){identity_reads=fd_reads=change_birth=change_owner=0;clock_step=0;test_clock=1000;put(TF_NETWORK_PROC_ROOT "/9999/exe","/usr/bin/zte_icg_agg");write_stat("9999",42);tcp(outgoing);}
static void pure_parsers(void){
    tf_network_tcp row;assert(tf_network_tcp_line(outgoing,&row));assert(row.inode==1234&&row.remote_ip==0x077100CB&&row.remote_port==4444&&row.state==1&&row.local_port==40000);
    assert(!tf_network_tcp_line("broken line",&row));
    unsigned long long inode;assert(tf_network_socket_inode("socket:[1234]",&inode)&&inode==1234);assert(!tf_network_socket_inode("socket:[1234]bad",&inode));assert(!tf_network_socket_inode("/etc/config",&inode));
    uint32_t ip;assert(tf_network_ipv4("203.0.113.7",&ip)&&ip==0x077100CB);assert(!tf_network_ipv4("127.0.0.1",&ip));assert(!tf_network_ipv4("1.2.3.256",&ip));assert(!tf_network_ipv4("1.2.3.4x",&ip));
    assert(tf_network_factory_enabled("{\"aggregation\":{\"enabled\":true,\"server\":{\"ip\":\"\",\"tcp_port\":0}}}"));
}
static void actual_reader(void){
    reset();assert(tf_network_factory_tunnels(snapshot,1000)==1);
    /* An unrelated socket, inbound management connection, loopback,
     * malformed identity or changed PID/fd may never prove aggregation. */
    tcp("0: 0100000A:9C40 077100CB:115C 01 00000000:00000000 00:00000000 00000000 0 0 9999 1 20\n");assert(tf_network_factory_tunnels(snapshot,1000)==-1);
    /* Runtime cloud endpoints need not match the stale static config. */
    reset();tcp("0: 0100000A:9C40 087100CB:115C 01 00000000:00000000 00:00000000 00000000 0 0 1234 1 20\n");assert(tf_network_factory_tunnels(snapshot,1000)==1);
    reset();tcp("0: 0100000A:9C40 077100CB:01BB 01 00000000:00000000 00:00000000 00000000 0 0 1234 1 20\n");assert(tf_network_factory_tunnels(snapshot,1000)==1);
    assert(tf_network_factory_tunnels("{\"aggregation\":{\"enabled\":true}}",1000)==1);
    reset();tcp("0: 0100007F:9C40 0100007F:115C 01 00000000:00000000 00:00000000 00000000 0 0 1234 1 20\n");assert(tf_network_factory_tunnels(snapshot,1000)==-1);
    reset();tcp("0: 0100000A:9C40 077100CB:115C 02 00000000:00000000 00:00000000 00000000 0 0 1234 1 20\n");assert(tf_network_factory_tunnels(snapshot,1000)==-1);
    reset();char lines[2048];snprintf(lines,sizeof lines,"%s%s",outgoing,"1: 00000000:9C40 00000000:0000 0A 00000000:00000000 00:00000000 00000000 0 0 1235 1 20\n");tcp(lines);assert(tf_network_factory_tunnels(snapshot,1000)==-1);
    reset();put(TF_NETWORK_PROC_ROOT "/9999/exe","/tmp/zte_icg_agg");assert(tf_network_factory_tunnels(snapshot,1000)==-1);
    reset();change_birth=1;assert(tf_network_factory_tunnels(snapshot,1000)==-1);
    reset();change_owner=1;assert(tf_network_factory_tunnels(snapshot,1000)==-1);
    reset();clock_step=5;assert(tf_network_factory_tunnels(snapshot,1000)==-1);
    reset();const char *disabled="{\"aggregation\":{\"enabled\":false,\"server\":{\"ip\":\"203.0.113.7\",\"tcp_port\":4444}}}";assert(tf_network_factory_tunnels(disabled,1000)==-1);
    const char *custom="{\"aggregation\":{\"enabled\":true,\"source\":\"icg-v3\",\"server\":{\"ip\":\"203.0.113.7\",\"tcp_port\":4444}}}";assert(tf_network_factory_tunnels(custom,1000)==-1);
}
static void cache(void){
    reset();tf_network_runtime r;tf_network_runtime_init(&r);assert(r.carrier==-1&&r.factory_online==-1);
    tf_network_runtime_refresh(&r,snapshot,1000);assert(r.carrier==1&&r.speed_mbps==1000&&r.factory_online==1&&r.factory_tunnels==1);
    int reads=identity_reads;tf_network_runtime_refresh(&r,snapshot,2000);assert(identity_reads==reads);
    tf_network_status s;tf_network_status_parse(snapshot,r.carrier,&s);assert(s.online==-1);tf_network_runtime_apply(&s,&r,2000);assert(s.online==1&&!strcmp(s.aggregation_label,"聚合在线"));
    tf_network_status_parse("{\"aggregation\":{\"enabled\":true,\"online\":false,\"tcp_tunnel_count\":0,\"controller\":{\"icg_process_running\":true}}}",r.carrier,&s);assert(s.online==-1);tf_network_runtime_apply(&s,&r,2000);assert(s.online==1);
    tf_network_status_parse(snapshot,r.carrier,&s);tf_network_runtime_apply(&s,&r,7001);assert(s.online==-1);
    tf_network_status_parse("{\"aggregation\":{\"enabled\":true,\"source\":\"icg-v3\",\"telemetry_fresh\":false}}",r.carrier,&s);tf_network_runtime_apply(&s,&r,2000);assert(s.online==-1);
    put(TF_NETWORK_ETH_ROOT "/carrier","0\n");tf_network_runtime_refresh(&r,"{}",4000);assert(r.carrier==0&&r.speed_mbps==-1&&r.factory_online==-1);
    put(TF_NETWORK_ETH_ROOT "/carrier","garbage\n");tf_network_runtime_refresh(&r,"{}",7000);assert(r.carrier==-1);
}
int main(void){
    _mkdir(TF_NETWORK_PROC_ROOT);_mkdir(TF_NETWORK_PROC_ROOT "/9999");_mkdir(TF_NETWORK_PROC_ROOT "/9999/fd");_mkdir(TF_NETWORK_PROC_ROOT "/net");_mkdir(TF_NETWORK_ETH_ROOT);
    put(TF_NETWORK_PROC_ROOT "/9999/comm","zte_icg_agg\n");put(TF_NETWORK_PROC_ROOT "/9999/fd/4","socket:[1234]");put(TF_NETWORK_PROC_ROOT "/9999/fd/5","socket:[1235]");put(TF_NETWORK_ETH_ROOT "/carrier","1\n");put(TF_NETWORK_ETH_ROOT "/speed","1000\n");
    pure_parsers();actual_reader();cache();
    puts("PASS: read-only fake-proc runtime: exact factory identity + owned outbound established socket, cloud endpoint changes, inbound/loopback exclusion, PID/fd rechecks, deadlines, 3s cache, Ethernet carrier/speed");return 0;
}
