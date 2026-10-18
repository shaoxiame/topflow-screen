/* Native UFI forwarding editor. Existing authenticated UFI APIs only.
 * Page 13 overview, 14 draft/authentication, 15 ASCII keyboard. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SMS_FORWARD_PAGES_H
#define TF_SMS_FORWARD_PAGES_H
#include "ufi_auth.h"
typedef struct {char values[5][8194],payload[16512];int kind,field,info,password_saved,loaded,uppercase,symbols,enabled,power,baseline_valid;char method[24],pending_method[24];unsigned char baseline[32];} tf_forward_draft;
_Static_assert(sizeof(tf_forward_draft)<=61440,"forward draft fits private pages");
_Alignas(4096) static union {tf_forward_draft value;unsigned char pages[61440];} sf_storage;
#define sf (sf_storage.value)
static int sf_memory_ready=0;
static char sf_parent[96]="apps.html";
static const char*sf_paths[]={"/api/sms_forward_mail","/api/sms_forward_curl","/api/sms_forward_dingtalk","/api/sms_forward_sms","/api/sms_forward_blacklist"};
static const char*sf_names[]={"SMTP 邮件","CURL 请求","钉钉机器人","转发至短信","过滤规则","本屏临时授权"};
static const char*sf_methods[]={"SMTP","CURL","DINGTALK","SMS"};
static const char*sf_keys[5][6]={{"smtp_host","smtp_port","smtp_username","smtp_password","smtp_to",NULL},{"curl_text",NULL},{"webhook_url","secret",NULL},{"sms_to_phone",NULL},{"phone","keywords",NULL}};
static int sf_count(int kind){return kind==0?5:kind==2||kind==4?2:1;}
static int sf_secret(int kind,int i){return kind==5||(kind==0&&i==3)||kind==1||kind==2;}
static const char*sf_label(int kind,int i){const char*mail[]={"SMTP 主机","SMTP 端口","SMTP 用户名","SMTP 密码","收件邮箱"};if(kind==0)return mail[i];if(kind==1)return"CURL 模板（含 {{sms-body}}）";if(kind==2)return i?"钉钉签名密钥":"钉钉 HTTPS Webhook";if(kind==3)return"目标号码（每行一个）";if(kind==4)return i?"关键词（每行一个）":"拦截号码（每行一个）";return"UFI 面板口令";}
static size_t sf_limit(int kind,int i){if(kind==5)return 1024;if(kind==0){const size_t l[]={253,5,320,1024,320};return l[i];}return kind==1?8192:kind==2?2048:4096;}
static int sf_multiline(int kind,int i){(void)i;return kind==1||kind==3||kind==4;}
static void sf_draft_clear(void){tf_ufi_wipe(sf.values,sizeof sf.values);tf_ufi_wipe(sf.payload,sizeof sf.payload);tf_ufi_wipe(sf.baseline,sizeof sf.baseline);sf.pending_method[0]=0;sf.baseline_valid=sf.loaded=sf.password_saved=sf.info=sf.field=sf.uppercase=sf.symbols=0;}
static void sms_forward_cleanup(void){tf_ufi_revoke();tf_ufi_wipe(&sf_storage,sizeof sf_storage);
#if defined(__linux__)
 if(sf_memory_ready)munlock(&sf_storage,sizeof sf_storage);
#endif
 sf_memory_ready=0;if(!strncmp(pending,"@sf",3)){tf_ufi_wipe(pending,sizeof pending);tf_ufi_wipe(pending_label,sizeof pending_label);}}
static int sf_protect(void){if(sf_memory_ready)return 1;
#if defined(__linux__)
 struct rlimit core={0,0};if(setrlimit(RLIMIT_CORE,&core)||prctl(PR_SET_DUMPABLE,0)||mlock(&sf_storage,sizeof sf_storage))return 0;
#endif
 sf_memory_ready=1;return 1;}
static int sf_ready(void){if(tf_ufi_live())return 1;sf_draft_clear();sf.enabled=sf.power=-1;sf.method[0]=0;return 0;}
static int sf_get(const char*path,char*raw,size_t cap){if(tf_ufi_request("GET",path,NULL,raw,cap,5000,0)!=200)return 0;tf_json d;if(!tf_parse(&d,raw))return 0;int okay=d.t[0].type=='{';const char*errors[]={"error","_datad_error"};for(int i=0;i<2;i++){int k=tf_key(&d,0,errors[i]);if(k>=0&&!tf_no_error(&d,k))okay=0;}for(int i=0;i<2;i++){int k=tf_key(&d,0,i?"ok":"success");if(k>=0&&tf_bool(&d,k)==0)okay=0;}char result[32];if(tf_gets(&d,0,"result",result,sizeof result)&&(!strcmp(result,"failed")||!strcmp(result,"failure")))okay=0;tf_free(&d);return okay;}
static int sf_quote(char*out,size_t cap,const char*raw){size_t n=0;if(cap<3)return 0;out[n++]='"';for(const unsigned char*p=(const unsigned char*)raw;*p;p++){const char*esc=*p=='\n'?"\\n":*p=='\t'?"\\t":*p=='\r'?"\\r":*p=='"'?"\\\"":*p=='\\'?"\\\\":NULL;if(esc){if(n+3>=cap)return 0;out[n++]=esc[0];out[n++]=esc[1];}else{if(*p<32||*p==127||n+2>=cap)return 0;out[n++]=(char)*p;}}out[n++]='"';out[n]=0;return 1;}
static int sf_nonblank(const char*s){for(;*s;s++)if(!isspace((unsigned char)*s))return 1;return 0;}
static int sf_phone_list(const char*s){int count=0;while(*s){while(*s=='\n'||*s=='\r'||*s==' ')s++;if(!*s)break;if(*s=='+')s++;int digits=0;while(isdigit((unsigned char)*s)){digits++;s++;}if(digits<3||digits>20)return 0;while(*s==' ')s++;if(*s&&*s!='\r'&&*s!='\n')return 0;if(++count>10)return 0;}return count>0;}
static int sf_build_payload(void){
 if(!sf.loaded||sf.kind<0||sf.kind>4)return 0;
 for(int i=0;i<sf_count(sf.kind);i++){if(strlen(sf.values[i])>sf_limit(sf.kind,i))return 0;if(!sf_multiline(sf.kind,i)&&(strchr(sf.values[i],'\r')||strchr(sf.values[i],'\n')))return 0;}
 if(sf.kind==0){char*end;long p=strtol(sf.values[1],&end,10);if(!*sf.values[1]||*end||p<1||p>65535||!sf_nonblank(sf.values[0])||!sf_nonblank(sf.values[2])||!sf_nonblank(sf.values[4])||(!sf_nonblank(sf.values[3])&&!sf.password_saved))return 0;}
 if(sf.kind==1&&(!sf_nonblank(sf.values[0])||!strstr(sf.values[0],"{{sms-body}}")))return 0;
 if(sf.kind==2&&(strncmp(sf.values[0],"https://",8)||strlen(sf.values[0])<10||strchr(sf.values[0],' ')))return 0;
 if(sf.kind==3&&!sf_phone_list(sf.values[0]))return 0;
 if(sf.kind==4)for(const char*p=sf.values[0];*p;p++)if(!isdigit((unsigned char)*p)&&!strchr("+ \r\n",*p))return 0;
 char quoted[16390];size_t n=0;sf.payload[n++]='{';for(int i=0;i<sf_count(sf.kind);i++){if(!sf_quote(quoted,sizeof quoted,sf.values[i]))goto fail;int k=snprintf(sf.payload+n,sizeof sf.payload-n,"%s\"%s\":%s",i?",":"",sf_keys[sf.kind][i],quoted);if(k<0||(size_t)k>=sizeof sf.payload-n)goto fail;n+=(size_t)k;}
 if(sf.kind==0||sf.kind==2||sf.kind==3){int k=snprintf(sf.payload+n,sizeof sf.payload-n,",\"forward_dev_info\":\"%d\"",sf.info?1:0);if(k<0||(size_t)k>=sizeof sf.payload-n)goto fail;n+=(size_t)k;}if(n+2>=sizeof sf.payload)goto fail;sf.payload[n++]='}';sf.payload[n]=0;tf_ufi_wipe(quoted,sizeof quoted);return 1;
 fail:tf_ufi_wipe(quoted,sizeof quoted);tf_ufi_wipe(sf.payload,sizeof sf.payload);return 0;
}
static int sf_overview_load(void){
 sf.enabled=sf.power=-1;sf.method[0]=0;char raw[4096];tf_json d;int okay=1;
 if(sf_get("/api/sms_forward_method",raw,sizeof raw)&&tf_parse(&d,raw)){okay=tf_gets(&d,0,"sms_forward_method",sf.method,sizeof sf.method);tf_free(&d);}else okay=0;
 if(sf_get("/api/sms_forward_enabled",raw,sizeof raw)&&tf_parse(&d,raw)){sf.enabled=tf_bool(&d,tf_key(&d,0,"enabled"));tf_free(&d);}else okay=0;
 if(sf_get("/api/power_status_forward_enabled",raw,sizeof raw)&&tf_parse(&d,raw)){sf.power=tf_bool(&d,tf_key(&d,0,"enabled"));tf_free(&d);}else okay=0;
 tf_ufi_wipe(raw,sizeof raw);return okay;
}
/* Compare only the existing channel's editable fields, not JSON ordering or
 * status text. The baseline is a digest in the already protected draft pages;
 * no extra copy of credentials is retained. SMTP password is deliberately
 * excluded because its read endpoint exposes only password_saved. */
static int sf_config_digest(const char*raw,int kind,unsigned char out[32]){
 if(kind<0||kind>4)return 0;tf_json d;if(!tf_parse(&d,raw))return 0;
 unsigned char parts[224]={0};char value[8194];int okay=1;
 for(int i=0;i<sf_count(kind);i++){
  if(kind==0&&i==3)continue;value[0]=0;int key=tf_key(&d,0,sf_keys[kind][i]);
  if(key>=0&&!tf_string(&d,key,value,sizeof value)){long long n;if(kind==0&&i==1&&tf_int(&d,key,&n))snprintf(value,sizeof value,"%lld",n);else{okay=0;break;}}
  tf_digest(value,strlen(value),parts+(size_t)i*32,0);tf_ufi_wipe(value,sizeof value);
 }
 parts[192]=(unsigned char)kind;parts[193]=(unsigned char)(tf_bool(&d,tf_key(&d,0,"password_saved"))==1);parts[194]=(unsigned char)(tf_bool(&d,tf_key(&d,0,"forward_dev_info"))==1);
 if(okay)tf_digest(parts,sizeof parts,out,0);tf_ufi_wipe(value,sizeof value);tf_ufi_wipe(parts,sizeof parts);tf_free(&d);return okay;
}
static int sf_load(int kind){
 sf_draft_clear();sf.kind=kind;if(kind<0||kind>4||!sf_ready())return 0;char raw[32768];tf_json d;int okay=0;
 if(sf_get(sf_paths[kind],raw,sizeof raw)&&tf_parse(&d,raw)){okay=1;for(int i=0;i<sf_count(kind);i++){
   if(kind==0&&i==3)continue;int key=tf_key(&d,0,sf_keys[kind][i]);if(key<0)continue; /* A successful empty channel read is an unconfigured draft. */
   if(!tf_string(&d,key,sf.values[i],sizeof sf.values[i])){long long value;if(kind==0&&i==1&&tf_int(&d,key,&value))snprintf(sf.values[i],sizeof sf.values[i],"%lld",value);else{okay=0;break;}}
   if(strlen(sf.values[i])>sf_limit(kind,i)){okay=0;break;}
  }sf.password_saved=kind==0&&tf_bool(&d,tf_key(&d,0,"password_saved"))==1;sf.info=tf_bool(&d,tf_key(&d,0,"forward_dev_info"))==1;tf_free(&d);}
 if(okay)okay=sf_config_digest(raw,kind,sf.baseline);sf.baseline_valid=okay;
 tf_ufi_wipe(raw,sizeof raw);if(!okay)sf_draft_clear();sf.loaded=okay;return okay;
}
static int sf_verify(const char*raw){
 tf_json d,p;if(!tf_parse(&d,raw))return 0;if(!tf_parse(&p,sf.payload)){tf_free(&d);return 0;}int okay=1;char expected[8194],actual[8194];
 for(int i=0;i<sf_count(sf.kind);i++){const char*key=sf_keys[sf.kind][i];if(sf.kind==0&&i==3){if(tf_bool(&d,tf_key(&d,0,"password_saved"))!=1)okay=0;continue;}
  if(!tf_gets(&p,0,key,expected,sizeof expected)){okay=0;break;}if(!tf_gets(&d,0,key,actual,sizeof actual)){long long value;if(sf.kind==0&&i==1&&tf_int(&d,tf_key(&d,0,key),&value))snprintf(actual,sizeof actual,"%lld",value);else{okay=0;break;}}if(strcmp(expected,actual)){okay=0;break;}}
 if((sf.kind==0||sf.kind==2||sf.kind==3)&&tf_bool(&d,tf_key(&d,0,"forward_dev_info"))!=sf.info)okay=0;
 tf_ufi_wipe(expected,sizeof expected);tf_ufi_wipe(actual,sizeof actual);tf_free(&p);tf_free(&d);return okay;
}
static void sf_render_keyboard(void){
 advanced_shell_frame(sf_label(sf.kind,sf.field),"act:advback",0);char safe[4096];const char*value=sf.values[sf.field];if(sf_secret(sf.kind,sf.field))snprintf(safe,sizeof safe,"%s",*value?"已输入保密内容（不回显）":"尚未输入");else{size_t n=strlen(value);const char*tail=n>180?value+n-180:value;while(((unsigned char)*tail&0xc0)==0x80)tail++;esc(safe,sizeof safe,tail);}ah("<div class='card tf-input-preview'>%s</div><p class='note'>%zu / %zu 字节</p>",safe,strlen(value),sf_limit(sf.kind,sf.field));
 const char*letters="qwertyuiopasdfghjklzxcvbnm",*symbols="1234567890!@#$%%^&*()_-+=.,:;?/@[]{}\\|<>~`'\"";const char*chars=sf.symbols?symbols+(sf.symbols==2?30:0):letters;int length=(int)strlen(chars);if(length>30)length=30;
 ah("<table style='width:100%%;border-spacing:2px;table-layout:fixed'>");for(int i=0;i<length;i++){if(i%10==0)ah("<tr>");unsigned c=(unsigned char)chars[i];if(!sf.symbols&&sf.uppercase)c=(unsigned)toupper((int)c);char one[2]={(char)c,0};esc(safe,sizeof safe,one);ah("<td style='width:10%%'><a class='button secondary' href='act:sf-key:%u' style='padding:0;height:32px;min-height:32px;line-height:32px;font-size:14px'>%s</a></td>",c,safe);if(i%10==9)ah("</tr>");}if(length%10)ah("</tr>");ah("</table><table style='width:100%%;border-spacing:3px'><tr><td><a class='button secondary' href='act:sf-case'>大小写</a></td><td><a class='button secondary' href='act:sf-symbols'>符号</a></td><td><a class='button secondary' href='act:sf-key:32'>空格</a></td></tr><tr><td><a class='button secondary' href='act:sf-delete'>退格</a></td><td><a class='button secondary' href='act:sf-clear'>清空</a></td><td><a class='button secondary' href='act:sf-done'>完成</a></td></tr></table>");if(sf_multiline(sf.kind,sf.field))ah("<a class='button secondary' href='act:sf-newline' style='margin-top:6px'>插入换行</a>");ah("<p class='note'>英文、数字与符号；已有中文内容可保留。保密字段不会显示原文。</p></div></body></html>");
}
static void sms_forward_render(void){
 int active=sf_ready();if(!active&&advanced_page!=13)advanced_page=13;
 if(advanced_page==15){sf_render_keyboard();return;}
 if(advanced_page==14){advanced_shell(sf_names[sf.kind]);for(int i=0;i<sf_count(sf.kind);i++){char safe[16390];if(sf_secret(sf.kind,i))snprintf(safe,sizeof safe,"%s",*sf.values[i]?"已填写（不显示原文）":sf.kind==0&&i==3&&sf.password_saved?"已保存 · 留空保留":"点击输入");else esc(safe,sizeof safe,*sf.values[i]?sf.values[i]:"点击输入");ah("<a class='tf-field' href='act:sf-edit:%d'><span class='tf-field-label'>%s</span><span class='tf-field-value'>%s</span></a>",i,sf_label(sf.kind,i),safe);}
  if(sf.kind==0||sf.kind==2||sf.kind==3)ah("<a class='button secondary' href='act:sf-info'>设备信息：%s · 点击切换</a>",sf.info?"附带":"不附带");if(sf.kind==0)ah("<p class='note'>端口 1–65535，按邮箱服务设置。只有已读到保存标记时，空密码才保留。</p>");if(sf.kind==1)ah("<p class='note'>使用现有 UFI CURL 执行器；必须含 {{sms-body}}，可含 {{sms-time}} / {{sms-from}}。模板可能含凭据，因此不回显。</p>");if(sf.kind==2)ah("<p class='note'>签名密钥为空表示不加签，不承诺保留旧值。Webhook 与密钥按保密内容处理。</p>");ah("<p class='note'>%s</p><a class='button' href='act:sf-save'>检查并确认%s</a>",sf.kind==4?"过滤规则不触发测试消息。号码仅允许数字、+、空格和换行。":"保存将切换当前渠道并发送一条测试通知；测试不受转发总开关影响。短信渠道可能产生费用。",sf.kind==4?"保存规则":"保存与测试");ah("</div></body></html>");return;
 }
 advanced_shell("短信转发");if(!active){ah("<div class='card'><b>UFI 连接暂不可用</b><p class='note'>直接复用设备现有 UFI 配置，无需另输口令。配置忙、刚更新或服务未确认时暂停访问，不会修改登录保护。</p></div><a class='button' href='act:sf-connect'>重新连接 UFI</a><p class='note'>仅本机内存临时使用，离开本页即清除。</p>");}
 else{char safe[96];esc(safe,sizeof safe,*sf.method?sf.method:"未读到");ah("<div class='card'><b>UFI 已连接</b><p class='note'>当前转发方式：%s</p></div>",safe);if(sf.enabled>=0)ah("<a class='button' href='act:sf-enable' style='margin-bottom:7px'>短信转发：%s · 点击%s</a>",sf.enabled?"已启用":"未启用",sf.enabled?"关闭":"开启");if(sf.power>=0)ah("<a class='button secondary' href='act:sf-power' style='margin-bottom:7px'>开关机通知：%s</a>",sf.power?"已启用":"未启用");for(int i=0;i<5;i++)ah("<a class='sms' href='act:sf-channel:%d'><b>%s</b><p class='note'>读取配置并编辑</p></a>",i,sf_names[i]);ah("<a class='button secondary' href='act:sf-refresh'>刷新配置状态</a><a class='button secondary' href='act:sf-revoke' style='margin-top:7px'>断开本屏连接</a>");}
 ah("<p class='note'>转发由现有 UFI 后台负责，本屏不新增轮询任务。状态未知或测试失败不会自动重发。</p></div></body></html>");
}
static int sms_forward_action(const char*a){
 if(!strcmp(a,"sms-forward")){if(!sf_protect()){show_notice("无法保护内存凭据，未连接 UFI");return 1;}snprintf(sf_parent,sizeof sf_parent,"%s",!strcmp(page,"subpages/sms.html")?page:"apps.html");sf_draft_clear();advanced_page=13;scroll_y=0;show_busy("正在读取 UFI 转发状态");if(!tf_ufi_live()&&!tf_ufi_authorize_existing()){show_notice("UFI 配置或会话暂不可用；未修改登录保护");return 1;}if(!sf_overview_load())show_notice("部分转发状态未读到，请刷新");return 1;}
 if(advanced_page<13||advanced_page>15)return 0;
 if(!strcmp(a,"advback")){if(advanced_page==15)advanced_page=14;else if(advanced_page==14){sf_draft_clear();advanced_page=13;}else{sms_forward_cleanup();advanced_page=0;snprintf(page,sizeof page,"%s",sf_parent);}scroll_y=0;return 1;}
 if(!strcmp(a,"sf-revoke")){sms_forward_cleanup();advanced_page=13;show_notice("本屏授权已清除，UFI 其他会话不受影响");return 1;}
 if(!strcmp(a,"sf-connect")){show_busy("正在连接现有 UFI");sf_draft_clear();advanced_page=13;if(sf_protect()&&tf_ufi_authorize_existing()){sf_overview_load();show_notice("UFI 已连接，修改仍需逐次确认");}else show_notice("UFI 配置或会话暂不可用；请稍后重试");return 1;}
 if(!strncmp(a,"sf-edit:",8)){char*end;long i=strtol(a+8,&end,10);if(advanced_page==14&&!*end&&i>=0&&i<sf_count(sf.kind)){sf.field=(int)i;advanced_page=15;scroll_y=0;}return 1;}
 if(!strcmp(a,"sf-done")){if(advanced_page==15)advanced_page=14;scroll_y=0;return 1;}
 if(!strncmp(a,"sf-key:",7)){char*end;long c=strtol(a+7,&end,10);if(advanced_page==15&&!*end&&!tf_ascii_append(sf.values[sf.field],sizeof sf.values[0],(unsigned)c,sf_limit(sf.kind,sf.field)))show_notice("输入无效或已达长度上限");return 1;}
 if(!strcmp(a,"sf-delete")){if(advanced_page==15)tf_utf8_backspace(sf.values[sf.field]);return 1;}
 if(!strcmp(a,"sf-clear")){if(advanced_page==15)tf_ufi_wipe(sf.values[sf.field],sizeof sf.values[sf.field]);return 1;}
 if(!strcmp(a,"sf-case")){if(advanced_page==15)sf.uppercase=!sf.uppercase;return 1;}
 if(!strcmp(a,"sf-symbols")){if(advanced_page==15)sf.symbols=(sf.symbols+1)%3;return 1;}
 if(!strcmp(a,"sf-newline")){size_t n=strlen(sf.values[sf.field]);if(advanced_page==15&&sf_multiline(sf.kind,sf.field)&&n<sf_limit(sf.kind,sf.field)){sf.values[sf.field][n]='\n';sf.values[sf.field][n+1]=0;}return 1;}
 if(strncmp(a,"sf-",3))return 0;if(!sf_ready()){advanced_page=13;show_notice("临时连接已失效，请重新连接 UFI");return 1;}
 if(!strncmp(a,"sf-channel:",11)){char*end;long kind=strtol(a+11,&end,10);if(!*end&&kind>=0&&kind<5){show_busy("正在读取渠道配置");if(sf_load((int)kind)){advanced_page=14;scroll_y=0;}else{advanced_page=13;show_notice("渠道配置未完整读取，未打开编辑");}}return 1;}
 if(!strcmp(a,"sf-refresh")){show_busy("正在读取转发状态");if(!sf_overview_load())show_notice("部分状态未读到，请稍后刷新");return 1;}
 if(!strcmp(a,"sf-info")){if(advanced_page==14)sf.info=!sf.info;return 1;}
 if(!strcmp(a,"sf-save")){if(advanced_page!=14||!control_guard())return 1;if(!sf_build_payload()){show_notice("字段无效或配置不完整；未提交");return 1;}snprintf(pending,sizeof pending,"@sf-save");snprintf(pending_label,sizeof pending_label,"%s%s。%s敏感内容不会出现在确认页。",sf.kind==4?"保存":"保存并切换为",sf_names[sf.kind],sf.kind==4?"":"将立即发送一条测试通知，测试不受总开关影响；短信渠道可能收费。仅提交一次，未确认不会自动重发。");scroll_y=0;return 1;}
 if(!strcmp(a,"sf-enable")||!strcmp(a,"sf-power")){if(!control_guard())return 1;int power=!strcmp(a,"sf-power"),current=power?sf.power:sf.enabled;if(current<0){show_notice("当前开关状态未知，未提交");return 1;}snprintf(sf.pending_method,sizeof sf.pending_method,"%s",sf.method);snprintf(pending,sizeof pending,"@sf-%s:%d",power?"power":"enable",!current);snprintf(pending_label,sizeof pending_label,"%s%s。%s",current?"关闭":"开启",power?"开关机转发通知":"短信转发",current?"保留已保存渠道配置。":"今后的事件可能发送到当前配置渠道，短信渠道可能收费。请确认接收方与渠道设置。");scroll_y=0;return 1;}
 return 0;
}
static int sms_forward_confirm(void){
 if(strncmp(pending,"@sf-",4))return 0;char operation[32];snprintf(operation,sizeof operation,"%s",pending);pending[0]=0;if(!control_guard()||!sf_ready()){show_notice("控制未启用或临时授权已过期，未发送");return 1;}
 char raw[32768],url[96];int save=!strcmp(operation,"@sf-save"),wanted=-1,power=!strncmp(operation,"@sf-power:",10);if(save){if(sf.kind<0||sf.kind>4||!sf_build_payload()){show_notice("草稿无效，未发送");return 1;}snprintf(url,sizeof url,"%s",sf_paths[sf.kind]);}
 else{const char*v=operation+(power?10:11);if(strcmp(v,"0")&&strcmp(v,"1"))return 1;wanted=*v-'0';snprintf(url,sizeof url,"/api/%s?enable=%d",power?"power_status_forward_enabled":"sms_forward_enabled",wanted);}
 show_busy("正在核对 UFI 当前设置");int unchanged=0;
 if(save){unsigned char current[32]={0};unchanged=sf.baseline_valid&&sf_get(sf_paths[sf.kind],raw,sizeof raw)&&sf_config_digest(raw,sf.kind,current)&&!memcmp(current,sf.baseline,sizeof current);tf_ufi_wipe(current,sizeof current);}
 else{char prior_method[24];snprintf(prior_method,sizeof prior_method,"%s",sf.pending_method);unchanged=sf_overview_load()&&(power?sf.power:sf.enabled)==!wanted&&!strcmp(prior_method,sf.method);}
 tf_ufi_wipe(raw,sizeof raw);if(!unchanged||!tf_ufi_live()||!control_guard()){if(save)sf.baseline_valid=0;tf_ufi_wipe(sf.payload,sizeof sf.payload);show_notice("UFI 设置已变化或读取失败；未覆盖当前配置，请重新读取后操作");return 1;}
 show_busy(save&&sf.kind<4?"保存并发送测试通知，请勿重复提交":"正在保存转发设置");int code=tf_ufi_request("POST",url,save?sf.payload:"{}",raw,sizeof raw,save&&sf.kind<4?55000:8000,1);tf_json d;int accepted=0,saved=0;if(code>=200&&code<=599&&tf_parse(&d,raw)){char result[24];accepted=code==200&&tf_gets(&d,0,"result",result,sizeof result)&&!strcmp(result,"success");saved=code!=401&&code!=403&&tf_bool(&d,tf_key(&d,0,"saved"))==1;tf_free(&d);}tf_ufi_wipe(raw,sizeof raw);
 int verified=0;if(tf_ufi_live()){if(save){if(sf_get(sf_paths[sf.kind],raw,sizeof raw))verified=sf_verify(raw);if(sf.kind<4){if(sf_get("/api/sms_forward_method",raw,sizeof raw)&&tf_parse(&d,raw)){char method[24];verified=verified&&tf_gets(&d,0,"sms_forward_method",method,sizeof method)&&!strcmp(method,sf_methods[sf.kind]);tf_free(&d);}else verified=0;}}
 else{if(sf_get(power?"/api/power_status_forward_enabled":"/api/sms_forward_enabled",raw,sizeof raw)&&tf_parse(&d,raw)){verified=tf_bool(&d,tf_key(&d,0,"enabled"))==wanted;tf_free(&d);}}}
 tf_ufi_wipe(raw,sizeof raw);tf_ufi_wipe(sf.payload,sizeof sf.payload);sf_draft_clear();advanced_page=13;if(tf_ufi_live())sf_overview_load();
 show_notice(accepted&&verified?(save&&sf.kind<4?"渠道保存并回读一致，测试已被渠道接收；不代表用户已读":"设置已保存，状态回读一致"):saved?"配置已保存，但测试失败或未确认；未自动重发，请检查渠道":accepted?"请求已接受，但回读未确认；未自动重复提交":"结果未确认，请检查 UFI 状态与记录；未自动重发");scroll_y=0;return 1;
}
#endif
