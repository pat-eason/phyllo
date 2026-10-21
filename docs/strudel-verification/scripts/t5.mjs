const core = await import('@strudel/core');
const mini = await import('@strudel/mini');
const tonal = await import('@strudel/tonal');
const { transpiler } = await import('@strudel/transpiler');
await core.evalScope(core, mini, tonal);
const t0 = performance.now(); const getTime = () => (performance.now() - t0) / 1000;
const trig = []; const toggles = [];
const r = core.repl({ getTime, transpiler, defaultOutput: async (hap) => trig.push(hap), onToggle: (s) => toggles.push(s) });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const run = async (code, ms = 900) => { trig.length = 0; await r.evaluate(code); await sleep(ms); return [...new Set(trig.map((h) => h.value.s))].sort().join(','); };
// use setcps(4) so each 900ms window covers ~3.6 cycles
console.log('3 blocks, one muted      :', await run(`setcps(4)\n$: s("a")\n_$: s("muted")\n$: s("b")\nnamed: s("c")\nnamed_: s("muted2")`));
console.log('solo S$ (+named, $)      :', await run(`setcps(4)\n$: s("a")\nS$: s("solo")\nnamed: s("c")`));
console.log('hot-swap kept running    :', 'toggles so far', JSON.stringify(toggles));
console.log('hush() inside code       :', JSON.stringify(await run(`setcps(4)\n$: s("a")\nhush()\n$: s("after")`)));
console.log('all(x=>x.ribbon(2,1))    :', await run(`setcps(4)\n$: s("<p0 p1 p2 p3>")\nall(x=>x.ribbon(2,1))`));
console.log('no labels -> last expr   :', await run(`setcps(4)\ns("x1")\ns("x2")`));
console.log('cpm/setcpm               :', (await r.evaluate(`setcpm(90)\n$: s("a")`), r.scheduler.cps));
r.stop();
// determinism of random functions across runs (same as offline export?)
const q = (p) => p.queryArc(0, 8).filter((h) => h.hasOnset()).map((h) => h.whole.begin.toFraction()).join(' ');
const a = q(core.s(mini.mini('hh*8')).degradeBy(0.5)), b = q(core.s(mini.mini('hh*8')).degradeBy(0.5));
console.log('degradeBy deterministic  :', a === b, '| sometimes deterministic:', q(core.s(mini.mini('bd*4')).sometimes((x) => x.ply(2))) === q(core.s(mini.mini('bd*4')).sometimes((x) => x.ply(2))));
// arrange: clip-local time
const arr = core.arrange([1, core.silence], [2, core.n(mini.mini('<0 1 2 3>'))], [1, core.silence]);
console.log('arrange clip-local time  :', [0, 1, 2, 3, 4, 5, 6, 7].map((c) => { const h = arr.queryArc(c, c + 1).filter((x) => x.hasOnset())[0]; return `c${c}=${h ? h.value.n : '-'}`; }).join(' '));
const arrF = core.arrange([0.5, core.silence], [1.5, core.s(mini.mini('bd*2'))]);
console.log('arrange fractional cycles:', arrF.queryArc(0, 4).filter((x) => x.hasOnset()).map((h) => h.whole.begin.toFraction()).join(' '));
// seek: start playback mid-song by shifting the pattern
console.log('early(8) for seek        :', arr.early(1).queryArc(0, 1).filter((x) => x.hasOnset()).map((h) => h.value.n).join(','));
// context.locations for attribution
const tr = transpiler(`$: s("bd sd")\n$: s("hh")`, {});
console.log('transpiled               :', tr.output.replace(/\n/g, ' | '));
const pat = (0, eval)(`(function(m,s,stack){return stack(s(m('bd sd', 4)), s(m('hh', 20)))})`)(mini.m, core.s, core.stack);
console.log('hap.context.locations    :', pat.queryArc(0, 1).map((h) => `${h.value.s}@${JSON.stringify(h.context.locations)}`).join(' '));
// tags for attribution
console.log('tag()                    :', JSON.stringify(core.s(mini.mini('bd')).tag('trk1').queryArc(0, 1)[0].context.tags));
// krill error location for mini notation
try { mini.parse('"bd [sd"'); } catch (e) { console.log('krill error.location     :', JSON.stringify(e.location.start), e.name); }
process.exit(0);
