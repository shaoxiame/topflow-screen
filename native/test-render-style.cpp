/* Actual engine pixel/layout assertions, never a device test. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cmath>
#include <initializer_list>
#include <chrono>
extern "C" void html_view_init(uint16_t*,int,int,int,int,const char*);
extern "C" int html_view_ready(void);
extern "C" int html_view_render_html(const char*);
extern "C" int html_view_rect(const char*,int*,int*,int*,int*);
extern "C" void html_view_rate_chart(int,int,int,int,const double*,const double*,int);
extern "C" int html_view_chart_save(int,int,int,int);
extern "C" int html_view_chart_restore(void);
extern "C" void html_view_set_clip_top(int);
extern "C" void html_view_fill_round_rect(int,int,int,int,int,int,int,int,int);
extern "C" void html_view_draw_text_px(int,int,const char*,int,int,int,int,int,int);
extern "C" void html_view_draw_text_contrast_px(int,int,const char*,int,int,int,int,int,int,int,int,int);
static uint16_t pixels[320*480],before[320*480],normal[320*480],grid[320*480];
static void rect(const char*id,int&x,int&y,int&w,int&h){assert(html_view_rect(id,&x,&y,&w,&h));}
int main(int argc,char**argv){
 assert(argc==2||argc==3);html_view_init(pixels,320,480,320,0,argv[1]);assert(html_view_ready());
 if(argc==3){
  assert(!strcmp(argv[2],"--benchmark-chart"));for(auto &p:pixels)p=0x2b7c;memcpy(before,pixels,sizeof pixels);
  double rx[30],tx[30];for(int i=0;i<30;i++){rx[i]=10+5*sin(i*.5);tx[i]=2+sin(i*.7);}rx[10]=rx[11]=tx[10]=tx[11]=-1;
  auto start=std::chrono::steady_clock::now();for(int i=0;i<1000;i++){memcpy(pixels,before,sizeof pixels);html_view_rate_chart(26,171,268,37,rx,tx,30);}
  double ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
  printf("{\"scope\":\"desktop native micro-chart plus buffer reset\",\"iterations\":1000,\"total_ms\":%.3f,\"per_chart_ms\":%.5f}\n",ms,ms/1000);return 0;
 }
 /* Fine glyph weights must preserve counters, not stamp a second full pixel.
  * Compare integrated coverage on the actual factory font at small UI size. */
 assert(html_view_render_html("<body style='margin:0;background:#fff;color:#000'><div id='fine-normal' style='font-size:13px;font-weight:400'>网络链接 028</div><div id='fine-bold' style='font-size:13px;font-weight:600'>网络链接 028</div></body>")>0);
 int fx,fy,fw,fh,wx,wy,ww,wh;rect("#fine-normal",fx,fy,fw,fh);rect("#fine-bold",wx,wy,ww,wh);
 long ink_normal=0,ink_medium=0;for(int row=0;row<fh;row++)for(int col=0;col<fw;col++)ink_normal+=63-((pixels[(fy+row)*320+fx+col]>>5)&63);
 for(int row=0;row<wh;row++)for(int col=0;col<ww;col++)ink_medium+=63-((pixels[(wy+row)*320+wx+col]>>5)&63);
 assert(ink_normal>0 && ink_medium>ink_normal && ink_medium<ink_normal*1.65);
 printf("small_font_weight_coverage_ratio=%.3f\n",(double)ink_medium/ink_normal);
 assert(html_view_render_html("<body style='margin:0;background:#fff'></body>")>=0);
 html_view_fill_round_rect(20,20,56,36,13,0,0,0,255);int antialiased=0;
 for(int row=0;row<36;row++)for(int col=0;col<56;col++){
  auto v=pixels[(20+row)*320+20+col];antialiased+=v!=0&&v!=65535;
  assert(v==pixels[(20+row)*320+20+55-col]);assert(v==pixels[(20+35-row)*320+20+col]);
 }
 assert(antialiased>=40&&pixels[20*320+20]==65535&&pixels[38*320+48]==0);
 const char*markup="<html><body style='margin:0;background:#fff'><div id='normal' style='font-size:29px;font-weight:400;width:auto;display:inline-block'>328.6</div><br><div id='bold' style='font-size:29px;font-weight:650;width:auto;display:inline-block'>328.6</div><div id='gradient' style='margin:20px;width:280px;height:112px;border-radius:17px;background:linear-gradient(115deg,#245ce9,#3674f5 75%,#4b81ef)'><div id='rate-chart' style='position:relative;top:55px;left:14px;width:252px;height:37px'></div></div></body></html>";
 assert(html_view_render_html(markup)>=1);int nx,ny,nw,nh,bx,by,bw,bh,x,y,w,h;rect("#normal",nx,ny,nw,nh);rect("#bold",bx,by,bw,bh);assert(bw>=nw&&bw<=nw+5&&bh==nh);int thin=0,bold=0;for(int j=0;j<nh;j++){for(int i=0;i<nw;i++)thin+=pixels[(ny+j)*320+nx+i]!=65535;for(int i=0;i<bw;i++)bold+=pixels[(by+j)*320+bx+i]!=65535;}assert(bold>thin);
 rect("#gradient",x,y,w,h);assert(pixels[y*320+x]==65535);assert(pixels[(y+h/2)*320+x+20]!=pixels[(y+h/2)*320+x+w-20]);
 rect("#rate-chart",x,y,w,h);memcpy(before,pixels,sizeof pixels);assert(html_view_chart_save(x,y,w,h));
 double rx[30],tx[30];for(int i=0;i<30;i++){rx[i]=10+5*sin(i*.5);tx[i]=2+sin(i*.7);}rx[10]=rx[11]=tx[10]=tx[11]=-1;
 html_view_rate_chart(x,y,w,h,rx,tx,30);memcpy(normal,pixels,sizeof pixels);int changed=0;
 for(int j=0;j<480;j++)for(int i=0;i<320;i++){if(i<x||i>=x+w||j<y||j>=y+h)assert(pixels[j*320+i]==before[j*320+i]);else changed+=pixels[j*320+i]!=before[j*320+i];}assert(changed>100);
 /* A guide remains visible through a missing-data interval. Neither series,
  * fill nor marker may bridge that interval. Compare with grid-only pixels. */
 double missing[30];for(auto &v:missing)v=-1;missing[0]=1;
 memcpy(pixels,before,sizeof pixels);html_view_rate_chart(x,y,w,h,missing,missing,30);memcpy(grid,pixels,sizeof pixels);
 int gap=x+2+(int)(10.5*(w-5)/29);for(int j=y;j<y+h;j++)assert(normal[j*320+gap]==grid[j*320+gap]);
 assert(html_view_chart_restore()&&!memcmp(before,pixels,sizeof pixels));
 for(auto &v:missing)v=-1;html_view_rate_chart(x,y,w,h,missing,missing,30);assert(!memcmp(before,pixels,sizeof pixels));
 html_view_rate_chart(x,y,321,h,rx,tx,30);assert(!memcmp(before,pixels,sizeof pixels));assert(!html_view_chart_save(-1,y,w,h));
 for(int i=0;i<30;i++){rx[i]=10;tx[i]=2;}html_view_rate_chart(x,y,w,h,rx,tx,30);
 int end=x+w-3,ry=y+4,ty=(int)(y+h-4-.2*(h-8));
 assert(pixels[ry*320+end]==65535);assert(pixels[ty*320+end]==(uint16_t)(((106&248)<<8)|((239&252)<<3)|(217>>3)));
 memcpy(pixels,before,sizeof pixels);rx[29]=NAN;tx[29]=-1;html_view_rate_chart(x,y,w,h,rx,tx,30);
 for(int j=y;j<y+h;j++)assert(pixels[j*320+end]==grid[j*320+end]);
 memcpy(pixels,before,sizeof pixels);for(int i=0;i<30;i++)rx[i]=tx[i]=0;html_view_rate_chart(x,y,w,h,rx,tx,30);
 assert(pixels[(y+h-4)*320+end]!=grid[(y+h-4)*320+end]); // valid zero is not a missing point
 memcpy(pixels,before,sizeof pixels);html_view_set_clip_top(y+h/2);html_view_rate_chart(x,y,w,h,rx,tx,30);html_view_set_clip_top(0);
 for(int j=0;j<y+h/2;j++)for(int i=0;i<320;i++)assert(pixels[j*320+i]==before[j*320+i]);
 memcpy(pixels,before,sizeof pixels);
 memcpy(normal,pixels,sizeof pixels);html_view_init(pixels,320,480,320,1,argv[1]);assert(html_view_render_html(markup)>=1);for(int j=0;j<480;j++)for(int i=0;i<320;i++)assert(pixels[(479-j)*320+319-i]==normal[j*320+i]);
 /* Bold contrast text must select its color from the untouched background,
  * once per covered pixel. A second offset pass used to re-read its own ink
  * and flip foreground color, producing hollow/missing strokes. */
 html_view_init(pixels,320,480,320,0,argv[1]);
 for(int dark=0;dark<2;dark++)for(int size: {11,13,29}){
  const char*page=dark?"<body style='margin:0;background:#000'></body>":"<body style='margin:0;background:#fff'></body>";
  assert(html_view_render_html(page)>=0);
  const char*text="网络聚合 0129";int fg=dark?255:0;
  html_view_draw_text_px(10,50,text,size,1,fg,fg,fg,255);memcpy(normal,pixels,sizeof pixels);
  assert(html_view_render_html(page)>=0);
  html_view_draw_text_contrast_px(10,50,text,size,1,0,0,0,255,255,255,255);
  if(memcmp(normal,pixels,sizeof pixels))for(int i=0;i<320*480;i++)if(normal[i]!=pixels[i]){fprintf(stderr,"contrast mismatch dark=%d size=%d x=%d y=%d expected=%x actual=%x\n",dark,size,i%320,i/320,normal[i],pixels[i]);break;}
  assert(!memcmp(normal,pixels,sizeof pixels));
 }
 puts("PASS: fractional small-font ink coverage, symmetric antialiased rounded edges, actual CSS bold width/coverage, gradient stops/rounded corner, same-scale white/mint chart lines, inset latest markers, subtle guide-only data gaps, missing-vs-zero semantics, bounded chart cache/clipping, 180-degree rendering; 11/13/29px bold contrast glyphs retain all strokes on light/dark backgrounds");return 0;
}
