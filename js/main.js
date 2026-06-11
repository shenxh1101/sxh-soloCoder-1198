var SynthApp = window.SynthApp || {};

(function() {
  var audioEngine = SynthApp.AudioEngine;
  var recorder = SynthApp.Recorder;
  var oscilloscope = SynthApp.Oscilloscope;

  var pressedKeys = {};

  function init() {
    oscilloscope.init('oscilloscope');

    bindKeys();
    bindWaveformButtons();
    bindADSR();
    bindEffects();
    bindPresets();
    bindRecorder();
    bindFile();

    recorder.setOnStateChange(updateRecorderUI);
  }

  function bindKeys() {
    var keyButtons = document.querySelectorAll('.key-btn');

    keyButtons.forEach(function(btn) {
      btn.addEventListener('mousedown', function(e) {
        e.preventDefault();
        var noteIndex = parseInt(btn.getAttribute('data-note'));
        selectKey(noteIndex);
        pressKey(noteIndex);
      });

      btn.addEventListener('mouseup', function(e) {
        e.preventDefault();
        var noteIndex = parseInt(btn.getAttribute('data-note'));
        releaseKey(noteIndex);
      });

      btn.addEventListener('mouseleave', function() {
        var noteIndex = parseInt(btn.getAttribute('data-note'));
        if (pressedKeys[noteIndex]) {
          releaseKey(noteIndex);
        }
      });

      btn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        var noteIndex = parseInt(btn.getAttribute('data-note'));
        selectKey(noteIndex);
        pressKey(noteIndex);
      });

      btn.addEventListener('touchend', function(e) {
        e.preventDefault();
        var noteIndex = parseInt(btn.getAttribute('data-note'));
        releaseKey(noteIndex);
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.repeat) return;
      var key = e.key;
      var noteIndex = keyToNoteIndex(key);
      if (noteIndex !== -1 && !pressedKeys[noteIndex]) {
        selectKey(noteIndex);
        pressKey(noteIndex);
      }
    });

    document.addEventListener('keyup', function(e) {
      var key = e.key;
      var noteIndex = keyToNoteIndex(key);
      if (noteIndex !== -1) {
        releaseKey(noteIndex);
      }
    });
  }

  function keyToNoteIndex(key) {
    var map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7 };
    return map[key] !== undefined ? map[key] : -1;
  }

  function selectKey(noteIndex) {
    audioEngine.selectKey(noteIndex);

    var allKeys = document.querySelectorAll('.key-btn');
    allKeys.forEach(function(k) { k.classList.remove('selected'); });

    var btn = document.querySelector('.key-btn[data-note="' + noteIndex + '"]');
    if (btn) btn.classList.add('selected');

    refreshUIForKey(noteIndex);
  }

  function refreshUIForKey(noteIndex) {
    var ks = audioEngine.getKeySettings(noteIndex);
    if (!ks) return;

    document.getElementById('attack').value = Math.round(ks.attack * 100);
    document.getElementById('decay').value = Math.round(ks.decay * 100);
    document.getElementById('sustain').value = Math.round(ks.sustain * 100);
    document.getElementById('release').value = Math.round(ks.release * 100);

    document.getElementById('attackVal').textContent = ks.attack.toFixed(2) + 's';
    document.getElementById('decayVal').textContent = ks.decay.toFixed(2) + 's';
    document.getElementById('sustainVal').textContent = ks.sustain.toFixed(2);
    document.getElementById('releaseVal').textContent = ks.release.toFixed(2) + 's';

    var waveButtons = document.querySelectorAll('.wave-btn');
    waveButtons.forEach(function(b) {
      b.classList.remove('active');
      if (b.getAttribute('data-wave') === ks.waveform) {
        b.classList.add('active');
      }
    });
  }

  function pressKey(noteIndex) {
    if (pressedKeys[noteIndex]) return;

    pressedKeys[noteIndex] = true;

    var btn = document.querySelector('.key-btn[data-note="' + noteIndex + '"]');
    if (btn) btn.classList.add('active');

    audioEngine.noteOn(noteIndex);

    if (recorder.isRecording()) {
      recorder.recordNoteOn(noteIndex);
    }
  }

  function releaseKey(noteIndex) {
    if (!pressedKeys[noteIndex]) return;

    pressedKeys[noteIndex] = false;

    var btn = document.querySelector('.key-btn[data-note="' + noteIndex + '"]');
    if (btn) btn.classList.remove('active');

    audioEngine.noteOff(noteIndex);

    if (recorder.isRecording()) {
      recorder.recordNoteOff(noteIndex);
    }
  }

  function getHeldNoteIndices() {
    var held = [];
    for (var i = 0; i < 8; i++) {
      if (pressedKeys[i]) {
        held.push(i);
      }
    }
    return held;
  }

  function releaseAllKeys() {
    for (var i = 0; i < 8; i++) {
      if (pressedKeys[i]) {
        releaseKey(i);
      }
    }
  }

  function bindWaveformButtons() {
    var buttons = document.querySelectorAll('.wave-btn');
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        buttons.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var wave = btn.getAttribute('data-wave');
        audioEngine.setWaveform(wave);
      });
    });
  }

  function bindADSR() {
    var attackSlider = document.getElementById('attack');
    var decaySlider = document.getElementById('decay');
    var sustainSlider = document.getElementById('sustain');
    var releaseSlider = document.getElementById('release');

    function updateADSR() {
      var params = {
        attack: parseInt(attackSlider.value) / 100,
        decay: parseInt(decaySlider.value) / 100,
        sustain: parseInt(sustainSlider.value) / 100,
        release: parseInt(releaseSlider.value) / 100
      };
      audioEngine.setADSR(params);

      document.getElementById('attackVal').textContent = params.attack.toFixed(2) + 's';
      document.getElementById('decayVal').textContent = params.decay.toFixed(2) + 's';
      document.getElementById('sustainVal').textContent = params.sustain.toFixed(2);
      document.getElementById('releaseVal').textContent = params.release.toFixed(2) + 's';
    }

    attackSlider.addEventListener('input', updateADSR);
    decaySlider.addEventListener('input', updateADSR);
    sustainSlider.addEventListener('input', updateADSR);
    releaseSlider.addEventListener('input', updateADSR);
  }

  function bindEffects() {
    var reverbSlider = document.getElementById('reverbMix');
    var delayMixSlider = document.getElementById('delayMix');
    var delayTimeSlider = document.getElementById('delayTime');

    function updateEffects() {
      var params = {
        reverbMix: parseInt(reverbSlider.value) / 100,
        delayMix: parseInt(delayMixSlider.value) / 100,
        delayTime: parseInt(delayTimeSlider.value) / 100
      };
      audioEngine.setEffects(params);

      document.getElementById('reverbMixVal').textContent = Math.round(params.reverbMix * 100) + '%';
      document.getElementById('delayMixVal').textContent = Math.round(params.delayMix * 100) + '%';
      document.getElementById('delayTimeVal').textContent = params.delayTime.toFixed(2) + 's';
    }

    reverbSlider.addEventListener('input', updateEffects);
    delayMixSlider.addEventListener('input', updateEffects);
    delayTimeSlider.addEventListener('input', updateEffects);
  }

  function bindPresets() {
    var buttons = document.querySelectorAll('.preset-btn');
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var presetName = btn.getAttribute('data-preset');
        var preset = SynthApp.Presets[presetName];
        if (!preset) return;

        audioEngine.setAllKeySettings({
          waveform: preset.waveform,
          attack: preset.attack,
          decay: preset.decay,
          sustain: preset.sustain,
          release: preset.release
        });

        var selKey = audioEngine.getSelectedKey();
        if (selKey >= 0) {
          refreshUIForKey(selKey);
        }
      });
    });
  }

  function bindRecorder() {
    document.getElementById('recordBtn').addEventListener('click', function() {
      if (recorder.isRecording()) {
        var heldKeys = getHeldNoteIndices();
        if (heldKeys.length > 0) {
          recorder.finalizeHeldNotes(heldKeys);
        }
        releaseAllKeys();
        recorder.stopRecording();
      } else {
        if (recorder.isPlaying()) {
          recorder.stopPlayback();
        }
        recorder.startRecording();
      }
    });

    document.getElementById('stopBtn').addEventListener('click', function() {
      if (recorder.isRecording()) {
        var heldKeys = getHeldNoteIndices();
        if (heldKeys.length > 0) {
          recorder.finalizeHeldNotes(heldKeys);
        }
        releaseAllKeys();
        recorder.stopRecording();
      }
      if (recorder.isPlaying()) {
        recorder.stopPlayback();
      }
    });

    document.getElementById('playBtn').addEventListener('click', function() {
      if (recorder.isPlaying()) {
        recorder.stopPlayback();
      } else {
        if (recorder.isRecording()) {
          var heldKeys = getHeldNoteIndices();
          if (heldKeys.length > 0) {
            recorder.finalizeHeldNotes(heldKeys);
          }
          releaseAllKeys();
          recorder.stopRecording();
        }
        recorder.playRecording();
      }
    });

    document.getElementById('clearBtn').addEventListener('click', function() {
      recorder.clearRecording();
    });
  }

  function bindFile() {
    document.getElementById('exportBtn').addEventListener('click', function() {
      recorder.exportJSON();
    });

    document.getElementById('importBtn').addEventListener('click', function() {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', function(e) {
      if (e.target.files.length > 0) {
        recorder.importJSON(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  function updateRecorderUI(state) {
    var recordBtn = document.getElementById('recordBtn');
    var stopBtn = document.getElementById('stopBtn');
    var playBtn = document.getElementById('playBtn');
    var indicator = document.getElementById('recIndicator');
    var statusText = document.getElementById('recStatus');

    recordBtn.classList.remove('recording');
    playBtn.classList.remove('playing');
    indicator.classList.remove('recording', 'playing');

    if (state.recording) {
      recordBtn.classList.add('recording');
      indicator.classList.add('recording');
      statusText.textContent = '录制中...';
      stopBtn.disabled = false;
    } else if (state.playing) {
      playBtn.classList.add('playing');
      indicator.classList.add('playing');
      statusText.textContent = '回放中...';
      stopBtn.disabled = false;
    } else {
      statusText.textContent = state.hasNotes ? '已录制 ' + recorder.getRecordedNotes().length + ' 个音符' : '就绪';
      stopBtn.disabled = true;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();