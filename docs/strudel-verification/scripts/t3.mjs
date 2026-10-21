const core = await import('@strudel/core');
const mini = await import('@strudel/mini');
const tonal = await import('@strudel/tonal');
const { transpiler } = await import('@strudel/transpiler');
const prog = `setcpm(120/4)
$: s("bd*4").bank("RolandTR909").gain(.82)
_$: note("c2")
$: chord("<Cm7 Fm7>").voicing().s("gm_epiano1")
lead: n("0 2").scale("C:minor")`;
const out = transpiler(prog, {});
console.log('=== transpiled output\n' + out.output);
console.log('=== miniLocations', JSON.stringify(out.miniLocations));

// a REPL with a fake clock in node, capture triggered haps
await core.evalScope(core, mini, tonal);
let t0 = performance.now();
const getTime = () => (performance.now() - t0) / 1000;
const trig = [];
const errs = [];
const toggles = [];
const r = core.repl({
  defaultOutput: async (hap, deadline, duration, cps, t) => trig.push({ v: hap.value, b: hap.whole.begin.valueOf(), t, cps }),
  getTime, transpiler,
  onEvalError: (e) => errs.push(e),
  onToggle: (s) => toggles.push(s),
  beforeEval: ({ code }) => {},
  afterEval: ({ pattern, meta }) => {},
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pat = await r.evaluate(prog);
console.log('=== after evaluate: cps', r.scheduler.cps, 'started', r.scheduler.started, 'toggles', toggles);
await sleep(1100);
const ids = {}; trig.forEach((x) => { ids[x.v.id] = (ids[x.v.id] || 0) + 1; });
console.log('haps by id (from .p label -> value.id):', ids);
console.log('sample hap value:', JSON.stringify(trig[0].v), 'voicing hap:', JSON.stringify(trig.find(x=>x.v.s==='gm_epiano1')?.v));
// playhead precision check: scheduler.now() vs audio targetTime
const s = r.scheduler;
const T = getTime();
const heard = s.num_cycles_at_cps_change + (T - s.seconds_at_cps_change - s.latency) * s.cps;
console.log(`now()=${s.now().toFixed(4)} heardCycle(formula)=${heard.toFixed(4)} diff(cycles)=${(s.now()-heard).toFixed(4)} => ${( (s.now()-heard)/s.cps*1000).toFixed(1)}ms; clock.duration=${s.clock.duration} latency=${s.latency}`);
// check formula against haps: for each hap, cycle at its targetTime by formula should equal its begin
const errsF = trig.slice(0, 20).map((x) => s.num_cycles_at_cps_change + (x.t - s.seconds_at_cps_change - s.latency) * s.cps - x.b);
console.log('formula vs hap.whole.begin max abs err (cycles):', Math.max(...errsF.map(Math.abs)).toExponential(2));

// hot swap: S$ solo + error
trig.length = 0;
await r.evaluate(`$: s("hh*8")\nS$: s("cp")\n$: s("bd")`);
await sleep(600);
console.log('=== solo eval: distinct s values', [...new Set(trig.map((x) => x.v.s))], 'ids', [...new Set(trig.map((x) => x.v.id))], 'still started', s.started);
const before = r.state.activeCode;
const res = await r.evaluate(`$: s("bd*")`);
console.log('=== bad mini eval returns', res, '| onEvalError got:', errs.map((e) => e.constructor.name + ': ' + e.message));
console.log('state.evalError', r.state.evalError?.message, '| activeCode unchanged (last good keeps playing):', r.state.activeCode === before, '| started', s.started);
const res2 = await r.evaluate(`$: s("bd").fooBar()`);
console.log('=== runtime error:', errs.at(-1)?.message);
const res3 = await r.evaluate(`$: s("bd"`);
console.log('=== JS syntax error:', errs.at(-1)?.constructor.name, errs.at(-1)?.message, JSON.stringify(errs.at(-1)?.loc));
r.stop();
console.log('after stop toggles', toggles, 'now()', s.now());
process.exit(0);
