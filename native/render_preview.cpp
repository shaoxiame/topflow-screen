/* Render the same litehtml/FreeType engine on this Windows PC. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <cmath>
extern "C" void html_view_init(uint16_t*,int,int,int,int,const char*);
extern "C" int html_view_ready(void);
extern "C" void html_view_set_uidir(const char*);
extern "C" int html_view_render_html(const char*);
extern "C" const char*html_view_click(float,float);
extern "C" void html_view_set_scroll(int);
extern "C" int html_view_pinned_height(void);
extern "C" void html_view_set_clip_top(int);
extern "C" int html_view_rect(const char*,int*,int*,int*,int*);
extern "C" void html_view_rate_chart(int,int,int,int,const double*,const double*,int);
int main(int argc,char**argv){
 if(argc<5){fprintf(stderr,"usage: render-preview input.html ui-dir font-file output.ppm [click-x click-y [scroll-y [chart.txt]]]\n");return 2;}
 FILE*f=fopen(argv[1],"rb");if(!f)return 3;std::string html;char b[4096];size_t n;while((n=fread(b,1,sizeof b,f)))html.append(b,n);fclose(f);
 uint16_t fb[320*480]={0};html_view_init(fb,320,480,320,0,argv[3]);if(!html_view_ready())return 5;html_view_set_uidir(argv[2]);if(argc>=8)html_view_set_scroll(atoi(argv[7]));int height=html_view_render_html(html.c_str());if(height<1)return 6;
 if(argc>=9){FILE*c=fopen(argv[8],"rb");int count=0;double rx[30],tx[30];if(!c)return 7;bool valid=fscanf(c,"%d",&count)==1&&count>=0&&count<=30;for(int i=0;valid&&i<count;i++)valid=fscanf(c,"%lf %lf",&rx[i],&tx[i])==2&&std::isfinite(rx[i])&&std::isfinite(tx[i])&&rx[i]>=-1&&tx[i]>=-1;char extra;valid=valid&&fscanf(c," %c",&extra)==EOF;fclose(c);if(!valid)return 7;int x,y,w,h;if(html_view_rect("#rate-chart",&x,&y,&w,&h)){html_view_set_clip_top(html_view_pinned_height());html_view_rate_chart(x,y,w,h,rx,tx,count);html_view_set_clip_top(0);printf("chart-rect=%d,%d,%d,%d samples=%d\n",x,y,w,h,count);}}
 f=fopen(argv[4],"wb");if(!f)return 4;fprintf(f,"P6\n320 480\n255\n");for(auto p:fb){unsigned char rgb[3]={(unsigned char)((p>>11)*255/31),(unsigned char)(((p>>5)&63)*255/63),(unsigned char)((p&31)*255/31)};fwrite(rgb,1,3,f);}fclose(f);printf("layout-height=%d\n",height);if(argc>=7)printf("click=%s\n",html_view_click((float)atoi(argv[5]),(float)atoi(argv[6])));return 0;
}
