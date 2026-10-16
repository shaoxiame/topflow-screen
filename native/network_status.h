/* Read-only presentation of existing zwrt-datad network fields. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Source contract: zwrt-datad v0.10.79 STATE_SCHEMA.md and rust/src/state.rs.
 * Radio carrier aggregation (CA) uses net.nrca/lteca only. The separate
 * aggregation network service uses aggregation.* / verified factory tunnels.
 * CA count is never evidence of aggregation-network online state.
 * No commands, probes, settings, credentials or persistent state live here. */
#ifndef TF_NETWORK_STATUS_H
#define TF_NETWORK_STATUS_H
#include "control_logic.h"
#include "radio_status.h"
#include <math.h>
#include <stdarg.h>

#define TF_CA_MAX 8
typedef struct {
    int nr, index, pci, band, arfcn;
    double bandwidth, rsrp, sinr;
} tf_carrier;
typedef struct {
    int enabled, online, aggregation_custom, ethernet_carrier, ethernet_path_online;
    int nr_count, lte_count, ca_count, ca_invalid, ca_reported;
    double eth_rx, eth_tx;
    long long remaining_bytes, today_bytes;
    char aggregation_label[64], aggregation_detail[192], mode[32];
    char remaining[40], today[40], ethernet_label[64], ca_summary[96];
    char primary_band[32], primary_bandwidth[32], primary_summary[96];
    tf_carrier ca[TF_CA_MAX];
} tf_network_status;

static int tf_network_number(const tf_json *d, int i, double *out) {
    char value[64], *end; int len;
    if (i < 0 || i >= d->n) return 0;
    if (d->t[i].type == '"') {
        if (!tf_string(d, i, value, sizeof value)) return 0;
    } else if (d->t[i].type == 'n') {
        len = d->t[i].end - d->t[i].start;
        if (len < 1 || len >= (int)sizeof value) return 0;
        memcpy(value, d->s + d->t[i].start, (size_t)len); value[len] = 0;
    } else return 0;
    errno = 0; *out = strtod(value, &end);
    return !errno && end != value && !*end && isfinite(*out);
}
static double tf_network_rate(const tf_json *d, int object, const char *key) {
    double value;
    return tf_network_number(d, tf_key(d, object, key), &value) && value >= 0 ? value : -1;
}
static long long tf_network_bytes(const tf_json *d, int object, const char *key) {
    long long value;
    return tf_int(d, tf_key(d, object, key), &value) && value >= 0 ? value : -1;
}
static void tf_network_format_bytes(char *out, size_t size, long long value) {
    /* Decimal GB matches the byte-valued vendor quota; never manufacture zero. */
    if (value < 0) snprintf(out, size, "—");
    else if (value >= 1000000000LL) snprintf(out, size, "%.2f GB", (double)value / 1e9);
    else if (value >= 1000000) snprintf(out, size, "%.1f MB", (double)value / 1e6);
    else if (value >= 1000) snprintf(out, size, "%.1f KB", (double)value / 1e3);
    else snprintf(out, size, "%lld B", value);
}
static int tf_network_named_item(const tf_json *d, int array, const char *field, const char *name) {
    if (array < 0 || d->t[array].type != '[') return -1;
    for (int i = array + 1; i < d->t[array].next; i = d->t[i].next) {
        char value[96];
        if (tf_gets(d, i, field, value, sizeof value) && !strcmp(value, name)) return i;
    }
    return -1;
}
static void tf_network_aggregation(const tf_json *d, tf_network_status *s) {
    int agg = tf_key(d, 0, "aggregation"), traffic = tf_key(d, agg, "traffic");
    int controller = tf_key(d, agg, "controller"), fresh, custom, online;
    char source[40] = "", transport[20] = "";
    s->enabled = tf_bool(d, tf_key(d, agg, "enabled"));
    s->online = -1;
    tf_gets(d, agg, "mode", s->mode, sizeof s->mode);
    tf_gets(d, agg, "source", source, sizeof source);
    tf_gets(d, agg, "transport", transport, sizeof transport);
    custom = !strcmp(source, "icg-v3") || !strcmp(transport, "quic");
    s->aggregation_custom = custom;
    fresh = tf_bool(d, tf_key(d, agg, "telemetry_fresh"));
    online = tf_bool(d, tf_key(d, agg, "online"));
    long long tunnels = tf_network_bytes(d, agg, custom ? "quic_tunnel_count" : "tcp_tunnel_count");
    long long paths = tf_network_bytes(d, agg, "online_path_count");
    int monitored = tf_bool(d, tf_key(d, controller, "icg_process_running")) == 1;
    const char *label = "状态未知", *detail = "聚合状态暂未提供";
    if (s->enabled == 0) {
        s->online = 0; label = "聚合未启用"; detail = "跟随设备聚合拨钮";
    } else if (s->enabled == 1) {
        /* A false online bit from the legacy collector is not proof of an
         * offline tunnel. Its TCP scanner returns false when inode ownership
         * was never supplied; retain the effective mode but mark visibility. */
        if (custom && fresh == 0) {
            label = "聚合已开启"; detail = "自定义聚合遥测暂不可用";
        } else if (online == 1 || ((custom ? fresh == 1 : monitored) && (tunnels > 0 || (custom && paths > 0)))) {
            s->online = 1; label = "聚合在线"; detail = custom ? "自定义聚合通道已连接" : "原厂聚合通道已连接";
        } else if (custom && fresh == 1) {
            s->online = 0; label = "连接中"; detail = "聚合已开启，尚无已连接通道";
        } else {
            label = "聚合已开启"; detail = "当前接口未提供隧道连接状态";
        }
    }
    snprintf(s->aggregation_label, sizeof s->aggregation_label, "%s", label);
    snprintf(s->aggregation_detail, sizeof s->aggregation_detail, "%s", detail);
    s->remaining_bytes = tf_network_bytes(d, traffic, "remaining_bytes");
    if (s->remaining_bytes < 0) s->remaining_bytes = tf_network_bytes(d, traffic, "remaining_raw");
    s->today_bytes = tf_network_bytes(d, traffic, "today_used_bytes");
    if (s->today_bytes < 0) s->today_bytes = tf_network_bytes(d, traffic, "today_used_raw");
    tf_network_format_bytes(s->remaining, sizeof s->remaining, s->remaining_bytes);
    tf_network_format_bytes(s->today, sizeof s->today, s->today_bytes);
}
static void tf_network_ethernet(const tf_json *d, int carrier, tf_network_status *s) {
    int runtime = tf_key(d, 0, "runtime");
    int item = tf_network_named_item(d, tf_key(d, runtime, "link_rates"), "interface", "eth0");
    int agg = tf_key(d, 0, "aggregation");
    int path = tf_network_named_item(d, tf_key(d, agg, "paths"), "interface", "eth0");
    s->ethernet_carrier = carrier == 0 || carrier == 1 ? carrier : -1;
    s->ethernet_path_online = s->enabled == 1 && s->online == 1 ? tf_bool(d, tf_key(d, path, "online")) : -1;
    s->eth_rx = tf_network_rate(d, item, "rx_bps");
    s->eth_tx = tf_network_rate(d, item, "tx_bps");
    /* netdev rx_bps/tx_bps are bytes per second, despite the suffix. These are
     * physical-port counters, not QUIC payload rates or Internet reachability. */
    const char *label = s->ethernet_carrier == 0 ? "未插网线" : s->ethernet_carrier == 1 ? "已插网线" : "插线状态未知";
    snprintf(s->ethernet_label, sizeof s->ethernet_label, "%s", label);
}
static int tf_network_ca_record(const char *text, size_t length, int nr, tf_carrier *out) {
    if (!length || length >= 512) return 0;
    char row[512]; memcpy(row, text, length); row[length] = 0;
    double fields[11]; char *part = row;
    for (int i = 0; i < 11; i++) {
        char *end, *comma = strchr(part, ',');
        if ((i < 10 && !comma) || (i == 10 && comma)) return 0;
        if (comma) *comma = 0;
        errno = 0; fields[i] = strtod(part, &end);
        if (errno || end == part || !isfinite(fields[i])) return 0;
        while (isspace((unsigned char)*end)) end++;
        if (*end) return 0;
        part = comma ? comma + 1 : end;
    }
    int integer_fields[] = {0, 1, 3, 4};
    for (int i = 0; i < 4; i++) if (floor(fields[integer_fields[i]]) != fields[integer_fields[i]]) return 0;
    if (fields[0] < 0 || fields[0] > 63 || fields[1] < 0 || fields[1] > (nr ? 1007 : 503) ||
        fields[3] < 1 || fields[3] > 512 || fields[4] < 1 || fields[4] > (nr ? 3279165 : 262143)) return 0;
    out->nr = nr; out->index = (int)fields[0]; out->pci = (int)fields[1]; out->band = (int)fields[3]; out->arfcn = (int)fields[4];
    out->bandwidth = fields[5] > 0 && fields[5] <= 400 ? fields[5] : -1;
    out->rsrp = fields[7] >= -160 && fields[7] <= -20 ? fields[7] : NAN;
    out->sinr = fields[9] >= -30 && fields[9] <= 60 ? fields[9] : NAN;
    return 1;
}
static void tf_network_ca_list(const tf_json *d, int net, const char *key, int nr, tf_network_status *s) {
    char text[8192];
    int token = tf_key(d, net, key);
    if (token < 0) return;
    if (!tf_string(d, token, text, sizeof text)) { s->ca_invalid++; return; }
    s->ca_reported++;
    const char *p = text;
    for (int i = 0; *p && i < 64; i++) {
        const char *semi = strchr(p, ';'); size_t length = semi ? (size_t)(semi - p) : strlen(p);
        tf_carrier carrier;
        if (length && tf_network_ca_record(p, length, nr, &carrier)) {
            int duplicate = 0;
            for (int j = 0; j < s->ca_count; j++) {
                tf_carrier *prior = &s->ca[j];
                if (prior->nr == nr && prior->pci == carrier.pci && prior->arfcn == carrier.arfcn) duplicate = 1;
            }
            if (!duplicate) {
                if (nr) s->nr_count++; else s->lte_count++;
                if (s->ca_count < TF_CA_MAX) s->ca[s->ca_count++] = carrier;
            }
        } else if (length) s->ca_invalid++;
        if (!semi) break; p = semi + 1;
    }
}
static void tf_network_primary_carrier(const tf_json *d, int net, tf_network_status *s) {
    char type[32]="",band[32]="",*end;double bandwidth;
    tf_gets(d,net,"type",type,sizeof type);
    const char*label=tf_radio_label(type);int nr=!strncmp(label,"5G",2);
    if(!nr&&strcmp(label,"4G")&&strcmp(label,"4G+"))return;
    if(!tf_gets(d,net,nr?"nr_band":"band",band,sizeof band))return;
    const char *digits=band;if(*digits=='n'||*digits=='N'||*digits=='b'||*digits=='B')digits++;
    if(!isdigit((unsigned char)*digits))return;long value=strtol(digits,&end,10);
    if(*end||value<1||value>512)return;
    snprintf(s->primary_band,sizeof s->primary_band,"%c%ld",nr?'n':'B',value);
    /* nr_bw is explicit MHz in the state contract; never infer bandwidth from
     * allowed-band lists, duplex mode or the number of CA descriptors. */
    if(nr&&tf_network_number(d,tf_key(d,net,"nr_bw"),&bandwidth)&&bandwidth>0&&bandwidth<=400)
        snprintf(s->primary_bandwidth,sizeof s->primary_bandwidth,"%.1f MHz",bandwidth);
    snprintf(s->primary_summary,sizeof s->primary_summary,"%s · %s",s->primary_band,s->primary_bandwidth);
}
/* carrier is a separately read kernel eth0 carrier (0/1); pass -1 when not
 * available. A byte counter, client count or bridge-up bit must not replace it. */
static void tf_network_status_parse(const char *raw, int carrier, tf_network_status *s) {
    memset(s, 0, sizeof *s);
    s->enabled = s->online = s->ethernet_path_online = -1;
    s->ethernet_carrier = carrier == 0 || carrier == 1 ? carrier : -1;
    s->remaining_bytes = s->today_bytes = -1; s->eth_rx = s->eth_tx = -1;
    snprintf(s->aggregation_label, sizeof s->aggregation_label, "状态未知");
    snprintf(s->aggregation_detail, sizeof s->aggregation_detail, "聚合状态暂不可用");
    snprintf(s->remaining, sizeof s->remaining, "—"); snprintf(s->today, sizeof s->today, "—");
    snprintf(s->ethernet_label, sizeof s->ethernet_label, carrier == 0 ? "未插网线" : carrier == 1 ? "已插网线" : "插线状态未知");
    snprintf(s->ca_summary, sizeof s->ca_summary, "载波数据暂不可用");
    snprintf(s->primary_band,sizeof s->primary_band,"—");
    snprintf(s->primary_bandwidth,sizeof s->primary_bandwidth,"—");
    snprintf(s->primary_summary,sizeof s->primary_summary,"主载波数据暂不可用");
    tf_json d; if (!tf_parse(&d, raw)) return;
    tf_network_aggregation(&d, s); tf_network_ethernet(&d, carrier, s);
    int net = tf_key(&d, 0, "net");
    tf_network_primary_carrier(&d,net,s);
    tf_network_ca_list(&d, net, "nrca", 1, s); tf_network_ca_list(&d, net, "lteca", 0, s);
    if (s->nr_count && s->lte_count) snprintf(s->ca_summary, sizeof s->ca_summary, "NR %d 路 · LTE %d 路", s->nr_count, s->lte_count);
    else if (s->nr_count) snprintf(s->ca_summary, sizeof s->ca_summary, "NR %d 路载波", s->nr_count);
    else if (s->lte_count) snprintf(s->ca_summary, sizeof s->ca_summary, "LTE %d 路载波", s->lte_count);
    else if (s->ca_invalid) snprintf(s->ca_summary, sizeof s->ca_summary, "载波数据无法解析");
    else if (s->ca_reported) snprintf(s->ca_summary, sizeof s->ca_summary, "当前未报告附加载波");
    tf_free(&d);
}
static int tf_network_append(char *out, size_t cap, size_t *used, const char *format, ...) {
    if (*used >= cap) return 0;
    va_list args; va_start(args, format);
    int n = vsnprintf(out + *used, cap - *used, format, args); va_end(args);
    if (n < 0 || (size_t)n >= cap - *used) { out[0] = 0; *used = cap; return 0; }
    *used += (size_t)n; return 1;
}
static int tf_network_ca_html(const tf_network_status *s, char *out, size_t cap) {
    size_t used = 0; if (!cap) return 0; out[0] = 0;
    if(strcmp(s->primary_band,"—")&&!tf_network_append(out,cap,&used,
        "<div class='card ca-card'><div class='cardtitle'>当前主载波 <span class='tag'>%s</span></div><div class='row last'><span class='key'>带宽</span><span class='value'>%s</span></div></div>",s->primary_band,s->primary_bandwidth))return 0;
    if (!s->ca_count) return tf_network_append(out, cap, &used, "<p class='note'>%s</p>", s->ca_summary);
    for (int i = 0; i < s->ca_count; i++) {
        const tf_carrier *c = &s->ca[i]; char bw[32], rsrp[32], sinr[32];
        if (c->bandwidth > 0) snprintf(bw, sizeof bw, "%.1f MHz", c->bandwidth); else strcpy(bw, "—");
        if (isfinite(c->rsrp)) snprintf(rsrp, sizeof rsrp, "%.1f dBm", c->rsrp); else strcpy(rsrp, "—");
        if (isfinite(c->sinr)) snprintf(sinr, sizeof sinr, "%.1f dB", c->sinr); else strcpy(sinr, "—");
        if (!tf_network_append(out, cap, &used,
            "<div class='card ca-card'><div class='cardtitle'>%s 载波 %d <span class='tag'>%c%d</span></div>"
            "<div class='row'><span class='key'>PCI / ARFCN</span><span class='value'>%d / %d</span></div>"
            "<div class='row'><span class='key'>带宽</span><span class='value'>%s</span></div>"
            "<div class='row last'><span class='key'>RSRP / SINR</span><span class='value'>%s / %s</span></div></div>",
            c->nr ? "5G" : "4G", c->index + 1, c->nr ? 'n' : 'B', c->band, c->pci, c->arfcn, bw, rsrp, sinr)) return 0;
    }
    if (s->nr_count + s->lte_count > s->ca_count && !tf_network_append(out, cap, &used, "<p class='note'>仅展示前 %d 路已报告载波</p>", s->ca_count)) return 0;
    return 1;
}
#endif
