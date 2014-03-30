(function () {
    "use strict";

    fluid.registerNamespace("flock.examples");

    flock.init();

    fluid.defaults("flock.examples.drumMachine", {
        gradeNames: ["fluid.eventedComponent", "autoInit"],

        score: [
            {
                interval: "repeat",
                time: 1,
                change: {
                    synth: "synth",
                    values: {
                        "trig.source": {
                            synthDef: {
                                ugen: "flock.ugen.sequence",
                                list: [1, 1, 0, 1, 1, 0, 1, 0],
                                loop: 1
                            }
                        }
                    }
                }
            }
        ],

        components: {
            synth: {
                type: "flock.synth",
                options: {
                    synthDef: {
                        ugen: "flock.ugen.playBuffer",
                        buffer: {
                            id: "kick",
                            url: "audio/kick.wav"
                        },
                        trigger: {
                            id: "trig",
                            ugen: "flock.ugen.inputTrigger",
                            source: 0,
                            duration: 0.01
                        }
                    }
                }
            },

            scheduler: {
                type: "flock.scheduler.async.tempo",
                options: {
                    bpm: 180,
                    score: "{drumMachine}.options.score"
                }
            }
        }
    });

}());
