/*! Automagic Music Maker 0.2.0, Copyright 2014Myles Borins | automagicmusicmaker.com */

/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the Piano directory.

*/

/*global jQuery, fluid, flock, navigator*/



var automm = automm || {};

(function ($) {
    "use strict";

    fluid.defaults("automm.oscillator", {
        gradeNames: ["fluid.modelComponent", "fluid.eventedComponent", "autoInit"],

        components: {
            polysynth: {
                type: "flock.synth.polyphonic",
                options: {
                    // TODO: Generate this synthDef using model transformation.
                    synthDef: {
                        id: "carrier",
                        ugen: "{oscillator}.model.osc",
                        freq: "{oscillator}.model.freq",
                        mul: {
                            id: "env",
                            ugen: "flock.ugen.env.simpleASR",
                            attack: "{oscillator}.model.attack",
                            sustain: "{oscillator}.model.sustain",
                            release: "{oscillator}.model.release"
                        }
                    }
                }
            }
        },

        model: {
            arpActive: false,
            freq: 440,
            osc: "flock.ugen.sin",
            attack: 0.25,
            sustain: 0.7,
            release: 0.5,
            gate: 0,
            afour: 69,
            afourFreq: 440,
            octaveNotes: 12,
            isShift: false
        },

        events: {
            onNote: null,
            afterNote: null,
            onClick: null,
            afterClick: null,
            afterInstrumentUpdate: null
        },

        listeners: {
            onNote: "{that}.onNote({arguments}.0)",
            afterNote: "{that}.afterNote({arguments}.0)",
            onClick: "{that}.onClick({arguments}.0)",
            afterClick: "{that}.afterClick({arguments}.0)",
            afterInstrumentUpdate: "{that}.update()"
        },

        // Maps parameter between this model and the model of flocking
        paramMap: {
            "freq": "carrier.freq",
            "attack": "env.attack",
            "sustain": "env.sustain",
            "release": "env.release",
            "gate": "env.gate"
        }
    });

    automm.oscillator.preInit = function (that) {
        if (!flock.enviro.shared) {
            flock.init();
        }

        that.update = function (param, value) {
            if (that.model.hasOwnProperty(param)) {
                that.applier.requestChange(param, value);
            }
        };

        that.onNote = function (note) {
            var freq;
            if (typeof (note) === "object") {
                note = note[0].id;
            }
            freq = automm.midiToFreq(note, that.model.octaveNotes, that.model.afour, that.model.afourFreq);
            that.polysynth.noteOn(note, {"carrier.freq": freq});
        };

        that.afterNote = function (note) {
            if (typeof (note) === "object") {
                note = note[0].id;
            }
            if (!that.isShift) {
                that.polysynth.noteOff(note);
            }
        };

        that.onClick = function (note) {
            if (!that.model.arpActive) {
                that.onNote(note);
            }
        };

        that.afterClick = function (note) {
            if (!that.model.arpActive) {
                that.afterNote(note);
            }
        };
    };

    automm.oscillator.finalInit = function (that) {
        // That.update creates a function that takes a parameter from the model
        // and updates it's value
        //  the applier directly below adds a listener to all instances of the model chaning
        //  it then updates the synth accordingly
        /*jslint unparam: true*/
        that.applier.modelChanged.addListener("*", function (newModel, oldModel, changeSpec) {
            var path = changeSpec[0].path,
                oscPath = that.options.paramMap[path];
            that.polysynth.input(oscPath, newModel[path]);
        });
        /*jslint unparam: false*/
    };

    automm.midiToFreq = function (noteNum, octaveNotes, afour, afourFreq) {
        return Math.pow(2, ((noteNum - afour) / octaveNotes)) * afourFreq;
    };
}(jQuery));
;/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the Piano directory.

*/

/*global jQuery, fluid, flock, document, d3, setTimeout*/

var automm = automm || {};

(function ($) {
    "use strict";

    fluid.defaults("automm.arpeggiator", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        model: {
            // Is it active?
            arpActive: false,
            notificationShowing: false,
            // Rate of the metronome... should be in bpm
            interval: 150,
            // Scale and mode to arpeggiate in
            scale: "major",
            mode: "ionian",
            // This pattern is in Note Degrees starting from 0 ({"I"": 0, "II":1, "III":etcetcetc})
            arpPattern: [0, 2, 4],
            // Stuff from the instrument model
            firstNote: 60,
            octaves: 1,
            octaveNotes: 12,

            // This is a connanon which is used to collect modes / scales / etc....
            // probably shouldn't live here
            canon: {
                modes: {
                    ionian: 0,
                    dorian: 1,
                    phyrgian: 2,
                    lydian: 3,
                    mixolydian: 4,
                    aeolian: 5,
                    locrian: 6
                },
                scales: {
                    major: [2, 2, 1, 2, 2, 2, 1],
                    minor: [2, 2, 1, 2, 2, 1, 2]
                }
            }
        },

        components: {
            metronome: {
                type: "flock.scheduler.async",
                options: {
                    components: {
                        timeConverter: {
                            type: "flock.convert.ms"
                        }
                    }
                }
            }
        },

        events: {
            onClick: null,
            afterClick: null,
            onNote: null,
            afterNote: null,

            // MIDI-compatible events.
            // TODO: These should replace onNote/afterNote.
            message: null,
            noteOn: null,
            noteOff: null,

            metronomeEvent: null,
            afterInstrumentUpdate: null,
            arpActive: null
        }
    });

    automm.arpeggiator.preInit = function (that) {
        that.runningArpeggiators = {};

        that.currentlyPlaying = [];

        that.drawNotification = function (isAlt) {
            var container = that.container.find("#viewBox"),
                viewBox,
                textRect;
            that.model.notificationShowing = true;
            container = container[0];
            that.svg = d3.select(container);
            viewBox = that.svg.attr("viewBox").split(' ');
            fluid.each(viewBox, function (value, i) {
                viewBox[i] = parseFloat(value);
            });
            that.svgTextGroup = that.svg.append("g");
            textRect = that.svgTextGroup.append("rect");
            textRect.attr("x", viewBox[2] / 4);
            textRect.attr("y", viewBox[3] / 4);
            textRect.attr("height", "50%");
            textRect.attr("width", "50%");
            textRect.attr("fill", "black");
            textRect.attr("opacity", 0.5);
            textRect.attr("rx", "20");
            textRect.attr("ry", "20");
            that.svgText = that.svgTextGroup.append("text");
            that.svgText.attr("x", viewBox[2] / 2);
            that.svgText.attr("y", viewBox[3] / 1.8);
            that.svgText.attr("text-anchor", "middle");
            that.svgText.attr("fill", "white");
            that.svgText.attr("font-size", 25);
            if (isAlt) {
                that.svgText.text("Arpeggiator On");
            } else {
                that.svgText.text("Arpeggiator Off");
            }
            setTimeout(that.removeNotification, 500);
        };

        that.removeNotification = function () {
            that.svgTextGroup.remove();
            that.model.notificationShowing = false;
        };

        that.onClick = function (note) {
            if (that.model.arpActive) {
                note = parseFloat(note[0].id);
                that.startArpeggiator(note);
            }
        };

        that.afterClick = function (note) {
            if (that.model.arpActive) {
                note = parseFloat(note[0].id);
                that.stopArpeggiator(note);
            }
        };

        that.bindAlt = function () {
            $(document).keydown(function (event) {
                if (event.altKey === true && !that.model.notificationShowing) {
                    that.update("arpActive", !that.model.arpActive);
                    that.events.arpActive.fire(that.model.arpActive);
                }
            });
        };

        //  The below metronome are Web Workers running at a particular time interval
        //  They are by creating flock.
        // that.setMetronome = function (interval) {
        //
        // };

        that.startMetronome = function (interval) {
            interval = interval || that.model.interval;
            that.metronome.repeat(interval, that.events.metronomeEvent.fire);
        };

        that.stopMetronome = function (interval) {
            interval = interval || that.model.interval;
            that.metronome.clearRepeat(interval);
        };

        that.startArpeggiator = function (root) {
            var count = 0,
                firstTime = true,

                metronomeEvent = function () {
                    var range = {
                            low: that.model.firstNote,
                            high: (that.model.octaves * that.model.octaveNotes) + that.model.firstNote
                        },
                        note = automm.whichNote(root, that.model.canon.scales[that.model.scale],
                            that.model.canon.modes[that.model.mode], that.model.arpPattern, count, range),
                        prevNote = count - 1;

                    if (prevNote === -1) {
                        prevNote = that.model.arpPattern.length - 1;
                    }

                    prevNote = automm.whichNote(root, that.model.canon.scales[that.model.scale],
                            that.model.canon.modes[that.model.mode], that.model.arpPattern, prevNote, range);

                    if (!firstTime) {
                        that.events.afterNote.fire(prevNote);
                        that.events.noteOff.fire({
                            type: "noteOff",
                            chan: 1,
                            note: prevNote,
                            velocity: 0
                        });

                        that.currentlyPlaying.splice(($.inArray(note, that.currentlyPlaying)), 1);
                    } else {
                        firstTime = false;
                    }

                    that.events.onNote.fire(note);
                    that.events.noteOn.fire({
                        type: "noteOn",
                        chan: 1,
                        note: note,
                        velocity: 127
                    });

                    that.currentlyPlaying.push(note);

                    if (count >= that.model.arpPattern.length - 1) {
                        count = 0;
                    } else {
                        count = count + 1;
                    }
                };

            if (that.runningArpeggiators[root] === undefined) {
                that.runningArpeggiators[root] = [];
            }

            that.runningArpeggiators[root].push(metronomeEvent);

            that.events.metronomeEvent.addListener(metronomeEvent);
        };

        that.stopArpeggiator = function (root) {
            fluid.each(that.runningArpeggiators[root], function (event) {
                that.removeMetronomeEvent(event);
            });
            that.runningArpeggiators[root].length = 0;

            fluid.each(that.currentlyPlaying, function (note) {
                that.events.afterNote.fire(note);
                that.events.noteOff.fire({
                    type: "noteOff",
                    chan: 1,
                    note: note,
                    velocity: 0
                });
            });
        };

        that.clearArpeggiators = function () {
            fluid.each(that.runningArpeggiators, function (root) {
                that.stopArpeggiator(root);
            });
        };

        that.setMetronomeEvent = function (callback) {
            that.events.metronomeEvent.addListener(callback);
        };

        that.removeMetronomeEvent = function (callback) {
            that.events.metronomeEvent.removeListener(callback);
        };

        that.update = function (param, value) {
            that.applier.requestChange(param, value);
            return that;
        };
    };

    automm.arpeggiator.finalInit = function (that) {
        that.startMetronome(that.model.interval);
        that.events.afterInstrumentUpdate.addListener(that.update);
        that.events.onClick.addListener(that.onClick);
        that.events.afterClick.addListener(that.afterClick);
        that.events.arpActive.addListener(that.drawNotification);
        that.bindAlt();

        /*jslint unparam: true*/
        that.applier.modelChanged.addListener("interval", function (newModel, oldModel, changeSpec) {
            that.stopMetronome(oldModel.interval);
            that.startMetronome(newModel.interval);
        });
        /*jslint unparam: false*/
    };

    automm.relativeScale = function (scale, mode) {
        var relativeScale = [],
            i;
        for (i = 0; i < scale.length; i = i + 1) {
            if (i === 0) {
                relativeScale[i] = 0;
            } else {
                relativeScale[i] = relativeScale[i - 1] + scale[(i - 1 + mode) % scale.length];
            }
        }

        return relativeScale;
    };

    automm.whichNote = function (root, scale, mode, arpPattern, count, range) {
        var relativeScale = automm.relativeScale(scale, mode),
            note = root + relativeScale[arpPattern[count]];
        note = automm.offsetMod(note, range);

        return note;
    };

    automm.offsetMod = function (i, range) {
        // i is any number
        // range is an object
        //
        // See if the number is below the range and needs to be modded down
        // range = {
        //     low: that.model.firstNote,
        //     high: (that.model.octaves * that.model.octaveNotes) + that.model.firstNote
        // };
        var count = range.high - range.low;

        if (i - range.low < 0) {
            i = i + count;
            i = automm.offsetMod(i, range);
        } else if (i >= range.high) {
            i = i - count;
            i = automm.offsetMod(i, range);
        }

        return i;
    };
}(jQuery));
;/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the Piano directory.

*/

/*global jQuery, fluid, document*/

var automm = automm || {};

(function ($) {
    "use strict";

    fluid.defaults("automm.aria", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        model: {
            notes: ["C", "C-Sharp", "D", "D-Sharp", "E", "F", "F-Sharp", "G", "G-Sharp", "A", "A-Sharp", "B"],
            octaveNotes: 12,
            renderedNotes: [],
            playingNotes: []
        },

        events: {
            afterUpdate: null,
            onClick: null,
            afterClick: null,
            onSelect: null
        }
    });

    automm.aria.preInit = function (that) {
        that.currentlySelected = null;

        that.getNotes = function () {
            // Dump all notes within the container into an array
            var domNotes = that.container.find(".note");

            // Iterate through the array and replace the notes with their id's a.k.a note numbers
            fluid.each(domNotes, function (note, i) {
                that.model.renderedNotes[i] = note.id;
            });

            // Sort that array
            that.model.renderedNotes.sort();

            // Iterate again, this time replace the id numbers with note names
            fluid.each(that.model.renderedNotes, function (note, i) {
                that.model.renderedNotes[i] = {"number": note, "name": (that.model.notes[note % 12] + (Math.floor(note / 12) - 1))};
            });

        };

        that.setTitle = function () {
            var ariaContainer = that.container.find("#aria"),
                instrumentType = that.container.children()[0].id;
            // Append a div that will be used to title the aria application
            ariaContainer.append("<div id='ariaTitle'>AutoMM " + that.container[0].id + " type: " + instrumentType + "</div>");
        };

        that.setDescription = function () {
            var ariaContainer = that.container.find("#aria"),
                instrumentType = that.container.children()[0].id;
            ariaContainer.append("<div id='ariaDescription'>Welcome to the Automagic Music Maker "
                + "Within this application you will find a " + instrumentType + " in which you can interact with.  "
                + "The " + instrumentType + " has " + that.model.renderedNotes.length + " notes "
                + "starting with " + that.model.renderedNotes[0].name + " and ending with "
                + that.model.renderedNotes[that.model.renderedNotes.length - 1].name
                + " you can use the left and right keys to move between notes, and press the space bar to activate them. "
                + "You can deactivate individual notes by pressing spacebar a second time while it is selected. "
                + "If you find that you have too many notes playing at a time, you can stop them all by hitting escape. "
                + "The application also has an arpeggiator, which plays note patterns based on the first note you press. "
                + "To enable the arpeggiator, press alt at any time. "
                + "This application does not follow aria standards, and you will not hear any notification of where your "
                + "current selection is, but don't fret, this was a design choice. It was found to be too distracting to "
                + "play the piano while having your screen reader constantly yelling over top. "
                + "I plan to add keyboard bindings in the near future, this should make the application much more pleasurable "
                + "to interact with.  If you have any question or suggestions please email me at myles DOT borins AT gmail DOT"
                + " com or tweet me @the_alpha_nerd" + "<div>");
        };

        that.render = function () {
            // Find jquery for aria element
            var ariaContainer = that.container.find("#aria");
            // If that container does not exist, make it
            if (ariaContainer.length < 1) {
                that.container.append("<div id='aria' style='display:none;'></div>");
            }
            ariaContainer.empty();
            // Call the function to make the div used to title application
            that.setTitle();
            that.setDescription();
        };

        // The Below function is called when spacebar is hit on a selected Note
        // It fires onClick and afterClick events depending on if a note is currently playing
        that.onActivation = function (note) {
            // get the id of the current note and see if it is already playing
            var noteId = note.id,
                noteState = $.inArray(noteId, that.model.playingNotes);
            note = $(note);
            // If the note is in the playingNotes array, splice it out and fire afterClick
            if (noteState > -1) {
                that.model.playingNotes.splice(noteState, 1);
                that.events.afterClick.fire(note);
            // If it is not in the array, put it in there and fire onClick
            } else {
                that.model.playingNotes[that.model.playingNotes.length] = noteId;
                that.events.onClick.fire(note);
            }
        };

        // The below function is ran when the escape button is hit
        // It stops all currently playing notes
        // Perhaps this should be moved into the oscillator
        that.escaped = function () {
            fluid.each(that.model.playingNotes, function (note) {
                note = that.container.find("#" + note);
                that.events.afterClick.fire(note);
            });
            that.model.playingNotes = [];
        };

        // Binds the escape key to that.escaped
        that.bindEscape = function () {
            $(document).keydown(function (event) {
                if (event.keyCode === 27) {
                    that.escaped();
                }
            });
        };

        // This function intializes a container to be selectable
        // and traversable using the arrow keys
        that.fluidInit = function () {
            // Find type of instrument that has been rendered
            var instrumentType = that.container.children().eq(0),
                // Create an array fille dwith objects stating note numbers and names of all rendered notes
                noteArray = $(automm.fetchNotes(that.container, that.model.renderedNotes));
            // Make the container tabbable
            instrumentType.fluid("tabbable");
            // Make the elements inside selectable
            instrumentType.fluid("selectable", {
                // the default orientation is vertical, so we need to specify that this is horizontal.
                // this affects what arrow keys will move selection
                direction: fluid.a11y.orientation.HORIZONTAL,
                selectableElements: noteArray,
                autoSelectFirstItem: false,

                onSelect: function (note) {
                    that.currentlySelected = note;
                    that.events.onSelect.fire(note);
                }
            });
            // Set the handler to be used when notes are activated
            /*jslint unparam: true*/
            instrumentType.fluid("activatable", function (evt) {
                that.onActivation(that.currentlySelected);
            });
            /*jslint unparam: false*/
        };

        that.update = function () {
            that.getNotes();
            that.render();
            that.fluidInit();   // Take the instrument container, make it both tabbable and able to be traverse with keys
        };
    };

    automm.aria.finalInit = function (that) {
        that.bindEscape();
        that.update();
        that.events.afterUpdate.addListener(that.update);
    };

    automm.fetchNotes = function (container, noteModel) {
        // take a container and model of renderedNotes, return an array of the elements of those notes
        return fluid.transform(noteModel, function (note) {
            var noteSelector = "#" + note.number;
            return container.find(noteSelector)[0];
        });
    };

}(jQuery));
;/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the Piano directory.

*/

/*global jQuery, fluid, d3*/

var automm = automm || {};

(function () {
    "use strict";

    fluid.defaults("automm.piano", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        model: {
            firstNote: 60, // Middle C
            octaves: 1,
            octaveNotes: 12,
            padding: 50,
            pattern: ['white', 'black', 'white', 'black', 'white', 'white', 'black', 'white', 'black', 'white', 'black', 'white'],
            keys: {
                white: {
                    width: 50,
                    height: 200,
                    stroke: "black",
                    fill: "white",
                    highlight: "yellow",
                    selected: "blue",
                    notes: []
                },
                black: {
                    width: 30,
                    height: 125,
                    stroke: "black",
                    fill: "black",
                    highlight: "yellow",
                    selected: "blue",
                    notes: []
                }
            },
            viewBox: {
                width: null,
                height: null
            }
        },

        events: {
            afterUpdate: null,
            afterInstrumentUpdate: null,
            afterNoteCalc: null,
            getNoteCalc: null
        },

        listeners: {
            onCreate: {
                funcName: "automm.piano.init",
                args: "{that}"
            }
        }
    });

    automm.piano.preInit = function (that) {
        that.setup = function () {
            var i;
            that.model.keys.white.notes = [];
            that.model.keys.black.notes = [];

            for (i = that.model.firstNote; i < (that.model.firstNote + (that.model.octaves * that.model.octaveNotes)); i += 1) {
                that.model.keys[that.model.pattern[i % that.model.octaveNotes]].notes.push(i);
            }

            that.model.whiteNotes = that.model.keys.white.notes.length;
            that.model.blackNotes = that.model.keys.black.notes.length;

            that.updateValue("viewbox", {
                width: (that.model.keys.white.width * that.model.whiteNotes) + that.model.padding,
                height: that.model.keys.white.height + that.model.padding
            });

            // Calculate to create string neccesary to generate viewbox (should be in JSON?)
            that.model.viewbox.dim = "0 0 " + that.model.viewbox.width + " " + that.model.viewbox.height;
        };

        // Automation of drawing all the keys on the canvas
        that.drawNote = function (noteType, x, y, id) {
            var r = that.noteGroup.append("rect");
            r.style("stroke", noteType.stroke);
            r.style("fill", noteType.fill);
            r.attr("x", x);
            r.attr("y", y);
            r.attr("width", noteType.width);
            r.attr("height", noteType.height);
            r.attr("id", id);
            r.attr("class", "note");
            r.attr("noteType", noteType.fill);
        };

        // Automation of drawing all the keys on the canvas
        that.render = function () {
            var blackX = -(that.model.keys.black.width / 2),
                prevNote,
                blackCount = 0,
                i;

            if (that.model.keys.white.notes[0] > that.model.keys.black.notes[0]) {
                blackX = blackX - that.model.keys.white.width + (that.model.keys.black.width / 2);
            }
            // Draw White Keys
            for (i = 0; i < that.model.keys.white.notes.length; i += 1) {
                if (that.model.keys.white.notes[0] > that.model.keys.black.notes[0]) {
                    that.drawNote(that.model.keys.white, (i * that.model.keys.white.width) + that.model.keys.black.width / 2, 0, that.model.keys.white.notes[i]);
                } else {
                    that.drawNote(that.model.keys.white, i * that.model.keys.white.width, 0, that.model.keys.white.notes[i]);
                }
            }

            // Draw Black Keys
            for (i = that.model.firstNote; i < (that.model.octaves * that.model.octaveNotes) + that.model.firstNote; i += 1) {
                //get width going

                // If the current key in the pattern is black then draw it!
                if (that.model.pattern[i % that.model.octaveNotes] === "black") {
                    blackX = blackX + that.model.keys.white.width;
                    that.drawNote(that.model.keys.black, blackX, 0, that.model.keys.black.notes[blackCount]);
                    blackCount = blackCount + 1;
                }

                // If it is white, but the previous key was white, skip the key
                if (that.model.pattern[i % that.model.octaveNotes] === prevNote) {
                    blackX = blackX + that.model.keys.white.width;
                }

                // Keep track of previous key
                prevNote = that.model.pattern[i % that.model.octaveNotes];
            }
        };

        that.draw = function () {
            // Calculate it all
            that.setup();
            // Draw viewbox and subsequent group to draw keys into
            that.d3container = d3.select("#" + that.container.attr('id')).select('#piano');  // ??????
            var svg = that.d3container.append("svg");
            svg.attr("style", "height: 100%;");
            svg.attr("viewBox", that.model.viewbox.dim);
            svg.attr("role", "application");
            svg.attr("focusable", true);
            svg.attr("tabindex", "0");
            svg.attr("id", "viewBox");
            svg.attr("aria-labelledby", "ariaTitle");
            svg.attr("aria-describedby", "ariaDescription");

            that.noteGroup = svg.append("g");
            that.noteGroup.attr("transform", "translate(" + that.model.padding / 2 + "," + that.model.padding / 2 + ")");
            that.noteGroup.attr("id", "noteGroup");
            that.noteGroup.attr("focusable", true);
            // Draw the keys
            that.render();
        };

        that.updateValue = function (param, value) {
            that.applier.requestChange(param, value);
        };

        that.update = function (param, value) {
            that.applier.requestChange(param, value);
            that.container.children("#piano").empty();
            that.draw();
            // Fire event that piano is drawn
            that.events.afterUpdate.fire();
        };

        that.sendNoteCalc = function () {
            that.events.afterNoteCalc.fire(that.model.keys);
        };
    };

    automm.piano.init = function (that) {
        var pianoElements = that.container.find("#piano").length;
        if (that.model.auto && pianoElements < 1) {
            that.container.append("<div id='piano'></div>");
            pianoElements = 1;
        }
        if (pianoElements > 0) {
            // Draw the svg
            that.draw();
            that.events.afterUpdate.fire();
            // Fire event that piano is drawn
            that.events.afterInstrumentUpdate.addListener(that.update);
            that.events.getNoteCalc.addListener(that.sendNoteCalc);
        }
    };
}());
;/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the grid directory.

*/

/*global jQuery, fluid, d3*/

var automm = automm || {};

(function () {
    "use strict";

    fluid.defaults("automm.grid", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        model: {
            auto: false,
            columns: 8,
            rows: 8,
            firstNote: 60, // Middle C
            octaves: 1,
            octaveNotes: 12,
            padding: 50,
            pattern: ['white', 'black', 'white', 'black', 'white', 'white', 'black', 'white', 'black', 'white', 'black', 'white'],
            keys: {
                white: {
                    width: 50,
                    height: 50,
                    stroke: "black",
                    fill: "white",
                    highlight: "yellow",
                    selected: "blue",
                    notes: []
                },
                black: {
                    width: 50,
                    height: 50,
                    stroke: "black",
                    fill: "black",
                    highlight: "yellow",
                    selected: "blue",
                    notes: []
                }
            },
            viewBox: {
                height: null,
                width: null
            }
        },

        events: {
            afterUpdate: null,
            onNote: null,
            afterNote: null,
            afterInstrumentUpdate: null,
            afterNoteCalc: null,
            getNoteCalc: null
        }
    });

    automm.grid.preInit = function (that) {
        that.setup = function () {
            var noteNum = that.model.firstNote,
                i;
            that.model.keys.white.notes = [];
            that.model.keys.black.notes = [];

            for (i = 0; i < (that.model.columns * that.model.rows); i += 1) {
                that.model.keys[that.model.pattern[i % that.model.octaveNotes]].notes.push(noteNum);
                noteNum += 1;
            }

            that.updateValue("viewbox", {
                width: (that.model.keys.white.width * that.model.columns) + that.model.padding,
                height: (that.model.keys.white.height * that.model.rows) + that.model.padding
            });

            // Calculate to create string neccesary to generate viewbox (should be in JSON?)
            that.model.viewbox.dim = "0 0 " + that.model.viewbox.width + " " + that.model.viewbox.height;
        };

        // Automation of drawing all the keys on the canvas
        that.drawNote = function (noteType, x, y, id) {
            var r = that.noteGroup.append("rect");
            r.style("stroke", noteType.stroke);
            r.style("fill", noteType.fill);
            r.attr("x", x);
            r.attr("y", y);
            r.attr("width", noteType.width);
            r.attr("height", noteType.height);
            r.attr("id", id);
            r.attr("class", "note");
            r.attr("noteType", noteType.fill);
        };

        that.calcNoteDim = function (noteType, noteNumber, dim) {
            var calculation = (noteNumber - that.model.firstNote);
            if (dim === "width") {
                calculation = calculation % that.model.columns;
            } else {
                calculation = Math.floor(calculation / that.model.columns);
            }
            calculation = calculation * noteType[dim];
            return (calculation);
        };

        // Automation of drawing all the keys on the canvas
        that.render = function () {
            var notePos = {},
                noteNum,
                i;

            for (i = 0; i < that.model.keys.white.notes.length; i += 1) {
                noteNum = that.model.keys.white.notes[i];
                notePos.width = that.calcNoteDim(that.model.keys.white, noteNum, "width");
                notePos.height = that.calcNoteDim(that.model.keys.white, noteNum, "height");
                that.drawNote(that.model.keys.white, notePos.width, notePos.height, noteNum);
            }
            for (i = 0; i < that.model.keys.black.notes.length; i += 1) {
                noteNum = that.model.keys.black.notes[i];
                notePos.width = that.calcNoteDim(that.model.keys.black, noteNum, "width");
                notePos.height = that.calcNoteDim(that.model.keys.black, noteNum, "height");
                that.drawNote(that.model.keys.black, notePos.width, notePos.height, noteNum);
            }

        };

        that.draw = function () {
            // Calculate it all
            that.setup();
            // Draw viewbox and subsequent group to draw keys into
            that.d3container = d3.select("#" + that.container.attr('id')).select('#grid');  // ??????
            var svg = that.d3container.append("svg");
            svg.attr("style", "height: 100%;");
            svg.attr("viewBox", that.model.viewbox.dim);
            svg.attr("role", "application");
            svg.attr("focusable", true);
            svg.attr("tabindex", "0");
            svg.attr("id", "viewBox");
            svg.attr("aria-labelledby", "ariaTitle");

            that.noteGroup = svg.append("g");
            that.noteGroup.attr("transform", "translate(" + that.model.padding / 2 + "," + that.model.padding / 2 + ")");
            that.noteGroup.attr("id", "noteGroup");
            that.noteGroup.attr("focusable", true);
            // Draw the keys
            that.render();

        };

        that.updateValue = function (param, value) {
            that.applier.requestChange(param, value);
        };

        that.update = function (param, value) {
            that.applier.requestChange(param, value);
            that.container.children("#grid").empty();
            that.draw();
            // Fire event that grid is drawn
            that.events.afterUpdate.fire();
        };

        that.sendNoteCalc = function () {
            that.events.afterNoteCalc.fire(that.model.keys);
        };
    };

    automm.grid.finalInit = function (that) {
        var gridElements = that.container.find("#grid").length;
        if (that.model.auto && gridElements < 1) {
            that.container.append("<div id='grid'></div>");
            gridElements = 1;
        }
        if (gridElements > 0) {
            // Draw the svg
            that.draw();
            that.events.afterUpdate.fire();
            // Fire event that grid is drawn
            that.events.onNote.addListener(that.onNote);
            // Bind functions to event listeners
            that.events.afterNote.addListener(that.afterNote);
            that.events.afterInstrumentUpdate.addListener(that.update);
            that.events.getNoteCalc.addListener(that.sendNoteCalc);
        }
    };
}());
;/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the Piano directory.

*/
/*global jQuery, fluid */

var automm = automm || {};

(function () {
    "use strict";

    fluid.defaults("automm.controller", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        model: {
            autoPiano: false,
            autoGrid: false,
            autoGui: false,
            artActive: false,
            columns: 8,
            rows: 8,
            afour: 69,     // The note number of A4... this could probably be calculate based on all the other stuff (probably should be)
            afourFreq: 440, // Standard freq for A4, used to calculate all other notes
            firstNote: 60, // Middle C
            octaves: 1,
            octaveNotes: 12,
            padding: 0,
            pattern: ['white', 'black', 'white', 'black', 'white', 'white', 'black', 'white', 'black', 'white', 'black', 'white'],
            keys: {
                white: {
                    fill: '#ffffff', // White
                    stroke: '#000000', //  Black
                    highlight: '#fff000', //  Yellow
                    selected: '#00F5FF'  // Turquoise
                },
                black: {
                    fill: '#000000', // Black
                    stroke: '#000000', // Black
                    highlight: '#fff000', //  Yellow
                    selected: '#00F5FF'  // Turquoise
                }
            }
        },

        events: {
            // MIDI-compatible events.
            // TODO: These should replace onNote/afterNote.
            message: null,
            noteOn: null,
            noteOff: null,

            onNote: null,
            afterNote: null,
            afterInstrumentUpdate: null,
            afterGuiUpdate: null,
            afterNoteCalc: null,
            afterUpdate: null,
            getNoteCalc: null,
            afterPoly: null,
            onClick: null,
            afterClick: null,
            onSelect: null
        },

        listeners: {
            afterGuiUpdate: {
                func: "{that}.update"
            }
        },

        invokers: {
            update: {
                funcName: "automm.controller.update",
                args: [
                    "{that}.applier", "{that}.events.afterInstrumentUpdate",
                    "{arguments}.0", "{arguments}.1"
                ]
            }
        },

        components: {
            noteSource: {
                type: "automm.noteSource",
                options: {
                    events: {
                        onClick: "{controller}.events.onClick",
                        afterClick: "{controller}.events.afterClick",
                        message: "{controller}.events.message",
                        noteOn: "{controller}.events.noteOn",
                        noteOff: "{controller}.events.noteOff"
                    }
                }
            },

            eventBinder: {
                type: "automm.eventBinder",
                container: "{controller}.container",
                options: {
                    events: {
                        afterUpdate: "{controller}.events.afterUpdate",
                        onClick: "{controller}.events.onClick",
                        afterClick: "{controller}.events.afterClick",
                        onNote: "{controller}.events.onNote",
                        afterNote: "{controller}.events.afterNote",
                        afterPoly: "{controller}.events.afterPoly"
                    }
                }
            },

            highlighter: {
                type: "automm.highlighter",
                container: "{controller}.container",
                options: {
                    model: {
                        keys: "{controller}.model.keys"
                    },
                    events: {
                        onClick: "{controller}.events.onClick",
                        afterClick: "{controller}.events.afterClick",
                        onNote: "{controller}.events.onNote",
                        afterNote: "{controller}.events.afterNote",
                        afterNoteCalc: "{controller}.events.afterNoteCalc",
                        getNoteCalc: "{controller}.events.getNoteCalc",
                        onSelect: "{controller}.events.onSelect"
                    }
                }
            }
        }
    });

    fluid.defaults("automm.noteSource", {
        gradeNames: ["fluid.eventedComponent", "autoInit"],

        events: {
            onClick: null,
            afterClick: null,

            message: null,
            noteOn: null,
            noteOff: null
        },

        // TODO: Modelize these.
        listeners: {
            onClick: {
                funcName: "automm.noteSource.fireNoteMessage",
                args: ["{arguments}.0.0.id", "noteOn", "{that}.events"]
            },

            afterClick: {
                funcName: "automm.noteSource.fireNoteMessage",
                args: ["{arguments}.0.0.id", "noteOff", "{that}.events"]
            }
        }
    });

    automm.noteSource.fireNoteMessage = function (noteId, type, events) {
        var msg = {
            type: type,
            chan: 1,
            note: Number(noteId),
            velocity: 127
        };

        events.message.fire(msg);
        events[type].fire(msg);
    };

    automm.controller.update = function (applier, afterInstrumentUpdate, param, value) {
        that.applier.requestChange(param, value);
        that.events.afterInstrumentUpdate.fire(param, value);
    };

    fluid.defaults("automm.withArpeggiator", {
        gradeNames: ["fluid.modelComponent", "autoInit"],

        model: {
            arpActive: false,
            // Rate of the metronome... should be in bpm
            interval: 150,
            // Scale and mode to arpeggiate in
            scale: "major",
            mode: "ionian",
            // This pattern is in Note Degrees starting from 0 ({"I"": 0, "II":1, "III":etcetcetc})
            arpPattern: [0, 2, 4],

            // This is a connanon which is used to collect modes / scales / etc....
            // probably shouldn't live here
            canon: {
                modes: {
                    ionian: 0,
                    dorian: 1,
                    phyrgian: 2,
                    lydian: 3,
                    mixolydian: 4,
                    aeolian: 5,
                    locrian: 6
                },
                scales: {
                    major: [2, 2, 1, 2, 2, 2, 1],
                    minor: [2, 2, 1, 2, 2, 1, 2]
                }
            }
        },

        components: {
            arpeggiator: {
                type: "automm.arpeggiator",
                container: "{withArpeggiator}.container",
                options: {
                    model: "{withArpeggiator}.model",
                    events: {
                        message: "{withArpeggiator}.events.message",
                        noteOn: "{withArpeggiator}.events.noteOn",
                        noteOff: "{withArpeggiator}.events.noteOff",

                        onNote: "{withArpeggiator}.events.onNote",
                        afterNote: "{withArpeggiator}.events.afterNote",
                        onClick: "{withArpeggiator}.events.onClick",
                        afterClick: "{withArpeggiator}.events.afterClick",
                        afterInstrumentUpdate: "{withArpeggiator}.events.afterInstrumentUpdate"
                    }
                }
            }
        }
    });

    fluid.defaults("automm.withARIA", {
        gradeNames: ["fluid.eventedComponent", "autoInit"],

        components: {
            aria: {
                type: "automm.aria",
                container: "{controller}.container",
                options: {
                    model: {
                        octaveNotes: "{controller}.model.octaveNotes"
                    },
                    events: {
                        afterUpdate: "{controller}.events.afterGuiUpdate",
                        onClick: "{controller}.events.onClick",
                        afterClick: "{controller}.events.afterClick",
                        onSelect: "{controller}.events.onSelect"
                    }
                }
            }
        }
    })

    fluid.defaults("automm.keyboardController", {
        gradeNames: ["automm.controller", "automm.withArpeggiator", "autoInit"],

        components: {
            piano: {
                type: "automm.piano",
                container: "{keyboardController}.container",
                options: {
                    model: "{keyboardController}.model",
                    events: {
                        afterInstrumentUpdate: "{keyboardController}.events.afterInstrumentUpdate",
                        afterNoteCalc: "{keyboardController}.events.afterNoteCalc",
                        afterUpdate: "{keyboardController}.events.afterUpdate",
                        getNoteCalc: "{keyboardController}.events.getNoteCalc"
                    }
                }
            }
        }
    });

    fluid.defaults("automm.gridController", {
        gradeNames: ["automm.controller", "automm.withArpeggiator", "autoInit"],

        components: {
            grid: {
                type: "automm.grid",
                container: "{gridController}.container",
                options: {
                    model: {
                        auto: "{gridController}.model.autoGrid",
                        columns: "{gridController}.model.columns",
                        rows: "{gridController}.model.rows",
                        firstNote: "{gridController}.model.firstNote", // Middle C
                        octaveNotes: "{gridController}.model.octaveNotes",
                        padding: "{gridController}.model.padding",
                        pattern: "{gridController}.model.pattern",
                        keys: "{gridController}.model.keys"
                    },
                    events: {
                        afterInstrumentUpdate: "{gridController}.events.afterInstrumentUpdate",
                        afterNoteCalc: "{gridController}.events.afterNoteCalc",
                        afterUpdate: "{gridController}.events.afterUpdate",
                        getNoteCalc: "{gridController}.events.getNoteCalc"
                    }
                }

            }
        }
    });

    fluid.defaults("automm.instrument", {
        gradeNames: ["automm.controller", "automm.withArpeggiator", "autoInit"],

        components: {
            piano: {
                type: "automm.piano",
                container: "{instrument}.container",
                options: {
                    model: {
                        auto: "{instrument}.model.autoPiano",
                        firstNote: "{instrument}.model.firstNote", // Middle C
                        octaves: "{instrument}.model.octaves",
                        octaveNotes: "{instrument}.model.octaveNotes",
                        padding: "{instrument}.model.padding",
                        pattern: "{instrument}.model.pattern",
                        keys: "{instrument}.model.keys"
                    },
                    events: {
                        afterInstrumentUpdate: "{instrument}.events.afterInstrumentUpdate",
                        afterNoteCalc: "{instrument}.events.afterNoteCalc",
                        afterUpdate: "{instrument}.events.afterUpdate",
                        getNoteCalc: "{instrument}.events.getNoteCalc"
                    }
                }
            },

            grid: {
                type: "automm.grid",
                container: "{instrument}.container",
                options: {
                    model: {
                        auto: "{instrument}.model.autoGrid",
                        columns: "{instrument}.model.columns",
                        rows: "{instrument}.model.rows",
                        firstNote: "{instrument}.model.firstNote", // Middle C
                        octaveNotes: "{instrument}.model.octaveNotes",
                        padding: "{instrument}.model.padding",
                        pattern: "{instrument}.model.pattern",
                        keys: "{instrument}.model.keys"
                    },
                    events: {
                        afterInstrumentUpdate: "{instrument}.events.afterInstrumentUpdate",
                        afterNoteCalc: "{instrument}.events.afterNoteCalc",
                        afterUpdate: "{instrument}.events.afterUpdate",
                        getNoteCalc: "{instrument}.events.getNoteCalc"
                    }
                }
            },

            oscillator: {
                type: "automm.oscillator",
                options: {
                    model: {
                        afour: "{instrument}.afour",
                        afourFreq: "{instrument}.afourFreq",
                        ocaveNotes: "{instrument}.octaveNotes",
                        arpActive: "{instrument}.arpActive"
                    },
                    events: {
                        onClick: "{instrument}.events.onClick",
                        afterClick: "{instrument}.events.afterClick",
                        onNote: "{instrument}.events.onNote",
                        afterNote: "{instrument}.events.afterNote",
                        afterInstrumentUpdate: "{instrument}.events.afterInstrumentUpdate"
                    }
                }
            },

            gui: {
                type: "automm.gui",
                container: "{instrument}.container",
                options: {
                    model: {
                        drawGui: "{instrument}.model.drawGui",
                        firstNote: "{instrument}.model.firstNote", // Middle C
                        octaves: "{instrument}.model.octaves",
                        octaveNotes: "{instrument}.model.octaveNotes",
                        padding: "{instrument}.model.padding",
                        pattern: "{instrument}.model.pattern",
                        keys: "{instrument}.model.keys"
                    },
                    events: {
                        afterGuiUpdate: "{instrument}.events.afterGuiUpdate"
                    }
                }
            }
        }
    });

}());
;/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the Piano directory.

*/

/*global jQuery, fluid*/

var automm = automm || {};

(function ($) {
    "use strict";

    fluid.defaults("automm.highlighter", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        model: {
            keys: {
                white: {width: 50, height: 50, stroke: "black", fill: "white", highlight: "yellow", notes: []},
                black: {width: 50, height: 50, stroke: "black", fill: "black", highlight: "yellow", notes: []}
            },
            arpActive: false
        },

        events: {
            getNoteCalc: null,
            onNote: null,
            afterNote: null,
            afterNoteCalc: null,
            onSelect: null
        }
    });

    automm.highlighter.preInit = function (that) {
        that.currentlySelected = null;
        that.currentlyPlaying = [];

        that.afterNoteCalc = function (newKeys) {
            that.model.keys = newKeys;
        };

        that.onNote = function (note) {
            note = automm.numberToNote(note, that.container);
            automm.updateCssFill(note, 'highlight', that.model.keys);
            that.currentlyPlaying.push(note[0].id);
        };

        that.afterNote = function (note) {
            var playPosition;
            note = automm.numberToNote(note, that.container);
            playPosition = automm.isCurrentlyPlaying(note[0].id, that.currentlyPlaying);
            if (that.currentlySelected !== null && note[0] === that.currentlySelected[0]) {
                automm.updateCssFill(note, 'selected', that.model.keys);
            } else {
                automm.updateCssFill(note, 'fill', that.model.keys);
            }
            that.currentlyPlaying.splice(playPosition, 1);
        };

        that.onClick = function (note) {
            if (!that.model.arpActive) {
                that.onNote(note);
            }
        };

        that.afterClick = function (note) {
            if (!that.model.arpActive) {
                that.afterNote(note);
            }
        };

        that.onSelect = function (note) {
            var prevPlaying;
            note = automm.numberToNote(note, that.container);
            if (that.currentlySelected !== null) {
                prevPlaying = automm.isCurrentlyPlaying(that.currentlySelected[0].id, that.currentlyPlaying);
                if (prevPlaying === -1) {
                    automm.updateCssFill(that.currentlySelected, 'fill', that.model.keys);
                } else {
                    automm.updateCssFill(that.currentlySelected, 'highlight', that.model.keys);
                }
            }
            automm.updateCssFill(note, 'selected', that.model.keys);
            that.currentlySelected = note;
        };
    };

    automm.highlighter.finalInit = function (that) {
        that.events.onNote.addListener(that.onNote);
        that.events.afterNote.addListener(that.afterNote);
        that.events.afterNoteCalc.addListener(that.afterNoteCalc);
        that.events.onClick.addListener(that.onClick);
        that.events.afterClick.addListener(that.afterClick);
        that.events.onSelect.addListener(that.onSelect);
        that.events.getNoteCalc.fire();
    };

    automm.numberToNote = function (note, container) {
        if (typeof (note) === "number") {
            note = container.find("#" + note);
        }
        note = $(note);
        return note;
    };

    automm.updateCssFill = function (note, attribute, keys) {
        if ($.inArray(parseInt(note[0].id, 10), keys.white.notes) !== -1) {
            note.css("fill", keys.white[attribute]);
        } else {
            note.css("fill", keys.black[attribute]);
        }
    };

    automm.isCurrentlyPlaying = function (note, currentlyPlaying) {
        var isPlaying = $.inArray(note, currentlyPlaying);
        return isPlaying;
    };

}(jQuery));
;/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the Piano directory.

*/
/*global jQuery, fluid, dat */

var automm = automm || {};

(function () {
    "use strict";
    fluid.defaults("automm.gui", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        model: {
            drawGui: false,
            afour: 69,     // The note number of A4... this could probably be calculate based on all the other stuff (probably should be)
            afourFreq: 440, // Standard freq for A4, used to calculate all other notes
            firstNote: 60, // Middle C
            octaves: 1,
            octaveNotes: 12,
            padding: 0,
            pattern: ['white', 'black', 'white', 'black', 'white', 'white', 'black', 'white', 'black', 'white', 'black', 'white'],
            keys: {
                white: {
                    fill: '#fff000',
                    stroke: '#000000',
                    highlight: '#ffffff'
                },
                black: {
                    fill: '#ffa400',
                    stroke: '#000000',
                    highlight: '#000000'
                }
            }
        },

        events: {
            afterGuiUpdate: null
        }
    });

    automm.gui.preInit = function (that) {
        that.init = function () {
            that.datgui = new dat.GUI({ autoPlace: false });
            that.customContainer = that.container.children('#gui');
            that.datgui.close();
            that.customContainer.append(that.datgui.domElement);
            that.customContainer.attr('align', 'center').children().attr('align', 'left');

            that.datgui.octaves = that.datgui.add(that.model, 'octaves', 1, 5);
            that.datgui.firstNote = that.datgui.add(that.model, 'firstNote', 24, 84).step(1);

            // Folder for style
            that.datgui.style = that.datgui.addFolder('Style');
            that.datgui.padding = that.datgui.style.add(that.model, 'padding', 0, 200);

            // Do White Keys
            that.datgui.whiteKeys = that.datgui.style.addFolder('White Keys');
            that.datgui.whiteKeysFill = that.datgui.whiteKeys.addColor(that.model.keys.white, 'fill');
            that.datgui.whiteKeysStroke = that.datgui.whiteKeys.addColor(that.model.keys.white, 'stroke');
            that.datgui.whiteKeysHighlight = that.datgui.whiteKeys.addColor(that.model.keys.white, 'highlight');

            // Do Black Keys
            that.datgui.blackKeys = that.datgui.style.addFolder('Black Keys');
            that.datgui.blackKeysFill = that.datgui.blackKeys.addColor(that.model.keys.black, 'fill');
            that.datgui.blackKeysStroke = that.datgui.blackKeys.addColor(that.model.keys.black, 'stroke');
            that.datgui.blackKeysHighlight = that.datgui.blackKeys.addColor(that.model.keys.black, 'highlight');

            // Events ~ should be bubbled or at least done cleaner... this is so bad :(
            that.datgui.octaves.onChange(function (value) {
                that.update("octaves", value);
            });
            that.datgui.firstNote.onChange(function (value) {
                that.update("firstNote", value);
            });
            that.datgui.padding.onChange(function (value) {
                that.update("padding", value);
            });
            that.datgui.whiteKeysFill.onChange(function (value) {
                that.update("keys.white.fill", value);
            });
            that.datgui.whiteKeysStroke.onChange(function (value) {
                that.update("keys.white.stroke", value);
            });
            that.datgui.whiteKeysHighlight.onChange(function (value) {
                that.update("keys.white.highlight", value);
            });
            that.datgui.blackKeysFill.onChange(function (value) {
                that.update("keys.black.fill", value);
            });
            that.datgui.blackKeysStroke.onChange(function (value) {
                that.update("keys.black.stroke", value);
            });
            that.datgui.blackKeysHighlight.onChange(function (value) {
                that.update("keys.black.highlight", value);
            });

        };

        // Not sure if I should even bother with this
        // that.addControl = function (param) {
        //     that.datgui[param] = that.datgui[param] || that.datgui.add(that.model, param, 1, 5);
        // };
        // that.addFolder = function (name) {
        //
        // };
        // that.appendFolder = function (name) {
        //
        // }
        that.update = function (param, value) {
            that.applier.requestChange(param, value);
            that.events.afterGuiUpdate.fire(param, value);
            return that;
        };
    };

    automm.gui.finalInit = function (that) {
        if (that.model.drawGui) {
            if (that.container.find("gui").length < 1) {
                that.container.append("<div id='gui' aria-hidden='true'></div>");
            } else {
                that.container.find('gui').attr('aria-hidden', true);
            }
            that.init();
            that.container.append("<div class='buffer' style='height:50px;'></div>");
        }
    };
}());
;/*
Google Summer of Code 2012: Automagic Music Maker

Primarily written by Myles Borins
Strongly influenced by GSOC Mentor Colin Clark
Using the Infusion framework and Flocking Library

The Automagic Music Maker is distributed under the terms the MIT or GPL2 Licenses.
Choose the license that best suits your project. The text of the MIT and GPL
licenses are at the root of the Piano directory.

*/
/*global jQuery, fluid, document*/

var automm = automm || {};

(function ($) {
    "use strict";
    fluid.defaults("automm.eventBinder", {
        gradeNames: ["fluid.viewComponent", "autoInit"],

        model: {
            isShift: false
        },

        events: {
            afterUpdate: null,
            afterClick: null,
            onClick: null
        }

    });

    automm.eventBinder.preInit = function (that) {
        that.bindEvents = function () {
            // Variables to keep track of currently pressed notes
            var lastClicked = {},
                isClicking = false;
            that.polyNotes = [];

            $(document).keydown(function (event) {
                if (event.shiftKey === true) {
                    that.model.isShift = true;
                }
            });
            $(document).keyup(function (event) {
                if (event.shiftKey === false && that.model.isShift) {
                    that.model.isShift = false;
                    that.afterShift();
                }
            });

            // Get an Array of all notes on canvas
            that.notes = that.container.find(".note");

            // Iterate through each note
            /*jslint unparam: true*/
            that.notes.each(function (i, note) {
                // Make sure the note element is set up properly
                note = $(note);
                var mouseDownHandler = function () {
                    // For Keeping track
                    lastClicked = note;
                    isClicking = true;
                    that.onClick(note);
                };

                // mousedown event binding
                note.mousedown(mouseDownHandler);
                note.on("touchstart", mouseDownHandler);

                var mouseUpHandler = function () {
                    isClicking = false;
                    if (!that.model.isShift) {
                        that.events.afterClick.fire(note);
                    }
                    lastClicked = {};
                };

                // mousup event binding
                note.mouseup(mouseUpHandler);
                note.on("touchend", mouseUpHandler);

                // mouse hover event binding
                note.mouseover(function () {
                    if (isClicking) {
                        if (!that.model.isShift) {
                            that.events.afterClick.fire(lastClicked);
                        }
                        that.onClick(note);
                    }
                    lastClicked = note;
                });
                note.one("mousedown", function () {
                    var enviro = flock.enviro.shared;
                    if (enviro && !enviro.model.isPlaying) {
                        flock.enviro.shared.play();
                    }
                });
            });
            /*jslint unparam: false*/
        };

        that.onClick = function (note) {
            var inArray = $.inArray(note, that.polyNotes);
            if (that.model.isShift) {
                if (inArray >= 0) {
                    that.events.afterClick.fire(note);
                    that.polyNotes.splice(inArray, 1);
                    return that;
                } else {
                    that.polyNotes[that.polyNotes.length] = note;
                }
            }
            that.events.onClick.fire(note);
        };

        that.afterShift = function () {
            /*jslint unparam: true*/
            fluid.each(that.polyNotes, function (note) {
                that.events.afterClick.fire(note);
            });
            that.polyNotes = [];
            /*jslint unparam: false*/
        };
    };

    automm.eventBinder.finalInit = function (that) {
        that.bindEvents();
        that.events.afterUpdate.addListener(that.bindEvents);
    };
}(jQuery));
