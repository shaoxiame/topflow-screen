"""Small offline Mandarin input dictionary from pinned MIT upstream data."""
import pathlib,urllib.request,hashlib,json,re,unicodedata
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'native/vendor/pinyin';out.mkdir(parents=True,exist_ok=True)
revision='9193766130af24d2ac54230be979b2e98ac66223'
files={}
for name in ('kMandarin_8105.txt','kHanyuPinlu.txt','LICENSE'):
 data=urllib.request.urlopen(f'https://raw.githubusercontent.com/mozillazg/pinyin-data/{revision}/{name}',timeout=20).read(2*1024*1024)
 (out/name).write_bytes(data);files[name]=hashlib.sha256(data).hexdigest()
def syllable(value):
 value=value.lower().replace('ü','v').replace('ǖ','v').replace('ǘ','v').replace('ǚ','v').replace('ǜ','v')
 return ''.join(c for c in unicodedata.normalize('NFD',value) if 'a'<=c<='z')
table={};frequency={}
for line in (out/'kHanyuPinlu.txt').read_text('utf-8').splitlines():
 match=re.match(r'U\+([0-9A-F]+):\s*(.*?)\s*#',line)
 if not match:continue
 character=chr(int(match[1],16))
 numbers=re.findall(r'\((\d+)\)',line)
 if numbers:frequency[character]=sum(map(int,numbers))
for line in (out/'kMandarin_8105.txt').read_text('utf-8').splitlines():
 match=re.match(r'U\+([0-9A-F]+):\s*(.*?)\s*#',line)
 if not match:continue
 code=int(match[1],16)
 if not 0x4e00<=code<=0x9fff:continue
 for part in match[2].split(','):
  key=syllable(part)
  if key and len(key)<=6:table.setdefault(key,set()).add(chr(code))
# Keep the most useful messaging words first, independent of keyboard history.
preferred='的了是我你您好在有不和就都这那们来去说想要会能请谢谢到收发短信网络连接屏幕设置现在可以测试成功正常今天明天时间号码开关电源再见中兴联通移动电信卡'
rank={c:len(preferred)-i for i,c in reversed(list(enumerate(preferred)))}
lines=['/* Generated offline data; pinyin-data MIT, see vendor/pinyin/LICENSE. */','#ifndef TF_PINYIN_DATA_H','#define TF_PINYIN_DATA_H','typedef struct { const char *syllable, *characters; } tf_pinyin_entry;','static const tf_pinyin_entry tf_pinyin_entries[]={']
for key,chars in sorted(table.items()):
 ordered=sorted(chars,key=lambda c:(-rank.get(c,0),-frequency.get(c,0),ord(c)))
 lines.append('{'+json.dumps(key)+','+json.dumps(''.join(ordered),ensure_ascii=False)+'},')
lines+=['};','#define TF_PINYIN_COUNT (sizeof(tf_pinyin_entries)/sizeof(tf_pinyin_entries[0]))','#endif','']
(root/'native/pinyin_data.h').write_text('\n'.join(lines),'utf-8')
(out/'provenance.json').write_text(json.dumps({'repository':'https://github.com/mozillazg/pinyin-data','commit':revision,'sourceSha256':files,'syllables':len(table),'characters':sum(map(len,table.values()))},indent=2)+'\n','utf-8')
print('Offline dictionary:',len(table),'syllables;',sum(map(len,table.values())),'character entries')
