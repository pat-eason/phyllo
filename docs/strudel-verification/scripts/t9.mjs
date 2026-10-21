const core = await import('@strudel/core');
const mini = await import('@strudel/mini');
const song = core.s(mini.mini('<b0 b1 b2 b3 b4 b5 b6 b7 b8 b9>'));
const show = (p, a, b) => Array.from({ length: b - a }, (_, i) => { const h = p.queryArc(a + i, a + i + 1).filter((x) => x.hasOnset())[0]; return `c${a + i}=${h?.value.s ?? '-'}`; }).join(' ');
// loop bars 4..7 (len 3) engaged while playhead is at cycle 37 -> start region at next boundary c0=38
console.log('ribbon(4,3).late(38) :', show(song.ribbon(4, 3).late(38), 38, 45));
console.log('ribbon(4,3) plain    :', show(song.ribbon(4, 3), 36, 42), '(phase = cycle mod 3)');
// seek: start transport at bar 6 -> early(6) and playhead = 6 + scheduler cycle
console.log('early(6) from c0     :', show(song.early(6), 0, 3));
