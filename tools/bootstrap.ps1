$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cache = Join-Path $root '.cache/downloads'
New-Item -ItemType Directory -Force $cache | Out-Null
# Only public, pinned upstream sources are retrieved. No device is contacted.
function Get-PinnedGit($url, $commit, $relative) {
 $dest = Join-Path $root $relative
 if (Test-Path -LiteralPath $dest) {
  $head = & git -C $dest rev-parse HEAD 2>$null
  if ($LASTEXITCODE -ne 0 -or $head -ne $commit) { throw "Existing dependency does not match pinned commit: $relative" }
  if ((& git -C $dest status --porcelain).Length) { throw "Dependency has local changes: $relative" }
  return
 }
 New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
 & git init --quiet $dest
 if ($LASTEXITCODE -ne 0) { throw 'git init failed' }
 & git -C $dest remote add origin $url
 & git -C $dest fetch --quiet --depth 1 origin $commit
 if ($LASTEXITCODE -ne 0) { throw "Pinned source fetch failed: $relative" }
 & git -C $dest checkout --quiet --detach FETCH_HEAD
 if ($LASTEXITCODE -ne 0 -or (& git -C $dest rev-parse HEAD) -ne $commit) { throw "Revision mismatch: $relative" }
}
function Get-CheckedFile($url, $file, $digest) {
 if (!(Test-Path -LiteralPath $file)) { Invoke-WebRequest -Uri $url -OutFile $file }
 if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) {
  throw "SHA-256 mismatch; refusing changed upstream bytes: $file"
 }
}
Get-PinnedGit 'https://github.com/litehtml/litehtml.git' '8836bc1bc35ca0cfd71dc0386ef841d5cbc3bd5e' 'native/vendor/litehtml'
Get-PinnedGit 'https://gitlab.freedesktop.org/freetype/freetype.git' '023fd06e3dbe84ab7327ddddd9fe851824fe1ade' 'native/vendor/freetype'
$zigRoot = Join-Path $root 'native/toolchain/zig-x86_64-windows-0.14.1'
$zigZip = Join-Path $cache 'zig-x86_64-windows-0.14.1.zip'
Get-CheckedFile 'https://ziglang.org/download/0.14.1/zig-x86_64-windows-0.14.1.zip' $zigZip '554f5378228923ffd558eac35e21af020c73789d87afeabf4bfd16f2e6feed2c'
if (!(Test-Path -LiteralPath $zigRoot)) {
 New-Item -ItemType Directory -Force (Split-Path $zigRoot -Parent) | Out-Null
 Expand-Archive -LiteralPath $zigZip -DestinationPath (Split-Path $zigRoot -Parent)
}
if ((& (Join-Path $zigRoot 'zig.exe') version) -ne '0.14.1') { throw 'Unexpected Zig version' }
Write-Output 'Pinned dependencies prepared locally. No device was contacted.'
