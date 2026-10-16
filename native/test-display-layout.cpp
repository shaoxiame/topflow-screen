/* Actual renderer geometry/pixels/hit tests for display and cell-lock forms. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
extern "C" void html_view_init(uint16_t*,int,int,int,int,const char*);
extern "C" int html_view_ready(void);
extern "C" void html_view_set_uidir(const char*);
extern "C" int html_view_render_html(const char*);
extern "C" void html_view_set_scroll(int);
extern "C" int html_view_repaint(void);
extern "C" int html_view_pinned_height(void);
extern "C" int html_view_rect(const char*,int*,int*,int*,int*);
extern "C" const char*html_view_click(float,float);
static uint16_t fb[320*480];
static int hits=0;
struct box{int x,y,w,h;};
static box rect(const char*s){box b{};assert(html_view_rect(s,&b.x,&b.y,&b.w,&b.h));return b;}
static std::string read(const std::string&p){FILE*f=fopen(p.c_str(),"rb");assert(f);std::string s;char b[4096];size_t n;while((n=fread(b,1,sizeof b,f)))s.append(b,n);fclose(f);return s;}
static void save(const std::string&p){FILE*f=fopen(p.c_str(),"wb");assert(f);fprintf(f,"P6\n320 480\n255\n");for(auto v:fb){unsigned char rgb[3]={(unsigned char)((v>>11)*255/31),(unsigned char)(((v>>5)&63)*255/63),(unsigned char)((v&31)*255/31)};assert(fwrite(rgb,1,3,f)==3);}fclose(f);}
static void hitbox(box b,const std::string&action,int top,int minw,int minh){
 assert(b.x>=0&&b.y>=top&&b.x+b.w<=320&&b.y+b.h<=480&&b.w>=minw&&b.h>=minh);
 for(int yi=1;yi<=3;yi++)for(int xi=1;xi<=3;xi++){
  const char*actual=html_view_click((float)b.x+b.w*xi/4.0f,(float)b.y+b.h*yi/4.0f);
  assert(actual&&actual==action);hits++;
 }
}
int main(int argc,char**argv){
 assert(argc==4);html_view_init(fb,320,480,320,0,argv[1]);assert(html_view_ready());html_view_set_uidir(argv[2]);
 const char*names[]={"display-fixed","display-adaptive","form-cell-nr","form-cell-lte","keyboard-cell"};
 printf("{\"scope\":\"local native litehtml + original ZTE font; no device access\",\"results\":[");bool firstpage=true;
 for(const char*name:names)for(int dark=0;dark<2;dark++){
  std::string variant=std::string(name)+(dark?"-dark":""),base=std::string(argv[3])+"/"+variant,html=read(base+".html");
  html_view_set_scroll(0);int height=html_view_render_html(html.c_str());assert(height>=480&&html_view_pinned_height()==67);
  std::vector<uint16_t>header(fb,fb+320*67);save(base+".ppm");
  std::string back=!strcmp(name,"keyboard-cell")?"act:edit-done":"act:advback";
  box theme=rect(".header-theme"),backbox=rect(".header-back");assert(theme.x+theme.w<=backbox.x);
  hitbox(theme,"act:theme",0,30,30);hitbox(backbox,back,0,30,30);
  std::vector<std::string>actions;
  if(!strncmp(name,"display-",8)){
   actions={"act:display-mode:0","act:display-mode:1"};
   box m0=rect("a[href='act:display-mode:0']"),m1=rect("a[href='act:display-mode:1']");assert(m0.x+m0.w<m1.x&&m0.y==m1.y);
   if(!strcmp(name,"display-fixed")){
    actions.push_back("act:display-step:-1");actions.push_back("act:display-step:1");
    for(int p:{5,10,25,50,75,100})actions.push_back("act:display-preset:"+std::to_string(p));
    actions.push_back("act:display-apply");
    box minus=rect("a[href='act:display-step:-1']"),plus=rect("a[href='act:display-step:1']");assert(minus.x+minus.w<plus.x&&minus.y==plus.y);
    box apply=rect("a[href='act:display-apply']");assert(apply.y>=67&&apply.y+apply.h<=480);
    assert(html.find("\xe2\x88\x92")==std::string::npos); /* U+2212 has no glyph in the device font. */
   }
   for(int t:{15,30,60,120,-1})actions.push_back("act:display-time:"+std::to_string(t));
   actions.push_back("act:screen-lock");actions.push_back("act:display-refresh");
  }else if(!strncmp(name,"form-cell-",10)){
   actions={"act:edit:0","act:edit:1"};if(!strcmp(name,"form-cell-nr"))actions.push_back("act:edit:2");actions.push_back("act:form-apply");
  }else{
   assert(height==480);for(int i=49;i<=57;i++)actions.push_back("act:key:"+std::to_string(i));actions.push_back("act:key-backspace");actions.push_back("act:key:48");actions.push_back("act:edit-done");
  }
  if(!firstpage)printf(",");firstpage=false;printf("{\"page\":\"%s\",\"height\":%d,\"pinnedHeight\":67,\"headerPixelsInvariant\":true,\"targets\":[",variant.c_str(),height);bool firsttarget=true;
  for(const auto&action:actions){
   html_view_set_scroll(0);assert(html_view_repaint()==height);std::string selector=".tf-form a[href='"+action+"']";box original=rect(selector.c_str());
   int scroll=original.y+original.h<=480?0:std::min(height-480,std::max(0,original.y-110));
   html_view_set_scroll(scroll);assert(html_view_repaint()==height);assert(!memcmp(fb,header.data(),header.size()*sizeof(uint16_t)));
   box visible=rect(selector.c_str());assert(visible.y==original.y-scroll&&visible.x==original.x&&visible.w==original.w&&visible.h==original.h);
   hitbox(visible,action,67,!strcmp(name,"keyboard-cell")?80:38,!strcmp(name,"keyboard-cell")?48:38);
   hitbox(rect(".header-theme"),"act:theme",0,30,30);hitbox(rect(".header-back"),back,0,30,30);
   if(action=="act:display-apply")save(base+"-apply.ppm");
   if(action=="act:display-refresh")save(base+"-bottom.ppm");
   if(!firsttarget)printf(",");firsttarget=false;printf("{\"action\":\"%s\",\"documentRect\":[%d,%d,%d,%d],\"scroll\":%d,\"hitChecks\":9}",action.c_str(),original.x,original.y,original.w,original.h,scroll);
  }
  printf("]}");
 }
 printf("],\"totalHitChecks\":%d,\"passed\":true}\n",hits);return 0;
}
