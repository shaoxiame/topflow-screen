/* Desktop-only actual renderer regression and bounded benchmark. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <algorithm>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
extern "C" void html_view_init(uint16_t*,int,int,int,int,const char*);
extern "C" int html_view_ready(void);
extern "C" void html_view_set_uidir(const char*);
extern "C" void html_view_set_scroll(int);
extern "C" int html_view_render_html(const char*);
extern "C" int html_view_render_overlay(const char*);
extern "C" int html_view_render_to_size(uint16_t*,int,int,const char*);
extern "C" const char* html_view_click(float,float);
extern "C" int html_view_text_width_px(const char*,int);
extern "C" void html_view_text_bounds_px(const char*,int,int*,int*,int*,int*);
extern "C" void html_view_draw_text_px(int,int,const char*,int,int,int,int,int,int);
extern "C" void html_view_draw_text_contrast_px(int,int,const char*,int,int,int,int,int,int,int,int,int);
#ifndef TF_RENDER_BASELINE
extern "C" int html_view_repaint(void);
extern "C" int html_view_pinned_height(void);
extern "C" size_t html_view_test_cache_bytes(void);
extern "C" unsigned html_view_test_cache_entries(void);
#endif
static std::string read(const char*path){FILE*f=fopen(path,"rb");assert(f);std::string s;char b[8192];size_t n;while((n=fread(b,1,sizeof b,f)))s.append(b,n);fclose(f);return s;}
static uint64_t hash(const void*p,size_t n,uint64_t h=1469598103934665603ULL){const unsigned char*b=(const unsigned char*)p;while(n--)h=(h^*b++)*1099511628211ULL;return h;}
static double millis(std::chrono::steady_clock::time_point t){return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-t).count();}
static uint16_t fb[320*480],saved[320*480],expected[320*480],header[320*96];
static std::string click_at(int x,int y){return html_view_click((float)x,(float)y);}
static std::string utf8(unsigned c){std::string s;s+=(char)(0xe0|(c>>12));s+=(char)(0x80|((c>>6)&63));s+=(char)(0x80|(c&63));return s;}
int main(int argc,char**argv){
 assert(argc==9); const char*mode=argv[8]; const bool record=!strcmp(mode,"record");
 html_view_init(fb,320,480,320,0,argv[1]);assert(html_view_ready());html_view_set_uidir(argv[2]);
 /* Legacy recording is a performance/visual reference only. Auto-hinting and
  * larger labels deliberately change its raster/layout. Current acceptance
  * compares fresh and retained paints exactly, never blesses a legacy image
  * by overwriting its expected pixels. */
 FILE*gold=record?fopen(argv[7],"wb"):nullptr;assert(!record||gold);
 for(int page=0;page<4;page++){
  std::string html=read(argv[3+page]);html_view_set_scroll(0);int height=html_view_render_html(html.c_str());assert(height>0);
  std::vector<std::string> header_clicks;
  if(!record)memcpy(header,fb,67*320*2);
  const int offsets[]={0,17,110,220,std::max(0,height-480)};
  for(int scroll:offsets){
   html_view_set_scroll(scroll);assert(html_view_render_html(html.c_str())==height);
   int pinned=67;
#ifndef TF_RENDER_BASELINE
   assert(html_view_pinned_height()==pinned);
#endif
   if(record){assert(fwrite(&height,sizeof height,1,gold)==1);assert(fwrite(fb,sizeof fb,1,gold)==1);}
   else if(memcmp(header,fb,pinned*320*2)){fprintf(stderr,"fixed header pixel mismatch page=%d scroll=%d\n",page,scroll);return 8;}
   uint64_t clicks=1469598103934665603ULL;size_t point=0;
   memcpy(saved,fb,sizeof fb);
   for(int y=11;y<480;y+=37)for(int x=13;x<320;x+=41){std::string s=click_at(x,y);clicks=hash(s.c_str(),s.size()+1,clicks);if(record){unsigned n=(unsigned)s.size();assert(fwrite(&n,sizeof n,1,gold)==1);assert(fwrite(s.data(),1,n,gold)==n);}else{if(scroll==0)header_clicks.push_back(s);else if(y<pinned&&s!=header_clicks[point]){fprintf(stderr,"fixed header hit mismatch page=%d scroll=%d x=%d y=%d\n",page,scroll,x,y);return 9;}}point++;}
#ifndef TF_RENDER_BASELINE
   /* Rebuild resets :active state before comparing a retained repaint. */
   assert(html_view_render_html(html.c_str())==height);memcpy(saved,fb,sizeof fb);
   memset(fb,0xcd,sizeof fb);assert(html_view_repaint()==height);assert(!memcmp(saved,fb,sizeof fb));
   uint64_t retained_clicks=1469598103934665603ULL;for(int y=11;y<480;y+=37)for(int x=13;x<320;x+=41){const char*s=html_view_click((float)x,(float)y);retained_clicks=hash(s,strlen(s)+1,retained_clicks);}assert(retained_clicks==clicks);
#endif
  }
  auto start=std::chrono::steady_clock::now();for(int i=0;i<50;i++){html_view_set_scroll((i*17)%std::max(1,height-479));assert(html_view_render_html(html.c_str())==height);}double full=millis(start);
#ifndef TF_RENDER_BASELINE
  start=std::chrono::steady_clock::now();for(int i=0;i<50;i++){html_view_set_scroll((i*17)%std::max(1,height-479));assert(html_view_repaint()==height);}double repaint=millis(start);
#else
  double repaint=full;
#endif
  const char*names[]={"home","home-dark","long-settings","long-settings-dark"};printf("{\"page\":\"%s\",\"height\":%d,\"iterations\":50,\"full_render_ms\":%.3f,\"scroll_repaint_ms\":%.3f}\n",names[page],height,full,repaint);
 }
 /* Direct text overlays use the same cache as litehtml. Check deterministic
  * raster, advances and bounds after cache-warming, including bold and alpha. */
 html_view_set_scroll(0);
 for(int size:{10,13,29,50,96}){
  assert(html_view_render_html("<body style='margin:0;background:#123456'><div style='height:1200px'></div></body>")>0);
  const char*label="网络状态 Topflow 0129Ág";
  html_view_draw_text_px(-21,21,label,size,1,246,240,235,199);
  html_view_draw_text_contrast_px(12,100,label,size,1,24,25,26,250,251,252,201);
  int bounds[5];bounds[0]=html_view_text_width_px(label,size);html_view_text_bounds_px(label,size,&bounds[1],&bounds[2],&bounds[3],&bounds[4]);uint64_t pixels=hash(fb,sizeof fb);
  if(record){assert(fwrite(bounds,sizeof bounds,1,gold)==1);assert(fwrite(&pixels,sizeof pixels,1,gold)==1);}else{
   assert(bounds[0]>0&&bounds[3]>bounds[1]&&bounds[4]>bounds[2]);
   assert(html_view_render_html("<body style='margin:0;background:#123456'><div style='height:1200px'></div></body>")>0);
   html_view_draw_text_px(-21,21,label,size,1,246,240,235,199);
   html_view_draw_text_contrast_px(12,100,label,size,1,24,25,26,250,251,252,201);
   int warmed[5];warmed[0]=html_view_text_width_px(label,size);html_view_text_bounds_px(label,size,&warmed[1],&warmed[2],&warmed[3],&warmed[4]);
   assert(!memcmp(bounds,warmed,sizeof bounds)&&pixels==hash(fb,sizeof fb));
  }
 }
 if(gold)fclose(gold);
#ifndef TF_RENDER_BASELINE
 size_t peak=0;
 for(unsigned page=0;page<64;page++){
  std::string stress="<body style='margin:0;font-size:64px'>";
  for(unsigned i=0;i<28;i++)stress+=utf8(0x4e00+page*28+i);
  stress+="</body>";assert(html_view_render_html(stress.c_str())>0);assert(html_view_pinned_height()==0);
  peak=std::max(peak,html_view_test_cache_bytes());assert(html_view_test_cache_bytes()<=384*1024&&html_view_test_cache_entries()<=512);
 }
 assert(peak>200*1024);printf("glyph_cache_peak_observed_bytes=%zu limit=393216 entries_limit=512\n",peak);
 std::string longpage=read(argv[5]);html_view_set_scroll(150);assert(html_view_render_html(longpage.c_str())>0);assert(html_view_pinned_height()==67);memcpy(saved,fb,sizeof fb);
 html_view_init(fb,320,480,320,1,argv[1]);assert(html_view_test_cache_bytes()==0&&html_view_test_cache_entries()==0);html_view_set_scroll(150);assert(html_view_render_html(longpage.c_str())>0);assert(html_view_repaint()>0);
 for(int y=0;y<480;y++)for(int x=0;x<320;x++)assert(fb[(479-y)*320+319-x]==saved[y*320+x]);
 std::vector<uint16_t> padded(328*480+2,0xa5a5);html_view_init(padded.data()+1,320,480,328,0,argv[1]);html_view_set_scroll(150);assert(html_view_render_html(longpage.c_str())>0);assert(html_view_repaint()>0);assert(padded.front()==0xa5a5&&padded.back()==0xa5a5);
 for(int y=0;y<480;y++)for(int x=0;x<320;x++)assert(padded[1+y*328+x]==saved[y*320+x]);
 html_view_init(fb,320,480,320,0,argv[1]);html_view_set_scroll(0);assert(html_view_render_html(longpage.c_str())>0);html_view_set_uidir("different-dir");assert(html_view_repaint()==-1);html_view_set_uidir(argv[2]);
 uint16_t small[100*100]={0};assert(html_view_render_to_size(small,100,100,"<body>x</body>")>0);assert(html_view_repaint()==-1);
 html_view_set_scroll(0);assert(html_view_render_overlay("<body style='background:transparent'><a href='overlay'>overlay</a></body>")==0);assert(html_view_repaint()==-1); // never turn a modal into a full page
 assert(html_view_render_html(nullptr)==-1);assert(html_view_repaint()==-1);
 html_view_init(fb,320,480,320,0,"missing-font-for-fail-closed-test.ttf");assert(!html_view_ready());assert(html_view_repaint()==-1);assert(html_view_click(12,12)[0]=='\0');
 html_view_init(fb,320,480,320,0,argv[1]);assert(html_view_ready());assert(html_view_repaint()==-1);
 puts("PASS: current typography fresh-vs-retained pixels/layout/hit targets; fixed light/dark header/back targets; deterministic cached glyphs; bounded glyph eviction; rotation/pitch; reinitialization and unavailable-document failures. Legacy raster is intentionally different and is not an equivalence target.");
#endif
 return 0;
}
