/* One home slot follows the existing device aggregation state. No I/O. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_HOME_MODE_H
#define TF_HOME_MODE_H
#include <string.h>
#define TF_MAIN_PAGE_COUNT 3
static const char*tf_home_page(int enabled){return enabled==1?"aggregate.html":"index.html";}
static int tf_main_page_index(const char*name){
 if(!strcmp(name,"index.html")||!strcmp(name,"aggregate.html"))return 0;
 const char*rest[]={"network.html","apps.html"};
 for(int i=0;i<2;i++)if(!strcmp(name,rest[i]))return i+1;
 return -1;
}
static const char*tf_main_page_name(int index,int enabled){
 const char*rest[]={"network.html","apps.html"};
 return index>0&&index<TF_MAIN_PAGE_COUNT?rest[index-1]:tf_home_page(enabled);
}
static const char*tf_resolve_home_page(const char*name,int enabled){return tf_main_page_index(name)==0?tf_home_page(enabled):name;}
#endif
