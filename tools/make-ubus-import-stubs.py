"""Generate link-only AArch64 ABI stubs from reviewed public declarations.
No private ELF, firmware code, pyelftools, or device access is needed.
Never deploy these stubs: runtime resolves the already installed libraries.
"""
import pathlib, re, json
root = pathlib.Path(__file__).resolve().parents[1]
spec = json.loads((root / 'native/vendor/openwrt/link-imports.json').read_text('utf-8'))
out = root / 'native/build-bus-import'
out.mkdir(exist_ok=True)
for name, library in spec['libraries'].items():
    assert re.fullmatch(r'libub(?:us|ox)\.so\.[0-9]+', name)
    lines = ['/* Link-only ABI declarations; never deploy. */']
    for symbol in library['functions']:
        assert re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', symbol)
        lines += ['.text', f'.global {symbol}', f'.type {symbol}, %function', f'{symbol}:', 'ret', f'.size {symbol}, .-{symbol}']
    for symbol, size in library['objects'].items():
        assert re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', symbol) and isinstance(size, int) and 0 < size <= 16
        lines += ['.bss', '.balign 16', f'.global {symbol}', f'.type {symbol}, %object', f'{symbol}:', f'.zero {size}', f'.size {symbol}, {size}']
    (out / (name + '.S')).write_text('\n'.join(lines) + '\n', 'utf-8')
print('Public ABI link-only stubs generated; never deploy native/build-bus-import.')
