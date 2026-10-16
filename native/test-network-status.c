#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "network_status.h"

static char *read_fixture(const char *path) {
    FILE *f = fopen(path, "rb"); assert(f);
    fseek(f, 0, SEEK_END); long n = ftell(f); rewind(f); assert(n > 0 && n < 65536);
    char *text = calloc((size_t)n + 1, 1); assert(text);
    assert(fread(text, 1, (size_t)n, f) == (size_t)n); fclose(f); return text;
}
static void aggregation(void) {
    tf_network_status s;
    tf_network_status_parse("{\"aggregation\":{\"enabled\":true,\"online\":false,\"state\":\"waiting\",\"controller\":{\"icg_process_running\":false},\"tcp_tunnel_count\":0}}", -1, &s);
    assert(s.enabled == 1 && s.online == -1 && !strcmp(s.aggregation_label,"聚合已开启"));
    assert(strstr(s.aggregation_detail,"未提供") && strcmp(s.aggregation_label,"等待上线"));
    tf_network_status_parse("{\"aggregation\":{\"enabled\":true,\"online\":false,\"controller\":{\"icg_process_running\":true},\"tcp_tunnel_count\":0}}", -1, &s);
    assert(s.online == -1 && !strcmp(s.aggregation_label,"聚合已开启"));
    tf_network_status_parse("{\"aggregation\":{\"enabled\":true,\"online\":true}}", -1, &s);
    assert(s.online == 1 && !strcmp(s.aggregation_label,"聚合在线"));
    tf_network_status_parse("{\"aggregation\":{\"enabled\":false,\"online\":true}}", -1, &s);
    assert(s.enabled == 0 && s.online == 0 && !strcmp(s.aggregation_label,"聚合未启用"));
    tf_network_status_parse("{\"aggregation\":{\"enabled\":true,\"source\":\"icg-v3\",\"telemetry_fresh\":false,\"online\":true,\"quic_tunnel_count\":4}}", -1, &s);
    assert(s.online == -1 && strstr(s.aggregation_detail,"遥测"));
    tf_network_status_parse("{\"aggregation\":{\"enabled\":true,\"source\":\"icg-v3\",\"telemetry_fresh\":true,\"online\":false,\"online_path_count\":2}}", -1, &s);
    assert(s.online == 1);
    tf_network_status_parse("{\"aggregation\":{\"enabled\":true,\"source\":\"icg-v3\",\"telemetry_fresh\":true,\"online\":false,\"quic_tunnel_count\":0}}", -1, &s);
    assert(s.online == 0);
    tf_network_status_parse(NULL, -1, &s); assert(s.enabled == -1 && s.online == -1 && s.eth_rx < 0);
    tf_network_status_parse("{\"aggregation\":{\"enabled\":\"bad\",\"online\":true}}", -1, &s); assert(s.enabled == -1 && s.online == -1);
}
static void quota_and_ethernet(void) {
    tf_network_status s;
    tf_network_status_parse("{\"aggregation\":{\"traffic\":{\"remaining_bytes\":null,\"remaining_raw\":\"9316368043\",\"today_used_bytes\":0}},\"runtime\":{\"link_rates\":[{\"interface\":\"eth0\",\"rx_bps\":125000,\"tx_bps\":250000}]} }", -1, &s);
    assert(s.remaining_bytes == 9316368043LL && !strcmp(s.remaining,"9.32 GB"));
    assert(!strcmp(s.today,"0 B") && s.eth_rx == 125000 && s.eth_tx == 250000);
    assert(s.ethernet_carrier == -1 && !strcmp(s.ethernet_label,"插线状态未知"));
    tf_network_status_parse("{\"aggregation\":{\"traffic\":{\"remaining_bytes\":-1,\"today_used_bytes\":null}},\"runtime\":{\"link_rates\":[{\"interface\":\"eth0\",\"rx_bps\":null,\"tx_bps\":-1}]} }", 0, &s);
    assert(s.remaining_bytes == -1 && !strcmp(s.remaining,"—") && s.today_bytes == -1);
    assert(s.eth_rx == -1 && s.eth_tx == -1 && !strcmp(s.ethernet_label,"未插网线"));
    tf_network_status_parse("{}",1,&s); assert(!strcmp(s.ethernet_label,"已插网线") && s.ethernet_path_online == -1);
    tf_network_status_parse("{\"aggregation\":{\"traffic\":{\"remaining_bytes\":9223372036854775808,\"remaining_raw\":\"bad\",\"today_used_raw\":\"false\"}}}",-1,&s);
    assert(s.remaining_bytes == -1 && s.today_bytes == -1);
}
static void carriers(void) {
    tf_network_status s; char html[8192], tiny[10];
    /* First descriptor is copied exactly from official STATE_SCHEMA.md:89.
     * Additional rows are contract boundary fixtures, never device payloads. */
    tf_network_status_parse("{\"net\":{\"nrca\":\"0,273,1,41,504990,100,0,-140.0,-43.0,-23.0,-120.0;1,194,1,78,627264,100,0,-90,-10,18,-60;\",\"lteca\":\"0,0,1,1,100,20,0,-99,-10,10,-60;\"}}",-1,&s);
    assert(s.nr_count == 2 && s.lte_count == 1 && s.ca_count == 3 && !s.ca_invalid);
    assert(s.enabled == -1 && s.online == -1); /* CA is not aggregation networking. */
    assert(s.ca[0].pci == 273 && s.ca[0].band == 41 && s.ca[0].arfcn == 504990);
    assert(s.ca[2].pci == 0 && s.ca[2].bandwidth == 20);
    assert(tf_network_ca_html(&s,html,sizeof html) && strstr(html,"n41") && strstr(html,"B1") && strstr(html,"504990") && strstr(html,"-23.0 dB"));
    assert(!tf_network_ca_html(&s,tiny,sizeof tiny) && !*tiny);
    tf_network_status_parse("{\"net\":{\"nrca\":\"0,273,1,41,504990,100,0,-140.0,-43.0,-23.0,-120.0;0,273,1,41,504990,100,0,-140.0,-43.0,-23.0,-120.0;\",\"lteca\":\"\"}}",-1,&s);
    assert(s.ca_count == 1 && s.nr_count == 1);
    tf_network_status_parse("{\"net\":{\"nrca\":\"0,65535,1,78,627264,100,0,-90,-10,18,-60;bad<script>;\",\"lteca\":\"\"}}",-1,&s);
    assert(!s.ca_count && s.ca_invalid == 2 && tf_network_ca_html(&s,html,sizeof html));
    assert(!strstr(html,"script") && strstr(html,"无法解析"));
    tf_network_status_parse("{\"net\":{\"nrca\":\"\",\"lteca\":\"\"}}",-1,&s);
    assert(!s.ca_count && !strcmp(s.ca_summary,"当前未报告附加载波"));
    tf_carrier c;
    const char *bad[] = {"0,0,1,1,0,20,0,-90,-10,10,-60", "0,0,1,1,100,20,0,NaN,-10,10,-60", "0,0,1,1,100,20,0,-90,-10,10,-60,1", "0,0,1,1,100,20,0,-90,-10,10"};
    for (int i=0;i<4;i++)assert(!tf_network_ca_record(bad[i],strlen(bad[i]),0,&c));
}
int main(int argc, char **argv) {
    assert(argc == 2); tf_network_status s; char *observed = read_fixture(argv[1]);
    tf_network_status_parse(observed, 0, &s); free(observed);
    assert(s.enabled == 0 && s.remaining_bytes == 10000000000LL && s.today_bytes == 100000);
    assert(s.eth_rx == 0 && s.eth_tx == 0 && s.ethernet_carrier == 0 && !s.ca_count);
    assert(!strcmp(s.primary_band,"n78")&&!strcmp(s.primary_bandwidth,"100.0 MHz"));
    char primary_html[8192];assert(tf_network_ca_html(&s,primary_html,sizeof primary_html)&&strstr(primary_html,"当前主载波")&&strstr(primary_html,"100.0 MHz"));
    
    const char*radio_raw[]={"sa","NR5G-NSA","endc","5GA","lte","LTE_CA","not-SA","Only_5G","3G"};
    for(int i=0;i<9;i++){char sample[256];snprintf(sample,sizeof sample,"{\"net\":{\"type\":\"%s\",\"nr_band\":\"n78\",\"band\":\"B3\",\"nr_bw\":\"100\"}}",radio_raw[i]);tf_network_status_parse(sample,-1,&s);assert(!strcmp(s.primary_band,i<4?"n78":i<6?"B3":"—"));}

    aggregation(); quota_and_ethernet(); carriers();
    puts("PASS: observed sanitized 018 snapshot + official schema: aggregation observability, quota, Ethernet carrier/rates, bounded validated NR/LTE carriers");
    return 0;
}
