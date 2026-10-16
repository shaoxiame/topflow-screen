(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.TopFlowUfiPlugin = api; api.register(root); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ROOT = '/data/plugins/topflow-screen';
  // Exact previously delivered installation, permitted for recovery/removal only.
  var recoveryArchive = {
    "archiveSha256": "c3f71f86bc6eec94b626c58ab35aa8e42d8b0fd959dc9fea0766aa896034d8e4",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "5e3d3921b5bf6a379cae71830570e6334e7f7ef10946e0d896a7c2c41aad3e66",
      "topflow-factory-bus-aarch64": "37947782091bd92fcb2541ded591a9f8da9b208b124a1085e920e67dac44d010",
      "screenctl.sh": "544f08a3f1fad5b421a15bb26ac20787746751f21341885634cf877cb69603c7",
      "supervisor.sh": "7bdbf28d07bca60515b59f90a6732d565c83fb34e0aec29dd858a90ddcc99bd2"
    }
  };
  var recoveryArchives = [recoveryArchive, {
    "archiveSha256": "40c3b519c49ff033d640ee49a87798704cbf6f13352749cb6eeec06af49b5dbc",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "a9f4521fcc1e8ae35aebb484b28e5c933f0a08dab534a94645604aa52a66fffd",
      "topflow-factory-bus-aarch64": "9b786000a2e3fe0c4351442d1db752685125d2c7beca513f47b731d279e19c3e",
      "screenctl.sh": "8afb602f8856d616bf7ffc3adea2fa3fabfb2e8bcd83850ef47eb1230d9129dd",
      "supervisor.sh": "273142f51a3d4f4ff2f4015fbb3881e3ab6814af1adcecf6e8c18642cc23eb34"
    }
  }, {
    "archiveSha256": "2be054bc463ff854bf425a7d6e011e4a226e61d56a91a7d009dd3aa3955220c8",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "9909e83cc029cf8dc025d6d8202884638286c125e1750e7831c649cf12334894",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "2c8a2027d43a805c560181d9cafd7b86fa1e92e6a68cb6aa4a92a5e39facddc7",
      "supervisor.sh": "a933e379f2ddb4d97cbbfc7ec4558c231d70a4eb526e60754c96d277a88e0df9"
    }
  }, {
    "archiveSha256": "5448dad44f152a56eefaf694303cb0d99eb31a32858c88339a2e926b54a537fb",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "eeae1cf55a95a40f6f53269ff471fd5fd09561ca08dd3363f4924ca969aa3201",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "b5b4482827a36563b0cae6a7478807a5f09410a447646c516ee80932e8677d68",
      "supervisor.sh": "e52def3dd57a5118c2afb2130d2fc4781f4903dca1ef1ecac79366824ff3136d"
    }
  }, {
    "archiveSha256": "eb827da58a09d90dc33fcfa0c9c73680de59f5b23b34eb624dc1b660e21435b7",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "1546713d82a9740e543332d939123b4b652862294cc7cc62bc1415adeb665f09",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "da66f4266ea70bd689f94fa1e35c1d0b1e4b21e454bb042e7029db0b8fb69aab",
      "supervisor.sh": "4d621b9b3baab9b1833dd06c763d9b2f55788cf942b94a7ca26835b335714087"
    }
  }, {
    "archiveSha256": "451173776a43fb4a82b77ca6a84d548b0bf7a9c45bf68d3fea4b1ec204642935",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "cf8b19bb3d14748a3b892557eab1db3a8d80428e880ee8a7f133629001ad84b2",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "da66f4266ea70bd689f94fa1e35c1d0b1e4b21e454bb042e7029db0b8fb69aab",
      "supervisor.sh": "4d621b9b3baab9b1833dd06c763d9b2f55788cf942b94a7ca26835b335714087"
    }
  }, {
    "archiveSha256": "25cf2802daee30bcef06904c95a2fa53708ca78848b892d229f64261c9c0f716",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "176fa6c9d509f6cb4b1a0f2269236a420a7ade749362ebb6ba1f27532d9297dc",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "da66f4266ea70bd689f94fa1e35c1d0b1e4b21e454bb042e7029db0b8fb69aab",
      "supervisor.sh": "4d621b9b3baab9b1833dd06c763d9b2f55788cf942b94a7ca26835b335714087"
    }
  }, {
    "archiveSha256": "9724983a006ab42b187c82b3d51d6da92a422907e8c77b485466f0f9ebb284a2",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "a47662cc9393feeda19702f81d3fdbebc0e531cb8b0a9a1a621d4b0a76bfedc8",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "da66f4266ea70bd689f94fa1e35c1d0b1e4b21e454bb042e7029db0b8fb69aab",
      "supervisor.sh": "4d621b9b3baab9b1833dd06c763d9b2f55788cf942b94a7ca26835b335714087"
    }
  }, {
    "archiveSha256": "1a8c5cb50e7343718300217f897ace4288382fad8acafd7472c90ba071918500",
    "members": [
      "./",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "e78192592d0365cdbcb6b70ac4dc71763bf6f0afaebd198e1afef89eb8ddd71d",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "0b446248d46ff49760b4bcfa7c14e5bd60ec6efeaab5313836f26bce183f992b",
      "supervisor.sh": "e6246273b557950d1ed3241d186676a598136a85895e036bfbab8b0896f35488"
    }
  }];
  var verifiedPayloads = new WeakSet();
  var rendererFailures = {
    ADOPT_RECEIPT: '交接凭据校验', ADOPT_CONFIG: '原厂显示配置回读', ADOPT_PIN_POLICY: '锁屏策略一致性',
    ADOPT_POLICY_READ: '停止原厂后读取显示配置失败', ADOPT_POLICY_INVALID: '显示配置缺失、格式无效或数值不支持',
    ADOPT_POLICY_CHANGED: '交接期间原厂显示策略发生改变', ADOPT_BRIGHTNESS: '屏幕亮度或最大亮度读回不符合已支持范围',
    ADOPT_SENSOR_ID: '光感设备身份不符或不可读', ADOPT_SENSOR_READ: '光感状态读取失败', ADOPT_SENSOR_STATE: '光感状态值无效', ADOPT_SENSOR_INIT: '光感初始化（原厂流程）',
    ADOPT_SENSOR_ENABLE: '未能恢复并确认光感启用', ADOPT_SENSOR_LUX: '光感启用后仍未读到有效照度',
    ADOPT_GUARD_ACTIVE: '自有限时交接保护锁未能取得或确认',
    ADOPT_FACTORY_PRESENT: '原厂进程退出确认', ADOPT_INTERNAL_LOCK: '内部锁交接复检', ADOPT_GUARD_IDENTITY: '过渡保护身份',
    ADOPT_AUTOSLEEP_LOCK: '原厂休眠锁交接复检', ADOPT_LIFECYCLE: '显示生命周期初始化', ADOPT_SLEEP_PROVIDER: '休眠服务复检', ADOPT_IDLE_GUARD: '灭屏延迟保护初始化',
    WAKE_SENSOR_GUARD: '唤醒时显示保护锁未确认', WAKE_POLICY_READ: '唤醒时读取原厂显示策略失败',
    WAKE_POLICY_CHANGED: '唤醒期间原厂显示或锁屏策略已改变', WAKE_SENSOR_PREPARE: '唤醒时光感恢复或照度回读失败',
    BUS_PATH: '总线组件路径', BUS_SOCKET: '本地通信通道', BUS_FORK: '总线子进程创建', BUS_EXEC: '总线组件执行',
    BUS_READY_TIMEOUT: '总线服务就绪等待', BUS_EOF: '总线通道断开', BUS_ULOOP: '总线事件循环', BUS_CONNECT: '原厂总线连接',
    BUS_OBJECT: '原厂兼容服务注册', BUS_SUBSCRIBER: '休眠订阅器注册', BUS_SLEEP_SUBSCRIBE: '休眠事件订阅',
    BUS_REREGISTER: '休眠服务重新订阅', BUS_POWER_EVENT: '电源事件接收', BUS_PARENT_FD: '总线父进程通道',
    DISPLAY_POLICY_INIT: '显示策略初始化', PIN_PROTECT: '锁屏内存保护', PIN_BOOT_ID: '锁屏启动身份读取',
    PIN_STATE_OPEN: '锁屏状态文件打开', PIN_STATE_INVALID: '锁屏状态校验', PIN_STATE_STORE: '锁屏状态保存',
    UI_RESOURCE: '界面资源读取', DRM_INIT: '显示设备初始化', DRM_DIMENSIONS: '屏幕尺寸核验',
    TOUCH_INIT: '触控设备初始化', FONT_INIT: '字体初始化', FIRST_FRAME: '首帧绘制',
    DISPLAY_ADOPT: '显示交接事务', BUS_RUNTIME: '总线运行检查', DISPLAY_RUNTIME: '显示运行检查', FRAME_RENDER: '画面刷新'
  };
  recoveryArchives.push({
  "archiveSha256": "71b2ea3670db24a93be9ba885cfb116ae15629148e2e8144e7042b77a8d6ea5e",
  "members": [
    "./",
    "./build-manifest.json",
    "./licenses/",
    "./NOTICE.txt",
    "./REBUILD.txt",
    "./screenctl.sh",
    "./supervisor.sh",
    "./topflow-factory-bus-aarch64",
    "./topflow-screen",
    "./topflow-screen.sha256",
    "./ui/",
    "./ui/aggregate.html",
    "./ui/apps.html",
    "./ui/index.html",
    "./ui/network.html",
    "./ui/settings.html",
    "./ui/style.css",
    "./ui/subpages/",
    "./ui/subpages/sms.html",
    "./licenses/FreeType-FTL.txt",
    "./licenses/gumbo-Apache.txt",
    "./licenses/LGPL-2.1.txt",
    "./licenses/litehtml-BSD.txt",
    "./licenses/LLVM-libcxx.txt",
    "./licenses/LLVM-libcxxabi.txt",
    "./licenses/musl-COPYRIGHT.txt",
    "./licenses/openwrt-NOTICE.txt",
    "./licenses/pinyin-data-MIT.txt",
    "./licenses/u60pro-devui-MIT.txt"
  ],
  "files": {
    "topflow-screen": "3fbc768ad66beea6382864d31d9d0821e381af78564c07d2cf6c4a9cec0f27a8",
    "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
    "screenctl.sh": "0b446248d46ff49760b4bcfa7c14e5bd60ec6efeaab5313836f26bce183f992b",
    "supervisor.sh": "e6246273b557950d1ed3241d186676a598136a85895e036bfbab8b0896f35488"
  }
});
  recoveryArchives.push({
  "archiveSha256": "d1e23c5d2b5393f0dbaf11e76480e9345c24dece2c6412913cb0c19f3a9953c9",
  "members": [
    "./",
    "./boot-hook.sh",
    "./boot-integrity.sha256",
    "./build-manifest.json",
    "./licenses/",
    "./NOTICE.txt",
    "./REBUILD.txt",
    "./screenctl.sh",
    "./supervisor.sh",
    "./topflow-factory-bus-aarch64",
    "./topflow-screen",
    "./topflow-screen.sha256",
    "./ui/",
    "./ui/aggregate.html",
    "./ui/apps.html",
    "./ui/index.html",
    "./ui/network.html",
    "./ui/settings.html",
    "./ui/style.css",
    "./ui/subpages/",
    "./ui/subpages/sms.html",
    "./licenses/FreeType-FTL.txt",
    "./licenses/gumbo-Apache.txt",
    "./licenses/LGPL-2.1.txt",
    "./licenses/litehtml-BSD.txt",
    "./licenses/LLVM-libcxx.txt",
    "./licenses/LLVM-libcxxabi.txt",
    "./licenses/musl-COPYRIGHT.txt",
    "./licenses/openwrt-NOTICE.txt",
    "./licenses/pinyin-data-MIT.txt",
    "./licenses/u60pro-devui-MIT.txt"
  ],
  "files": {
    "topflow-screen": "3fbc768ad66beea6382864d31d9d0821e381af78564c07d2cf6c4a9cec0f27a8",
    "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
    "screenctl.sh": "673a2a01bd21b070779254323be90ce71b33db83630bf667a6ec0a100785af08",
    "supervisor.sh": "e6246273b557950d1ed3241d186676a598136a85895e036bfbab8b0896f35488",
    "boot-hook.sh": "005aa42b73a0f83fbd752310733c960591f2cc7e8919f9c0394f6b27b1ba165e"
  }
});
  // Exact prior 0.2.1 release bytes; recovery only, never execution.
  recoveryArchives.push({
    "archiveSha256": "b08e18c9cda493699229eaf94e37a11939b0b4b9ab31aaf6ec4c1322cdd5f258",
    "members": [
      "./",
      "./boot-hook.sh",
      "./boot-integrity.sha256",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/FreeType-gzip-zlib.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/PolyForm-Noncommercial-1.0.0.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "063ce8523da021841820aff86be9541c1d60f8080c3b9407c97dcf62dd471202",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "673a2a01bd21b070779254323be90ce71b33db83630bf667a6ec0a100785af08",
      "supervisor.sh": "e6246273b557950d1ed3241d186676a598136a85895e036bfbab8b0896f35488",
      "boot-hook.sh": "005aa42b73a0f83fbd752310733c960591f2cc7e8919f9c0394f6b27b1ba165e"
    }
  });

  // Exact prior 0.2.1 release bytes; recovery only, never execution.
  recoveryArchives.push({
    "archiveSha256": "1270e867cc42cc97c58ad5fccbf6c5444e1f27d8d10c67929c134f0722db3a87",
    "members": [
      "./",
      "./boot-hook.sh",
      "./boot-integrity.sha256",
      "./build-manifest.json",
      "./licenses/",
      "./NOTICE.txt",
      "./REBUILD.txt",
      "./screenctl.sh",
      "./supervisor.sh",
      "./topflow-factory-bus-aarch64",
      "./topflow-screen",
      "./topflow-screen.sha256",
      "./ui/",
      "./ui/aggregate.html",
      "./ui/apps.html",
      "./ui/index.html",
      "./ui/network.html",
      "./ui/settings.html",
      "./ui/style.css",
      "./ui/subpages/",
      "./ui/subpages/sms.html",
      "./licenses/FreeType-FTL.txt",
      "./licenses/gumbo-Apache.txt",
      "./licenses/LGPL-2.1.txt",
      "./licenses/litehtml-BSD.txt",
      "./licenses/LLVM-libcxx.txt",
      "./licenses/LLVM-libcxxabi.txt",
      "./licenses/musl-COPYRIGHT.txt",
      "./licenses/openwrt-NOTICE.txt",
      "./licenses/pinyin-data-MIT.txt",
      "./licenses/u60pro-devui-MIT.txt"
    ],
    "files": {
      "topflow-screen": "063ce8523da021841820aff86be9541c1d60f8080c3b9407c97dcf62dd471202",
      "topflow-factory-bus-aarch64": "662d0e0a99ed2b638837f86d6df776419871e04c8e5d50aa8a5e1599d5265a28",
      "screenctl.sh": "673a2a01bd21b070779254323be90ce71b33db83630bf667a6ec0a100785af08",
      "supervisor.sh": "e6246273b557950d1ed3241d186676a598136a85895e036bfbab8b0896f35488",
      "boot-hook.sh": "005aa42b73a0f83fbd752310733c960591f2cc7e8919f9c0394f6b27b1ba165e"
    }
  });

  function error(code, message) { var e = new Error(message); e.code = code; return e; }
  function failureMessage(code) {
    var messages = {
      AUTOSTART_INTEGRITY_FAILED: '开机组件校验未通过，未执行自动接管；请检查或更新组件',
      AUTOSTART_HOOK_CONFLICT: '共享启动脚本存在冲突或格式不兼容，已保留原文件',
      AUTOSTART_CONFIG_INVALID: '本插件的开机启动配置未能确认',
      AUTOSTART_INSTALL_CHANGED: '安装状态发生变化，本次开机设置已停止',
      AUTOSTART_WORKER_UNVERIFIED: '启动任务的进程归属无法确认，未终止不明进程',
      AUTOSTART_WORKER_BUSY: '启动任务尚未退出，请稍后刷新状态',
      AUTOSTART_BOOT_ID_UNAVAILABLE: '无法读取本次开机标识，自启动操作未确认',
      AUTOSTART_CANCELLED: '本次自动启动已取消',
      FACTORY_INTERNAL_LOCK_ACTIVE: '原厂屏幕仍持有内部锁；请等待它自然熄屏后重试，组件完整，无需重新安装',
      FACTORY_ALWAYS_ON_LOCK_ACTIVE: '原厂当前设置为常亮且持有内部锁，无法安全交接；本插件不会更改原厂设置',
      FACTORY_INTERNAL_LOCK_UNSTABLE: '原厂内部锁记录正在更新，等待超时后仍不稳定；原厂保留，可稍后重试',
      FACTORY_AUTOSLEEP_LOCK_ACTIVE: '原厂休眠锁在等待期结束时仍未释放，已保留原厂；熄屏后通常还需约三分钟释放',
      FACTORY_AUTOSLEEP_LOCK_UNKNOWN: '原厂内核休眠锁无法可靠读取，已拒绝接管',
      FACTORY_INTERNAL_LOCK_UNKNOWN: '原厂内部锁状态暂未读清，已保留原厂屏幕；可稍后重试',
      FACTORY_PROVIDER_UNAVAILABLE: '无法读取原厂屏幕服务；尚未停止原厂屏幕',
      FACTORY_ENVIRONMENT_CONFLICT: '原厂程序、启动环境或挂载状态与已支持环境不一致，已拒绝接管',
      FACTORY_IDENTITY_CHANGED: '交接前原厂屏幕进程身份发生变化，已拒绝继续操作',
      FACTORY_LOCK_OWNER_CONFLICT: '原厂屏幕内部锁归属与已核验进程不一致，已拒绝继续操作',
      FACTORY_LOCK_HANDOVER_FAILED: '原厂屏幕退出后的显示锁交接未能确认，请读取恢复状态',
      SLEEP_PROVIDER_UNAVAILABLE: '原厂休眠服务不可读，已拒绝接管',
      FACTORY_PERIODIC_WAKE_UNVERIFIED: '当前周期唤醒配置尚不支持安全交接，已保留原厂屏幕',
      DISPLAY_STATE_UNKNOWN: '原厂显示设置或传感器状态未能完整读取，已拒绝接管',
      DISPLAY_LOCK_STATE_MISMATCH: '显示亮度与休眠锁状态正在变化或不一致，请等待稳定后重试',
      DISPLAY_GUARD_UNAVAILABLE: '限时过渡保护不可用，已拒绝接管',
      NATIVE_CHECKSUM_FAILED: '已安装原生文件的校验值不一致，未执行接管',
      MONOTONIC_CLOCK_UNAVAILABLE: '原生时钟协议不可用，未确认接管',
      RENDERER_EXITED: '自定义屏幕程序已退出，接管未完成',
      RENDERER_STALLED: '自定义屏幕心跳超时，监管程序正在恢复原厂',
      FACTORY_HANDOVER_TIMEOUT: '原厂安全交接等待已到6分钟，已保留原厂屏幕；可稍后重试',
      WAIT_CLOCK_UNAVAILABLE: '交接等待计时不可用，已拒绝接管',
      TRANSITION_GUARD_RELEASE_RECOVERED: '此次屏幕过渡未完成，但已确认原厂及自有过渡锁恢复，可重试',
      TRANSITION_GUARD_RELEASE_UNCONFIRMED: '原厂已恢复但自有过渡锁释放尚未确认；请先执行恢复原厂确认清理，再尝试启动或卸载',
      RENDERER_STILL_ACTIVE: '自定义屏幕或服务进程仍在退出，恢复尚未确认；请执行恢复原厂后重查',
      FACTORY_RESTORE_UNCONFIRMED: '原厂恢复的进程及服务未能稳定确认，请执行恢复原厂后重查',
      PREFLIGHT_ABORTED: '屏幕预检未完成，尚未启动自定义屏幕',
      INSTALLED_VERSION_MISMATCH: '已安装组件属于其他版本，不能用新界面直接启动旧程序'
    };
    return (messages[code] || '屏幕保护检查未通过') + '（' + code + '）';
  }
  function failureStatusMessage(state) {
    var message = failureMessage(state.failure);
    if (Object.prototype.hasOwnProperty.call(rendererFailures, state.rendererFailure)) message += '；失败阶段：' + rendererFailures[state.rendererFailure] + '（' + state.rendererFailure + '）';
    if (Number.isInteger(state.rendererExitStatus) && state.rendererExitStatus >= 0 && state.rendererExitStatus <= 255) {
      message += '；Shell 退出状态：' + state.rendererExitStatus;
      if (state.rendererExitStatus >= 128) message += '（可能与信号有关，单凭此值不能确定原因）';
    }
    return message;
  }
  function waitingMessage(state) {
    return (state.waiting === 'FACTORY_INTERNAL_LOCK_UNSTABLE' ? '原厂状态正在更新。' : '') +
      '等待原厂自然熄屏并释放休眠锁；熄屏后通常还需约3分钟。等待期间原厂继续运行，请暂不触碰屏幕，可取消。' +
      (Number.isSafeInteger(state.waitingRemaining) ? '本次最多还等待 ' + state.waitingRemaining + ' 秒。' : '本次最多等待6分钟。') + '这是等待上限，不是预计完成时间；条件满足会提前切换。';
  }
  function shellFailure(response, result) {
    var content = result && typeof result.content === 'string' ? result.content : '';
    var marker = content.match(/(?:^|\r?\n)TOPFLOW_ERROR=([A-Z_]+)(?:\r?\n|$)/);
    if (marker) return error(marker[1], failureMessage(marker[1]));
    var status = response && Number.isInteger(response.status) ? response.status : 0;
    if (status === 401 || status === 403) return error('UFI_AUTH_REQUIRED', 'UFI 登录或 Shell 权限未通过（HTTP ' + status + '），请在原面板重新登录后刷新');
    if (status && response.ok === false) return error('UFI_HTTP_' + status, 'UFI Shell 接口返回 HTTP ' + status + '，未确认执行结果');
    var reason = /permission denied/i.test(content) ? '权限不足' : /read-only file system/i.test(content) ? '目标文件系统只读' : /syntax error/i.test(content) ? 'Shell 语法不兼容' : /not found/i.test(content) ? '所需命令或文件不存在' : /timed?\s*out|timeout/i.test(content) ? '执行超时' : '返回值或执行结果未确认';
    return error('SHELL_FAILED', 'UFI Shell 调用失败：' + reason);
  }
  function shellQuote(value) { return "'" + String(value).replace(/'/g, "'\"'\"'") + "'"; }
  function token(value) { if (!/^[a-f0-9]{32}$/.test(value || '')) throw error('INVALID_TOKEN', '安装会话无效'); return value; }
  function hash(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw error('INVALID_HASH', '安装包校验值无效'); return value; }
  function releaseAllowed(payload) { if (payload && payload.reviewOnly === true) throw error('RELEASE_BLOCKED', '当前文件仅供本地审查，实体屏安装/启动已阻止；请使用明确标注待设备验收的开发测试 TXT'); }
  function nativePayload(payload) {
    if (payload && typeof payload === 'object' && verifiedPayloads.has(payload)) return payload;
    if (!payload || payload.hardwareTested !== false || typeof payload.archiveBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.archiveBase64) || payload.archiveBase64.length > 3 * 1024 * 1024) throw error('INVALID_PACKAGE', '原生包无效或超出大小限制');
    hash(payload.archiveSha256); hash(payload.screenctlSha256);
    if (typeof payload.screenctlSource !== 'string' || !payload.screenctlSource.startsWith('#!/bin/sh\n') || payload.screenctlSource.length > 98304 || payload.screenctlSource.includes('\0')) throw error('INVALID_PACKAGE', '内置恢复控制器无效');
    if (!Array.isArray(payload.members) || !payload.members.length || payload.members.some(function (name) { return typeof name !== 'string' || !/^[A-Za-z0-9._/-]+\/?$/.test(name) || name.startsWith('/') || name.split('/').some(function (part) { return part === '..'; }); })) throw error('INVALID_PACKAGE', '原生包路径无效');
    return payload;
  }
  function privatePayload(input) {
    // Capture getters once, validate the captured data, then freeze only our
    // private copy. External frozen objects are never implicitly trusted.
    var copy = Object.assign({}, input);
    if (Array.isArray(copy.members)) copy.members = copy.members.slice();
    nativePayload(copy);
    Object.freeze(copy.members); Object.freeze(copy);
    verifiedPayloads.add(copy);
    return copy;
  }
  function rootGuard() {
    return 'TF_ROOT=/data/plugins/topflow-screen\n[ "$(readlink -f /data/plugins 2>/dev/null)" = /data/plugins ] || { echo TOPFLOW_ERROR=UNSAFE_PARENT; exit 1; }\n';
  }
  function ownerGuard(owner) {
    token(owner);
    return rootGuard() + '[ -d "$TF_ROOT" ] && [ ! -L "$TF_ROOT" ] && [ "$(readlink -f "$TF_ROOT")" = "$TF_ROOT" ] || { echo TOPFLOW_ERROR=UNSAFE_TARGET; exit 1; }\n' +
      '[ -f "$TF_ROOT/.install-owner" ] && [ ! -L "$TF_ROOT/.install-owner" ] && [ "$(cat "$TF_ROOT/.install-owner")" = ' + shellQuote(owner) + ' ] || { echo TOPFLOW_ERROR=INSTALL_OWNER; exit 1; }\n';
  }
  function installedMembers(payload) {
    return payload.members.map(function (name) { return name.replace(/^\.\//, '').replace(/\/$/, ''); }).filter(Boolean);
  }
  function ownershipGuard(payload) { nativePayload(payload); return ownershipClause(payload); }
  function ownershipClause(payload) {
    return '[ -f "$TF_ROOT/.topflow-install" ] && [ ! -L "$TF_ROOT/.topflow-install" ] && [ "$(cat "$TF_ROOT/.topflow-install")" = "$(printf \'TOPFLOW_SCREEN_INSTALL_V1\\n%s\' ' + shellQuote(payload.archiveSha256) + ')" ] || { echo TOPFLOW_ERROR=UNVERIFIED_OWNERSHIP; exit 1; }\n' +
      '[ -f "$TF_ROOT/.topflow-files" ] && [ ! -L "$TF_ROOT/.topflow-files" ] && [ "$(cat "$TF_ROOT/.topflow-files")" = "$(printf \'%s\\n\' ' + installedMembers(payload).map(shellQuote).join(' ') + ')" ] || { echo TOPFLOW_ERROR=UNVERIFIED_MANIFEST; exit 1; }\n';
  }
  function screenOwnershipGuard(payload) {
    var current = ownershipGuard(payload);
    var branches = recoveryArchives.map(function (recoveryArchive) {
    var legacy = ownershipClause(recoveryArchive);
    var checks = Object.keys(recoveryArchive.files).map(function (name) {
      return 'if [ ! -e "$TF_ROOT/' + name + '" ] && [ ! -L "$TF_ROOT/' + name + '" ] && [ "$TF_LEGACY_CLEANING" = true ]; then :; else\n' +
        '[ -f "$TF_ROOT/' + name + '" ] && [ ! -L "$TF_ROOT/' + name + '" ] && [ "$(stat -c %h "$TF_ROOT/' + name + '\")" = 1 ] || { echo TOPFLOW_ERROR=UNVERIFIED_LEGACY_FILES; exit 1; }\n' +
        'printf \'%s  %s\\n\' ' + shellQuote(recoveryArchive.files[name]) + ' "$TF_ROOT/' + name + '" | sha256sum -c - >/dev/null 2>&1 || { echo TOPFLOW_ERROR=UNVERIFIED_LEGACY_FILES; exit 1; }\nfi\n';
    }).join('');
    return 'elif [ "$TF_INSTALLED_MARKER" = "$(printf \'TOPFLOW_SCREEN_INSTALL_V1\\n%s\' ' + shellQuote(recoveryArchive.archiveSha256) + ')" ]; then\n' + legacy +
      'TF_LEGACY_CLEANING=false\nif [ -e "$TF_ROOT/.uninstalling" ] || [ -L "$TF_ROOT/.uninstalling" ]; then\n' +
      '[ -f "$TF_ROOT/.uninstalling" ] && [ ! -L "$TF_ROOT/.uninstalling" ] && [ "$(stat -c %h "$TF_ROOT/.uninstalling")" = 1 ] && [ "$(stat -c %u "$TF_ROOT/.uninstalling")" = 0 ] && [ "$(cat "$TF_ROOT/.uninstalling")" = uninstalling ] && [ ! -e "$TF_ROOT/.upload-active" ] && [ ! -L "$TF_ROOT/.upload-active" ] && [ ! -e "$TF_ROOT/.install-owner" ] || { echo TOPFLOW_ERROR=UNVERIFIED_LEGACY_FILES; exit 1; }\nTF_LEGACY_CLEANING=true\nfi\n' + checks +
      'TF_VERSION_MISMATCH=true\n';
    }).join('');
    return 'tf_verify_install() {\nTF_VERSION_MISMATCH=false\n' +
      'TF_INSTALLED_MARKER=$(cat "$TF_ROOT/.topflow-install" 2>/dev/null || true)\n' +
      'if [ "$TF_INSTALLED_MARKER" = "$(printf \'TOPFLOW_SCREEN_INSTALL_V1\\n%s\' ' + shellQuote(payload.archiveSha256) + ')" ]; then\n' + current + branches +
      'else echo TOPFLOW_ERROR=INSTALLED_VERSION_MISMATCH; exit 1; fi\n}\ntf_verify_install\n';
  }
  function memoryController(action, payload) {
    return '(\nset -- ' + action + (action === 'status' ? '' : ' --confirmed') + '\n' + payload.screenctlSource.replace(/\n?$/, '\n') + ')\n';
  }
  function installLock(owner, payload) {
    return ownerGuard(owner) + ownershipGuard(payload) +
      'TF_ROOT_ID=$(stat -c %d:%i "$TF_ROOT")\n[ -f "$TF_ROOT/.lifecycle.lock" ] && [ ! -L "$TF_ROOT/.lifecycle.lock" ] && [ "$(stat -c %h "$TF_ROOT/.lifecycle.lock")" = 1 ] && [ "$(stat -c %u "$TF_ROOT/.lifecycle.lock")" = 0 ] || { echo TOPFLOW_ERROR=UNSAFE_LOCK; exit 1; }\n' +
      'exec 7<"$TF_ROOT/.lifecycle.lock"\nTF_LOCK_ID=$(stat -L -c %d:%i "/proc/self/fd/7")\nflock -n 7 || { echo TOPFLOW_ERROR=CONTROL_BUSY; exit 1; }\n' +
      '[ "$(stat -c %d:%i "$TF_ROOT")" = "$TF_ROOT_ID" ] && [ "$(stat -c %d:%i "$TF_ROOT/.lifecycle.lock")" = "$TF_LOCK_ID" ] || { echo TOPFLOW_ERROR=INSTALL_CHANGED; exit 1; }\n' +
      'TF_RUN=/tmp/topflow-screen\n[ -d "$TF_RUN" ] && [ ! -L "$TF_RUN" ] && [ "$(readlink -f "$TF_RUN")" = "$TF_RUN" ] && [ "$(stat -c %u "$TF_RUN")" = 0 ] || { echo TOPFLOW_ERROR=UNSAFE_RUNTIME; exit 1; }\n' +
      '[ ! -L "$TF_RUN/control.lock" ] && { [ ! -e "$TF_RUN/control.lock" ] || { [ -f "$TF_RUN/control.lock" ] && [ "$(stat -c %h "$TF_RUN/control.lock")" = 1 ]; }; } || { echo TOPFLOW_ERROR=UNSAFE_LOCK; exit 1; }\n' +
      'exec 9>"$TF_RUN/control.lock"\nflock -n 9 || { echo TOPFLOW_ERROR=CONTROL_BUSY; exit 1; }\n' + ownerGuard(owner) + ownershipGuard(payload);
  }
  function buildInstallStart(owner, payload) {
    releaseAllowed(payload);
    token(owner);
    nativePayload(payload);
    return 'set -eu\numask 077\n' + rootGuard() +
      'for TF_TOOL in sha256sum tar flock; do command -v "$TF_TOOL" >/dev/null 2>&1 || { echo TOPFLOW_ERROR=MISSING_TOOL; exit 1; }; done\n' +
      '[ "$(uname -m)" = aarch64 ] || { echo TOPFLOW_ERROR=UNSUPPORTED_ARCH; exit 1; }\n' +
      '[ ! -e "$TF_ROOT" ] && [ ! -L "$TF_ROOT" ] || { echo TOPFLOW_ERROR=TARGET_EXISTS; exit 1; }\n' +
      'mkdir "$TF_ROOT"\n: > "$TF_ROOT/.lifecycle.lock"\nprintf \'%s\' ' + shellQuote(owner) + ' > "$TF_ROOT/.install-owner"\n' +
      'printf \'%s\\n\' ' + installedMembers(payload).map(shellQuote).join(' ') + ' > "$TF_ROOT/.topflow-files"\n' +
      'TF_RUN=/tmp/topflow-screen\n[ ! -e "$TF_RUN" ] && [ ! -L "$TF_RUN" ] || { echo TOPFLOW_ERROR=RUNTIME_EXISTS; exit 1; }\nmkdir "$TF_RUN"\n' +
      'printf \'%s\' ' + shellQuote(owner) + ' > "$TF_ROOT/.upload-active"\n' +
      'printf \'TOPFLOW_SCREEN_INSTALL_V1\\n%s\\n\' ' + shellQuote(payload.archiveSha256) + ' > "$TF_ROOT/.topflow-install"\n' +
      'printf \'TOPFLOW_INSTALL=READY\\n\'\n';
  }
  function buildUploadComplete(owner, payload) {
    nativePayload(payload);
    return 'set -eu\numask 077\n' + installLock(owner, payload) +
      '[ -f "$TF_ROOT/.upload-active" ] && [ ! -L "$TF_ROOT/.upload-active" ] && [ "$(cat "$TF_ROOT/.upload-active")" = ' + shellQuote(token(owner)) + ' ] || { echo TOPFLOW_ERROR=UPLOAD_OWNER; exit 1; }\n' +
      'rm -f "$TF_ROOT/.upload-active"\nprintf \'TOPFLOW_INSTALL=UPLOAD_FINISHED\\n\'\n';
  }
  function buildInstallFinish(owner, payload) {
    releaseAllowed(payload);
    nativePayload(payload);
    var allowed = payload.members.map(shellQuote).join('|');
    return 'set -eu\numask 077\n' + installLock(owner, payload) +
      '[ ! -e "$TF_ROOT/.upload-active" ] && [ ! -L "$TF_ROOT/.upload-active" ] || { echo TOPFLOW_ERROR=UPLOAD_ACTIVE; exit 1; }\n' +
      '[ -f "$TF_ROOT/.payload.tar.gz" ] && [ ! -L "$TF_ROOT/.payload.tar.gz" ] || { echo TOPFLOW_ERROR=INVALID_ARCHIVE; exit 1; }\n' +
      'printf \'%s  %s\\n\' ' + shellQuote(payload.archiveSha256) + ' "$TF_ROOT/.payload.tar.gz" | sha256sum -c -\n' +
      'TF_MEMBERS=$(tar -tzf "$TF_ROOT/.payload.tar.gz")\nprintf \'%s\\n\' "$TF_MEMBERS" | while IFS= read -r TF_MEMBER; do case "$TF_MEMBER" in ' + allowed + ') ;; *) echo TOPFLOW_ERROR=UNEXPECTED_MEMBER; exit 1;; esac; done\n' +
      'tar -xzf "$TF_ROOT/.payload.tar.gz" -C "$TF_ROOT"\n' +
      '(cd "$TF_ROOT" && sha256sum -c topflow-screen.sha256)\n' +
      'chmod 700 "$TF_ROOT"\nchmod 755 "$TF_ROOT/topflow-screen" "$TF_ROOT/topflow-factory-bus-aarch64" "$TF_ROOT/screenctl.sh" "$TF_ROOT/supervisor.sh"\n' +
      'rm -f "$TF_ROOT/.payload.tar.gz" "$TF_ROOT/.install-owner"\nprintf \'TOPFLOW_INSTALL=INSTALLED_NOT_STARTED\\n\'\n';
  }
  function buildScreenCommand(action, payload, confirmed) {
    if (!['status', 'start', 'restore', 'uninstall', 'autostart-enable', 'autostart-disable'].includes(action)) throw error('INVALID_ACTION', '屏幕动作无效');
    if (action !== 'status' && confirmed !== true) throw error('CONFIRM_REQUIRED', '须明确确认本次屏幕切换');
    if (action === 'start' || action === 'autostart-enable') releaseAllowed(payload);
    nativePayload(payload);
    var command = 'set -eu\n' + rootGuard();
    if (action === 'status') command += 'if [ ! -e "$TF_ROOT" ] && [ ! -L "$TF_ROOT" ]; then if pidof zte_topsw_devui >/dev/null 2>&1; then printf \'TOPFLOW_SCREEN={"installed":false,"mode":"factory"}\\n\'; else printf \'TOPFLOW_SCREEN={"installed":false,"mode":"unknown"}\\n\'; fi; exit 0; fi\n';
    command += '[ -d "$TF_ROOT" ] && [ ! -L "$TF_ROOT" ] && [ "$(readlink -f "$TF_ROOT")" = "$TF_ROOT" ] && [ "$(stat -c %u "$TF_ROOT")" = 0 ] || { echo TOPFLOW_ERROR=UNSAFE_TARGET; exit 1; }\n' + screenOwnershipGuard(payload);
    if (action === 'start' || action === 'autostart-enable' || action === 'autostart-disable') {
      command += '[ "$TF_VERSION_MISMATCH" = false ] || { echo TOPFLOW_ERROR=INSTALLED_VERSION_MISMATCH; exit 1; }\n' +
        '[ ! -e "$TF_ROOT/.install-owner" ] && [ ! -L "$TF_ROOT/.install-owner" ] && [ -f "$TF_ROOT/screenctl.sh" ] && [ ! -L "$TF_ROOT/screenctl.sh" ] || { echo TOPFLOW_ERROR=INSTALL_INCOMPLETE; exit 1; }\n' +
        'printf \'%s  %s\\n\' ' + shellQuote(payload.screenctlSha256) + ' "$TF_ROOT/screenctl.sh" | sha256sum -c -\n' +
        'sh "$TF_ROOT/screenctl.sh" ' + action + ' --confirmed\n' + (action === 'start' ? 'printf \'TOPFLOW_SWITCH=SUBMITTED\\n\'\n' : '');
    } else if (action === 'status') {
      command += 'TF_PARTIAL=false\nif [ -e "$TF_ROOT/.install-owner" ] || [ ! -f "$TF_ROOT/screenctl.sh" ]; then TF_PARTIAL=true; fi\nTF_UPLOAD=false\nif [ -e "$TF_ROOT/.upload-active" ]; then TF_UPLOAD=true; fi\n' +
        'TF_STATE=$(\n' + memoryController('status', payload) + ')\nprintf \'TOPFLOW_SCREEN={"partial":%s,"uploadActive":%s,"versionMismatch":%s,%s\\n\' "$TF_PARTIAL" "$TF_UPLOAD" "$TF_VERSION_MISMATCH" "${TF_STATE#\\{}"\n';
    } else {
      command += memoryController(action, payload);
      if (action === 'restore') command += 'printf \'TOPFLOW_SWITCH=SUBMITTED\\n\'\n';
    }
    return command;
  }
  function parseScreenStatus(output) {
    var lines = String(output || '').split(/\r?\n/).filter(function (line) { return line.indexOf('TOPFLOW_SCREEN=') === 0; });
    if (lines.length !== 1) throw error('STATUS_UNCONFIRMED', '屏幕状态未确认');
    var state;
    try { state = JSON.parse(lines[0].slice(15)); } catch (_) { throw error('STATUS_UNCONFIRMED', '屏幕状态无效'); }
    if (!state || !['factory', 'custom', 'unknown'].includes(state.mode)) throw error('STATUS_UNCONFIRMED', '屏幕状态无效');
    var parsed = { installed: state.installed !== false, partial: state.partial === true, uploadActive: state.uploadActive === true, mode: state.mode, pid: Number.isSafeInteger(state.pid) ? state.pid : null, ready: state.ready === true, heartbeatAge: Number.isSafeInteger(state.heartbeatAge) && state.heartbeatAge >= 0 ? state.heartbeatAge : null, supervised: state.supervised === true };
    if (typeof state.failure === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(state.failure)) parsed.failure = state.failure;
    if (parsed.failure && Object.prototype.hasOwnProperty.call(rendererFailures, state.rendererFailure)) parsed.rendererFailure = state.rendererFailure;
    if (parsed.failure && Number.isInteger(state.rendererExitStatus) && state.rendererExitStatus >= 0 && state.rendererExitStatus <= 255) parsed.rendererExitStatus = state.rendererExitStatus;
    if (['FACTORY_INTERNAL_LOCK_ACTIVE', 'FACTORY_INTERNAL_LOCK_UNSTABLE', 'FACTORY_AUTOSLEEP_LOCK_ACTIVE'].includes(state.waiting)) parsed.waiting = state.waiting;
    if (Number.isSafeInteger(state.waitingRemaining) && state.waitingRemaining >= 0 && state.waitingRemaining <= 360) parsed.waitingRemaining = state.waitingRemaining;
    if (state.versionMismatch === true) parsed.versionMismatch = true;
    if (state.autostart && typeof state.autostart.enabled === 'boolean' && ['present', 'absent', 'conflict', 'unknown'].includes(state.autostart.hook) && ['disabled', 'enabled', 'waiting', 'starting', 'started', 'skipped', 'failed', 'cancelled'].includes(state.autostart.state)) {
      parsed.autostart = { enabled: state.autostart.enabled, hook: state.autostart.hook, state: state.autostart.state };
      if (typeof state.autostart.reason === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(state.autostart.reason)) parsed.autostart.reason = state.autostart.reason;
    }
    return parsed;
  }
  function directRequest(root, path, options) {
    var base = typeof KANO_baseURL !== 'undefined' && KANO_baseURL ? KANO_baseURL : '/api';
    var url = new URL(String(base).replace(/\/$/, '') + path, root.location.href);
    if (url.origin !== root.location.origin) throw error('UNSAFE_API', 'UFI 接口必须与当前已登录面板同源');
    var headers = typeof common_headers !== 'undefined' && common_headers ? Object.assign({}, common_headers) : {};
    Object.keys(headers).forEach(function (key) { if (key.toLowerCase() === 'content-type') delete headers[key]; });
    if (options.json) headers['Content-Type'] = 'application/json';
    return root.fetch(url.href, { method: options.method || 'POST', headers: headers, credentials: 'same-origin', body: options.json ? JSON.stringify(options.body) : options.body });
  }
  function ownInstalledBlock(source, executingScript) {
    if (typeof source !== 'string' || typeof executingScript !== 'string' || executingScript.length < 100) return null;
    var blocks = /<!--\s*\[KANO_PLUGIN_START\]\s*(.*?)\s*-->([\s\S]*?)<!--\s*\[KANO_PLUGIN_END\]\s*\1\s*-->/g;
    var found = [], names = [], block;
    while ((block = blocks.exec(source))) {
      names.push(block[1].trim());
      var scripts = Array.from(block[2].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi));
      if (scripts.length === 1 && scripts[0][1].trim() === executingScript.trim()) found.push({ name: block[1].trim(), remaining: source.slice(0, block.index) + source.slice(blocks.lastIndex) });
    }
    return found.length === 1 && found[0].name.length <= 160 && /\.txt$/i.test(found[0].name) && !/[\\/:\x00-\x1f]/.test(found[0].name) && !found[0].name.includes('..') && names.filter(function (name) { return name === found[0].name; }).length === 1 ? found[0] : null;
  }
  function findInstalledBlockName(source, executingScript) {
    var record = ownInstalledBlock(source, executingScript); return record && record.name;
  }
  async function removeInstalledRecord(root, executingScript) {
    async function readSource() {
      var response = await directRequest(root, '/get_custom_head', { method: 'GET' }), data = await response.json();
      if (!response.ok || !data || typeof data.text !== 'string') throw error('RECORD_UNCONFIRMED', 'UFI 插件记录读取未确认');
      return data.text;
    }
    var first = await readSource(), record = ownInstalledBlock(first, executingScript);
    if (!record) throw error('RECORD_AMBIGUOUS', '未能唯一识别本插件及真实导入名称，请使用 UFI 插件列表删除');
    var second = await readSource(), again = ownInstalledBlock(second, executingScript);
    if (first !== second || !again || again.name !== record.name) throw error('RECORD_CHANGED', '插件列表已变化，未调用删除接口；请刷新后重试');
    var response = await directRequest(root, '/plugin/uninstall', { json: true, body: { name: record.name } });
    var reply = await response.json().catch(function () { return null; });
    if (!response.ok || !reply || typeof reply !== 'object' || Array.isArray(reply) || reply.success === false || reply.result === 'error' || reply.error) throw error('RECORD_API_UNCONFIRMED', 'UFI 单条卸载接口不可用或响应未确认，请在插件列表删除“' + record.name + '”');
    var after = await readSource();
    if (ownInstalledBlock(after, executingScript) || after.trim() !== record.remaining.trim()) throw error('RECORD_REMOVE_UNCONFIRMED', '未回读到仅本插件记录被移除，请核对 UFI 插件列表；不会整表覆盖或自动重试');
    return { removed: true, name: record.name };
  }
  async function uploadNative(root, payload) {
    releaseAllowed(payload);
    nativePayload(payload);
    var binary = root.atob(payload.archiveBase64), bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var form = new root.FormData();
    form.append('path', ROOT);
    form.append('file', new root.Blob([bytes], { type: 'application/gzip' }), '.payload.tar.gz');
    var response = await directRequest(root, '/upload_file', { body: form });
    var result = await response.json();
    if (!response.ok || result.result !== 'success' || result.path !== ROOT + '/.payload.tar.gz' || result.name !== '.payload.tar.gz' || result.size !== bytes.length) { var uploadError = error('UPLOAD_UNCONFIRMED', '归档上传未确认，不会解包或自动重试'); uploadError.uploadCompleted = true; throw uploadError; }
  }
  function readBridges(root, control) {
    function denyWrite() { if (!control()) throw error('READ_ONLY', '当前会话未启用设备控制'); }
    return {
      getData: function (params) { if (typeof getData !== 'function') throw error('NO_BRIDGE', 'UFI getData 未就绪，请使用原登录入口后重试'); return getData(params); },
      postData: function (cookie, data, timeout) { denyWrite(); if (typeof postData !== 'function') throw error('NO_BRIDGE', 'UFI postData 不可用'); return postData(cookie, data, timeout); },
      sessionCookie: function () { return typeof KANO_COOKIE !== 'undefined' ? KANO_COOKIE : null; },
      request: function (path, options) { if (options && options.body !== undefined) denyWrite(); if (!root.DatadApp || typeof root.DatadApp.request !== 'function') throw error('NO_BRIDGE', 'UFI DatadApp 不可用'); return root.DatadApp.request(path, options); },
      runShellWithRoot: async function (command, timeout) {
        var response = await directRequest(root, '/run_shell', { json: true, body: { cmd: String(command), timeout: Number(timeout) || 12000 } });
        var result = await response.json().catch(function () { return {}; });
        if (!response.ok || result.success !== true || typeof result.content !== 'string') throw shellFailure(response, result);
        return result;
      }
    };
  }
  function register(root) {
    var doc = root.document;
    if (!doc || root.__topflow_screen_plugin) return;
    var payload = privatePayload(root.TopFlowPackagePayload);
    var versionLabel = typeof payload.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(payload.version) ? payload.version : '开发版';
    var versionCaption = versionLabel === '开发版' ? versionLabel : 'v' + versionLabel;
    var executingScript = doc.currentScript && doc.currentScript.textContent || '';
    var controller = { close: closePanel, open: openPanel };
    root.__topflow_screen_plugin = controller;
    var panel = null, screen = null, mounted = null, message = null, observer = null, controls = false, busy = false, currentState = null;
    var bridges = readBridges(root, function () { return controls; });
    var cancelTask = null, cancelRequested = false, cancelSignal = null, cancelWake = null, activeAction = '', stateEpoch = 0;
    var focusReturn = null;
    function updateStateCard() {
      if (!panel) return;
      var state = currentState, card = panel.querySelector('[data-tf-state-card]');
      var mode = state && state.mode, pending = state && (state.waiting || state.uploadActive || state.partial);
      card.setAttribute('data-mode', mode === 'custom' ? 'custom' : mode === 'factory' ? 'factory' : 'unknown');
      card.setAttribute('data-tone', !state || state.failure || pending || mode === 'unknown' ? 'pending' : 'ready');
      card.setAttribute('aria-busy', String(busy));
      panel.querySelector('[data-tf-mode]').textContent = !state ? (busy ? '正在读取状态' : '屏幕状态未确认') : mode === 'custom' ? '插件屏幕' : mode === 'factory' ? '原厂屏幕' : '屏幕状态未确认';
      var actions = { status: '读取中', switch: '切换中', uninstall: '卸载中', autostart: '设置中', cancel: '取消中' };
      panel.querySelector('[data-tf-state-label]').textContent = busy ? (actions[activeAction] || '处理中') : !state ? '等待确认' : state.failure ? '需要检查' : state.waiting ? '等待交接' : state.uploadActive ? '上传待确认' : state.partial ? '安装未完成' : mode === 'custom' ? '进程运行中' : mode === 'factory' ? '原厂运行中' : '状态未知';
      panel.querySelector('[data-tf-state-hint]').textContent = !state ? (busy ? '正在通过 UFI 读取当前屏幕与组件状态。' : '状态读取未确认，请刷新后继续。') : state.failure ? '操作结果需要检查，详细信息见下方。' : state.waiting ? '原厂继续运行，可随时取消本次等待。' : state.uploadActive ? '上传结果未确认，等待完成后再继续操作。' : state.partial ? '可清理已识别的未完成安装，再重新启用。' : mode === 'custom' ? '进程状态已读取，画面与触摸请在设备上确认。' : mode === 'factory' ? '原厂屏幕正在运行，插件组件按需启用。' : '请刷新状态，确认后再继续操作。';
    }
    function say(text) { if (message) message.textContent = text; }
    function updateButtons() {
      if (!panel) return;
      updateStateCard();
      var update = panel.querySelector('[data-tf-update]');
      update.hidden = !(currentState && currentState.installed && currentState.versionMismatch);
      update.disabled = busy || update.hidden || currentState.uploadActive || !!currentState.waiting || payload.reviewOnly;
      update.textContent = '更新到 v' + versionLabel;
      var boot = currentState && currentState.autostart;
      var auto = panel.querySelector('[data-tf-autostart]');
      auto.textContent = boot && boot.enabled ? '关闭自启动' : '开启自启动';
      auto.setAttribute('aria-checked', String(!!(boot && boot.enabled)));
      auto.disabled = busy || !currentState || !currentState.installed || currentState.partial || currentState.uploadActive || currentState.versionMismatch || !boot || (!boot.enabled && (payload.reviewOnly || ['conflict', 'unknown'].includes(boot.hook)));
      var bootLabels = { disabled: '已关闭', enabled: '已开启 · 下次开机生效', waiting: '正在等待开机服务就绪', starting: '正在接管屏幕', started: '本次开机已启动', skipped: '本次自动启动已跳过', failed: '本次自动启动失败，请刷新屏幕状态', cancelled: '本次自动启动已取消' };
      var bootReasons = { READY_TIMEOUT: '服务就绪超时', INTEGRITY_FAILED: '组件校验未通过', CONFIG_INVALID: '启动配置未确认', START_FAILED: '屏幕接管未确认', SCREEN_UNCONFIRMED: '屏幕运行尚未确认' };
      panel.querySelector('[data-tf-autostart-state]').textContent = !currentState ? '状态未确认' : !currentState.installed ? '安装屏幕组件后可开启' : currentState.versionMismatch ? '更新组件后可设置' : !boot ? '自启动状态未确认，请刷新' : ['conflict', 'unknown'].includes(boot.hook) ? '启动项状态异常，请刷新检查' : (boot.enabled || boot.state === 'failed' ? bootLabels[boot.state] : '已关闭') + (bootReasons[boot.reason] ? ' · ' + bootReasons[boot.reason] : '');
      panel.querySelector('[data-tf-version]').textContent = !currentState ? '设备组件版本尚未确认' : currentState.uploadActive ? '组件上传尚未结束，暂不能更新' : currentState.versionMismatch ? '已核验可更新的旧版组件' : currentState.partial ? '当前 TXT 组件安装未完成' : currentState.installed ? '设备组件与本 TXT 一致 · v' + versionLabel : '设备尚未安装屏幕组件';
      var toggle = panel.querySelector('[data-tf-toggle]');
      toggle.disabled = busy || !currentState || currentState.uploadActive;
      toggle.textContent = !currentState ? '正在读取屏幕状态…' : currentState.uploadActive ? '等待上传结束确认' : currentState.partial && !currentState.versionMismatch ? '清理未完成安装' : currentState.mode === 'custom' || currentState.mode === 'unknown' && currentState.installed || currentState.failure === 'TRANSITION_GUARD_RELEASE_UNCONFIRMED' || currentState.failure === 'FACTORY_RESTORE_UNCONFIRMED' || currentState.failure === 'RENDERER_STILL_ACTIVE' ? '切换回原厂屏幕' : currentState.versionMismatch ? '更新并切换到插件屏幕' : currentState.installed ? '切换到插件屏幕' : '安装并切换到插件屏幕';
      if (payload.reviewOnly && currentState && !currentState.partial && currentState.mode === 'factory') { toggle.disabled = true; toggle.textContent = '审查候选 · 实体屏发布已阻止'; }
      panel.querySelector('[data-tf-uninstall]').disabled = busy || !currentState || currentState.uploadActive;
      panel.querySelector('[data-tf-status]').disabled = busy;
      panel.querySelector('[data-tf-close]').disabled = busy;
      var cancel = panel.querySelector('[data-tf-cancel]');
      cancel.hidden = !(currentState && currentState.waiting);
      cancel.disabled = cancel.hidden || cancelRequested || busy && activeAction !== 'switch';
      if (currentState && currentState.waiting) { toggle.disabled = true; toggle.textContent = '等待原厂安全交接…'; }
    }
    function stopWebScreen() {
      controls = false;
      if (mounted) mounted.destroy(); mounted = null;
      if (screen) screen.replaceChildren();
      if (panel) panel.querySelector('[data-tf-advanced]').open = false;
    }
    function mountScreen() {
      // This explicit UFI control entry supplies authenticated bridges. Standalone snapshots keep their own read-only defaults.
      controls = true;
      if (mounted) mounted.destroy();
      screen.replaceChildren();
      var transport = root.TopflowDeviceAPI.createUfiTransport(bridges, { allowWrites: controls });
      var api = root.TopflowDeviceAPI.create({ mode: controls ? 'live' : 'readonly', allowWrites: controls, transport: transport });
      var aoTransport = root.TopFlowAoyouUfiTransport.createTransport({ runShellWithRoot: bridges.runShellWithRoot, allowWrites: controls });
      var aoyou = root.TopFlowAoyou.createAdapter({ mode: controls ? 'control' : 'readonly', transport: function (request) { if (request.method !== 'GET' && !controls) throw error('READ_ONLY', '当前会话未启用设备控制'); return aoTransport(request); } });
      mounted = root.TopFlowUI.mount(screen, { api: api, aoyou: aoyou, state: root.TopflowDeviceAPI.normalize(root.UFI_DATA || {}), demo: false, live: true, control: controls, poll: true, interval: 3000 });
    }
    function closePanel() {
      if (busy) { say('操作尚未完成，请等待结果后关闭。'); return; }
      stopWebScreen();
      if (observer) observer.disconnect(); observer = null;
      if (panel) panel.remove();
      panel = screen = message = null;
      currentState = null; stateEpoch++;
      if (focusReturn && typeof focusReturn.focus === 'function') focusReturn.focus();
      focusReturn = null;
    }
    async function shell(command, marker, timeout) {
      var result = await bridges.runShellWithRoot(command, timeout || 12000);
      if (!result || result.success !== true || typeof result.content !== 'string' || (marker && !result.content.split(/\r?\n/).includes(marker))) {
        var code = result && String(result.content || '').match(/TOPFLOW_ERROR=([A-Z_]+)/);
        throw error(code ? code[1] : 'NATIVE_FAILED', code ? failureMessage(code[1]) : '屏幕操作未确认；不会自动重试，请读取状态');
      }
      return result.content;
    }
    async function readStatus() {
      var timer;
      var deadline = new Promise(function (_, reject) { timer = root.setTimeout(function () { reject(error('STATUS_TIMEOUT', '屏幕状态读取超时，操作结果未确认；可刷新状态或取消已有等待')); }, 15000); });
      try { return parseScreenStatus(await Promise.race([shell(buildScreenCommand('status', payload), null), deadline])); }
      finally { root.clearTimeout(timer); }
    }
    async function screenStatus() {
      var readEpoch = stateEpoch;
      var state = await readStatus();
      if (readEpoch !== stateEpoch) return state;
      currentState = state; updateButtons();
      say((state.uploadActive ? '上传正在进行或结果未知，清理暂被锁定以防迟到写入；' : state.partial ? '存在可识别的未完成安装，请清理后重新安装；' : state.versionMismatch ? '已识别受信旧版本，启动前需安全更新；' : state.installed ? '组件已安装；' : '尚未安装组件；') + (state.mode === 'custom' ? '自定义屏幕进程运行中，仍需目视确认画面与触摸。' : state.mode === 'factory' ? '原厂屏幕进程运行中。' : '显示状态未知，请检查设备。') + (payload.reviewOnly ? '\n本地审查文件：安装与启用已阻止；恢复和安全卸载仍可用。' : payload.directSwitch ? '\n' + versionLabel + ' 直接切换版：确认后直接点亮插件屏幕；原厂启用PIN时保持锁屏，无需等待自然熄屏。新版尚未实机验证，加载入口不会自动切换。' : payload.diagnosticCandidate ? '\n' + versionLabel + ' 诊断自测版：既有启动失败根因仍未确定，加载入口不会自动切换。' : '\n开发测试版 · 待设备验收。加载此入口不会自动安装或切换。'));
      if (state.waiting) say(waitingMessage(state));
      else if (state.failure) say(failureStatusMessage(state) + (state.mode === 'factory' ? '。原厂屏幕进程已回读确认。' : '。请确认原厂恢复状态。'));
      return state;
    }
    async function refreshStatus() {
      if (busy) return;
      busy = true; activeAction = 'status'; stateEpoch++; updateButtons();
      try { return await screenStatus(); }
      catch (e) { currentState = null; say(e.message); }
      finally { busy = false; activeAction = ''; updateButtons(); }
    }
    async function toggleAutostart() {
      if (busy || !currentState || !currentState.installed || currentState.partial || currentState.uploadActive || currentState.versionMismatch || !currentState.autostart) return;
      busy = true; activeAction = 'autostart'; stateEpoch++; updateButtons();
      try {
        currentState = await readStatus();
        var boot = currentState.autostart;
        if (!currentState.installed || currentState.partial || currentState.uploadActive || currentState.versionMismatch || !boot || (!boot.enabled && (payload.reviewOnly || ['conflict', 'unknown'].includes(boot.hook)))) throw error('AUTOSTART_UNCONFIRMED', '当前组件或自启动状态未确认，请刷新后重试');
        var enable = !boot.enabled;
        if (!root.confirm(enable ? '开启后，设备重启时由 UFI 官方启动入口自动加载插件屏幕；服务就绪后尝试一次，失败沿用原厂恢复机制。不立即切换当前屏幕。确认开启？' : '关闭开机自启动并取消尚未接管的启动任务。当前正在运行的屏幕保持不变。确认关闭？')) return;
        say(enable ? '正在登记本插件的开机启动项…' : '正在移除本插件的开机启动项…');
        await shell(buildScreenCommand(enable ? 'autostart-enable' : 'autostart-disable', payload, true), enable ? 'TOPFLOW_AUTOSTART=ENABLED' : 'TOPFLOW_AUTOSTART=DISABLED', 45000);
        currentState = await readStatus();
        if (!currentState.installed || currentState.versionMismatch || currentState.partial || currentState.uploadActive || !currentState.autostart || currentState.autostart.enabled !== enable || currentState.autostart.hook !== (enable ? 'present' : 'absent') || (!enable && ['waiting', 'starting'].includes(currentState.autostart.state))) throw error('AUTOSTART_UNCONFIRMED', '自启动设置回读不一致，结果未确认；请刷新状态，不会自动重试');
        say(enable ? '已确认开启开机自启动。下次重启后，UFI 就绪时自动尝试加载插件屏幕。' : '已确认关闭开机自启动，尚未接管的启动任务已取消；当前屏幕保持不变。');
      } catch (e) { currentState = null; say(e.message + '。请刷新查看实际状态，不会自动重试。'); }
      finally { busy = false; activeAction = ''; updateButtons(); }
    }
    async function installNative() {
      var stage = '创建安装目录';
      try {
        var bytes = new Uint8Array(16); root.crypto.getRandomValues(bytes);
        var owner = Array.from(bytes, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
        await shell(buildInstallStart(owner, payload), 'TOPFLOW_INSTALL=READY');
        stage = '上传原生归档';
        say('通过 UFI 文件上传接口传输已确认的归档…');
        var uploadError = null;
        try { await uploadNative(root, payload); } catch (e) { if (!e.uploadCompleted) throw error('UPLOAD_PENDING', '上传连接中断或响应不完整，结果未知；清理已锁定，不能假定后台上传结束'); uploadError = e; }
        await shell(buildUploadComplete(owner, payload), 'TOPFLOW_INSTALL=UPLOAD_FINISHED');
        if (uploadError) throw uploadError;
        stage = '校验归档并解包';
        say('核验 SHA-256 并解包组件…');
        await shell(buildInstallFinish(owner, payload), 'TOPFLOW_INSTALL=INSTALLED_NOT_STARTED', 20000);
      } catch (e) { throw error(e.code || 'INSTALL_FAILED', '安装阶段「' + stage + '」：' + e.message); }
    }
    async function cancellableStatus(pending) {
      try {
        var value = await Promise.race([pending, cancelSignal]);
        if (cancelRequested) { await cancelTask; throw error('SWITCH_CANCELLED', '已取消等待，原厂屏幕已回读确认'); }
        return value;
      } catch (e) {
        if (cancelRequested) { await cancelTask; throw error('SWITCH_CANCELLED', '已取消等待，原厂屏幕已回读确认'); }
        throw e;
      }
    }
    async function switchScreen(action, context) {
      var commandError = null;
        try { await shell(buildScreenCommand(action, payload, true), 'TOPFLOW_SWITCH=SUBMITTED', 45000); } catch (e) { commandError = e; }
        // A visible factory PID cannot override failed provider/guard recovery.
        // The controller's marker proves its full recovery barrier completed.
        if (commandError) throw commandError;
        context.submitted = true;
        // Submission precedes firmware/policy checks and QPIC teardown. Give
        // those bounded phases time to finish; readiness/failure still exits
        // immediately and this polling exists only during the user's action.
        var wanted = action === 'start' ? 'custom' : 'factory', previousPid = null, consecutive = 0, maxAttempts = payload.directSwitch ? 30 : 10, failedReads = 0, lastReadError = null;
        for (var attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(function (resolve) { root.setTimeout(resolve, currentState && currentState.waiting ? 5000 : 1000); });
          if (cancelRequested) { await cancelTask; throw error('SWITCH_CANCELLED', '已取消等待，原厂屏幕已回读确认'); }
          try {
            var state = await cancellableStatus(readStatus());
            if (cancelRequested) { await cancelTask; throw error('SWITCH_CANCELLED', '已取消等待，原厂屏幕已回读确认'); }
            currentState = state; updateButtons();
            failedReads = 0; lastReadError = null;
            if (wanted === 'custom' && state.failure) throw error('SCREEN_START_REJECTED', failureStatusMessage(state) + (state.mode === 'factory' ? '。原厂屏幕进程已回读确认' : ''));
            if (wanted === 'custom' && state.waiting) { maxAttempts = 90; say(waitingMessage(state)); }
            var matches = state.mode === wanted && (wanted !== 'custom' || state.installed && !state.versionMismatch && !state.partial && !state.uploadActive && state.ready && state.supervised && state.pid !== null && state.heartbeatAge !== null && state.heartbeatAge <= 12);
            consecutive = matches ? (wanted === 'factory' || state.pid === previousPid ? consecutive + 1 : 1) : 0;
            previousPid = state.pid;
            if (consecutive >= 3) { currentState = state; say((wanted === 'custom' ? '插件屏幕进程与首帧心跳' : '原厂屏幕进程') + '已连续三次回读确认，请目视检查画面和触摸。'); return state; }
          } catch (statusError) {
            if (cancelRequested) { await cancelTask; throw error('SWITCH_CANCELLED', '已取消等待，原厂屏幕已回读确认'); }
            if (statusError.code === 'SCREEN_START_REJECTED' || statusError.code === 'STATUS_TIMEOUT') throw statusError;
            consecutive = 0; previousPid = null; failedReads++;
            // Transport exceptions can contain a URL or response text. Surface
            // only the bounded code, never arbitrary transport diagnostics.
            var readCode = typeof statusError.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(statusError.code) ? statusError.code : 'STATUS_NETWORK_ERROR';
            lastReadError = error('STATUS_READ_FAILED', '屏幕状态连续读取失败 ' + failedReads + ' 次，切换结果未确认；最后一次错误：' + readCode);
            if (failedReads >= 3) throw lastReadError;
          }
        }
        throw lastReadError || error('SWITCH_UNCONFIRMED', '未观察到目标屏幕进程，切换未确认；请读取状态或恢复原厂');
    }
    async function cancelWaiting() {
      if (cancelRequested || !currentState || !currentState.waiting || busy && activeAction !== 'switch') return;
      var managedSwitch = busy;
      busy = true; cancelRequested = true; stateEpoch++; if (!managedSwitch) activeAction = 'cancel'; updateButtons();
      say('正在取消等待并确认原厂服务保持运行…');
      cancelTask = (async function () {
        await shell(buildScreenCommand('restore', payload, true), 'TOPFLOW_SWITCH=SUBMITTED', 45000);
        var state = await readStatus();
        if (state.mode !== 'factory' || state.waiting) throw error('CANCEL_UNCONFIRMED', '取消等待后的原厂状态未确认，请刷新状态');
        currentState = state;
        say('已取消等待，原厂屏幕运行中；组件保留，可稍后重试。');
      })();
      if (cancelWake) cancelWake();
      try { await cancelTask; } catch (e) { say(e.message); }
      finally { if (!managedSwitch) { busy = false; cancelRequested = false; cancelTask = null; activeAction = ''; cancelSignal = null; cancelWake = null; } updateButtons(); }
    }
    async function toggleScreen(requestUpdate) {
      if (busy || currentState && (currentState.uploadActive || currentState.waiting)) return;
      if (requestUpdate === true && (!currentState || !currentState.installed || !currentState.versionMismatch)) return;
      if (currentState && currentState.partial && !currentState.versionMismatch) return uninstallPlugin();
      busy = true; activeAction = 'switch'; stateEpoch++; cancelRequested = false; cancelTask = null;
      cancelSignal = new Promise(function (resolve) { cancelWake = resolve; }); updateButtons();
      var switchContext = null, updating = requestUpdate === true;
      try {
        var state = await screenStatus();
        if (state.uploadActive || state.waiting) { say(state.waiting ? waitingMessage(state) : '组件上传尚未结束，暂不能切换或更新。'); return; }
        if (requestUpdate === true && (!state.installed || !state.versionMismatch)) { say('设备组件状态已变化，未发现可更新的受信旧版；未执行更新。'); return; }
        if (state.partial && !state.versionMismatch) { busy = false; return await uninstallPlugin(); }
        var action = requestUpdate === true ? 'start' : state.mode === 'custom' || state.mode === 'unknown' && state.installed || state.failure === 'TRANSITION_GUARD_RELEASE_UNCONFIRMED' || state.failure === 'FACTORY_RESTORE_UNCONFIRMED' || state.failure === 'RENDERER_STILL_ACTIVE' ? 'restore' : 'start';
        updating = action === 'start' && state.versionMismatch === true;
        if (action === 'start') releaseAllowed(payload);
        var prompt = action === 'restore' ? '停止插件屏幕并恢复原厂屏幕。' + (state.autostart && state.autostart.enabled ? '开机自启动仍已开启；下次重启会再次加载插件屏幕，可另行关闭自启动开关。' : '') + '确认切换？' : (state.versionMismatch ? '更新到本 TXT 的 v' + versionLabel + '：将自动恢复并确认原厂稳定，清理已核验的旧组件，安装新版后启动插件屏幕；期间屏幕会短暂切换，无需手动恢复或再次启用。UFI 插件记录保持不变。' : !state.installed ? '将安装组件到 /data/plugins/topflow-screen 并切换到插件屏幕。' : '将切换到插件屏幕。') + (payload.directSwitch ? '将直接点亮插件屏幕，原厂启用PIN时保持锁屏；无需等待自然熄屏。新版尚未在设备验证。' : payload.diagnosticCandidate ? '这是诊断自测版，既有启动失败根因尚未确定，新版尚未在设备验证。' : '实体屏尚未实机验证。') + '原厂文件保留，开机自启动由独立开关控制。' + (updating && state.autostart && state.autostart.enabled ? '本次组件更新会清除旧自启动设置，更新后请重新开启。' : '') + '确认继续？';
        if (!root.confirm(prompt)) { say('已取消，未执行屏幕切换。'); return; }
        stopWebScreen();
        if (action === 'start' && state.versionMismatch) {
          say('正在确认原厂稳定并移除已核验的旧组件…');
          await shell(buildScreenCommand('uninstall', payload, true), 'TOPFLOW_UNINSTALL=COMPONENTS_REMOVED', 60000);
          state = await readStatus();
          if (state.installed || state.mode !== 'factory') throw error('UPDATE_UNCONFIRMED', '旧组件清理后的原厂状态未确认，未安装或启动新版');
        }
        if (action === 'start' && !state.installed) await installNative();
        say(action === 'start' ? payload.directSwitch ? '正在直接交接并点亮插件屏幕…' : '正在切换到插件屏幕…' : '正在恢复原厂屏幕…');
        switchContext = { action: action, submitted: false, previousFailure: JSON.stringify([state.failure, state.rendererFailure, state.rendererExitStatus]) };
        await switchScreen(action, switchContext);
      } catch (e) {
        var refreshedState = null, refreshFailed = false;
        if (!cancelRequested) { try { refreshedState = await screenStatus(); } catch (_) { refreshFailed = true; currentState = null; } }
        var detail = e.message;
        // Only a fresh read belongs here. A cached failure predating an install
        // or rejected command must not replace that operation's actual error.
        var freshFailure = refreshedState && refreshedState.failure && switchContext && switchContext.action === 'start' &&
          (switchContext.submitted || JSON.stringify([refreshedState.failure, refreshedState.rendererFailure, refreshedState.rendererExitStatus]) !== switchContext.previousFailure);
        if (freshFailure) {
          var failureDetail = failureStatusMessage(refreshedState) + (refreshedState.mode === 'factory' ? '。原厂屏幕进程已回读确认' : '。请确认原厂恢复状态');
          detail = switchContext.submitted ? failureDetail : e.message + '。最新失败记录：' + failureDetail;
          if (switchContext.submitted && (e.code === 'STATUS_READ_FAILED' || e.code === 'STATUS_TIMEOUT')) detail += '。' + e.message;
        }
        if (refreshFailed) detail += '。随后刷新状态也失败，当前恢复状态未确认';
        say(detail + (currentState && currentState.partial ? '。确有未完成安装，可使用清理按钮；不会自动覆盖或重试。' : updating ? '。更新未完成，请刷新查看当前组件与屏幕状态；不会自动重试。' : '。组件不会因此被删除，可查看状态后重试。'));
      }
      finally {
        if (cancelTask) { try { await cancelTask; } catch (_) {} }
        busy = false; activeAction = ''; cancelRequested = false; cancelTask = null; cancelSignal = null; cancelWake = null; updateButtons();
      }
    }
    async function uninstallPlugin() {
      if (busy || !currentState || currentState.uploadActive) return;
      if (!root.confirm('卸载将关闭并移除本插件开机启动项，恢复并确认原厂屏幕，再删除本插件 /data/plugins/topflow-screen 与 /tmp/topflow-screen。保留原厂、UFI及其他插件文件。面板插件记录的安全移除将在清理后检查。确认卸载？')) return;
      busy = true; activeAction = 'uninstall'; stateEpoch++; updateButtons(); stopWebScreen();
      try {
        say('正在恢复原厂、停止本插件进程并验证清理路径…');
        if (currentState.installed) await shell(buildScreenCommand('uninstall', payload, true), 'TOPFLOW_UNINSTALL=COMPONENTS_REMOVED', 60000);
        currentState = await readStatus();
        if (currentState.installed || currentState.mode !== 'factory') throw error('UNINSTALL_UNCONFIRMED', '组件清理后的原厂状态未确认');
        try {
          await removeInstalledRecord(root, executingScript);
          say('卸载已回读确认：实体组件、运行文件及本插件 UFI 记录已清除，原厂屏幕运行中。关闭后刷新 UFI 页面以移除已加载入口。');
        } catch (recordError) { say('实体组件和运行文件已清除，原厂屏幕运行中；面板记录清理尚未确认。' + recordError.message + '。不会改写整份 custom_head。'); }
      } catch (e) { say(e.message + '。卸载未完全确认；不会删除不明文件或改写其他插件记录。'); }
      finally { busy = false; activeAction = ''; updateButtons(); }
    }
    function openPanel() {
      if (panel) return;
      focusReturn = doc.activeElement || null;
      panel = doc.createElement('div'); panel.className = 'tf-package-shell';
      panel.innerHTML = '<section class="tf-package-dialog" role="dialog" aria-modal="true" aria-label="TopFlow 屏幕插件" tabindex="-1">' +
        '<header class="tf-package-head"><div class="tf-package-brand"><span class="tf-package-mark" aria-hidden="true">TF</span><div><p class="tf-package-eyebrow">UFI · 屏幕控制台</p><h2>TopFlow 屏幕</h2></div></div><button class="tf-package-close" data-tf-close type="button" aria-label="关闭管理面板">关闭<span aria-hidden="true">×</span></button></header>' +
        '<div class="tf-package-scroll" role="region" aria-label="屏幕与组件管理" tabindex="0">' +
        '<section class="tf-package-state-card" data-tf-state-card data-mode="unknown" data-tone="pending" aria-busy="true" aria-label="当前屏幕"><div class="tf-package-state-top"><span class="tf-package-caption">当前显示</span><span class="tf-package-state-pill"><i aria-hidden="true"></i><span data-tf-state-label>读取中</span></span></div><div class="tf-package-state-main"><div><h3 data-tf-mode>正在读取状态</h3><p data-tf-state-hint>正在通过 UFI 读取当前屏幕与组件状态。</p></div><span class="tf-package-screen-icon" aria-hidden="true"><i></i></span></div><button class="tf-package-primary" data-tf-toggle type="button" disabled>正在读取屏幕状态…</button><button class="tf-package-cancel" data-tf-cancel type="button" hidden>取消等待，保留原厂</button></section>' +
        '<section class="tf-package-version" aria-label="组件版本"><div class="tf-package-section-head"><div><span class="tf-package-caption">组件版本</span><b>本 TXT · ' + versionCaption + '</b></div><button class="tf-package-subtle" data-tf-status type="button">刷新状态</button></div><p data-tf-version>设备组件版本尚未确认</p><button class="tf-package-update" data-tf-update type="button" hidden disabled>更新到 v' + versionLabel + '</button><p class="tf-package-footnote">检测已导入 TXT 与设备组件；新版需先导入 UFI。</p></section>' +
        '<section class="tf-package-autostart" aria-label="开机启动"><div><b>开机自动启用</b><p data-tf-autostart-state>状态未确认</p></div><button class="tf-package-switch" data-tf-autostart type="button" role="switch" aria-label="开机自动启用插件屏幕" aria-checked="false" disabled>开启自启动</button></section>' +
        '<section class="tf-package-feedback" aria-label="操作结果"><span class="tf-package-caption">操作信息</span><p data-tf-message role="status" aria-live="polite" aria-atomic="true">正在读取屏幕状态…</p></section>' +
        '<details data-tf-advanced><summary>设备控制</summary><p>展开即可编辑；短信、Wi-Fi、基站和遨游等操作均在提交前确认。收起或关闭即停止刷新并撤销控制。</p><div data-tf-screen></div></details>' +
        '</div>' +
        '<footer class="tf-package-footer"><a class="tf-package-docs" href="https://tapan.top/UFITOOLS-U60Pro/1.0.0%E6%96%B0%E7%89%88%E6%9C%AC%E6%96%87%E6%A1%A3" target="_blank" rel="noopener noreferrer">UFI 官方文档<span aria-hidden="true">↗</span></a><button class="tf-package-danger" data-tf-uninstall type="button" disabled>卸载插件</button></footer>' +
        '</section>';
      doc.body.append(panel); screen = panel.querySelector('[data-tf-screen]'); message = panel.querySelector('[data-tf-message]');
      if (typeof root.MutationObserver === 'function') {
        observer = new root.MutationObserver(function () {
          if (panel && !panel.isConnected) { stopWebScreen(); if (observer) observer.disconnect(); observer = null; panel = screen = message = null; currentState = null; }
        });
        // The dialog is a direct body child. Changes inside UFI's live status
        // cards do not need to wake this disposal observer.
        observer.observe(doc.body, { childList: true });
      }
      panel.querySelector('[data-tf-close]').onclick = closePanel;
      panel.onkeydown = function (event) {
        if (event.key === 'Escape') { event.preventDefault(); if (!busy) closePanel(); return; }
        if (event.key !== 'Tab' || !panel || typeof panel.querySelectorAll !== 'function') return;
        var focusable = Array.from(panel.querySelectorAll('button:not(:disabled), a[href], summary, [tabindex="0"]')).filter(function (item) { return !item.hidden && item.getClientRects().length > 0; });
        if (!focusable.length) { event.preventDefault(); return; }
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      var closeButton = panel.querySelector('[data-tf-close]');
      if (typeof closeButton.focus === 'function') closeButton.focus();
      panel.querySelector('[data-tf-status]').onclick = refreshStatus;
      panel.querySelector('[data-tf-update]').onclick = function () { return toggleScreen(true); };
      panel.querySelector('[data-tf-toggle]').onclick = toggleScreen;
      panel.querySelector('[data-tf-autostart]').onclick = toggleAutostart;
      panel.querySelector('[data-tf-cancel]').onclick = cancelWaiting;
      panel.querySelector('[data-tf-uninstall]').onclick = uninstallPlugin;
      panel.querySelector('[data-tf-advanced]').ontoggle = function (event) { if (event.target.open) mountScreen(); else stopWebScreen(); };
      refreshStatus();
    }
    function attachEntry() {
      var entry = doc.createElement('button'); entry.type = 'button'; entry.className = 'tf-package-entry'; entry.textContent = 'TopFlow 屏幕 · 预览与管理'; entry.onclick = openPanel;
      // UFI clips .functions-container to the height of its inner .collapse_box.
      // Keep this entry outside that collapsing region, as existing plugins do.
      var functions = doc.querySelector('.functions-container');
      if (functions && typeof functions.insertAdjacentElement === 'function') functions.insertAdjacentElement('afterend', entry);
      else (doc.querySelector('.container') || doc.body).append(entry);
    }
    if (doc.body) attachEntry(); else doc.addEventListener('DOMContentLoaded', attachEntry, { once: true });
  }
  return { register: register, buildInstallStart: buildInstallStart, buildUploadComplete: buildUploadComplete, buildInstallFinish: buildInstallFinish, buildScreenCommand: buildScreenCommand, parseScreenStatus: parseScreenStatus, nativePayload: nativePayload, directRequest: directRequest, uploadNative: uploadNative, findInstalledBlockName: findInstalledBlockName, removeInstalledRecord: removeInstalledRecord, shellFailure: shellFailure };
});
