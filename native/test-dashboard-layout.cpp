/* Same-engine 320x480 dashboard acceptance, local fixtures only. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
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
extern "C" int html_view_repaint(void);
extern "C" void html_view_set_scroll(int);
extern "C" int html_view_pinned_height(void);
extern "C" int html_view_rect(const char*,int*,int*,int*,int*);
extern "C" const char*html_view_click(float,float);
static uint16_t fb[320*480];
static int hits=0;
struct box { int x,y,w,h; };
static box rect(const char*s){box b{};assert(html_view_rect(s,&b.x,&b.y,&b.w,&b.h));return b;}
static std::string read(const std::string&p){FILE*f=fopen(p.c_str(),"rb");assert(f);std::string s;char b[4096];size_t n;while((n=fread(b,1,sizeof b,f)))s.append(b,n);fclose(f);return s;}
static void visible(box b){assert(b.x>=0&&b.y>=67&&b.x+b.w<=320&&b.y+b.h<=480&&b.w>0&&b.h>0);}
static void hit(box b,const char*action){for(int y=1;y<4;y++)for(int x=1;x<4;x++){assert(!strcmp(html_view_click(b.x+b.w*x/4.f,b.y+b.h*y/4.f),action));hits++;}}
int main(int argc,char**argv){
 assert(argc==4);html_view_init(fb,320,480,320,0,argv[1]);assert(html_view_ready());html_view_set_uidir(argv[2]);
 const char*names[]={"index","aggregate","index-large","aggregate-large","aggregate-unknown","network","apps"};
 int pages=0;
 for(auto name:names)for(int dark=0;dark<2;dark++){
  /* The same maximum-width data is covered on both backgrounds. */
  std::string file=std::string(argv[3])+"/"+name+((dark&&strcmp(name,"index-large")&&strcmp(name,"aggregate-large"))?"-dark":"")+"-filled.html";
  std::string html=read(file);if(dark&&(strstr(name,"-large"))) {auto p=html.find("class=\"light\"");assert(p!=std::string::npos);html.replace(p,13,"class=\"dark\"");}
  assert(html.find("{{")==std::string::npos);html_view_set_scroll(0);int height=html_view_render_html(html.c_str());assert(height>=480&&html_view_pinned_height()==67);
  std::vector<uint16_t>header(fb,fb+320*67);box theme=rect(".header-theme"),back{};assert(!html_view_rect(".header-back",&back.x,&back.y,&back.w,&back.h));hit(theme,"act:theme");
  bool home=!strncmp(name,"index",5)||!strncmp(name,"aggregate",9);
  if(home){
   assert(height==480);visible(rect(".hero"));visible(rect(".thermal"));
   box receive=rect(".ratecol.receive"),send=rect(".ratecol.send");assert(receive.x+receive.w<=send.x);visible(receive);visible(send);
   for(const char*id:{"5G","4G1","4G2"}){std::string action=std::string("act:modem:")+id,selector="a[href='"+action+"']";box b=rect(selector.c_str());int pad=!strncmp(name,"aggregate",9)?6:9;b.x-=10;b.y-=pad;b.w+=20;b.h+=2*pad;visible(b);assert(b.h>=48);hit(b,action.c_str());}
   if(!strncmp(name,"aggregate",9)){box q=rect(".hero-quota"),e=rect(".ethernet-strip"),t=rect(".thermal"),hero=rect(".hero");visible(q);visible(e);assert(q.y+q.h<=hero.y+hero.h&&e.y+e.h<=t.y);}
  }else if(!strcmp(name,"network")){
   box ca=rect(".carrier-summary");visible(ca);assert(ca.y+ca.h<=440);assert(height>700);
   for(const char*selector:{"a[href='act:network']",".ca-card",".ethernet-card"}){
    html_view_set_scroll(0);assert(html_view_repaint()==height);box original=rect(selector);int scroll=std::min(height-480,std::max(0,original.y-90));html_view_set_scroll(scroll);assert(html_view_repaint()==height);assert(!memcmp(fb,header.data(),header.size()*sizeof(uint16_t)));box b=rect(selector);visible(b);if(selector[0]=='a')hit(b,"act:network");hit(rect(".header-theme"),"act:theme");
   }
  }else{
   assert(height==480);for(const char*action:{"act:wifi","act:sub:sms.html","act:aoyou","act:page:settings.html"}){std::string selector=std::string("a[href='")+action+"']";box b=rect(selector.c_str());b.x-=12;b.y-=11;b.w+=24;b.h+=22;visible(b);assert(b.h>=48);hit(b,action);}
  }
  pages++;
 }
 printf("{\"scope\":\"local native engine / factory font / RGB565\",\"pages\":%d,\"hitChecks\":%d,\"aggregateSingleFrame\":true,\"caSummaryVisible\":true,\"ethernetDetailsReachable\":true,\"headerPixelsInvariant\":true,\"passed\":true}\n",pages,hits);
}
