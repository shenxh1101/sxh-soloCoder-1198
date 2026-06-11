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

  var effects = { reverbMix: 0.3, delayMix: 0.2, delayTime: 0.3 };

  var selectedKey = -1;

  var keySettings = [];
  for (var i = 0; i < 8; i++) {
    keySettings.push({
      waveform: 'sine',
      attack: 0.01,
      decay: 0.1,
      sustain: 0.8,
      release: 0.2
    });
  }

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
    var ks = keySettings[noteIndex];

    if (activeNotes[noteIndex]) {
      noteOff(noteIndex);
    }

    var osc = audioCtx.createOscillator();
    osc.type = ks.waveform;
    osc.frequency.value = frequency;

    var gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1.0, now + ks.attack);
    gainNode.gain.linearRampToValueAtTime(ks.sustain, now + ks.attack + ks.decay);

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
    var ks = keySettings[noteIndex];

    var currentGain = entry.gainNode.gain.value;
    entry.gainNode.gain.cancelScheduledValues(now);
    entry.gainNode.gain.setValueAtTime(currentGain, now);
    entry.gainNode.gain.linearRampToValueAtTime(0, now + ks.release);

    var stopTime = now + ks.release + 0.1;
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

  function stopAllImmediate() {
    var keys = Object.keys(activeNotes);
    for (var i = 0; i < keys.length; i++) {
      var idx = parseInt(keys[i]);
      var entry = activeNotes[idx];
      try {
        entry.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        entry.gainNode.gain.value = 0;
        entry.oscillator.stop(audioCtx.currentTime);
        entry.oscillator.disconnect();
        entry.gainNode.disconnect();
      } catch (e) {}
      delete activeNotes[idx];
    }
  }

  function selectKey(noteIndex) {
    selectedKey = noteIndex;
  }

  function getSelectedKey() {
    return selectedKey;
  }

  function getKeySettings(noteIndex) {
    if (noteIndex >= 0 && noteIndex < 8) {
      return {
        waveform: keySettings[noteIndex].waveform,
        attack: keySettings[noteIndex].attack,
        decay: keySettings[noteIndex].decay,
        sustain: keySettings[noteIndex].sustain,
        release: keySettings[noteIndex].release
      };
    }
    return null;
  }

  function setKeySettings(noteIndex, params) {
    if (noteIndex < 0 || noteIndex >= 8) return;
    if (params.waveform !== undefined) keySettings[noteIndex].waveform = params.waveform;
    if (params.attack !== undefined) keySettings[noteIndex].attack = params.attack;
    if (params.decay !== undefined) keySettings[noteIndex].decay = params.decay;
    if (params.sustain !== undefined) keySettings[noteIndex].sustain = params.sustain;
    if (params.release !== undefined) keySettings[noteIndex].release = params.release;
  }

  function setAllKeySettings(params) {
    for (var i = 0; i < 8; i++) {
      setKeySettings(i, params);
    }
  }

  function setWaveform(w) {
    if (selectedKey >= 0) {
      keySettings[selectedKey].waveform = w;
    }
  }

  function getWaveform() {
    if (selectedKey >= 0) {
      return keySettings[selectedKey].waveform;
    }
    return keySettings[0].waveform;
  }

  function setADSR(params) {
    if (selectedKey >= 0) {
      setKeySettings(selectedKey, params);
    }
  }

  function getADSR() {
    if (selectedKey >= 0) {
      return getKeySettings(selectedKey);
    }
    return getKeySettings(0);
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

  function getAllKeySettings() {
    var result = [];
    for (var i = 0; i < 8; i++) {
      result.push({
        waveform: keySettings[i].waveform,
        attack: keySettings[i].attack,
        decay: keySettings[i].decay,
        sustain: keySettings[i].sustain,
        release: keySettings[i].release
      });
    }
    return result;
  }

  function restoreAllKeySettings(settings) {
    if (!settings || !Array.isArray(settings)) return;
    for (var i = 0; i < 8 && i < settings.length; i++) {
      var s = settings[i];
      if (s) {
        keySettings[i].waveform = s.waveform || 'sine';
        keySettings[i].attack = typeof s.attack === 'number' ? s.attack : 0.01;
        keySettings[i].decay = typeof s.decay === 'number' ? s.decay : 0.1;
        keySettings[i].sustain = typeof s.sustain === 'number' ? s.sustain : 0.8;
        keySettings[i].release = typeof s.release === 'number' ? s.release : 0.2;
      }
    }
  }

  return {
    init: init,
    noteOn: noteOn,
    noteOff: noteOff,
    stopAll: stopAll,
    stopAllImmediate: stopAllImmediate,
    selectKey: selectKey,
    getSelectedKey: getSelectedKey,
    getKeySettings: getKeySettings,
    setKeySettings: setKeySettings,
    setAllKeySettings: setAllKeySettings,
    setWaveform: setWaveform,
    getWaveform: getWaveform,
    setADSR: setADSR,
    getADSR: getADSR,
    setEffects: setEffects,
    getEffects: getEffects,
    getAnalyser: getAnalyser,
    getAudioContext: getAudioContext,
    getAllKeySettings: getAllKeySettings,
    restoreAllKeySettings: restoreAllKeySettings
  };
})();