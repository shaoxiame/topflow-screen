/* TopFlow adapter. Static protocol review: zwrt-datad 0.10.79 + downloaded UFI frontend.
 * No network request or device change occurs when loading this module.
 * Native screen ownership/switching is intentionally not implemented here.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TopflowDeviceAPI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MODEMS = ['5G', '4G1', '4G2'];
  const STATUS_CMD = 'net,sim,interfaces,traffic,thermal,battery,wlan,modems,aggregation,power,sleep,cooling,sim_states,modem_main_state,pin_status,sim_slot,dual_sim,real_rx_speed,real_tx_speed,qci,ambr_dl_max,ambr_ul_max,cpu_temp,cpu_usage,mem_usage,battery_value,battery_temperature,wifi_access_sta_num,network_type,network_provider_fullname,lock_nr_cell,lock_lte_cell,sms_unread_num,uptime';
  // Vendor APN namespaces, not physical SIM slots or WWAN subid values.
  const APN_TARGETS = Object.freeze({'5G': 1, '4G1': 201, '4G2': 101});
  const FACTORY_PREFIX = 'TOPFLOW_FACTORY_V1=';
  const FACTORY_KEYS = Object.freeze({'4G1':'V3E2', '4G2':'V3E1'});
  const SIM_SOURCE_FIELDS = Object.freeze({'5G':'st_slot','4G1':'v3t_2_st_slot','4G2':'v3t_1_st_slot'});
  const SIM_SOURCE_PREFIX = 'TOPFLOW_SIM_SOURCE_V1=';
  const QOS_MODES = Object.freeze(['Ai_mode','Live_mode','Chat_mode','Game_mode','Video_mode','Nomal_mode']);
  const POWER_READ = 'ubus call zwrt_mc.device.manager get_device_info \'{"deviceInfoList":["mode_main_state","quicken_power_on","power_saver_mode","bat_temperature_level"]}\'';
  const WIFI_CMD = 'queryWiFiModuleSwitch,queryAccessPointInfo,queryWirelessConfig,WiFiDualBandSupported,WiFiDualBandEnabled,BandSteeringSwitch';
  const BANDS_CMD = 'net_select,lte_supported_bands,nr_sa_supported_bands,nr_nsa_supported_bands,lte_band,lte_band_lock,nr_band_lock,nr_nsa_band_lock,lock_nr_cell,lock_lte_cell';
  const NETWORK_MODES = Object.freeze([
    {value: 'WL_AND_5G', label: '自动 5G / 4G / 3G'}, {value: 'LTE_AND_5G', label: '5G NSA'},
    {value: 'Only_5G', label: '5G SA'}, {value: 'WCDMA_AND_LTE', label: '4G / 3G'},
    {value: 'Only_LTE', label: '仅 4G'}, {value: 'Only_WCDMA', label: '仅 3G'},
  ]);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const array = value => Array.isArray(value) ? value : [];
  const number = value => value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) ? null : Number(value);
  const positive = value => { const n = number(value); return n !== null && n > 0 ? n : null; };
  const qosRate = value => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(value))) return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const qosClass = value => typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value) ? ranged(value,1,255,true) : null;
  const nonnegative = value => { const n = number(value); return n !== null && n >= 0 ? n : null; };
  const bool = value => [true, 1, '1'].includes(value) ? true : [false, 0, '0'].includes(value) ? false : null;
  const first = (...values) => values.find(value => value !== null && value !== undefined && value !== '');
  const str = value => value === null || value === undefined ? '' : String(value);
  const error = (code, message) => Object.assign(new Error(message), {code});
  const bytes = text => new TextEncoder().encode(text).length;
  const operators = {'China Unicom': '中国联通', 'China Mobile': '中国移动', 'China Telecom': '中国电信'};

  // Match native/radio_status.h. The modem's reported radio type is separate
  // from its hardware id, configured network mode, CA carriers and aggregation.
  function normalizeRadioLabel(raw) {
    if (typeof raw !== 'string' || /[^\x00-\x7f]/.test(raw)) return '—';
    const value = raw.replace(/[\t\n\v\f\r _-]/g, '').toUpperCase();
    if (value.length > 63) return '—';
    if (['5GA', '5GADVANCED'].includes(value)) return '5G-A';
    if (['NSA', '5GNSA', 'NR5GNSA', 'ENDC'].includes(value)) return '5G NSA';
    if (['SA', '5GSA', 'NR5GSA'].includes(value)) return '5G SA';
    if (['5G', 'NR', 'NR5G'].includes(value)) return '5G';
    if (['4G+', 'LTE+', 'LTECA', 'LTEA'].includes(value)) return '4G+';
    if (['4G', 'LTE'].includes(value)) return '4G';
    if (['3G', 'WCDMA', 'UMTS', 'HSPA', 'HSDPA', 'HSUPA'].includes(value)) return '3G';
    if (['HSPA+', '3G+'].includes(value)) return '3G+';
    if (['2G', 'GSM', 'GPRS', 'EDGE'].includes(value)) return '2G';
    return '—';
  }

  function ranged(value, min, max, integral) {
    const n = number(value);
    return n === null || n < min || n > max || integral && !Number.isSafeInteger(n) ? null : n;
  }
  // Datad forwards zwrt_bsp.charger.charge_status (1/2/3/4), while
  // charger_connect only confirms external power. Never infer full from %.
  function normalizeBattery(value, fallback = {}) {
    const battery=obj(value), status=ranged(battery.charging,0,4,true), connected=bool(battery.charger_connect);
    let state='unknown', label='充电状态未知', mark='?', charging=null;
    if(status===1){if(connected===false)label='充电状态待确认';else{state='charging';label='充电中';mark='';charging=true;}}
    else if(status===4){state='full';label='已充满';mark='满';charging=false;}
    else if(status===2){state=connected===true?'plugged':'discharging';label=connected===true?'已插电 · 电池供电':'电池供电';mark=connected===true?'+':'';charging=false;}
    else if(status===3){state=connected===true?'plugged':connected===false?'discharging':'idle';label=connected===true?'已插电 · 未充电':'未充电';mark=connected===true?'+':'';charging=false;}
    else if(connected===true){state='plugged';label='已插电 · 充电状态未知';mark='+';}
    else if(connected===false){state='discharging';label='电池供电';mark='';charging=false;}
    return {percent:ranged(first(battery.percent,fallback.battery_value),0,100,true),tempC:number(first(battery.temp,fallback.battery_temperature)),charging,chargerConnected:connected,chargeStatus:status,state,stateLabel:label,stateMark:mark};
  }
  function identifier(value, max, invalid) {
    const n = ranged(value, 0, max, true);
    return [null, ...(invalid || [4294967295])].includes(n) ? null : n;
  }
  function servingCell(net, radio, connected, rat) {
    const nr = radio === 'nr';
    const rsrp = ranged(nr ? net.nr_rsrp : net.lte_rsrp, -200, -1);
    const rssi = ranged(nr ? net.nr_rssi : net.lte_rssi, -200, -1);
    const ratUsesRadio = nr ? /NR|SA|5G|ENDC/i.test(rat) : /LTE|4G|NSA|ENDC/i.test(rat);
    const available = connected !== false && (rsrp !== null || rssi !== null) && (ratUsesRadio || !rat);
    const bandText = str(nr ? first(net.nr_band, /^n/i.test(str(net.band)) ? net.band : undefined)
      : first(net.lte_band, !/^n/i.test(str(net.band)) ? net.band : undefined));
    const bandMatch = bandText.match(/^[nNbB]?(\d+)$/);
    return {
      available, radio, band: available && bandMatch ? Number(bandMatch[1]) : null,
      rsrp: available ? rsrp : null, rssi: available ? rssi : null,
      rsrq: available ? ranged(nr ? net.nr_rsrq : net.lte_rsrq, -50, 30) : null,
      sinr: available ? ranged(nr ? net.nr_snr : net.lte_snr, -50, 100) : null,
      pci: available ? identifier(nr ? net.nr_pci : net.lte_pci, nr ? 1007 : 503) : null,
      arfcn: available ? ranged(nr ? net.nr_channel : first(net.channel, net.lte_channel), 0, nr ? 3279165 : 262143, true) : null,
      cellId: available ? identifier(nr ? net.nr_cell_id : first(net.lte_cell_id, net.cell_id), nr ? 68719476735 : 268435455, [4294967295, 68719476735]) : null,
      tac: available ? identifier(nr ? net.nr_tac : first(net.lte_tac, net.tac), nr ? 16777215 : 65535, [nr ? 16777215 : 65535]) : null,
    };
  }

  function parseBands(value) {
    if (value === undefined || value === null || value === '') return [];
    if (!Array.isArray(value) && /^0x[0-9a-f]+$/i.test(str(value).trim())) {
      const mask = BigInt(value), out = [];
      for (let i = 1; i <= 1024; i++) if ((mask & (1n << BigInt(i - 1))) !== 0n) out.push(i);
      return out;
    }
    const list = Array.isArray(value) ? value : str(value).split(',');
    return [...new Set(list.map(v => Number(str(v).trim().replace(/^[nNbB]/, ''))).filter(n => Number.isInteger(n) && n > 0 && n <= 1024))].sort((a, b) => a - b);
  }
  function checkedBands(value, field) {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
    if (!list.length || list.some(v => !/^[nNbB]?\d+$/.test(str(v).trim()) || ranged(str(v).trim().replace(/^[nNbB]/, ''), 1, 1024, true) === null)) throw error('INVALID_PARAMETER', field + ' 包含无效频段');
    return parseBands(list);
  }
  function normalizeBands(raw) {
    raw = obj(raw); const net = obj(raw.net), caps = obj(net.band_capabilities);
    const supported = {
      lte: parseBands(first(raw.lte_supported_bands, net.lte_supported_bands, caps.lte)),
      nrSa: parseBands(first(raw.nr_sa_supported_bands, net.nr_sa_supported_bands, caps.nr_sa)),
      nrNsa: parseBands(first(raw.nr_nsa_supported_bands, net.nr_nsa_supported_bands, caps.nr_nsa)),
    };
    const selected = {
      lte: parseBands(first(raw.lte_band, net.lte_bands, raw.lte_band_lock, net.lte_band_lock)),
      nrSa: parseBands(first(raw.nr_band_lock, raw.nr5g_sa_band_lock, net.nr5g_sa_band_lock)),
      nrNsa: parseBands(first(raw.nr_nsa_band_lock, raw.nr5g_nsa_band_lock, net.nr5g_nsa_band_lock)),
    };
    const automatic = Object.fromEntries(Object.keys(supported).map(key => [key, !supported[key].length || !selected[key].length ? null : JSON.stringify(supported[key]) === JSON.stringify(selected[key])]));
    const lockedCells = [];
    for (const radio of ['nr', 'lte']) {
      const parts = str(first(raw['lock_' + radio + '_cell'], net['lock_' + radio + '_cell'])).split(',');
      if (parts.length < 2) continue;
      const pci = identifier(parts[0], radio === 'nr' ? 1007 : 503), arfcn = identifier(parts[1], radio === 'nr' ? 3279165 : 262143);
      if (pci === null || arfcn === null || arfcn === 0) continue;
      lockedCells.push({radio, pci, arfcn, band: radio === 'nr' ? positive(parts[2]) : null});
    }
    const networkMode = str(first(raw.net_select, net.net_select)) || null;
    const modeOptions = clone(NETWORK_MODES), knownMode = modeOptions.find(option => option.value === networkMode);
    const networkModeLabel = knownMode ? knownMode.label : networkMode === '4G_AND_5G' ? '当前模式：4G / 5G' : networkMode ? '当前模式：' + networkMode : '模式未知';
    // The device currently reports 4G_AND_5G, which is absent from this UFI's
    // selector. Preserve it for display; no verified mapping authorizes rewriting
    // it to WL_AND_5G (which additionally includes 3G) or adding a write option.
    if (networkMode && !knownMode) modeOptions.unshift({value: networkMode, label: networkModeLabel, readOnly: true});
    return {supported, selected, automatic, networkMode, networkModeLabel, networkModeSupported: Boolean(knownMode), modeOptions, lockedCells};
  }

  function normalizeModem(raw, id, root) {
    root = obj(root);
    const m = obj(raw), net = obj(m.net), sim = obj(m.sim), traffic = obj(m.traffic), qos = obj(m.qos);
    const connection = str(obj(m.wwan).status).toLowerCase();
    const ipv4 = obj(obj(m.interfaces).ipv4), ipv6 = obj(obj(m.interfaces).ipv6);
    let connected = connection ? /(^|_)disconnected($|_)/.test(connection) ? false : /(^|_)connected($|_)/.test(connection) ? true : null
      : bool(ipv4.up) === true || bool(ipv6.up) === true ? true : bool(ipv4.up) === false && bool(ipv6.up) === false ? false : null;
    const primarySim = id === '5G' ? obj(root.sim) : {};
    const simState = str(first(sim.state, primarySim.state, id === '5G' ? root.sim_states : undefined));
    const modemState = str(first(sim.modem_state, primarySim.modem_state, id === '5G' ? root.modem_main_state : undefined));
    const states = [simState, modemState].map(s => s.trim().toLowerCase());
    // Exact tokens observed in the vendor SDK. Empty strings, USB power and
    // get_wwaniface.enable=0 are not evidence of an absent or disabled SIM.
    const has = tokens => states.some(s => tokens.includes(s));
    const absent = has(['sim undetected', 'modem_sim_undetected']);
    const simError = has(['sim destroy', 'sim error', 'modem_sim_destroy']);
    const lockState = has(['wait puk', 'modem_waitpuk']) ? 'puk' : has(['wait pin', 'modem_waitpin']) ? 'pin'
      : has(['sim lock', 'modem_imsi_waitnck']) ? 'network' : has(['sim ready', 'modem_init_complete']) || connected === true ? 'unlocked' : 'unknown';
    const cardPresence = absent ? 'absent' : lockState !== 'unknown' || connected === true ? 'present' : 'unknown';
    const factory = obj(obj(root.factory).modems), enabled = id === '5G' ? null : bool(obj(factory[id]).enabled);
    const conflict = connected === true && (enabled === false || absent || simError || ['pin', 'puk', 'network'].includes(lockState));
    if (conflict) connected = null;
    const dataConnection = conflict ? 'conflict' : connected === true ? 'connected' : connected === false ? 'disconnected' : /(^|_)connecting($|_)/.test(connection) ? 'connecting' : 'unknown';
    const primaryCellular = id === '5G' ? obj(obj(root.interfaces).cellular) : {};
    const rat = str(net.type), nr = /NR|SA|5G|ENDC/i.test(rat);
    const ratesUnavailable = enabled === false || conflict || absent || simError || ['pin','puk','network'].includes(lockState);
    const trafficAvailable = !ratesUnavailable && (id === '5G' || enabled === true);
    // AMBR is the modem's last reported bearer limit in Mbps, not live traffic.
    // A ready SIM can retain it while disconnected; unknown or unusable cards
    // must not inherit old values, and no other modem's QoS is a fallback.
    const qosAvailable = !ratesUnavailable && cardPresence === 'present' && (id === '5G' || enabled === true);
    // A ready SIM may report its radio while data is disconnected. Unusable or
    // unconfirmed cards must not display a previous SIM's cached type or band.
    const radioAvailable = !ratesUnavailable && cardPresence === 'present' && (id === '5G' || enabled === true);
    const serving = {nr: servingCell(net, 'nr', ratesUnavailable ? false : connected, rat), lte: servingCell(net, 'lte', ratesUnavailable ? false : connected, rat)};
    const signal = serving[nr ? 'nr' : 'lte'];
    const registration = connected === true ? 'registered' : 'unknown';
    const statusCode = conflict ? 'conflict' : enabled === false ? 'disabled' : absent ? 'no_sim' : ['pin', 'puk', 'network'].includes(lockState) ? 'locked' : simError ? 'sim_error'
      : connected === true ? 'connected' : dataConnection === 'connecting' ? 'connecting' : connected === false ? 'disconnected' : 'unknown';
    return {
      id, connected, simState, modemState,
      // datad integer()/clamp() turns an absent external st_slot into zero.
      // Preserve it as a report, but do not claim a physical slot from that
      // default when neither a SIM state nor a connection corroborates it.
      reportedSlot: id === '5G' ? ranged(first(sim.slot, primarySim.current_slot), 1, 2, true) : ranged(sim.slot, 0, 1, true),
      simSlot: cardPresence === 'unknown' ? null : id === '5G' ? ranged(first(sim.slot, primarySim.current_slot), 1, 2, true) : ranged(sim.slot, 0, 1, true),
      subid: ranged(m.subid, 1, 6, true),
      enabled, cardPresence, lockState, dataConnection, registration,
      availability: connected === true || bool(obj(m.usb).present) === true ? 'available' : bool(obj(m.usb).present) === false ? 'unavailable' : 'unknown',
      usbPresent: bool(obj(m.usb).present), statusCode,
      statusLabel: ({disabled:'未启用',conflict:'状态冲突',no_sim:'未插卡',locked:lockState === 'pin' ? '待输入 PIN' : lockState === 'puk' ? '待输入 PUK' : 'SIM 卡已锁',sim_error:'SIM 异常',connected:'已联网',disconnected:'未联网',connecting:'连接中',unknown:'状态未知'})[statusCode],
      roaming: /^roaming$/i.test(str(net.roaming)) ? true : /^home$/i.test(str(net.roaming)) ? false : null,
      roamingAllowed: id === '5G' ? bool(first(net.roaming_allowed, primaryCellular.roam_enable)) : null,
      apnTarget: APN_TARGETS[id], capabilities: {dataConnection: id === '5G', roaming: id === '5G', apn: true, apnMultipleProfiles: id === '5G', modemEnable: id !== '5G' && enabled !== null, trafficLimit: id === '5G'},
      operator: operators[net.operator] || str(net.operator) || '运营商未知',
      rat: rat || null, reportedRat: rat || null, radioLabel: radioAvailable ? normalizeRadioLabel(net.type) : '—',
      band: radioAvailable ? str(net.band) || null : null, bars: nonnegative(net.bars),
      rxBps: trafficAvailable ? nonnegative(traffic.rx_speed) : null, txBps: trafficAvailable ? nonnegative(traffic.tx_speed) : null,
      qci: qosAvailable ? qosClass(qos.qci) : null,
      ambrDownMbps: qosAvailable ? qosRate(qos.ambr_dl) : null, ambrUpMbps: qosAvailable ? qosRate(qos.ambr_ul) : null,
      rsrp: signal.rsrp, rsrq: signal.rsrq, sinr: signal.sinr, rssi: signal.rssi,
      pci: signal.pci, arfcn: signal.arfcn, cellId: signal.cellId, tac: signal.tac, serving,
      temperatureC: null, canSendSms: id === '5G',
    };
  }

  function normalizeAggregation(value, supported) {
    const agg=obj(value), enabled=bool(agg.enabled), custom=agg.source==='icg-v3'||agg.transport==='quic';
    const fresh=bool(agg.telemetry_fresh), observed=bool(agg.online), running=bool(obj(agg.controller).icg_process_running);
    const tunnels=nonnegative(custom?agg.quic_tunnel_count:agg.tcp_tunnel_count), paths=nonnegative(agg.online_path_count);
    let online=null, statusLabel='状态未知', detail='聚合状态暂未提供';
    if(enabled===false){online=false;statusLabel='聚合未启用';detail='跟随设备聚合拨钮';}
    else if(enabled===true){
      if(custom&&fresh===false){statusLabel='聚合已开启';detail='自定义聚合遥测暂不可用';}
      else if(observed===true||((custom?fresh===true:running===true)&&(tunnels>0||custom&&paths>0))){online=true;statusLabel='聚合在线';detail=custom?'自定义聚合通道已连接':'原厂聚合通道已连接';}
      else if(custom&&fresh===true){online=false;statusLabel='连接中';detail='聚合已开启，尚无已连接通道';}
      else{statusLabel='聚合已开启';detail='当前接口未提供隧道连接状态';}
    }
    const traffic=obj(agg.traffic), counter=value=>ranged(value,0,Number.MAX_SAFE_INTEGER,true);
    return {supported,enabled,online,statusLabel,detail,mode:str(agg.mode)||null,state:str(agg.state)||null,
      remainingBytes:first(counter(traffic.remaining_bytes),counter(traffic.remaining_raw))??null,
      todayUsedBytes:first(counter(traffic.today_used_bytes),counter(traffic.today_used_raw))??null};
  }
  function normalizeCarriers(raw) {
    const net=obj(raw.net), carriers=[], seen=new Set(); let reported=0,invalid=0;
    for(const [key,radio] of [['nrca','nr'],['lteca','lte']]){
      if(!Object.hasOwn(net,key))continue;
      if(typeof net[key]!=='string'||net[key].length>8191){invalid++;continue;}reported++;
      for(const line of net[key].split(';').slice(0,64)){
        if(!line.trim())continue;
        const columns=line.split(',');
        if(columns.length!==11||columns.some(x=>!x.trim()||!Number.isFinite(Number(x)))){invalid++;continue;}
        const f=columns.map(Number),nr=radio==='nr',index=ranged(f[0],0,63,true),pci=ranged(f[1],0,nr?1007:503,true),band=ranged(f[3],1,512,true),arfcn=ranged(f[4],1,nr?3279165:262143,true);
        if([index,pci,band,arfcn].includes(null)){invalid++;continue;}
        const identity=`${radio}:${pci}:${arfcn}`;if(seen.has(identity))continue;seen.add(identity);
        carriers.push({radio,index,pci,band,arfcn,bandwidthMHz:ranged(f[5],Number.MIN_VALUE,400),rsrp:ranged(f[7],-160,-20),sinr:ranged(f[9],-30,60)});
      }
    }
    const radioLabel=normalizeRadioLabel(str(net.type)),radio=radioLabel.startsWith('5G')?'nr':['4G','4G+'].includes(radioLabel)?'lte':null;
    const primaryBand=radio?str(radio==='nr'?net.nr_band:net.band).match(/^[nNbB]?(\d+)$/):null;
    const primary={radio,band:primaryBand?ranged(primaryBand[1],1,512,true):null,bandwidthMHz:radio==='nr'?ranged(net.nr_bw,Number.MIN_VALUE,400):null};
    const nrCount=carriers.filter(x=>x.radio==='nr').length,lteCount=carriers.length-nrCount;
    const summary=nrCount&&lteCount?`NR ${nrCount} 路 · LTE ${lteCount} 路`:nrCount?`NR ${nrCount} 路载波`:lteCount?`LTE ${lteCount} 路载波`:invalid?'载波数据无法解析':reported?'当前未报告附加载波':'载波数据暂不可用';
    return {primary,carriers:carriers.slice(0,8),nrCount,lteCount,summary,invalid};
  }
  function normalize(raw, options) {
    raw = obj(raw); options = obj(options);
    raw = {...raw, factory:normalizeFactoryState(options.factory || raw.factory)};
    let list = array(raw.modems);
    if (!list.length && (raw.net || raw.traffic || raw.real_rx_speed !== undefined)) {
      list = [{id: '5G', net: {...obj(raw.net), type: first(obj(raw.net).type, raw.network_type), operator: first(obj(raw.net).operator, raw.network_provider_fullname)},
        sim: raw.sim, wwan: {status: obj(raw.net).wan_status},
        traffic: {rx_speed: first(obj(raw.traffic).rx_speed, raw.real_rx_speed), tx_speed: first(obj(raw.traffic).tx_speed, raw.real_tx_speed)},
        qos: {qci: first(obj(raw.qos).qci, raw.qci), ambr_dl: first(obj(raw.qos).ambr_dl, raw.ambr_dl_max), ambr_ul: first(obj(raw.qos).ambr_ul, raw.ambr_ul_max)}}];
    }
    const modems = MODEMS.map(id => {
      const modem = list.find(m => m.id === id);
      return normalizeModem(id === '5G' && modem ? {...modem, net: {...obj(raw.net), ...obj(modem.net)}} : modem, id, raw);
    });
    for (const modem of modems) {
      const temp = array(obj(raw.thermal).modems).find(m => m.id === modem.id);
      modem.temperatureC = temp && temp.available !== false ? number(temp.celsius) : null;
    }
    const sum = key => { const values = modems.map(m => ['unknown','conflict'].includes(m.statusCode) ? null : m.enabled===false||m.cardPresence==='absent' ? 0 : m[key]); return values.some(v => v === null) ? null : values.reduce((a, b) => a + b, 0); };
    const battery = obj(raw.battery), system = obj(raw.system), runtime = obj(raw.runtime), memory = obj(runtime.memory_kb), wlan = obj(raw.wlan), agg = obj(raw.aggregation);
    const totalBytes = first(number(system.mem_total), number(memory.total) === null ? null : number(memory.total) * 1024);
    const availableBytes = first(number(system.mem_avail), number(memory.available) === null ? null : number(memory.available) * 1024);
    const calculatedUsage = totalBytes > 0 && availableBytes !== undefined ? 100 * (totalBytes - availableBytes) / totalBytes : null;
    return {
      source: options.source || 'snapshot', ts: number(raw.ts), version: str(obj(raw.datad).version) || null,
      modems, total: {rxBps: sum('rxBps'), txBps: sum('txBps'), scope: '各基带承载速率之和（含协议开销）'},
      primary: {rxBps: modems[0].rxBps, txBps: modems[0].txBps},
      battery: normalizeBattery(battery,raw),
      cpu: {tempC: number(first(obj(raw.thermal).cpu_celsius, system.cpu_temp, raw.cpu_temp)), usagePct: number(first(system.cpu_usage, raw.cpu_usage, number(runtime.cpu_usage_tenths) === null ? null : number(runtime.cpu_usage_tenths) / 10))},
      memory: {usagePct: number(first(system.mem_used_pct, raw.mem_usage, calculatedUsage)), totalBytes: number(totalBytes), availableBytes: number(availableBytes)},
      wifi: {enabled: bool(wlan.enabled), ssid: str(wlan.ssid) || null, bands: array(wlan.bands).map(b => ({band: str(b.band), ssid: str(b.ssid), enabled: bool(b.enabled), encryption: str(b.enc)})), clients: nonnegative(first(obj(raw.clients).wifi, raw.wifi_access_sta_num))},
      aggregation: normalizeAggregation(agg, Object.prototype.hasOwnProperty.call(raw, 'aggregation')),
      ethernet: (()=>{const port=obj(array(runtime.link_rates).find(x=>x.interface==='eth0')),carrier=bool(options.ethernetCarrier);return {carrier,statusLabel:carrier===true?'已插网线':carrier===false?'未插网线':'插线状态未知',rxBps:nonnegative(port.rx_bps),txBps:nonnegative(port.tx_bps),speedMbps:carrier===true?ranged(options.ethernetSpeedMbps,1,100000,true):null};})(),
      carrierAggregation: normalizeCarriers(raw),
      locks: {lte: str(first(obj(raw.net).lock_lte_cell, raw.lock_lte_cell)), nr: str(first(obj(raw.net).lock_nr_cell, raw.lock_nr_cell))},
      bands: normalizeBands(raw),
      sms: {unread: nonnegative(first(obj(raw.sms).unread, raw.sms_unread_num)), stale: bool(obj(raw.sms).stale)},
      power: normalizePower(raw), traffic: normalizeTraffic(raw), cooling: normalizeCooling(raw),
      factory: normalizeFactoryState(raw.factory),
      uptimeSeconds: nonnegative(first(system.uptime, raw.uptime)),
    };
  }

  function encodeUtf16Hex(text) {
    let output = '';
    for (let i = 0; i < text.length; i++) output += text.charCodeAt(i).toString(16).padStart(4, '0');
    return output;
  }
  function encodeBase64(text) {
    const data = new TextEncoder().encode(text);
    let binary = ''; for (const byte of data) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function decodeBase64(text) {
    try { return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(text), c => c.charCodeAt(0))); }
    catch (_) { return '[短信编码无法解析]'; }
  }
  function normalizeMessages(raw) {
    raw = raw || {};
    const native = array(obj(raw.sms).list);
    const list = Array.isArray(raw) ? raw : Array.isArray(raw.messages) ? raw.messages : native;
    return list.map(m => ({id: str(m.id), number: str(first(m.num, m.number)), text: m.text !== undefined ? str(m.text) : decodeBase64(str(m.content)),
      date: str(m.date), unread: m.unread !== undefined ? bool(m.unread) : String(m.tag) === '1',
      direction: ['2', '3'].includes(String(m.tag)) ? 'outgoing' : 'incoming', failed: String(m.tag) === '3', sender: str(m.sender) || '5G'}));
  }
  function normalizeWifi(raw) {
    raw = obj(raw);
    const aps = array(raw.ResponseList).map(ap => ({
      section: str(ap.AccessPointIndex), band: str(ap.AccessPointIndex).split('_').pop(),
      ssid: str(ap.SSID), encryption: str(ap.AuthMode), enabled: bool(ap.AccessPointSwitchStatus),
      hidden: bool(ap.ApBroadcastDisabled), isolate: bool(ap.ApIsolate), pmf: number(ap.Pmf_switch),
      passwordSaved: Boolean(ap.Password),
    }));
    return {enabled: bool(raw.WiFiModuleSwitch), dualBand: bool(first(raw.WiFiDualBandEnabled, raw.BandSteeringSwitch)),
      dualBandSupported: bool(raw.WiFiDualBandSupported), aps, wireless: clone(raw.WirelessConfig || {})};
  }
  function modemId(value) {
    if (!MODEMS.includes(value)) throw error('INVALID_PARAMETER', '请选择 5G、4G1 或 4G2 基带');
    return value;
  }
  function primaryOnly(params) {
    if (params.modem !== undefined && params.modem !== '5G') throw error('UNSUPPORTED', '此接口没有外挂 4G 基带目标参数，不能代替该卡执行');
    if (params.subid !== undefined || params.slot_id !== undefined) throw error('UNSUPPORTED', '此接口不支持按 subid 或 APN 命名空间选择数据基带');
  }
  function normalizeApn(reply, modem) {
    modemId(modem); const raw = obj(obj(reply).data || reply), config = obj(raw.config), normalized = Object.keys(config).length > 0;
    const profiles = value => (Array.isArray(value) ? value : array(obj(value).apnListArray)).map(profile => ({
      id: str(first(profile.profileId, profile.id)), name: str(first(profile.profilename, profile.name)), apn: str(first(profile.wanapn, profile.apn)),
      pdpType: ranged(first(profile.pdpType, profile.pdp_type), 1, 3, true), authMode: ranged(first(profile.pppAuthMode, profile.auth_mode), 0, 3, true),
      enabled: bool(first(profile.isEnable, profile.enabled)),
    })).filter(profile => profile.id);
    const mode = ranged(normalized ? config.mode : obj(raw.apn_mode).apn_mode, 0, 1, true);
    const readable = mode !== null;
    // A valid mode alone is insufficient: all four vendor reads must be
    // present. In the panel format writable=false is an explicit denial.
    const complete = normalized ? Array.isArray(config.automatic) && Array.isArray(config.manual) && typeof config.enabled_id === 'string'
      : Array.isArray(obj(raw.auto_apn_list).apnListArray) && Array.isArray(obj(raw.manu_apn_list).apnListArray) && typeof obj(raw.enabled_id).profileId === 'string';
    const writable = readable && complete && (normalized ? config.writable === true : raw.writable !== false);
    return {modem, slotId: APN_TARGETS[modem], readable, writable, mode,
      singleProfile: modem !== '5G' || raw.single_profile === true,
      enabledId: str(normalized ? config.enabled_id : obj(raw.enabled_id).profileId), automatic: profiles(normalized ? config.automatic : raw.auto_apn_list), manual: profiles(normalized ? config.manual : raw.manu_apn_list)};
  }
  function normalizePower(raw) {
    raw=obj(raw); const supply=obj(obj(raw.power).direct_supply), sleep=obj(raw.sleep);
    const minutes=[-1,5,10,20,30,60,120].includes(number(sleep.minutes)) ? number(sleep.minutes) : null;
    return {directSupply:{supported:supply.supported===true,enabled:bool(supply.enabled),mode:['enable','disable'].includes(supply.mode)?supply.mode:null},
      sleep:{supported:sleep.supported===true&&minutes!==null,minutes,seconds:minutes===null?null:minutes===-1?0:minutes*60}};
  }
  function normalizeCooling(raw) {
    const cooling = obj(obj(raw).cooling), fan = obj(cooling.fan), liquid = obj(cooling.liquid), policy = obj(fan.policy);
    const fanSupported = Object.keys(fan).length > 0, liquidSupported = Object.keys(liquid).length > 0;
    // enabled has different legacy meanings for these two devices. Neither
    // it nor an instantaneous PWM/active flag identifies the always-on policy.
    return {supported: fanSupported || liquidSupported, source: 'datad',
      vendorSyncError: str(cooling.vendor_sync_error) || null,
      fan: {supported: fanSupported, alwaysOn: bool(fan.always_on),
        mode: ['automatic','custom','always_on','manual'].includes(fan.mode) ? fan.mode : null,
        speedPct: ranged(fan.speed_percent, 0, 100), pwm: ranged(fan.pwm, 0, 255, true),
        tempC: ranged(fan.temperature_celsius, -40, 150), thermalEnabled: bool(fan.thermal_enabled),
        policyApplied: bool(policy.applied), policyError: str(policy.error) || null},
      liquid: {supported: liquidSupported, alwaysOn: bool(liquid.always_on),
        mode: ['automatic','low','high'].includes(liquid.mode) ? liquid.mode : null,
        active: bool(liquid.active), driverPlaying: bool(liquid.driver_playing), thermalEnabled: bool(liquid.thermal_enabled)}};
  }
  function normalizeTraffic(raw) {
    raw=obj(raw); const t=obj(raw.traffic),limit=obj(t.limit),clear=obj(t.clear_day);
    return {scope:'5G',monthRxBytes:nonnegative(first(t.month_rx_bytes,raw.month_rx_bytes)),monthTxBytes:nonnegative(first(t.month_tx_bytes,raw.month_tx_bytes)),
      dayRxBytes:nonnegative(t.day_rx_bytes),dayTxBytes:nonnegative(t.day_tx_bytes),
      limit:{enabled:bool(limit.enable),valueBytes:nonnegative(limit.value),type:ranged(limit.type,1,3,true),ratio:ranged(limit.ratio,0,100,true)},
      clearDay:{enabled:bool(first(clear.enable,raw.wan_auto_clear_flow_data_switch)),day:ranged(first(clear.clearday,raw.traffic_clear_date),1,31,true)}};
  }
  function normalizeClients(raw) {
    raw=obj(raw); const clients=obj(raw.clients),validMac=value=>/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(str(value));
    const mode=['deny','allow','disabled'].includes(clients.acl_mode)?clients.acl_mode:null;
    const blocked=array(clients.blocked).filter(validMac).map(value=>value.toLowerCase());
    const list=Array.isArray(clients.list)?clients.list:[...array(raw.station_list).map(item=>({...item,kind:'wifi'})),...array(raw.lan_station_list).map(item=>({...item,kind:'lan'}))];
    return {readable:Array.isArray(clients.list)||Array.isArray(raw.station_list)&&Array.isArray(raw.lan_station_list),aclMode:mode,blocked,
      items:list.map(item=>({mac:str(first(item.mac,item.mac_addr)).toLowerCase(),name:str(first(item.name,item.hostname)),ip:str(first(item.ip,item.ip_addr)),band:['2g','5g','6g'].includes(item.band)?item.band:null,guest:bool(item.guest),kind:item.kind||(item.band?'wifi':'unknown')})).filter(item=>validMac(item.mac))};
  }
  function normalizeFactoryState(raw) {
    raw = obj(raw);
    const settings=obj(raw.settings);
    return {settings:{qosMode:QOS_MODES.includes(settings.qosMode)?settings.qosMode:null,quickBoot:bool(settings.quickBoot),powerSaver:bool(settings.powerSaver)},modems:Object.fromEntries(Object.keys(FACTORY_KEYS).map(id => {
      const value = first(raw[id], obj(obj(raw.modems)[id]).flight);
      const flight = ['on','off'].includes(value) ? value : null;
      return [id, {flight, enabled:flight === null ? null : flight === 'off'}];
    }))};
  }
  function normalizeSimSource(raw, modem) {
    if (!MODEMS.includes(modem)) throw error('INVALID_PARAMETER','请选择有效基带');
    const value=obj(raw)[SIM_SOURCE_FIELDS[modem]];
    const source=value===0||value==='0'?0:value===1||value==='1'?1:null;
    return {modem,source,label:source===0?'插拔卡':source===1?'内置卡':'尚未确认'};
  }
  function simSourceReadCommand(modem) {
    if (!MODEMS.includes(modem)) throw error('INVALID_PARAMETER','请选择有效基带');
    const field=SIM_SOURCE_FIELDS[modem], method=modem==='5G'?'get_sim_info':'get_v3t_sim_info';
    // Only the raw source scalar leaves the fixed getter; ICCID/IMSI and the
    // provision/session slot are never returned or mistaken for a card source.
    return `tf_source=$(ubus -t 1 call zwrt_zte_mdm.api ${method} '{}' 2>/dev/null | jsonfilter -e '@.${field}' 2>/dev/null)\ncase "$tf_source" in 0|1) ;; *) tf_source=unknown ;; esac\nprintf '${SIM_SOURCE_PREFIX}{"${field}":"%s"}\\n' "$tf_source"`;
  }
  function factoryReadCommand() {
    return ["printf '" + FACTORY_PREFIX + "{'"]
      .concat(Object.entries(FACTORY_KEYS).map(([id,key],index) => `tf_v=$(uci -q get zwrt_zte_mc.mc_status.${key}_lpr_flight_status); case "$tf_v" in on|off) ;; *) tf_v=unknown ;; esac; printf '${index ? ',' : ''}"${id}":"%s"' "$tf_v"`))
      .concat([
        "tf_qos=$(uci -q get zwrt_smart_mng.smart_qos.mode); case \"$tf_qos\" in " + QOS_MODES.join('|') + ") ;; *) tf_qos=unknown ;; esac",
        "tf_power=$("+POWER_READ+" 2>/dev/null) || tf_power=''",
        "tf_quick=$(printf '%s' \"$tf_power\" | jsonfilter -e '@.quicken_power_on' 2>/dev/null); case \"$tf_quick\" in 0|1) ;; *) tf_quick=unknown ;; esac",
        "tf_saver=$(printf '%s' \"$tf_power\" | jsonfilter -e '@.power_saver_mode' 2>/dev/null); case \"$tf_saver\" in 0|1) ;; *) tf_saver=unknown ;; esac",
        "printf ',\"settings\":{\"qosMode\":\"%s\",\"quickBoot\":\"%s\",\"powerSaver\":\"%s\"}}\\n' \"$tf_qos\" \"$tf_quick\" \"$tf_saver\""
      ]).join('\n');
  }
  function factoryEnableCommand(modem, enabled) {
    if (!Object.prototype.hasOwnProperty.call(FACTORY_KEYS, modem) || typeof enabled !== 'boolean') throw error('INVALID_PARAMETER', '仅支持指定外挂卡的启用开关');
    const parameter = FACTORY_KEYS[modem], flight = enabled ? 'off' : 'on';
    // Every shell token is constant or selected from a closed enum. Preserve
    // the original SDK moduleName; no service or arbitrary command is added.
    const payload = JSON.stringify({moduleName:'zte_topsw_devui',action:flight,parameter});
    return `tf_current=$(uci -q get zwrt_zte_mc.mc_status.${parameter}_lpr_flight_status)\ncase "$tf_current" in on|off) ;; *) exit 1 ;; esac\nubus call zwrt_mc.device.manager device_tsp_lpr_flight_mode_set '${payload}' >/dev/null || exit 1\ntf_i=0\nwhile [ "$tf_i" -lt 5 ]; do\n tf_v=$(uci -q get zwrt_zte_mc.mc_status.${parameter}_lpr_flight_status)\n [ "$tf_v" = '${flight}' ] && break\n tf_i=$((tf_i + 1))\n sleep 1\ndone\n` + factoryReadCommand();
  }
  function factorySettingCommand(operation, body) {
    let mutation, read, expected, valid;
    if(operation==='qos') {
      if(!QOS_MODES.includes(body.mode))throw error('INVALID_PARAMETER','原厂工作模式无效');
      expected=body.mode;read='uci -q get zwrt_smart_mng.smart_qos.mode';valid=QOS_MODES.join('|');
      mutation="ubus call zwrt_smart_mng.api zte_smart_mng_set_qos_mode '"+JSON.stringify({qos_mode:body.mode,source_module:'zte_topsw_devui'})+"'";
    } else {
      if(!['quick-boot','power-saver'].includes(operation)||typeof body.enabled!=='boolean')throw error('INVALID_PARAMETER','原厂电源选项无效');
      const key=operation==='quick-boot'?'quicken_power_on':'power_saver_mode';expected=body.enabled?'1':'0';valid='0|1';
      read=POWER_READ+" | jsonfilter -e '@."+key+"'";
      mutation="ubus call zwrt_mc.device.manager set_device_info '"+JSON.stringify({moduleName:'zte_topsw_devui',deviceInfoList:{[key]:expected}})+"'";
    }
    return `tf_current=$(${read})\ncase "$tf_current" in ${valid}) ;; *) exit 1 ;; esac\n${mutation} >/dev/null || exit 1\ntf_i=0\nwhile [ "$tf_i" -lt 5 ]; do\n tf_v=$(${read})\n [ "$tf_v" = '${expected}' ] && break\n tf_i=$((tf_i + 1))\n sleep 1\ndone\n`+factoryReadCommand();
  }
  function integer(value, min, max, field) {
    const n = number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw error('INVALID_PARAMETER', field + ' 超出有效范围');
    return n;
  }
  function boolean(value, field) { if (typeof value !== 'boolean') throw error('INVALID_PARAMETER', field + ' 必须为布尔值'); return value; }
  function text(value, field, max) {
    if (typeof value !== 'string' || !value.trim() || /[\x00\r\n]/.test(value) || bytes(value) > max) throw error('INVALID_PARAMETER', field + ' 无效');
    return value.trim();
  }
  const hardware = (body, effects) => ({method: 'POST', path: '/api/datad/hardware', kind: 'json', body, effects});
  const goform = (body, effects) => ({method: 'POST', path: '/api/goform/goform_set_cmd_process', kind: 'goform', body, effects});

  function buildAction(name, p) {
    p = obj(p); let action;
    if (name === 'aggregation.set') {
      action = hardware({action: name, params: {enabled: boolean(p.enabled, 'enabled')}}, ['network-reconfiguration']);
    } else if (name === 'factory.modem.enabled') {
      if (!Object.prototype.hasOwnProperty.call(FACTORY_KEYS, p.modem)) throw error('UNSUPPORTED', '原厂启用接口只支持 4G1 / 4G2');
      action = {method:'POST',kind:'factory',operation:'modem-enabled',body:{modem:p.modem,enabled:boolean(p.enabled,'enabled')},effects:['network-reconfiguration'],timeoutMs:12000};
    } else if (['factory.qos.set','factory.quick_boot.set','factory.power_saver.set'].includes(name)) {
      const operation={'factory.qos.set':'qos','factory.quick_boot.set':'quick-boot','factory.power_saver.set':'power-saver'}[name];
      const body=operation==='qos'?{mode:p.mode}:{enabled:boolean(p.enabled,'enabled')};
      if(operation==='qos'&&!QOS_MODES.includes(p.mode))throw error('INVALID_PARAMETER','工作模式只允许原厂已有的六项');
      action={method:'POST',kind:'factory',operation,body,effects:['power-setting'],timeoutMs:12000};
    } else if (name === 'cellular.connect' || name === 'cellular.disconnect') {
      primaryOnly(p); action = hardware({action: name, params: {}}, ['network-reconfiguration']);
    } else if (name === 'cellular.set') {
      primaryOnly(p); const params = {};
      // Sparse writes: copying get_wwaniface.enable=0 would disconnect an
      // active session when only the roaming setting was meant to change.
      if (p.roaming !== undefined) params.roaming = integer(p.roaming, 0, 1, '漫游开关');
      if (p.enabled !== undefined) params.enabled = integer(p.enabled, 0, 1, '数据开关');
      if (!Object.keys(params).length) throw error('INVALID_PARAMETER', '请选择数据或漫游开关');
      action = hardware({action: name, params}, ['network-reconfiguration']);
    } else if (name === 'sim.set_slot') {
      primaryOnly(p); action = hardware({action: name, params: {slot: integer(p.slot, 1, 2, '主基带 SIM 卡槽')}}, ['network-reconfiguration']);
    } else if (name === 'traffic.set_limit') {
      primaryOnly(p); const params = {enabled: integer(p.enabled, 0, 1, '流量限额开关')};
      if (params.enabled) {
        const amount = str(p.value);
        if (!/^\d{1,15}$/.test(amount) || BigInt(amount) < 1n || BigInt(amount) > 109951162777600n) throw error('INVALID_PARAMETER', '流量限额须为 1 字节至 100 TiB');
        params.value = amount; params.type = integer(p.type, 1, 3, '限额类型');
      }
      if (p.ratio !== undefined) params.ratio = integer(p.ratio, 0, 100, '提醒比例');
      action = hardware({action: name, params}, ['network-reconfiguration']);
    } else if (name === 'traffic.set_clear_day' || name === 'traffic.calibrate') {
      primaryOnly(p); let params;
      if(name==='traffic.set_clear_day')params={day:integer(p.day,1,31,'流量结算日'),enabled:p.enabled===undefined?1:integer(p.enabled,0,1,'按月清零开关')};
      else {const value=str(p.value);if(!/^\d{1,15}$/.test(value)||BigInt(value)>109951162777600n)throw error('INVALID_PARAMETER','月流量校正须为 0 字节至 100 TiB');params={value};}
      action=hardware({action:name,params},['save-traffic-settings']);
    } else if (name === 'client.block' || name === 'client.unblock' || name === 'client.rename') {
      const mac=str(p.mac).toLowerCase();if(!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac))throw error('INVALID_PARAMETER','客户端 MAC 地址无效');
      const params={mac};if(name==='client.rename')params.hostname=text(p.hostname,'设备名称',253);
      action=hardware({action:name,params},name==='client.rename'?['save-client-name']:['wifi-disconnect']);
    } else if (name === 'power.direct_supply.set') {
      action=hardware({action:name,params:{enabled:boolean(p.enabled,'enabled')}},['power-setting']);
    } else if (['cooling.fan.set_enabled','cooling.liquid.set_enabled'].includes(name)) {
      action=hardware({action:name,params:{enabled:boolean(p.enabled,'enabled')}},['save-cooling-settings','hardware-policy']);
    } else if (name === 'sleep.set') {
      const seconds=integer(p.seconds,0,7200,'空闲休眠秒数');
      if(![0,300,600,1200,1800,3600,7200].includes(seconds))throw error('INVALID_PARAMETER','请选择不休眠或 5 / 10 / 20 / 30 / 60 / 120 分钟');
      action=hardware({action:name,params:{seconds:String(seconds)}},['power-setting']);
    } else if (name === 'wifi.guest.set') {
      const params={};if(p.enabled!==undefined)params.enabled=boolean(p.enabled,'enabled');
      if(p.bands!==undefined){const bands=obj(p.bands);if(!Object.keys(bands).length)throw error('INVALID_PARAMETER','访客频段不能为空');params.bands={};for(const [band,on]of Object.entries(bands)){if(!['2g','5g','6g'].includes(band))throw error('INVALID_PARAMETER','访客频段无效');params.bands[band]=boolean(on,'bands.'+band);}}
      if(p.activeTime!==undefined){if(![0,120,240,480,720].includes(p.activeTime))throw error('INVALID_PARAMETER','访客有效时间无效');params.active_time=p.activeTime;}
      if(p.managementAccess!==undefined)params.management_access=boolean(p.managementAccess,'managementAccess');
      if(!Object.keys(params).length)throw error('INVALID_PARAMETER','访客设置没有变化');action=hardware({action:name,params},['wifi-disconnect']);
    } else if (['apn.set_mode', 'apn.add', 'apn.modify', 'apn.delete', 'apn.enable'].includes(name)) {
      const modem = modemId(p.modem), target = APN_TARGETS[modem];
      if (modem !== '5G' && ['apn.add', 'apn.delete'].includes(name)) throw error('UNSUPPORTED', '外挂 4G 基带只有固定 APN 配置，不能新增或删除');
      let suffix = 'manual', method = 'POST', body = {};
      if (name === 'apn.set_mode') { suffix = 'mode'; body.apn_mode = integer(p.mode, 0, 1, 'APN 模式'); }
      else {
        if (name !== 'apn.add') { body.profileId = text(p.profileId, 'APN 配置 ID', 64); if (!/^[A-Za-z0-9_.-]+$/.test(body.profileId)) throw error('INVALID_PARAMETER', 'APN 配置 ID 无效'); }
        if (name === 'apn.enable') suffix = 'manual/enable';
        if (name === 'apn.delete') method = 'DELETE';
        if (name === 'apn.modify') method = 'PUT';
        if (name === 'apn.add' || name === 'apn.modify') {
          body.profilename = text(p.name, 'APN 名称', 64);
          body.wanapn = text(p.apn, 'APN', 128);
          for (const key of ['username', 'password']) if (p[key] !== undefined) {
            if (typeof p[key] !== 'string' || /[\x00\r\n]/.test(p[key]) || bytes(p[key]) > 256) throw error('INVALID_PARAMETER', key + ' 无效');
            body[key] = p[key];
          }
          if (p.authMode !== undefined) body.pppAuthMode = integer(p.authMode, 0, 3, 'APN 认证方式');
          if (p.pdpType !== undefined) body.pdpType = integer(p.pdpType, 1, 3, 'APN PDP 类型');
          if (name === 'apn.modify' && Object.keys(body).length === 1) throw error('INVALID_PARAMETER', 'APN 没有变化');
        }
      }
      // The existing DatadApp bridge implements GET/POST only. Map these
      // documented APN fields to the exact datad action instead of silently
      // downgrading PUT/DELETE to GET through that bridge.
      const map={profileId:'profile_id',profilename:'name',wanapn:'apn',pppAuthMode:'auth_mode',pdpType:'pdp_type',apn_mode:'mode'};
      const params={slot_id:target};for(const [key,value]of Object.entries(body))params[map[key]||key]=value;
      action = hardware({action:name,params},['network-reconfiguration']);
    } else if (['band.set_lte', 'band.set_nr_sa', 'band.set_nr_nsa'].includes(name)) {
      if (p.modem && p.modem !== '5G') throw error('UNSUPPORTED', '锁频接口仅作用于主基带');
      if (!parseBands(p.supported).length) throw error('CAPABILITIES_REQUIRED', '必须先读取设备支持频段；不可发送空列表');
      const supported = checkedBands(p.supported, '支持列表');
      const bands = p.automatic === true ? supported : checkedBands(p.bands, '所选列表');
      if (!bands.length) throw error('INVALID_PARAMETER', '手动频段不可为空；自动选择请明确选择全部支持频段');
      if (bands.some(band => !supported.includes(band))) throw error('INVALID_PARAMETER', '所选频段不在当前设备支持列表内');
      const map = {'band.set_lte': ['LTE_BAND_LOCK', 'lte_band_lock'], 'band.set_nr_sa': ['NR_BAND_LOCK', 'nr_band_lock'], 'band.set_nr_nsa': ['NR_NSA_BAND_LOCK', 'nr_nsa_band_lock']};
      action = goform({goformId: map[name][0], [map[name][1]]: bands.join(',')}, ['network-reconfiguration']);
    } else if (name === 'network.set_mode') {
      primaryOnly(p);
      if (!NETWORK_MODES.some(item => item.value === p.mode)) throw error('INVALID_PARAMETER', '网络模式不在此 UFI 面板已验证的选项中');
      action = goform({goformId: 'SET_BEARER_PREFERENCE', BearerPreference: p.mode}, ['network-reconfiguration']);
    } else if (name === 'cell.lock_nr' || name === 'cell.lock_lte') {
      if (p.modem && p.modem !== '5G') throw error('UNSUPPORTED', '锁基站接口仅作用于 5G 主基带，不支持选择外挂 4G 基带');
      const nr = name === 'cell.lock_nr';
      const pci = integer(p.pci, 0, nr ? 1007 : 503, 'PCI');
      const channel = integer(nr ? p.arfcn : p.earfcn, 1, nr ? 3279165 : 262143, nr ? 'ARFCN' : 'EARFCN');
      const body = {goformId: 'CELL_LOCK', rat: nr ? '16' : '12', pci: String(pci), earfcn: String(channel)};
      if (nr) body.band = String(integer(p.band, 1, 512, 'NR Band'));
      action = goform(body, ['network-reconfiguration']);
    } else if (name === 'cell.unlock_all') {
      primaryOnly(p);
      action = goform({goformId: 'UNLOCK_ALL_CELL'}, ['network-reconfiguration']);
    } else if (name === 'wifi.configure') {
      const section = text(p.section, 'Wi-Fi section', 20);
      if (!['main_2g', 'main_5g', 'guest_2g', 'guest_5g'].includes(section)) throw error('UNSUPPORTED', 'TopFlow 此适配器仅支持 2.4 / 5 GHz');
      const band = section.endsWith('2g') ? '2g' : '5g';
      const body = {goformId: 'setAccessPointInfo', AccessPointIndex: section, ChipIndex: band === '2g' ? 0 : 1};
      if (p.ssid !== undefined) body.SSID = text(p.ssid, 'SSID', 32);
      if (p.encryption !== undefined) {
        if (!['none', 'psk2+ccmp', 'psk-mixed+tkip+ccmp', 'sae-mixed', 'sae'].includes(p.encryption)) throw error('INVALID_PARAMETER', '不支持的 Wi-Fi 加密方式');
        body.AuthMode = p.encryption;
        if (p.encryption === 'none') body.EncrypType = 'NONE';
      }
      if (p.key !== undefined && p.key !== '') {
        if (typeof p.key !== 'string' || (bytes(p.key) < 8 || bytes(p.key) > 63) && !/^[0-9a-fA-F]{64}$/.test(p.key) || /[\x00\r\n]/.test(p.key)) throw error('INVALID_PARAMETER', 'Wi-Fi 密码须为 8–63 字节或 64 位十六进制');
        body.Password = encodeBase64(p.key);
      }
      if (p.hidden !== undefined) body.ApBroadcastDisabled = boolean(p.hidden, 'hidden') ? '1' : '0';
      if (p.isolate !== undefined) body.ApIsolate = boolean(p.isolate, 'isolate') ? '1' : '0';
      if (p.pmf !== undefined) body.Pmf_switch = String(integer(p.pmf, 0, 2, 'PMF'));
      if (Object.keys(body).length === 3) throw error('INVALID_PARAMETER', '未提供 Wi-Fi 修改项');
      action = goform(body, ['wifi-disconnect']);
    } else if (name === 'wifi.radio.set') {
      if (!['2g', '5g'].includes(p.band)) throw error('INVALID_PARAMETER', 'Wi-Fi 频段无效');
      action = goform({goformId: 'setWiFiRadio', Band: p.band, Enabled: boolean(p.enabled, 'enabled') ? 1 : 0}, ['wifi-disconnect']);
    } else if (name === 'wifi.set_dual_band') {
      action = goform({goformId: 'SET_WIFI_DUAL_BAND', WiFiDualBandEnabled: boolean(p.enabled, 'enabled') ? '1' : '0'}, ['wifi-disconnect']);
    } else if (name === 'sms.send') {
      const sender = str(p.sender || '5G').toLowerCase();
      if (!['5g', 'host'].includes(sender)) throw error('UNSUPPORTED', 'TopFlow 0.10.79 仅支持 5G 主卡发短信，4G1 / 4G2 不支持');
      const phone = text(p.number, '收件号码', 32);
      if (!/^\+?[0-9]{3,20}$/.test(phone)) throw error('INVALID_PARAMETER', '收件号码格式无效');
      if (typeof p.content !== 'string' || !p.content.trim() || p.content.length > 1000 || p.content.includes('\x00')) throw error('INVALID_PARAMETER', '短信正文须为 1–1000 个 UTF-16 字符');
      action = goform({goformId: 'SEND_SMS', Number: phone, MessageBody: encodeUtf16Hex(p.content), sms_sender: sender}, ['send-sms']);
      action.timeoutMs = 55000;
    } else if (name === 'sms.forward.enabled') {
      action = {method: 'POST', kind: 'json', path: '/api/sms_forward_enabled?enable=' + (boolean(p.enabled, 'enabled') ? '1' : '0'), body: {}, effects: ['forward-new-messages']};
    } else if (name === 'sms.forward.configure') {
      const method = str(p.method).toLowerCase();
      let path, body;
      const info = p.forwardDeviceInfo === undefined ? '0' : boolean(p.forwardDeviceInfo, 'forwardDeviceInfo') ? '1' : '0';
      if (method === 'smtp') {
        path = '/api/sms_forward_mail';
        const port = integer(first(p.port, 465), 1, 65535, 'SMTP 端口');
        body = {smtp_host: text(p.host, 'SMTP 主机', 253), smtp_port: String(port), smtp_username: text(p.username, 'SMTP 用户名', 320), smtp_to: text(p.to, '收件邮箱', 320), forward_dev_info: info};
        // UFI main.js 7743-7745/7910/7925 permits blank only after GET reports
        // password_saved, and always sends the field (never omit-to-retain).
        // passwordSaved is local validation context, not a server field.
        body.smtp_password = p.passwordSaved === true && !str(p.password).trim()
          ? '' : text(p.password, 'SMTP 密码', 1024);
      } else if (method === 'dingtalk') {
        path = '/api/sms_forward_dingtalk';
        const url = text(p.webhookUrl, '钉钉 Webhook', 2048);
        let parsed; try { parsed = new URL(url); } catch (_) { throw error('INVALID_PARAMETER', 'Webhook URL 无效'); }
        if (parsed.protocol !== 'https:') throw error('INVALID_PARAMETER', '钉钉 Webhook 必须使用 HTTPS');
        body = {webhook_url: url, forward_dev_info: info};
        // Match UFI main.js: a blank optional signature is an explicit empty
        // string, never an unverified promise to preserve a saved signature.
        body.secret = str(p.secret).trim();
      } else if (method === 'sms') {
        path = '/api/sms_forward_sms';
        if (typeof p.to !== 'string') throw error('INVALID_PARAMETER', '请输入转发号码，每行一个');
        const phones = p.to.split(/\r?\n/).map(phone => phone.trim()).filter(Boolean);
        if (!phones.length || phones.some(phone => !/^\+?[0-9]{3,20}$/.test(phone))) throw error('INVALID_PARAMETER', '转发号码格式无效，每行填写一个号码');
        body = {sms_to_phone: phones.join('\n'), forward_dev_info: info};
      } else if (method === 'curl') {
        path = '/api/sms_forward_curl';
        if (typeof p.curlText !== 'string' || !p.curlText.trim() || p.curlText.length > 8192 || p.curlText.includes('\x00')) throw error('INVALID_PARAMETER', 'CURL 模板无效');
        if (!p.curlText.includes('{{sms-body}}')) throw error('INVALID_PARAMETER', 'CURL 模板必须包含 {{sms-body}}');
        body = {curl_text: p.curlText.trim()};
      } else throw error('INVALID_PARAMETER', '转发方式须为 smtp / dingtalk / sms / curl');
      action = {method: 'POST', kind: 'json', path, body, effects: ['save-forwarding', 'send-test-message'], timeoutMs: 55000};
    } else if (name === 'screen.restore') {
      throw error('NOT_VERIFIED', '原厂屏幕切换尚未完成实机验证，不能执行服务或驱动操作');
    } else throw error('UNSUPPORTED', '尚未验证的动作：' + name);
    return Object.freeze({...action, name, writesDevice: true, timeoutMs: action.timeoutMs || 55000});
  }

  function assertResponse(data) {
    if (!data || typeof data !== 'object') throw error('INVALID_RESPONSE', '设备返回了无效数据');
    if (data.success === false || data.ok === false || data.error || data._datad_error || ['failed', 'failure', 'fail'].includes(data.result)) {
      const message = str(data.message || obj(data.error).message || data.error || '设备拒绝了操作');
      const failure = error(str(data.code || data.error_code || 'DEVICE_ERROR'), data.saved === true ? '配置已保存，但测试通知未确认成功；请检查状态，避免重复发送。' + message : message);
      if (data.saved === true) { failure.saved = true; failure.requiresReadback = true; }
      throw failure;
    }
    return data;
  }
  function readRequest(cmd, extra) {
    return {method: 'GET', kind: 'getData', path: '/api/goform/goform_get_cmd_process', query: {cmd, ...obj(extra)}, writesDevice: false};
  }
  function create(options) {
    options = obj(options);
    const mode = options.mode || 'readonly', transport = options.transport;
    if (!['readonly', 'mock', 'live'].includes(mode)) throw error('INVALID_PARAMETER', 'mode 无效');
    let snapshot = clone(options.snapshot || {}), wifiConfig = clone(options.wifi || {enabled: true, dualBand: false, aps: [{section: 'main_2g', band: '2g', ssid: 'TOPFLOW-2.4G', encryption: 'sae-mixed', enabled: true, hidden: false, pmf: 1, passwordSaved: true}, {section: 'main_5g', band: '5g', ssid: 'TOPFLOW-5G', encryption: 'sae-mixed', enabled: true, hidden: false, pmf: 1, passwordSaved: true}]}),
      messages = clone(options.messages || []), forward = clone(options.forward || {enabled: false, method: 'smtp', config: {}}),
      apnConfigs = clone(options.apn || Object.fromEntries(MODEMS.map(id => [id, {apn_mode:{apn_mode:0},enabled_id:{profileId:'demo'},auto_apn_list:{apnListArray:[{profileId:'auto',profilename:'运营商自动',wanapn:'internet'}]},manu_apn_list:{apnListArray:[{profileId:'demo',profilename:'本地演示',wanapn:'internet',pdpType:3,pppAuthMode:0}]}}]))), inflight = false;
    let factorySnapshot = normalizeFactoryState(options.factory || snapshot.factory), factoryAt = -Infinity, factoryPending = null;
    const sourceSnapshots=new Map(),sourcePending=new Map();
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const pause = typeof options.sleep === 'function' ? options.sleep : ms => new Promise(resolve => setTimeout(resolve, ms));
    const request = async descriptor => {
      if (typeof transport !== 'function') throw error('NO_TRANSPORT', '未连接设备；当前仅可使用本地快照');
      return assertResponse(await transport(clone(descriptor)));
    };
    const api = {
      mode,
      readFactoryState: async () => {
        if (mode === 'mock') return clone(factorySnapshot);
        if (factoryPending) return factoryPending;
        if (now() - factoryAt < 10000) return clone(factorySnapshot);
        factoryPending = (async () => {
          try { factorySnapshot = normalizeFactoryState(await request({method:'GET',kind:'factory',operation:'read',writesDevice:false})); }
          catch (_) { factorySnapshot = normalizeFactoryState({}); }
          factoryAt = now(); return clone(factorySnapshot);
        })();
        try { return await factoryPending; } finally { factoryPending = null; }
      },
      readState: async () => {
        const [state, factory] = await Promise.all([mode === 'mock' ? snapshot : request(readRequest(STATUS_CMD)), api.readFactoryState()]);
        return normalize(state, {source:mode === 'mock' ? 'demo' : 'device',factory});
      },
      readSimSource: async modem => {
        if (!MODEMS.includes(modem)) throw error('INVALID_PARAMETER','请选择有效基带');
        // Demand only: opening/refreshing a card, never the periodic snapshot.
        if(mode==='mock')return normalizeSimSource(obj(options.simSources)[modem],modem);
        if(sourcePending.has(modem))return clone(await sourcePending.get(modem));
        const cached=sourceSnapshots.get(modem);if(cached&&now()-cached.at<3000)return clone(cached.value);
        const pending=(async()=>{
          try{const raw=await request({method:'GET',kind:'sim-source',operation:'read',modem,writesDevice:false});const value=normalizeSimSource(raw,modem);sourceSnapshots.set(modem,{at:now(),value});return value;}
          catch(e){sourceSnapshots.delete(modem);throw e;}
        })();
        sourcePending.set(modem,pending);
        try{return clone(await pending);}finally{sourcePending.delete(modem);}
      },
      readMessages: async () => mode === 'mock' ? clone(messages) : normalizeMessages(await request(readRequest('sms_data_total', {page: 0, data_per_page: 100, mem_store: 1, tags: 100, order_by: 'order by id desc'}))),
      readWifi: async () => mode === 'mock' ? clone(wifiConfig) : normalizeWifi(await request(readRequest(WIFI_CMD))),
      readBands: async () => normalizeBands(mode === 'mock' ? snapshot : await request(readRequest(BANDS_CMD))),
      readClients: async () => normalizeClients(mode==='mock'?snapshot:await request(readRequest('clients,station_list,lan_station_list,queryDeviceAccessControlList,hostNameList'))),
      readTraffic: async () => normalizeTraffic(mode==='mock'?snapshot:await request(readRequest('traffic,month_rx_bytes,month_tx_bytes,wan_auto_clear_flow_data_switch,traffic_clear_date'))),
      readPower: async () => normalizePower(mode==='mock'?snapshot:await request(readRequest('power,sleep'))),
      readCooling: async () => normalizeCooling(mode==='mock'?snapshot:await request(readRequest('cooling'))),
      readApn: async modem => normalizeApn(mode === 'mock' ? apnConfigs[modemId(modem)] : await request({method:'GET',path:'/api/apn/all?slotId=' + APN_TARGETS[modemId(modem)],kind:'json',writesDevice:false}), modem),
      readForward: async () => {
        if (mode === 'mock') return clone(forward);
        const results = await Promise.all(['/api/sms_forward_method', '/api/sms_forward_enabled'].map(path => request({method: 'GET', path, kind: 'json', writesDevice: false})));
        const method = str(results[0].sms_forward_method).toLowerCase();
        const suffix = {smtp: 'mail', curl: 'curl', dingtalk: 'dingtalk', sms: 'sms'}[method];
        const config = suffix ? await request({method: 'GET', path: '/api/sms_forward_' + suffix, kind: 'json', writesDevice: false}) : {};
        return {enabled: bool(results[1].enabled), method, executor: results[0].executor || null, config};
      },
      buildAction,
      execute: async (name, params, confirmation) => {
        const action = buildAction(name, params);
        if (mode !== 'mock' && (mode !== 'live' || options.allowWrites !== true)) throw error('READ_ONLY', '设备保持只读：此操作未发送');
        if (mode !== 'mock' && obj(confirmation).confirmed !== true) throw error('CONFIRM_REQUIRED', '请先确认本次具体修改');
        if (mode !== 'mock' && action.effects.some(effect => ['send-sms', 'send-test-message', 'forward-new-messages'].includes(effect)) && obj(confirmation).allowExternalEffects !== true) throw error('EXTERNAL_CONFIRM_REQUIRED', '此操作会发送短信/测试消息或启用转发，须单独确认');
        if (inflight) throw error('BUSY', '上一项操作尚未完成，不能重复提交');
        inflight = true;
        try {
          const coolingTarget = name.startsWith('cooling.') ? name.split('.')[1] : null;
          if (coolingTarget) {
            const before = (await api.readCooling())[coolingTarget];
            if (!before.supported || before.alwaysOn === null || before.mode === null) throw error('UNSUPPORTED', '散热策略状态未完整读到；本次未发送修改');
          }
          if (name.startsWith('apn.')) {
            const target = await api.readApn(obj(params).modem);
            if (!target.writable) throw error('APN_READ_ONLY', '该基带 APN 配置未完整读到或不可写；本次未发送修改');
          }
          if (mode !== 'mock') {
            const result = await request(action);
            // SEND_SMS acknowledges the actual submission only with result=success;
            // transport success/ok and result=0 do not confirm a sent message.
            const acknowledged = name === 'sms.send' ? result.result === 'success' && (result.error === undefined || result.error === null || result.error === '')
              : result.success === true || result.ok === true || result.result === 'success';
            if (!acknowledged) throw error('UNCONFIRMED', '设备未确认成功；请读取实际状态，不要自动重试');
            if (name.startsWith('factory.')) { factorySnapshot=normalizeFactoryState(result.factory); factoryAt=now(); }
            if (coolingTarget) {
              const enabled = action.body.params.enabled;
              const expectedMode = coolingTarget === 'fan' ? enabled ? 'always_on' : 'custom' : enabled ? 'high' : 'automatic';
              let readback;
              // Read the existing cache until it reflects the applied policy.
              // Never repeat a hardware write, even after a timeout or error.
              for (let attempt = 0; attempt < 6; attempt++) {
                if (attempt) await pause(1000);
                readback = await api.readCooling();
                const target = readback[coolingTarget];
                const driverOkay = coolingTarget === 'fan' ? target.policyApplied === true && !target.policyError
                  : target.thermalEnabled === true && (!enabled || target.driverPlaying !== false);
                if (target.supported && target.alwaysOn === enabled && target.mode === expectedMode && driverOkay && !readback.vendorSyncError) {
                  return {ok:true,demo:false,verified:true,verification:'configured-policy',result,readback};
                }
              }
              const failure = error('UNCONFIRMED', '散热设置请求已提交，但尚未回读到目标策略或驱动状态异常；请查看实际状态，不要自动重复提交');
              failure.requiresReadback = true; failure.readback = readback; throw failure;
            }
            // The cache may lag a successful control. Return the reread data
            // without claiming it confirms a different or unavailable value.
            const readback=name.startsWith('client.')?await api.readClients():name.startsWith('traffic.')?await api.readTraffic():['power.direct_supply.set','sleep.set'].includes(name)?await api.readPower():name==='wifi.guest.set'?await api.readWifi():null;
            return {ok: true, demo: false, verified: result.verified===true||obj(result.result).verified===true, result, readback};
          }
          params = obj(params);
          if (name === 'factory.modem.enabled') factorySnapshot.modems[params.modem]={enabled:params.enabled,flight:params.enabled?'off':'on'};
          if (name === 'factory.qos.set') factorySnapshot.settings.qosMode=params.mode;
          if (name === 'factory.quick_boot.set') factorySnapshot.settings.quickBoot=params.enabled;
          if (name === 'factory.power_saver.set') factorySnapshot.settings.powerSaver=params.enabled;
          if (name === 'cellular.connect' || name === 'cellular.disconnect' || name === 'cellular.set') {
            const primary = array(snapshot.modems).find(m => m.id === '5G'); snapshot.interfaces = obj(snapshot.interfaces); snapshot.interfaces.cellular = obj(snapshot.interfaces.cellular);
            const on = name === 'cellular.connect' ? true : name === 'cellular.disconnect' ? false : params.enabled === undefined ? null : params.enabled === 1;
            if (primary && on !== null) primary.wwan = {...obj(primary.wwan),status:on?'ipv4_ipv6_connected':'disconnected'};
            if (params.roaming !== undefined) { snapshot.interfaces.cellular.roam_enable = params.roaming; snapshot.net = {...obj(snapshot.net),roaming_allowed:params.roaming}; }
          }
          if (name === 'sim.set_slot') { snapshot.sim = {...obj(snapshot.sim),current_slot:params.slot}; const primary=array(snapshot.modems).find(m=>m.id==='5G');if(primary)primary.sim={...obj(primary.sim),slot:params.slot}; }
          if (name === 'traffic.set_limit') snapshot.traffic={...obj(snapshot.traffic),limit:{...action.body.params,enable:params.enabled}};
          if (name === 'traffic.set_clear_day') snapshot.traffic={...obj(snapshot.traffic),clear_day:{clearday:params.day,enable:params.enabled===undefined?1:params.enabled}};
          if (name === 'traffic.calibrate') snapshot.traffic={...obj(snapshot.traffic),month_rx_bytes:Number(params.value),month_tx_bytes:0};
          if (name === 'power.direct_supply.set') snapshot.power={direct_supply:{supported:true,enabled:params.enabled,mode:params.enabled?'enable':'disable'}};
          if (name === 'sleep.set') snapshot.sleep={supported:true,minutes:params.seconds===0?-1:params.seconds/60};
          if (coolingTarget) {
            const target = snapshot.cooling[coolingTarget];
            target.always_on = params.enabled;
            target.mode = coolingTarget === 'fan' ? params.enabled ? 'always_on' : 'custom' : params.enabled ? 'high' : 'automatic';
            if (coolingTarget === 'fan') { target.enabled = params.enabled; target.policy = {attempted:true,applied:true,error:''}; }
            // These are synthetic demo indicators, never physical telemetry.
            else { target.enabled = true; target.active = params.enabled; target.driver_playing = params.enabled; }
            target.thermal_enabled = true; snapshot.cooling.vendor_sync_error = null;
            return {ok:true,demo:true,verified:false,readback:await api.readCooling(),message:'仅更新本地演示，未发送到设备',action:name};
          }
          if (name.startsWith('client.')) {snapshot.clients=obj(snapshot.clients);const mac=params.mac.toLowerCase();if(name==='client.rename'){const item=array(snapshot.clients.list).find(value=>value.mac===mac);if(item)item.name=params.hostname;}else{snapshot.clients.blocked=array(snapshot.clients.blocked).filter(value=>value!==mac);if(name==='client.block')snapshot.clients.blocked.push(mac);snapshot.clients.acl_mode='deny';}}
          if (name.startsWith('apn.')) {
            const config=apnConfigs[params.modem], list=config.manu_apn_list.apnListArray;
            if(name==='apn.set_mode')config.apn_mode.apn_mode=params.mode;
            else if(name==='apn.enable')config.enabled_id.profileId=params.profileId;
            else if(name==='apn.delete')config.manu_apn_list.apnListArray=list.filter(p=>p.profileId!==params.profileId);
            else if(name==='apn.add')list.push({profileId:'demo-'+Date.now(),profilename:params.name,wanapn:params.apn,pdpType:params.pdpType,pppAuthMode:params.authMode});
            else {const profile=list.find(p=>p.profileId===params.profileId);if(!profile)throw error('NOT_FOUND','APN演示配置不存在');Object.assign(profile,{profilename:params.name,wanapn:params.apn});if(params.pdpType!==undefined)profile.pdpType=params.pdpType;if(params.authMode!==undefined)profile.pppAuthMode=params.authMode;}
          }
          if (name === 'aggregation.set') snapshot.aggregation = {...obj(snapshot.aggregation), enabled: params.enabled, online: params.enabled, mode: params.enabled ? 'SMULTIWAN' : 'MULTIWAN', state: params.enabled ? 'online' : 'disabled'};
          if (name.startsWith('band.set_')) {
            snapshot.net = obj(snapshot.net);
            const values = params.automatic === true ? parseBands(params.supported) : parseBands(params.bands);
            const netKey = {'band.set_lte': 'lte_bands', 'band.set_nr_sa': 'nr5g_sa_band_lock', 'band.set_nr_nsa': 'nr5g_nsa_band_lock'}[name];
            snapshot.net[netKey] = values.join(',');
            const flatKey = {'band.set_lte': 'lte_band', 'band.set_nr_sa': 'nr_band_lock', 'band.set_nr_nsa': 'nr_nsa_band_lock'}[name];
            if (Object.prototype.hasOwnProperty.call(snapshot, flatKey)) snapshot[flatKey] = values.join(',');
          }
          if (name === 'network.set_mode') { snapshot.net = {...obj(snapshot.net), net_select: params.mode}; if ('net_select' in snapshot) snapshot.net_select = params.mode; }
          if (name === 'cell.lock_nr' || name === 'cell.lock_lte') { snapshot.net = obj(snapshot.net); snapshot.net[name === 'cell.lock_nr' ? 'lock_nr_cell' : 'lock_lte_cell'] = name === 'cell.lock_nr' ? [params.pci, params.arfcn, params.band].join(',') : [params.pci, params.earfcn].join(','); }
          if (name === 'cell.unlock_all') { snapshot.net = {...obj(snapshot.net), lock_nr_cell: '', lock_lte_cell: ''}; }
          if (name === 'wifi.configure') {
            const ap = wifiConfig.aps.find(item => item.section === params.section);
            if (!ap) throw error('UNSUPPORTED', '演示配置中不存在此 Wi-Fi');
            for (const key of ['ssid', 'encryption', 'hidden', 'isolate', 'pmf']) if (params[key] !== undefined) ap[key] = params[key];
            if (params.key) ap.passwordSaved = true;
          }
          if (name === 'wifi.radio.set') wifiConfig.aps.filter(ap => ap.band === params.band).forEach(ap => { ap.enabled = params.enabled; });
          if (name === 'wifi.set_dual_band') wifiConfig.dualBand = params.enabled;
          if (name === 'wifi.guest.set') for(const ap of wifiConfig.aps.filter(ap=>/^guest_/.test(ap.section))){if(params.enabled!==undefined)ap.enabled=params.enabled;if(obj(params.bands)[ap.band]!==undefined)ap.enabled=params.bands[ap.band];}
          if (name === 'sms.send') messages.unshift({id: 'demo-' + Date.now(), number: params.number, text: params.content, date: new Date().toISOString(), unread: false, direction: 'outgoing', failed: false, sender: '5G', demo: true});
          if (name === 'sms.forward.enabled') forward.enabled = params.enabled;
          if (name === 'sms.forward.configure') { forward.method = params.method; forward.config = clone(params); if (params.method === 'smtp') forward.config.password_saved = Boolean(str(params.password).trim() || params.passwordSaved === true); delete forward.config.password; delete forward.config.secret; delete forward.config.passwordSaved; }
          return {ok: true, demo: true, message: '仅更新本地演示，未发送到设备或收件人', action: name};
        } finally { inflight = false; }
      },
      setSnapshot: value => { if (mode !== 'mock') throw error('READ_ONLY', '只能替换本地演示快照'); snapshot = clone(value); },
    };
    return Object.freeze(api);
  }

  /* Integrates an already-authenticated UFI session. No login or migration.
     Pass original UFI getData/postData + DatadApp.request in closures at install time.
     postData supplies its verified AD/session machinery; do not reimplement it.
     Factory getters/settings use only the fixed commands explicitly selected below. */
  function createUfiTransport(bridges, options) {
    bridges = obj(bridges); options = obj(options);
    return async descriptor => {
      if (descriptor.kind === 'sim-source') {
        if(descriptor.method!=='GET'||descriptor.operation!=='read'||descriptor.body!==undefined)throw error('UNSUPPORTED','卡源桥接仅允许已核实的读取接口');
        const command=simSourceReadCommand(descriptor.modem);
        if(typeof bridges.runShellWithRoot!=='function')throw error('NO_BRIDGE','UFI 原厂只读桥接不可用');
        const result=await bridges.runShellWithRoot(command,4000);
        const lines=str(obj(result).content).split(/\r?\n/).filter(line=>line.startsWith(SIM_SOURCE_PREFIX));
        if(obj(result).success!==true||lines.length!==1)throw error('INVALID_RESPONSE','原厂未返回可确认的卡源');
        let raw;try{raw=JSON.parse(lines[0].slice(SIM_SOURCE_PREFIX.length));}catch(_){throw error('INVALID_RESPONSE','原厂卡源格式无效');}
        const source=normalizeSimSource(raw,descriptor.modem);
        return {[SIM_SOURCE_FIELDS[descriptor.modem]]:source.source};
      }
      if (descriptor.kind === 'factory') {
        const read = descriptor.operation === 'read' && descriptor.method === 'GET' && descriptor.body === undefined;
        if (!read && !(['modem-enabled','qos','quick-boot','power-saver'].includes(descriptor.operation) && descriptor.method === 'POST')) throw error('UNSUPPORTED', '未验证的原厂接口');
        if (!read && options.allowWrites !== true) throw error('READ_ONLY', '原厂桥接当前只读');
        if (typeof bridges.runShellWithRoot !== 'function') throw error('NO_BRIDGE', 'UFI 原厂只读桥接不可用');
        const body=obj(descriptor.body), command=read ? factoryReadCommand() : descriptor.operation==='modem-enabled'?factoryEnableCommand(body.modem,body.enabled):factorySettingCommand(descriptor.operation,body);
        const result=await bridges.runShellWithRoot(command,12000);
        const line=str(obj(result).content).split(/\r?\n/).find(line=>line.startsWith(FACTORY_PREFIX));
        if(obj(result).success!==true || !line)throw error('INVALID_RESPONSE','原厂接口没有返回可验证状态');
        let data;try{data=JSON.parse(line.slice(FACTORY_PREFIX.length));}catch(_){throw error('INVALID_RESPONSE','原厂状态格式无效');}
        if(read)return data;
        const state=normalizeFactoryState(data), actual=descriptor.operation==='modem-enabled'?state.modems[body.modem].enabled:state.settings[{'qos':'qosMode','quick-boot':'quickBoot','power-saver':'powerSaver'}[descriptor.operation]];
        if(actual!==(descriptor.operation==='qos'?body.mode:body.enabled))throw error('UNCONFIRMED','原厂未回读到所选目标状态；请稍后查看，不要自动重复提交');
        return {ok:true,verified:true,factory:data};
      }
      if (descriptor.kind === 'getData' && descriptor.method === 'GET') {
        if (typeof bridges.getData !== 'function') throw error('NO_BRIDGE', 'UFI getData 不可用');
        return bridges.getData(new URLSearchParams(descriptor.query));
      }
      if (descriptor.kind === 'goform') {
        if (typeof bridges.postData !== 'function' || typeof bridges.sessionCookie !== 'function') throw error('NO_BRIDGE', 'UFI postData 会话桥不可用');
        const cookie = bridges.sessionCookie();
        if (!cookie) throw error('AUTH_REQUIRED', '请先使用 UFI 原登录入口建立会话');
        const response = await bridges.postData(cookie, descriptor.body, descriptor.timeoutMs);
        if (response && typeof response.json === 'function') {
          const data = await response.json();
          if (!response.ok) throw error('HTTP_ERROR', str(data.message || data.error || response.status));
          return data;
        }
        return response;
      }
      if (descriptor.kind === 'json' && descriptor.path.startsWith('/api/')) {
        if (!['GET', 'POST'].includes(descriptor.method)) throw error('UNSUPPORTED', '现有 DatadApp 桥只支持 GET / POST');
        if (typeof bridges.request !== 'function') throw error('NO_BRIDGE', 'UFI DatadApp.request 不可用');
        return bridges.request(descriptor.path.slice(4), descriptor.method === 'POST' ? {body: descriptor.body, timeout: descriptor.timeoutMs} : {});
      }
      throw error('UNSUPPORTED', '未验证的 UFI 请求类型');
    };
  }
  function formatRate(value) {
    const n = nonnegative(value);
    if (n === null) return {value: '—', unit: 'B/s'};
    if (n >= 1e6) return {value: (n / 1e6).toFixed(2), unit: 'MB/s'};
    if (n >= 1e3) return {value: (n / 1e3).toFixed(1), unit: 'KB/s'};
    return {value: String(Math.round(n)), unit: 'B/s'};
  }
  function currentCellAction(state, radio) {
    if (!['nr', 'lte'].includes(radio)) throw error('INVALID_PARAMETER', '请选择 NR 或 LTE 服务小区');
    const primary = array(obj(state).modems).find(m => m.id === '5G');
    const cell = obj(obj(obj(primary).serving)[radio]);
    if (!cell.available || cell.pci === null || cell.pci === undefined || !cell.arfcn || radio === 'nr' && !cell.band) throw error('NO_SERVING_CELL', '当前服务小区信息不完整，无法锁定；可使用手动表单');
    const name = radio === 'nr' ? 'cell.lock_nr' : 'cell.lock_lte';
    const params = radio === 'nr' ? {pci: cell.pci, arfcn: cell.arfcn, band: cell.band} : {pci: cell.pci, earfcn: cell.arfcn};
    buildAction(name, params);
    return {name, params};
  }
  return Object.freeze({version: '0.1.0', datadVersion: '0.10.79', normalize, normalizeMessages, normalizeWifi, normalizeBands, normalizeApn, normalizeFactoryState, normalizeSimSource, normalizeClients, normalizeTraffic, normalizePower, normalizeCooling, parseBands, buildAction, currentCellAction, create, createUfiTransport, encodeUtf16Hex, formatRate});
});
