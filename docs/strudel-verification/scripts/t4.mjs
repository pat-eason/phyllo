const core = await import('@strudel/core');
const mine = await import('./sharehash.ts');
const cases = ['note("c3 e3")', 'setcpm(120/4)\n$: s("bd*4").bank("RolandTR909")\n_$: note("c2") // ünïcødé — 日本語 🎹', 'x'.repeat(300000)];
for (const c of cases) {
  const a = mine.code2hash(c);
  let b; try { b = core.code2hash(c); } catch (e) { b = 'UPSTREAM THREW: ' + e.constructor.name + ' ' + e.message; }
  console.log(`len=${c.length} identical=${a === b} roundtrip=${mine.hash2code(a) === c} upstreamDecodesMine=${a.length < 2000 ? core.hash2code(a) === c : 'n/a'} sample=${a.slice(0, 60)}${b.startsWith('UPSTREAM') ? ' | ' + b : ''}`);
}
console.log('known strudel.cc example "#ImMzIGUzIg%3D%3D" ->', JSON.stringify(mine.hash2code('ImMzIGUzIg%3D%3D')));
console.log(mine.fromShareUrl('https://strudel.cc/#' + mine.code2hash('s("bd")')), mine.fromShareUrl('https://strudel.cc/?J01s5i1J0200'));
