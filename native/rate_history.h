/* Thirty actual samples per scope. Missing values are gaps, not invented zeroes. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_RATE_HISTORY_H
#define TF_RATE_HISTORY_H
#include <math.h>
#include <stdint.h>
#include <string.h>
#define TF_RATE_SAMPLES 30
typedef struct {double rx[TF_RATE_SAMPLES],tx[TF_RATE_SAMPLES];int count,next;long stamp;} tf_rate_history;
static inline void tf_rate_init(tf_rate_history*h){memset(h,0,sizeof *h);h->stamp=-1;}
static inline double tf_rate_valid(double n){return isfinite(n)&&n>=0?n:-1;}
static inline int tf_rate_push(tf_rate_history*h,long stamp,double rx,double tx){if(stamp<0||stamp==h->stamp)return 0;h->rx[h->next]=tf_rate_valid(rx);h->tx[h->next]=tf_rate_valid(tx);h->next=(h->next+1)%TF_RATE_SAMPLES;if(h->count<TF_RATE_SAMPLES)h->count++;h->stamp=stamp;return 1;}
static inline int tf_rate_order(const tf_rate_history*h,double rx[TF_RATE_SAMPLES],double tx[TF_RATE_SAMPLES]){for(int i=0;i<h->count;i++){int j=(h->next-h->count+i+TF_RATE_SAMPLES)%TF_RATE_SAMPLES;rx[i]=h->rx[j];tx[i]=h->tx[j];}return h->count;}
#endif
