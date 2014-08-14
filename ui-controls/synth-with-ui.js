(function () {

    flock.init();
    flock.enviro.shared.play();

    fluid.defaults("flock.demo.moogySynth", {
        gradeNames: ["flock.synth", "autoInit"],

        synthDef: {
            ugen: "flock.ugen.scope",
            source: {
                id: "filter",
                ugen: "flock.ugen.filter.moog",
                cutoff: 2000,
                resonance: {
                    ugen: "flock.ugen.sin",
                    freq: 2,
                    mul: 1.5,
                    add: 1.5
                },
                source: {
                    id: "carrier",
                    ugen: "flock.ugen.lfSaw",
                    freq: 440,
                    mul: {
                        id: "env",
                        ugen: "flock.ugen.env.simpleASR",
                        attack: 0.25,
                        sustain: 0.7,
                        release: 1.0,
                        gate: 0.0
                    }
                }
            },
            options: {
                canvas: "#gfx",
                styles: {
                    strokeColor: "orange",
                    strokeWidth: 2
                }
            }
        }
    });

    fluid.defaults("flock.demo.synthUI", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        components: {
            synth: {
                type: "flock.demo.moogySynth"
            },

            piano: {
                type: "automm.keyboardController",
                container: "{that}.dom.keyboard",
                options: {
                    model: {
                        firstNote: 24,
                        auto: true,
                        octaves: 5
                    },

                    listeners: {
                        noteOn: {
                            func: "{synth}.set",
                            args: {
                                "carrier.freq": "@expand:flock.midiFreq({arguments}.0.note)",
                                "env.gate": 1.0
                            }
                        },
                        noteOff: {
                            func: "{synth}.set",
                            args: {
                                "env.gate": 0.0
                            }
                        }
                    }
                }
            },

            cutoffKnob: {
                type: "flock.demo.knob",
                container: "{that}.dom.cutoffKnob",
                options: {
                    input: "filter.cutoff"
                }
            },

            resonanceAddKnob: {
                type: "flock.demo.knob",
                container: "{that}.dom.resonanceAddKnob",
                options: {
                    input: "filter.resonance.add"
                }
            },

            resonanceMulKnob: {
                type: "flock.demo.knob",
                container: "{that}.dom.resonanceMulKnob",
                options: {
                    input: "filter.resonance.mul"
                }
            },

            resonanceFreqKnob: {
                type: "flock.demo.knob",
                container: "{that}.dom.resonanceFreqKnob",
                options: {
                    input: "filter.resonance.freq"
                }
            },

            attackKnob: {
                type: "flock.demo.knob",
                container: "{that}.dom.attackKnob",
                options: {
                    input: "env.attack"
                }
            },

            releaseKnob: {
                type: "flock.demo.knob",
                container: "{that}.dom.releaseKnob",
                options: {
                    input: "env.release"
                }
            },

            volumeKnob: {
                type: "flock.demo.knob",
                container: "{that}.dom.volumeKnob",
                options: {
                    input: "env.sustain"
                }
            }
        },

        events: {
            onCutoff: null,
            onAttack: null,
            onRelease: null,
            onVolume: null
        },

        selectors: {
            keyboard: "#keyboard",
            cutoffKnob: "#cutoff",
            resonanceAddKnob: "#res-add",
            resonanceMulKnob: "#res-mul",
            resonanceFreqKnob: "#res-change",
            attackKnob: "#attack",
            releaseKnob: "#release",
            volumeKnob: "#volume"
        }
    });

    fluid.defaults("flock.demo.knob", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        events: {
            onChange: null
        },

        listeners: {
            onCreate: {
                "this": "{that}.dom.container.0",
                method: "addEventListener",
                args: [
                    "change",
                    "{that}.events.onChange.fire"
                ]
            },

            onChange: {
                func: "{synth}.set",
                args: ["{that}.options.input", "{arguments}.0.target.value"]
            }
        }
    });

}());
