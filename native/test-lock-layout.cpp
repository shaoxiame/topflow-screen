/* Actual litehtml/FreeType lock-view layout, pixel and hit-test checks. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include "soft_lock.h"
#include "lockscreen_chart.h"
#include "screen_geometry.h"
#include "lock-motion-functions.inc"
extern "C" void html_view_init(uint16_t*,int,int,int,int,const char*);
extern "C" int html_view_ready(void);
extern "C" void html_view_set_uidir(const char*);
extern "C" int html_view_render_html(const char*);
extern "C" int html_view_pinned_height(void);
extern "C" int html_view_rect(const char*,int*,int*,int*,int*);
extern "C" const char*html_view_click(float,float);
extern "C" void html_view_set_clip_top(int);
extern "C" int html_view_chart_save(int,int,int,int);
extern "C" int html_view_chart_restore(void);
extern "C" void html_view_rate_chart(int,int,int,int,const double*,const double*,int);
extern "C" void html_view_fill_round_rect(int,int,int,int,int,int,int,int,int);
extern "C" void html_view_draw_text_px(int,int,const char*,int,int,int,int,int,int);
static char page[32]="index.html";
static uint32_t clock_ms=1000;
static uint32_t tick(void){return clock_ms;}
/* update_chart is extracted with the production renderer but not invoked here. */
long json_get_int(const char*,const char*,long fallback){return fallback;}
typedef struct{int width,height;}drm_disp_t;
static int damaged=0;
static int drm_disp_dirty(drm_disp_t*,int x0,int y0,int x1,int y1){assert(x0>=32&&x1<=287&&y0>=222&&y1<=297);damaged++;return 0;}
#include "lock-chart-functions.inc"
static int theme_dark;
static tf_lock_motion lock_motion;
#include "lock-rate-functions.inc"
static uint16_t fb[320*480];
struct box{int x,y,w,h;};
static box rect(const char*s){box b;assert(html_view_rect(s,&b.x,&b.y,&b.w,&b.h));assert(b.x>=0&&b.y>=0&&b.x+b.w<=320&&b.y+b.h<=480);return b;}
static std::string read(const std::string&p){FILE*f=fopen(p.c_str(),"rb");assert(f);std::string s;char b[4096];size_t n;while((n=fread(b,1,sizeof b,f)))s.append(b,n);fclose(f);return s;}
static void save(const std::string&p){FILE*f=fopen(p.c_str(),"wb");assert(f);fprintf(f,"P6\n320 480\n255\n");for(auto v:fb){unsigned char rgb[3]={(unsigned char)((v>>11)*255/31),(unsigned char)(((v>>5)&63)*255/63),(unsigned char)((v&31)*255/31)};assert(fwrite(rgb,1,3,f)==3);}fclose(f);}
/* Explicit local sample fixture: never used by the production renderer/data path. */
static void samples(int mode){memset(&lock_chart,0,sizeof lock_chart);memset(&chart_animation,0,sizeof chart_animation);lock_chart_rendering=1;const double down[]={12,18,13,24,33,21,28,32,27,38,36,41.075},up[]={2.1,2.8,2.2,3.6,3.1,2.8,4.1,4.7,3.8,5.2,4.6,5.785};for(int i=0;i<12;i++)tf_lock_chart_sample(&lock_chart,mode,i+1,(down[i]+mode*10)*1e6,(up[i]+mode*2)*1e6);}
static void color_test(const std::string&html,int dark){
 theme_dark=dark;assert(html_view_render_html(html.c_str())==480);static uint16_t before[320*480];memcpy(before,fb,sizeof fb);
 memset(&lock_motion,0,sizeof lock_motion);tf_lock_dashboard s={};s.mode=0;s.rx=41075000;s.tx=5785000;tf_lock_motion_sample(&lock_motion,&s,1000);lock_motion.active=1;chart_animation.active=0;drm_disp_t d={320,480};assert(lock_rate_animation_tick(&d,1040));
 int changed=0;for(int y=222;y<258;y++)for(int x=32;x<288;x++)if(fb[y*320+x]!=before[y*320+x])changed++;
 if(changed){save("native/preview/lock-color-after.ppm");memcpy(fb,before,sizeof fb);save("native/preview/lock-color-before.ppm");fprintf(stderr,"same-value repaint changed %d pixels (dark=%d)\n",changed,dark);}assert(!changed);
}
static void motion_test(const std::string&dir,int dark){
 std::string html=read(dir+"/lock-normal-021"+(dark?"-dark":"")+".html");theme_dark=dark;samples(0);assert(html_view_render_html(html.c_str())==480);draw_rate_chart();
 memset(&lock_motion,0,sizeof lock_motion);tf_lock_dashboard s={};s.mode=0;s.rx=41075000;s.tx=5785000;tf_lock_motion_sample(&lock_motion,&s,1000);
 clock_ms=2000;tf_lock_chart_sample(&lock_chart,0,13,56000000,9400000);s.rx=56000000;s.tx=9400000;tf_lock_motion_sample(&lock_motion,&s,clock_ms);
 assert(html_view_render_html(html.c_str())==480);draw_rate_chart();assert(chart_animation.active);std::string base=dir+"/lock-motion-021"+(dark?"-dark":"");save(base+"-0.ppm");
 static uint16_t original[320*480],previous[320*480];memcpy(original,fb,sizeof fb);memcpy(previous,fb,sizeof fb);drm_disp_t d={320,480};
 for(int elapsed:{90,180,320}){assert(lock_rate_animation_tick(&d,clock_ms+elapsed));int changed=0,curve_changed=0;for(int y=0;y<480;y++)for(int x=0;x<320;x++){int i=y*320+x;bool region=x>=32&&x<288&&((y>=222&&y<258)||(y>=274&&y<298));if(!region)assert(fb[i]==original[i]);if(fb[i]!=previous[i]){changed++;if(y>=274&&y<298)curve_changed++;}}assert(changed>0);if(elapsed<=180)assert(curve_changed>0);memcpy(previous,fb,sizeof fb);save(base+"-"+std::to_string(elapsed)+".ppm");}
 assert(!chart_animation.active&&!lock_motion.active);int before=damaged;assert(lock_rate_animation_tick(&d,clock_ms+1000)&&before==damaged);
 printf("PASS native lock animation %s: actual 0/90/180/320ms frames; curves and digits change only their regions; settles with no idle redraw\n",dark?"dark":"light");
}
int main(int argc,char**argv){
 assert(argc==4);html_view_init(fb,320,480,320,0,argv[1]);assert(html_view_ready());html_view_set_uidir(argv[2]);
 const char*names[]={"lock-entry","lock-handover","lock-cooldown","soft-lock","soft-lock-progress","lock-normal-021","lock-aggregate-021","lock-stale-021","lock-hold-021","lock-pin-status-021"};int cases=0,hits=0;
 for(const char*name:names)for(int dark=0;dark<2;dark++){
  std::string base=std::string(argv[3])+"/"+name+(dark?"-dark":""),html=read(base+".html");
  assert(html_view_render_html(html.c_str())==480&&html_view_pinned_height()==0);
  rect(".pin-top");rect(".pin-clock");rect(".pin-note");
  if(html.find("class='pin-screen soft-lock'")!=std::string::npos){
   rect(".lock-date");rect(".lock-network");rect(".lock-rates");rect("#lock-rx");rect("#lock-tx");
   box b=rect(".soft-unlock"),p=rect(".soft-progress");
   assert(b.x==TF_SOFT_LEFT&&b.y==TF_SOFT_TOP&&b.w==TF_SOFT_WIDTH&&b.h==TF_SOFT_HEIGHT);
   assert(p.x==TF_SOFT_PROGRESS_X&&p.y==TF_SOFT_PROGRESS_Y&&p.w==TF_SOFT_PROGRESS_WIDTH&&p.h==TF_SOFT_PROGRESS_HEIGHT);
   box fill;int visible=html_view_rect(".soft-progress i",&fill.x,&fill.y,&fill.w,&fill.h);
   int expected=!strcmp(name,"soft-lock-progress")?104:!strcmp(name,"lock-hold-021")?135:0;assert(fill.w==expected&&fill.h==4&&!!visible==!!expected);
   /* UI has no tap anchor: only the separately tested timed hold may unlock. */
   for(int y=0;y<480;y+=19)for(int x=0;x<320;x+=23){assert(!*html_view_click((float)x,(float)y));hits++;}
   if(expected)assert(fb[(p.y+1)*320+p.x+20]!=fb[(p.y+1)*320+p.x+180]);
   else assert(fb[(p.y+1)*320+p.x+20]==fb[(p.y+1)*320+p.x+180]);
  }else{
   rect(".pin-title");rect(".pin-status");rect(".pin-dots");rect(".pin-telemetry");const char*actions[]={"1","2","3","4","5","6","7","8","9","clear","0","submit"};
   bool enabled=!strcmp(name,"lock-entry")||!strcmp(name,"lock-pin-status-021");
   for(int i=0;i<12;i++){
    char selector[160];snprintf(selector,sizeof selector,".pin-keypad tr:nth-child(%d) td:nth-child(%d) .pin-key",i/3+1,i%3+1);
    box b=rect(selector);assert(b.w>=80&&b.h>=48);
    std::string expected=enabled?std::string("act:pin:")+actions[i]:"";
    assert(html_view_click((float)b.x+b.w/2.0f,(float)b.y+b.h/2.0f)==expected);hits++;
   }
  }
  if(!strcmp(name,"lock-normal-021")||!strcmp(name,"lock-hold-021")||!strcmp(name,"lock-aggregate-021")){samples(!strcmp(name,"lock-aggregate-021"));draw_rate_chart();box c=rect("#rate-chart");assert(c.x==32&&c.y==274&&c.w==256&&c.h==24);}
  save(base+".ppm");if(!strcmp(name,"lock-normal-021"))color_test(html,dark);printf("PASS %s%s: native 320x480; layout, bounds, hit targets and state\n",name,dark?"-dark":"");cases++;
 }
 for(int dark=0;dark<2;dark++)motion_test(argv[3],dark);
 printf("PASS: %d actual lock renders and %d hit targets; 8 real animation frames; static/full and partial rate repaint pixels identical\n",cases,hits);return 0;
}
