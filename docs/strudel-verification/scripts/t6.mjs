const core = await import('@strudel/core');
const mini = await import('@strudel/mini');
const { transpiler } = await import('@strudel/transpiler');
await core.evalScope(core, mini);
const t0 = performance.now(); const getTime = () => (performance.now() - t0) / 1000;
const trig = []; const evalErrs = []; const logs = [];
const origLog = console.log; console.log = (...a) => { if (String(a[0]).includes('%c')) logs.push(String(a[0]).replace('%c', '')); else origLog(...a); };
const r = core.repl({ getTime, transpiler, defaultOutput: async (hap) => trig.push(hap.value.s), onEvalError: (e) => evalErrs.push(e.message) });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
await r.evaluate(`setcps(4)\n$: s("good")`); await sleep(400);
trig.length = 0;
// evaluates fine (lazy), but throws when the scheduler queries it
const ret = await r.evaluate(`setcps(4)\n$: s("good")\n$: s("bd").fmap(v => { if (v.s) throw new Error('boom at query time'); return v; })`);
await sleep(500);
origLog('eval returned pattern?', !!ret, '| onEvalError:', JSON.stringify(evalErrs), '| haps after bad eval:', trig.length, '| state.schedulerError:', r.state.schedulerError);
origLog('logger lines:', JSON.stringify([...new Set(logs.filter((l) => /error/.test(l)))]));
// mitigation: dry-run query in editPattern-like guard before handing to scheduler
const guard = (pat, cps) => { try { pat.queryArc(0, 1, { _cps: cps }); return null; } catch (e) { return e.message; } };
origLog('dry-run guard catches it:', guard(r.state.pattern, 4));
r.stop(); process.exit(0);
