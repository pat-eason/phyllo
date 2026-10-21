// Starter programs from `Onboarding.dc.html` (`S` array), shared by parse tests.
/** Starter code from `Onboarding.dc.html` (the `S` array), one program per starter. */
export const STARTERS: Record<string, string[]> = {
  house: [
    "setcpm(124/4)",
    '$: s("bd*4").bank("RolandTR909")',
    '$: s("~ cp").bank("RolandTR909").room(.2)',
    '$: s("hh*8").gain("[.4 .7]*4").bank("RolandTR909")',
    '$: note("<a1 a1 c2 g1>*2").s("sawtooth").lpf(900)',
  ],
  lofi: [
    "setcpm(82/4)",
    '$: s("bd ~ ~ bd, ~ sd").bank("LinnDrum").lpf(3000)',
    '$: chord("<Fmaj7 Em7 Dm7 C^7>").voicing()',
    '     .s("gm_epiano1").room(.6)',
    '$: s("hh*8").gain(.3).degradeBy(.3)',
  ],
  breaks: [
    "setcpm(170/4)",
    '$: s("bd ~ ~ bd ~ ~ bd ~, ~ sd ~ [~ sd]")',
    '     .bank("AkaiMPC60")',
    '$: s("hh*8").gain("[.5 .3]*4")',
    '$: note("<e1 g1>").s("sine").shape(.4)',
  ],
  stage: [
    "setcpm(150/4)",
    '$: s("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8").bank("RolandTR909")',
    '$: note("<[c2 c3]*4 [ab1 ab2]*4 [bb1 bb2]*4 [g1 g2]*4>")',
    '     .s("sine").fmi(3).fmh(2).decay(.15).sustain(0)',
    '$: note("c5 eb5 g5 [bb5 g5] f5 ~ eb5 d5").s("square").lpf(3500).delay(.2)',
  ],
  ambient: [
    "setcpm(70/4)",
    '$: note("<c3 g3 eb4 bb3>").s("sine")',
    "     .attack(2).release(4).room(.9).slow(2)",
    '$: note("c5 ~ g5 ~").s("triangle").delay(.6).gain(.3)',
  ],
  euclid: ["setcpm(110/4)", '$: s("bd(3,8)").bank("RolandTR808")', '$: s("cp(2,8,2)").bank("RolandTR808")', '$: s("hh(5,8)").bank("RolandTR808")'],
  blank: ["setcpm(120/4)", "// add a track from the library to begin"],
};

