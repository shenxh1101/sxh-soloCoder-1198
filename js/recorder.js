var SynthApp = window.SynthApp || {};

SynthApp.Recorder = (function() {
  var recording = false;
  var playing = false;
  var recordedNotes = [];
  var recordingStartTime = 0;
  var playbackTimer = null;
  var playbackStartTime = 0;
  var scheduledNotes = [];
  var onStateChange = null;

  function startRecording() {
    recordedNotes = [];
    recordingStartTime = performance.now() / 1000;
    recording = true;
    notifyState();
  }

  function stopRecording() {
    recording = false;
    notifyState();
  }

  function recordNoteOn(noteIndex) {
    if (!recording) return;
    var now = performance.now() / 1000;
    var startTime = now - recordingStartTime;

    recordedNotes.push({
      noteIndex: noteIndex,
      frequency: SynthApp.NOTE_FREQUENCIES[noteIndex],
      startTime: startTime,
      duration: 0,
      noteOff: false
    });
  }

  function recordNoteOff(noteIndex) {
    if (!recording) return;
    var now = performance.now() / 1000;
    var endTime = now - recordingStartTime;

    for (var i = recordedNotes.length - 1; i >= 0; i--) {
      if (recordedNotes[i].noteIndex === noteIndex && !recordedNotes[i].noteOff) {
        recordedNotes[i].duration = endTime - recordedNotes[i].startTime;
        recordedNotes[i].noteOff = true;
        break;
      }
    }
  }

  function playRecording() {
    if (recordedNotes.length === 0) return;
    if (playing) return;

    SynthApp.AudioEngine.init();
    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    playing = true;
    notifyState();

    var now = audioCtx.currentTime;

    scheduledNotes = [];
    for (var i = 0; i < recordedNotes.length; i++) {
      var note = recordedNotes[i];
      var startTime = now + note.startTime;
      var endTime = startTime + note.duration;

      scheduledNotes.push({
        noteIndex: note.noteIndex,
        frequency: note.frequency,
        startTime: startTime,
        endTime: endTime
      });

      scheduleNotePlayback(note.noteIndex, note.frequency, startTime, endTime);
    }

    if (scheduledNotes.length > 0) {
      var lastNote = scheduledNotes[scheduledNotes.length - 1];
      var totalDuration = (lastNote.endTime - now) * 1000 + 500;

      playbackTimer = setTimeout(function() {
        stopPlayback();
      }, totalDuration);
    }
  }

  function scheduleNotePlayback(noteIndex, frequency, startTime, endTime) {
    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (!audioCtx) return;

    var adsr = SynthApp.AudioEngine.getADSR();
    var waveform = SynthApp.AudioEngine.getWaveform();
    var effects = SynthApp.AudioEngine.getEffects();

    var osc = audioCtx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = frequency;

    var gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1.0, startTime + adsr.attack);
    gainNode.gain.linearRampToValueAtTime(adsr.sustain, startTime + adsr.attack + adsr.decay);
    gainNode.gain.setValueAtTime(adsr.sustain, endTime);
    gainNode.gain.linearRampToValueAtTime(0, endTime + adsr.release);

    var dryGain = audioCtx.createGain();
    dryGain.gain.value = Math.max(0, 1.0 - effects.reverbMix - effects.delayMix);

    var reverbNode = audioCtx.createConvolver();
    reverbNode.buffer = createPlaybackReverb(audioCtx);

    var reverbGain = audioCtx.createGain();
    reverbGain.gain.value = effects.reverbMix;

    var delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = effects.delayTime;

    var delayGain = audioCtx.createGain();
    delayGain.gain.value = effects.delayMix;

    var delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.35;

    var noteMaster = audioCtx.createGain();
    noteMaster.gain.value = 0.4;

    osc.connect(gainNode);
    gainNode.connect(dryGain);
    gainNode.connect(reverbNode);
    gainNode.connect(delayNode);

    dryGain.connect(noteMaster);

    reverbNode.connect(reverbGain);
    reverbGain.connect(noteMaster);

    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayGain);
    delayGain.connect(noteMaster);

    noteMaster.connect(audioCtx.destination);

    osc.start(startTime);
    osc.stop(endTime + adsr.release + 0.2);
  }

  function createPlaybackReverb(ctx) {
    var sampleRate = ctx.sampleRate;
    var length = Math.floor(sampleRate * 2.5);
    var buffer = ctx.createBuffer(2, length, sampleRate);
    for (var channel = 0; channel < 2; channel++) {
      var data = buffer.getChannelData(channel);
      for (var i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
      }
    }
    return buffer;
  }

  function stopPlayback() {
    playing = false;
    if (playbackTimer) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }
    notifyState();
  }

  function clearRecording() {
    stopPlayback();
    recordedNotes = [];
    recording = false;
    notifyState();
  }

  function isRecording() {
    return recording;
  }

  function isPlaying() {
    return playing;
  }

  function getRecordedNotes() {
    return recordedNotes;
  }

  function exportJSON() {
    var data = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      notes: recordedNotes.map(function(n) {
        return {
          noteIndex: n.noteIndex,
          frequency: n.frequency,
          startTime: n.startTime,
          duration: n.duration
        };
      })
    };

    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = 'synth-recording-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data.notes && Array.isArray(data.notes)) {
          recordedNotes = data.notes.map(function(n) {
            return {
              noteIndex: n.noteIndex,
              frequency: n.frequency,
              startTime: n.startTime,
              duration: n.duration,
              noteOff: true
            };
          });
          stopPlayback();
          notifyState();
        }
      } catch (err) {
        console.error('Failed to parse JSON:', err);
      }
    };
    reader.readAsText(file);
  }

  function setOnStateChange(callback) {
    onStateChange = callback;
  }

  function notifyState() {
    if (onStateChange) {
      onStateChange({
        recording: recording,
        playing: playing,
        hasNotes: recordedNotes.length > 0
      });
    }
  }

  return {
    startRecording: startRecording,
    stopRecording: stopRecording,
    recordNoteOn: recordNoteOn,
    recordNoteOff: recordNoteOff,
    playRecording: playRecording,
    stopPlayback: stopPlayback,
    clearRecording: clearRecording,
    isRecording: isRecording,
    isPlaying: isPlaying,
    getRecordedNotes: getRecordedNotes,
    exportJSON: exportJSON,
    importJSON: importJSON,
    setOnStateChange: setOnStateChange
  };
})();