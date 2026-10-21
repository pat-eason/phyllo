const imp = (n)=>import(n);
const core = await imp('@strudel/core');
const mini = await imp('@strudel/mini');
const fmt = (haps) => haps.filter(h=>h.hasOnset()).map(h => `${h.whole.begin.toFraction()}-${h.whole.end.toFraction()}:${JSON.stringify(h.value)}`);
console.log('core exports count', Object.keys(core).length, 'mini exports', Object.keys(mini));
console.log('mini("bd*4") 0..1', fmt(mini.mini('bd*4').queryArc(0,1)));
console.log('m("bd*4")', typeof mini.m, mini.m && fmt(mini.m('bd*4').queryArc(0,1)));
console.log('h?', typeof mini.h);
console.log('core.s("bd*4") string autoparse?', fmt(core.s('bd*4').queryArc(0,1)));
