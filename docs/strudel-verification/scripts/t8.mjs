const core = await import('@strudel/core');
console.log('core has voicing?', 'voicing' in core, '| core has chord?', 'chord' in core, '| Pattern.prototype.voicing before tonal:', typeof core.Pattern.prototype.voicing);
await import('@strudel/tonal');
console.log('after tonal import:', typeof core.Pattern.prototype.voicing);
console.log('core has: setcpm?', 'setcpm' in core, 'repl?', 'repl' in core, 'hush?', 'hush' in core, 'code2hash?', 'code2hash' in core, 'getTime', 'getTime' in core, 'getCps', 'getCps' in core);
