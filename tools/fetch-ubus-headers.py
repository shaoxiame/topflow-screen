"""Fetch pinned upstream API headers locally, matching installed firmware ABI."""
import pathlib, urllib.request, tarfile, io, hashlib, json
root=pathlib.Path(__file__).resolve().parents[1]/'native/vendor/openwrt'
root.mkdir(parents=True,exist_ok=True)
manifest=[]
for repo,commit,folder in [('ubus','f787c97b','ubus'),('libubox','75a3b870','libubox')]:
 url=f'https://codeload.github.com/openwrt/{repo}/tar.gz/{commit}'
 data=urllib.request.urlopen(url,timeout=30).read(3*1024*1024)
 with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
  for entry in archive:
   parts=pathlib.PurePosixPath(entry.name).parts
   if not entry.isfile() or len(parts)!=2 or not (parts[-1].endswith('.h') or parts[-1] in ('COPYING','LICENSE')):continue
   target=root/folder/parts[-1];target.parent.mkdir(exist_ok=True)
   target.write_bytes(archive.extractfile(entry).read())
 manifest.append({'repository':f'https://github.com/openwrt/{repo}','commit':commit,'archiveSha256':hashlib.sha256(data).hexdigest()})
(root/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n','utf-8')
print('Pinned API headers saved locally', root)
