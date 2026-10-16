"""One-time edit of the native keyboard renderer and action dispatcher."""
import pathlib
path=pathlib.Path(__file__).resolve().parents[1]/'native/form_pages.h'
text=path.read_text('utf-8')
start=text.index(' if(advanced_page==7){advanced_n=0;')
end=text.index('\n if(form_kind==4)',start)
text=text[:start]+r''' if(advanced_page==7){
  advanced_n=0;char title[256],value[4096];esc(title,sizeof title,form_label(form_field));const char*raw=form_values[form_field];
  if(form_secret(form_field)){char mask[128];size_t n=strlen(raw);if(n>63)n=63;memset(mask,'*',n);mask[n]=0;esc(value,sizeof value,mask);}
  else{size_t length=strlen(raw);const char*tail=raw;if(length>90){tail=raw+length-90;while(((unsigned char)*tail&0xc0)==0x80)tail++;}esc(value,sizeof value,tail);}
  int chinese=keyboard_chinese&&!keyboard_symbols&&!form_secret(form_field);
  ah("<html><head><link rel='stylesheet' href='style.css'></head><body class='%s'><div style='padding:12px;min-height:480px'><a class='button secondary' href='act:edit-done' style='float:right;width:44px;min-height:27px;line-height:27px'>返回</a><b style='line-height:27px'>%s</b><div class='card' style='margin-top:10px;height:64px;padding:9px;overflow:hidden;word-break:break-all;font-size:15px'>%s<span style='color:#4987ff'>|</span></div><p class='note' style='margin:6px 0'>%zu / %zu 字节 · %s</p>",theme_dark?"dark":"light",title,value,strlen(raw),form_limit(form_field),chinese?"逐字拼音 · v 代表 ü":"英文、数字与符号");
  if(chinese){
   unsigned count=tf_pinyin_count(&keyboard_pinyin),begin=keyboard_pinyin.page*6;
   if(begin>=count){keyboard_pinyin.page=0;begin=0;}
   ah("<div style='height:24px;font-size:16px;color:#4987ff'>%s</div><table style='width:100%%;border-spacing:2px;table-layout:fixed'><tr>",*keyboard_pinyin.letters?keyboard_pinyin.letters:"输入拼音，点击候选字");
   for(unsigned j=0;j<6;j++){char c[4];if(tf_pinyin_candidate(&keyboard_pinyin,begin+j,c))ah("<td><a class='button secondary' href='act:py:%u' style='padding:0;min-height:34px;height:34px;line-height:34px;font-size:19px'>%s</a></td>",begin+j,c);else ah("<td></td>");}
   ah("<td><a class='button secondary' href='act:py-next' style='padding:0;min-height:34px;height:34px;line-height:34px'>›</a></td></tr></table>");
  }else ah("<div class='note' style='height:64px;padding-top:15px'>%s</div>",form_secret(form_field)?"密码仅留在本次内存草稿":"点击「中 / 英」可输入中文");
  const char*letters="qwertyuiopasdfghjklzxcvbnm",*symbols="1234567890!@#$%%^&*()_-+=.,:;?/@[]{}\\|<>~`'\"";
  const char*chars=keyboard_symbols?(symbols+(keyboard_symbols==2?30:0)):letters;int length=(int)strlen(chars);if(length>30)length=30;
  ah("<table style='width:100%%;border-spacing:2px;table-layout:fixed'>");
  for(int i=0;i<length;i++){if(i%10==0)ah("<tr>");unsigned c=(unsigned char)chars[i];if(!keyboard_symbols&&keyboard_case&&!chinese)c=(unsigned)toupper((int)c);char letter[2]={(char)c,0},safe[16];esc(safe,sizeof safe,letter);ah("<td style='width:10%%'><a class='button secondary' href='act:key:%u' style='padding:0;height:31px;min-height:31px;line-height:31px;font-size:14px'>%s</a></td>",c,safe);if(i%10==9)ah("</tr>");}if(length%10)ah("</tr>");
  ah("</table><table style='width:100%%;border-spacing:3px;margin-top:3px'><tr><td><a class='button secondary' href='act:key-language' style='padding:0;font-size:12px'>中 / 英</a></td><td><a class='button secondary' href='act:key-case' style='padding:0;font-size:12px'>大写</a></td><td><a class='button secondary' href='act:key-symbols' style='padding:0;font-size:12px'>%s</a></td><td><a class='button secondary' href='act:key:32' style='padding:0;font-size:12px'>空格</a></td><td><a class='button secondary' href='act:key-backspace' style='padding:0;font-size:12px'>退格</a></td></tr></table><a class='button' href='act:edit-done' style='margin-top:5px'>完成输入</a><p class='note' style='margin-top:5px'>离线输入 · 不记录键入内容</p></div></body></html>",keyboard_symbols==2?"字母":keyboard_symbols==1?"更多":"123");return;
 }'''+text[end:]
text=text.replace('正文支持英文、数字与符号，最大 512 字节。','正文支持中文拼音、英文、数字与符号，最大 512 字节。')
text=text.replace('if(advanced_page==7){advanced_page=6;scroll_y=0;}','if(advanced_page==7){tf_pinyin_clear(&keyboard_pinyin);advanced_page=6;scroll_y=0;}')
text=text.replace("form_field=a[5]-'0';advanced_page=7;scroll_y=0;", "form_field=a[5]-'0';tf_pinyin_clear(&keyboard_pinyin);keyboard_chinese=!form_secret(form_field)&&((form_kind==1&&form_field==1)||(form_kind==2&&form_field==0));keyboard_symbols=keyboard_case=0;advanced_page=7;scroll_y=0;")
start=text.index(' if(!strncmp(a,"key:",4))')
end=text.index('\n if(!strncmp(a,"wifi-enc:',start)
text=text[:start]+r''' if(!strncmp(a,"py:",3)){if(advanced_page==7&&keyboard_chinese&&!keyboard_symbols){char*end;unsigned long index=strtoul(a+3,&end,10);if(!*end&&index<=10000&&!tf_pinyin_commit(&keyboard_pinyin,(unsigned)index,form_values[form_field],sizeof form_values[0],form_limit(form_field)))show_notice("候选字不可用或输入已达长度上限");}return 1;}
 if(!strcmp(a,"py-next")){if(advanced_page==7&&keyboard_chinese){unsigned count=tf_pinyin_count(&keyboard_pinyin);keyboard_pinyin.page=count?(keyboard_pinyin.page+1)%((count+5)/6):0;}return 1;}
 if(!strcmp(a,"key-language")){if(advanced_page==7&&!form_secret(form_field)){keyboard_chinese=!keyboard_chinese;keyboard_symbols=keyboard_case=0;tf_pinyin_clear(&keyboard_pinyin);}return 1;}
 if(!strncmp(a,"key:",4)){char*end;long c=strtol(a+4,&end,10);if(advanced_page==7&&!*end){if(keyboard_chinese&&!keyboard_symbols&&!form_secret(form_field)&&c>='a'&&c<='z'){if(!tf_pinyin_push(&keyboard_pinyin,(unsigned)c))show_notice("请逐字输入拼音，先选择当前候选字");}else if(keyboard_chinese&&*keyboard_pinyin.letters&&c==32){if(!tf_pinyin_commit(&keyboard_pinyin,keyboard_pinyin.page*6,form_values[form_field],sizeof form_values[0],form_limit(form_field)))show_notice("请补全拼音或点击候选字");}else if(!tf_ascii_append(form_values[form_field],sizeof form_values[0],(unsigned)c,form_limit(form_field)))show_notice("输入已达长度上限");}return 1;}
 if(!strcmp(a,"key-case")){if(advanced_page==7){keyboard_case=!keyboard_case;keyboard_chinese=0;tf_pinyin_clear(&keyboard_pinyin);}return 1;}
 if(!strcmp(a,"key-symbols")){if(advanced_page==7){keyboard_symbols=(keyboard_symbols+1)%3;tf_pinyin_clear(&keyboard_pinyin);}return 1;}
 if(!strcmp(a,"key-backspace")){if(advanced_page==7){if(*keyboard_pinyin.letters)tf_pinyin_backspace(&keyboard_pinyin);else tf_utf8_backspace(form_values[form_field]);}return 1;}'''+text[end:]
path.write_text(text,'utf-8')
print('Keyboard updated')
