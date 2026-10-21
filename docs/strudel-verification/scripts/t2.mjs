const core = await import('@strudel/core');
const mini = await import('@strudel/mini');
const { s, note, n, silence, arrange, stack, sine, rev, cat } = core;
mini.miniAllStrings(); // make string args parse as mini-notation (as the transpiler does implicitly)
const F = (x) => x.toFraction();
const on = (pat, b, e) => pat.queryArc(b, e).filter((h) => h.hasOnset())
  .sort((a, b) => a.whole.begin.valueOf() - b.whole.begin.valueOf());
const fmt = (haps) => haps.map((h) => `${F(h.whole.begin)}:${typeof h.value === 'object' ? Object.entries(h.value).map(([k, v]) => k + '=' + (typeof v === 'number' ? +v.toFixed(3) : v)).join(',') : h.value}`).join(' ');
const perCycle = (pat, N) => Array.from({ length: N }, (_, c) => `c${c}:${on(pat, c, c + 1).length}`).join(' ');

console.log('--- arrange([8, silence],[8, s("bd*4")]) onsets per cycle, 0..24');
const arr = arrange([8, silence], [8, s('bd*4')]);
console.log(perCycle(arr, 24));
console.log('--- arrange([2, s("bd")],[1, s("<hh cp>")]) cycles 0..6: does section pattern see local or global cycle?');
const arr2 = arrange([2, s('<bd sd>')], [1, s('<hh cp oh>')]);
for (let c = 0; c < 9; c++) console.log(' c' + c, fmt(on(arr2, c, c + 1)));
console.log('--- note("<c d e f>").ribbon(1, 2), cycles 0..6');
const rib = note('<c d e f>').ribbon(1, 2);
for (let c = 0; c < 6; c++) console.log(' c' + c, fmt(on(rib, c, c + 1)));
console.log('--- arrange(...).ribbon(8,4): loop bars 8..12 of the arrangement; cycles 0..8');
const arr3 = arrange([8, s('bd')], [8, s('<a b c d e f g h>')]);
const loopd = arr3.ribbon(8, 4);
for (let c = 0; c < 8; c++) console.log(' c' + c, fmt(on(loopd, c, c + 1)));
console.log('--- ribbon with fractional offset 8.5,1 (half-cycle window start)');
console.log(' ', fmt(on(s('a b c d').ribbon(0.5, 1), 0, 1)));
console.log('--- zoom(0.25,0.75) on s("a b c d")', fmt(on(s('a b c d').zoom(0.25, 0.75), 0, 1)));
console.log('--- compress(0.25,0.75)', fmt(on(s('a b c d').compress(0.25, 0.75), 0, 1)));
console.log('--- linger(0.25)', fmt(on(s('a b c d').linger(0.25), 0, 1)));
console.log('--- s("hh*8").swingBy(1/6,4) onsets', fmt(on(s('hh*8').swingBy(1 / 6, 4), 0, 1)));
console.log('--- note("c d").lastOf(4, rev) cycles 0..4');
for (let c = 0; c < 4; c++) console.log(' c' + c, fmt(on(note('c d').lastOf(4, rev), c, c + 1)));
console.log('--- firstOf(4, rev)  c0:', fmt(on(note('c d').firstOf(4, rev), 0, 1)), ' c1:', fmt(on(note('c d').firstOf(4, rev), 1, 2)));
console.log('--- lastOf(4, x=>x.fast(2)) c3:', fmt(on(s('bd sd').lastOf(4, (x) => x.fast(2)), 3, 4)));
console.log('--- ply(2) s("bd sd")', fmt(on(s('bd sd').ply(2), 0, 1)));
console.log('--- sometimes(x=>x.ply(2)) over 8 cycles, events per cycle', perCycle(s('bd*4').sometimes((x) => x.ply(2)), 8));
console.log('--- degradeBy(.5) s("hh*16") per cycle', perCycle(s('hh*16').degradeBy(0.5), 6));
console.log('--- chop(4) s("vox")', fmt(on(s('vox').chop(4), 0, 1)));
console.log('--- control aliases -> canonical keys');
const aliasPat = s('x').rsize(2).size(3).sz(4).delayfb(0.4).dfb(0.3).delayt(0.25).lpq(5).lp(800).hp(100).o(2).fm(3).fmh(2);
console.log(' ', JSON.stringify(on(aliasPat, 0, 1)[0].value));
console.log(' s("bd:3") ->', JSON.stringify(on(s('bd:3'), 0, 1)[0].value), ' lpf("800:10") ->', JSON.stringify(on(s('x').lpf('800:10'), 0, 1)[0].value));
console.log(' room("0.5:4") ->', JSON.stringify(on(s('x').room('0.5:4'), 0, 1)[0].value), ' delay(".5:.25:.6") ->', JSON.stringify(on(s('x').delay('.5:.25:.6'), 0, 1)[0].value));
console.log(' bank("RolandTR909") ->', JSON.stringify(on(s('bd').bank('RolandTR909'), 0, 1)[0].value));
console.log(' lpf(sine.range(400,1400).slow(8)) at c0..', [0, 2, 4, 6].map((c) => +on(s('x').lpf(sine.range(400, 1400).slow(8)), c, c + 1)[0].value.cutoff.toFixed(0)).join(','));
console.log('--- silence', on(silence, 0, 4).length, 'stack(s("bd"),s("hh*2"))', fmt(on(stack(s('bd'), s('hh*2')), 0, 1)));

console.log('--- mini parse errors');
for (const bad of ['bd*', '[bd sd', 'bd(3,8', 'bd <sd']) {
  try { mini.mini(bad).queryArc(0, 1); console.log(' OK??', bad); }
  catch (e) { console.log(` ${JSON.stringify(bad)} -> ${e.constructor.name}: ${e.message}`); }
}
try { mini.mini2ast('"bd ]"'); } catch (e) { console.log(' mini2ast raw:', e.message); }
try { mini.parse('"bd ]"'); } catch (e) { console.log(' krill parse raw:', e.constructor.name, e.name, JSON.stringify(e.location), e.message); }
