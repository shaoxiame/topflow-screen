/* Completely synthetic, deterministic local preview data. Never bundled in TXT. */
const TF_FIXTURES = (() => {
  const makeModem = (id, enabled, rx, tx) => ({
    id, role: id === '5G' ? 'integrated_5g' : 'external_4g',
    sim: {state: enabled ? 'sim ready' : 'no sim', slot: 0},
    net: enabled ? {operator: id === '4G1' ? '示例移动' : '示例联通', type: id === '5G' ? 'SA' : 'LTE', band: id === '5G' ? 'n78' : 'B3', bars: 4, nr_rsrp: -88, nr_rsrq: -11, nr_snr: '21', nr_channel: 620000, nr_pci: 123, lte_rsrp: -92, lte_rsrq: -12, lte_snr: '15'} : {},
    traffic: {rx_speed: enabled ? rx : 0, tx_speed: enabled ? tx : 0},
    qos: enabled ? {qci: 6, ambr_dl: '1000', ambr_ul: '100'} : {},
    wwan: {status: enabled ? 'ipv4_ipv6_connected' : 'disconnected'},
    usb: id === '5G' ? null : {present: enabled, carrier: enabled ? 1 : 0}
  });
  const makeState = aggregate => ({
    version: '0.10.79', ts: 1800000000, sample_interval_ms: 1000,
    battery: {percent: 80, temp: 34, charging: 1, charger_connect: 1},
    system: {cpu_temp: 46, cpu_usage: 24, mem_used_pct: 35, uptime: 3600},
    thermal: {cpu_celsius: 46}, net: {operator: '示例联通', type: 'SA', band: 'n78'},
    aggregation: {enabled: aggregate, online: aggregate, mode: aggregate ? 'SMULTIWAN' : 'MULTIWAN', state: aggregate ? 'online' : 'disabled', traffic: {remaining_bytes: 120000000000, today_used_bytes: 2000000000}},
    clients: {total: 2, wifi: 2, list: []},
    wlan: {enabled: 1, bands: [{band: '2g', enabled: 1, ssid: 'EXAMPLE-2G'}, {band: '5g', enabled: 1, ssid: 'EXAMPLE-5G'}]},
    modems: [makeModem('5G', true, 30000000, 4000000), makeModem('4G1', aggregate, 8000000, 1000000), makeModem('4G2', aggregate, 6000000, 500000)],
    factory: {modems: {'4G1': {enabled: aggregate, flight: aggregate ? 'off' : 'on'}, '4G2': {enabled: aggregate, flight: aggregate ? 'off' : 'on'}}}
  });
  const history = aggregate => Array.from({length: 30}, (_, i) => {
    const main = {rx: Math.round(25000000 + Math.sin(i / 3) * 5000000), tx: Math.round(3000000 + Math.sin(i / 4) * 800000)};
    const second = {rx: aggregate ? 7000000 : 0, tx: aggregate ? 1000000 : 0};
    const third = {rx: aggregate ? 5000000 : 0, tx: aggregate ? 500000 : 0};
    return {'5G': main, '4G1': second, '4G2': third, total: {rx: main.rx + second.rx + third.rx, tx: main.tx + second.tx + third.tx}};
  });
  return {normal: makeState(false), aggregate: makeState(true), normalHistory: history(false), aggregateHistory: history(true)};
})();
if (typeof module !== 'undefined') module.exports = TF_FIXTURES;
