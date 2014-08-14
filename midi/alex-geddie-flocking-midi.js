(function () {
    "use strict";

    fluid.registerNamespace("flock.examples");

    flock.init();

    fluid.defaults("flock.examples.gibby", {
        gradeNames: ["flock.synth", "autoInit"],

        /*
        arg carrier = 6000, width = 500, modFreq = 15, pan = 0.0, scale = 0.2;
        var sine, out;
        sine = SinOsc.ar(SinOsc.ar(modFreq,0,width,carrier), mul:scale);
        Out.ar(0, Pan2.ar(sine, pan));
        */
        // g = Synth.new("gibby", [\freq, 500, \pan, 1.0, \scale, 0.02]);
        synthDef: {
            id: "panner",
            ugen: "flock.ugen.pan2",
            pan: 1.0,
            source: {
                id: "carrier",
                ugen: "flock.ugen.sinOsc",
                freq: {
                    id: "mod",
                    ugen: "flock.ugen.sinOsc",
                    freq: 15,
                    phase: 0,
                    mul: 500,
                    add: 6000
                },
                mul: 0.02
            }
        }
    });

    fluid.defaults("flock.examples.lawrie", {
        gradeNames: ["flock.synth", "autoInit"],

        /*
        arg freq = 5, mul = 0.2, blowFreq = 200, pan = 0.0, rq = 0.5;
        var impulse = Dust.ar(freq,  mul);
        var filteredPulse = BBandPass.ar(impulse, blowFreq, rq);
        var impulseVerb = FreeVerb.ar(filteredPulse);
        Out.ar(0, Pan2.ar(impulseVerb, pan));
        */
        //h = Synth.new("lawrie", [\freq, 5, \pan, 1.0, \blowFreq, 1000.0, \mul, 3.0]);

        synthDef: {
            id: "panner",
            ugen: "flock.ugen.pan2",
            pan: 1.0,
            source: {
                id: "impulseVerb",
                ugen: "flock.ugen.freeverb",
                mix: 0.33,
                room: 0.5,
                damp: 0.5,
                source: {
                    id: "filter",
                    ugen: "flock.ugen.filter.biquad.bp",
                    freq: 1000,
                    q: 2,
                    source: {
                        id: "impulse",
                        ugen: "flock.ugen.dust",
                        freq: 5,
                        mul: 3.0
                    }
                }
            }
        }
    });

    fluid.defaults("flock.examples.edwin", {
        gradeNames: ["flock.synth", "autoInit"],

        /*
        arg carrier = 6000, width = 0.5, modFreq = 15, pan = 0.0, scale = 0.2;
        var sine, out;
        sine = BLowPass.ar(SinOsc.ar(carrier, mul:Pulse.ar(modFreq,width,scale)),500);
        Out.ar(0, Pan2.ar(sine, pan));
        */
        //i = Synth.new("edwin", [\carrier, 150, \pan, 0.0, \modFreq, 15.0, \scale, 0.1]);

        synthDef: {
            id: "panner",
            ugen: "flock.ugen.pan2",
            pan: 0,
            source: {
                id: "filter",
                ugen: "flock.ugen.filter.biquad.lp",
                freq: 500,
                q: 1,
                source: {
                    id: "carrier",
                    ugen: "flock.ugen.sinOsc",
                    freq: 150,
                    mul: {
                        id: "mod",
                        // TODO: This isn't bandlimited, unlike the SC3 version.
                        ugen: "flock.ugen.lfPulse",
                        freq: 15,
                        width: 0.5,
                        mul: 0.1
                    }
                }
            }
        }
    });

    fluid.defaults("flock.examples.alexMIDI", {
        gradeNames: ["flock.band", "autoInit"],

        components: {
            gibby: {
                type: "flock.examples.gibby"
            },


            lawrie: {
                type: "flock.examples.lawrie"
            },

            edwin: {
                type: "flock.examples.edwin"
            },

            nanoKontrol: {
                type: "flock.midi.controller",
                options: {
                    components: {
                        synthContext: "{alexMIDI}"
                    },

                    controlMap: {
                        // Fader 1
                        /*
                        n.fader1.onChanged = {|val|
                            var modFreq = val * 0.5;
                            g.set(\modFreq, modFreq);
                        };
                        */
                        "0": {
                            synth: "gibby",
                            input: "mod.freq",
                            transform: {
                                mul: 0.5
                            }
                        },

                        // Knob 1
                        /*
                        n.knob1.onChanged = {|val|
                            var carrier = (val*2).postln;
                            g.set(\carrier, carrier);
                        };
                        */
                        "8": {
                            synth: "gibby",
                            input: "mod.add",
                            transform: {
                                mul: 2
                            }
                        },

                        // Fader 2
                        /*
                        n.fader2.onChanged = {|val|
                            var blowFreq = (val*20.0).postln;
                            h.set(\blowFreq, blowFreq+0.01);
                        };
                        */
                        "1": {
                            synth: "lawrie",
                            input: "filter.freq",
                            transform: {
                                mul: 20,
                                add: 0.01
                            }
                        },

                        // Knob 2
                        /*
                        n.knob2.onChanged = {|val|
                            var impulseFreq = (val*0.5).postln;
                            h.set(\freq, impulseFreq);
                        };
                        */
                        "9": {
                            synth: "lawrie",
                            input: "impulse.freq",
                            transform: {
                                mul: 0.5
                            }
                        },

                        // Fader 3
                        /*
                        n.fader3.onChanged = {|val|
                            var rq = (val/127).postln;
                            h.set(\rq, rq);
                        };
                        */
                        "2": {
                            synth: "lawrie",
                            input: "filter.q",
                            // TODO: The original transform was for reciprocal q
                            // and was pretty explosive, so this a poor imitation.
                            transform: {
                                add: 1
                            }
                        },

                        // Fader 4
                        /*
                        n.fader4.onChanged = {|val|
                            var modFreq = (val * 0.5)+0.1;
                            i.set(\modFreq, modFreq);
                        };
                        */
                        "3": {
                            synth: "edwin",
                            input: "mod.freq",
                            transform: {
                                mul: 0.5,
                                add: 0.1
                            }
                        },

                        // Knob 4
                        /*
                        n.knob4.onChanged = {|val|
                            var carrier = (val*10).postln;
                            i.set(\carrier, carrier);
                        };
                        */
                        "11": {
                            synth: "edwin",
                            input: "carrier.freq",
                            transform: {
                                mul: 10
                            }
                        },

                        // Fader 5
                        /*
                        n.fader5.onChanged = {|val|
                            var width = (val/127).postln;
                            i.set(\width, width);
                        };
                        */
                        "4": {
                            synth: "edwin",
                            input: "mod.width",
                            transform: {
                                ugen: "flock.ugen.math",
                                div: 127
                            },
                            valuePath: "source"
                        },

                        // Solo Button 4
                        /*
                        n.sBt4.onPress   = {
                            var newCarrier = rrand(50,2000).postln;
                            i.set(\carrier,newCarrier);
                        };
                        */
                        "35": {
                            synth: "edwin",
                            input: "carrier.freq",
                            transform: {
                                ugen: "flock.ugen.random",
                                mul: 1000,
                                add: 1050
                            }
                        }
                    }
                }
            }
        }
    });

}());
