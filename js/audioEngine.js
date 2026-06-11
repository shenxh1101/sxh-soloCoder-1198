var SynthApp = window.SynthApp || {};

SynthApp.AudioEngine = (function() {
  var audioCtx = null;
  var masterGain = null;
  var analyser = null;
  var dryGain = null;
  var reverbNode = null;
  var reverbGain = null;
  var delayNode = null;
  var delayGain = null;
  var delayFeedback = null;

  var waveform = 'sine';
  var adsr = { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 };
  var effects = { reverbMix: 0.3, delayMix: 0.2, delayTime: 0.3 };

  var activeNotes = {};

  function createReverbImpulse(ctx, duration, decay) {
    var sampleRate = ctx.sampleRate;
    var length = Math.floor(sampleRate * duration);
    var buffer = ctx.createBuffer(2, length, sampleRate);

    for (var channel = 0; channel < 2; channel++) {
      var data = buffer.getChannelData(channel);
      for (var i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  function init() {
    if (audioCtx) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.4;

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;

    dryGain = audioCtx.createGain();
    dryGain.gain.value = 1.0 - effects.reverbMix - effects.delayMix;

    reverbNode = audioCtx.createConvolver();
    reverbNode.buffer = createReverbImpulse(audioCtx, 2.5, 4);
    reverbGain = audioCtx.createGain();
    reverbGain.gain.value = effects.reverbMix;

    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = effects.delayTime;
    delayGain = audioCtx.createGain();
    delayGain.gain.value = effects.delayMix;

    delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.35;

    dryGain.connect(masterGain);

    reverbNode.connect(reverbGain);
    reverbGain.connect(masterGain);

    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayGain);
    delayGain.connect(masterGain);

    masterGain.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  function ensureContext() {
    if (!audioCtx) init();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function noteOn(noteIndex) {
    ensureContext();

    var frequency = SynthApp.NOTE_FREQUENCIES[noteIndex];
    var now = audioCtx.currentTime;

    if (activeNotes[noteIndex]) {
      noteOff(noteIndex);
    }

    var osc = audioCtx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = frequency;

    var gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1.0, now + adsr.attack);
    gainNode.gain.linearRampToValueAtTime(adsr.sustain, now + adsr.attack + adsr.decay);

    osc.connect(gainNode);
    gainNode.connect(dryGain);
    gainNode.connect(reverbNode);
    gainNode.connect(delayNode);

    osc.start(now);

    activeNotes[noteIndex] = {
      oscillator: osc,
      gainNode: gainNode,
      startedAt: now
    };
  }

  function noteOff(noteIndex) {
    if (!activeNotes[noteIndex]) return;

    var entry = activeNotes[noteIndex];
    var now = audioCtx.currentTime;

    var currentGain = entry.gainNode.gain.value;
    entry.gainNode.gain.cancelScheduledValues(now);
    entry.gainNode.gain.setValueAtTime(currentGain, now);
    entry.gainNode.gain.linearRampToValueAtTime(0, now + adsr.release);

    var stopTime = now + adsr.release + 0.1;
    entry.oscillator.stop(stopTime);

    var startedAt = entry.startedAt;
    var duration = now - startedAt;

    delete activeNotes[noteIndex];

    return { startTime: startedAt, duration: duration };
  }

  function stopAll() {
    var keys = Object.keys(activeNotes);
    for (var i = 0; i < keys.length; i++) {
      noteOff(parseInt(keys[i]));
    }
  }

  function setWaveform(w) {
    waveform = w;
  }

  function getWaveform() {
    return waveform;
  }

  function setADSR(params) {
    if (params.attack !== undefined) adsr.attack = params.attack;
    if (params.decay !== undefined) adsr.decay = params.decay;
    if (params.sustain !== undefined) adsr.sustain = params.sustain;
    if (params.release !== undefined) adsr.release = params.release;
  }

  function getADSR() {
    return adsr;
  }

  function setEffects(params) {
    if (params.reverbMix !== undefined) {
      effects.reverbMix = params.reverbMix;
      if (reverbGain) reverbGain.gain.value = params.reverbMix;
    }
    if (params.delayMix !== undefined) {
      effects.delayMix = params.delayMix;
      if (delayGain) delayGain.gain.value = params.delayMix;
    }
    if (params.delayTime !== undefined) {
      effects.delayTime = params.delayTime;
      if (delayNode) delayNode.delayTime.value = params.delayTime;
    }
    if (dryGain) {
      dryGain.gain.value = Math.max(0, 1.0 - effects.reverbMix - effects.delayMix);
    }
  }

  function getEffects() {
    return effects;
  }

  function getAnalyser() {
    return analyser;
  }

  function getAudioContext() {
    return audioCtx;
  }

  return {
    init: init,
    noteOn: noteOn,
    noteOff: noteOff,
    stopAll: stopAll,
    setWaveform: setWaveform,
    getWaveform: getWaveform,
    setADSR: setADSR,
    getADSR: getADSR,
    setEffects: setEffects,
    getEffects: getEffects,
    getAnalyser: getAnalyser,
    getAudioContext: getAudioContext
  };
})();