const core = await import('@strudel/core');
const mini = await import('@strudel/mini');
const bad = core.stack(core.s(mini.mini('good')), core.s(mini.mini('bd')).fmap((v) => { throw new Error('boom'); }));
const strictQuery = (pat, b, e, cps) => pat.query(new core.State(new core.TimeSpan(core.Fraction(b), core.Fraction(e)), { _cps: cps }));
try { strictQuery(bad, 0, 4, 0.5); console.log('no throw'); } catch (e) { console.log('strict query throws:', e.message); }
console.log('queryArc swallows ->', bad.queryArc(0, 1).length, 'haps');
