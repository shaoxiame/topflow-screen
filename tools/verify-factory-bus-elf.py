"""Verify helper runtime dependencies/exports against existing firmware ELF."""
import pathlib,sys,json
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'analysis/python-deps'))
from elftools.elf.elffile import ELFFile
exports=set()
for name in ('libubus.so.20230605','libubox.so.20230523'):
 with (root/'analysis/evidence'/name).open('rb') as f:
  e=ELFFile(f);d=next(s for s in e.iter_segments() if s['p_type']=='PT_DYNAMIC')
  exports|={s.name for s in d.iter_symbols() if s['st_value']}
with (root/'native/bin/topflow-factory-bus-aarch64').open('rb') as f:
 e=ELFFile(f);assert e['e_machine']=='EM_AARCH64'
 d=next(s for s in e.iter_segments() if s['p_type']=='PT_DYNAMIC')
 needed=[t.needed for t in d.iter_tags() if t.entry.d_tag=='DT_NEEDED']
 assert set(needed)=={'libubus.so.20230605','libubox.so.20230523','libc.so'},needed
 assert not any(t.entry.d_tag in ('DT_RPATH','DT_RUNPATH') for t in d.iter_tags())
 imports=[s.name for s in d.iter_symbols() if not s['st_value'] and s.name]
 required=[s for s in imports if s.startswith(('ubus_','uloop_','blob_','blobmsg_'))]
 assert set(required)<=exports,sorted(set(required)-exports)
 interpreter=next(s.get_interp_name() for s in e.iter_segments() if s['p_type']=='PT_INTERP')
 assert interpreter=='/lib/ld-musl-aarch64.so.1',interpreter
 print(json.dumps({'machine':e['e_machine'],'dependencies':needed,'verifiedExistingExports':len(required),'interpreter':interpreter},ensure_ascii=False))
