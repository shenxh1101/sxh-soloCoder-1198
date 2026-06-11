var SynthApp = window.SynthApp || {};

SynthApp.Presets = {
  piano: {
    name: 'Piano',
    waveform: 'triangle',
    attack: 0.005,
    decay: 0.3,
    sustain: 0.0,
    release: 1.0
  },
  organ: {
    name: 'Organ',
    waveform: 'sine',
    attack: 0.01,
    decay: 0.1,
    sustain: 0.8,
    release: 0.2
  },
  electronic: {
    name: 'Electronic',
    waveform: 'sawtooth',
    attack: 0.02,
    decay: 0.4,
    sustain: 0.5,
    release: 0.6
  }
};

SynthApp.NOTE_FREQUENCIES = [
  261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25
];

SynthApp.NOTE_NAMES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];