var SynthApp = window.SynthApp || {};

SynthApp.Recorder = (function() {
  var recording = false;
  var playing = false;
  var recordedNotes = [];
  var recordingStartTime = 0;
  var playbackTimer = null;
  var playbackNodes = [];
  var playbackStartCtxTime = 0;
  var playbackTotalDuration = 0;
  var playbackProgressTimer = null;
  var onStateChange = null;
  var onProgressUpdate = null;
  var onNoteHighlight = null;

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

  function finalizeHeldNotes(heldNoteIndices) {
    if (!recording) return;
    var now = performance.now() / 1000;
    var endTime = now - recordingStartTime;

    for (var j = 0; j < heldNoteIndices.length; j++) {
      var noteIndex = heldNoteIndices[j];
      for (var i = recordedNotes.length - 1; i >= 0; i--) {
        if (recordedNotes[i].noteIndex === noteIndex && !recordedNotes[i].noteOff) {
          recordedNotes[i].duration = Math.max(0.01, endTime - recordedNotes[i].startTime);
          recordedNotes[i].noteOff = true;
          break;
        }
      }
    }
  }

  function getTotalDuration() {
    var maxEnd = 0;
    for (var i = 0; i < recordedNotes.length; i++) {
      var end = recordedNotes[i].startTime + recordedNotes[i].duration;
      if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
  }

  function playRecording(seekOffset) {
    if (recordedNotes.length === 0) return;
    if (playing) return;

    SynthApp.AudioEngine.init();
    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    playing = true;
    notifyState();

    destroyPlaybackNodes();

    var offset = seekOffset || 0;
    var totalDur = getTotalDuration();
    playbackTotalDuration = totalDur;
    playbackStartCtxTime = audioCtx.currentTime;

    var now = audioCtx.currentTime;

    for (var i = 0; i < recordedNotes.length; i++) {
      var note = recordedNotes[i];
      var noteEnd = note.startTime + note.duration;
      if (noteEnd <= offset) continue;

      var adjustedStart = note.startTime - offset;
      var startTime = now + adjustedStart;
      var endTime = startTime + note.duration;

      scheduleNotePlayback(note.noteIndex, note.frequency, startTime, endTime);
    }

    startProgressTracking();

    if (totalDur > offset) {
      var remaining = (totalDur - offset) * 1000 + 500;
      playbackTimer = setTimeout(function() {
        stopPlayback();
      }, remaining);
    }
  }

  function scheduleNotePlayback(noteIndex, frequency, startTime, endTime) {
    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (!audioCtx) return;

    var ks = SynthApp.AudioEngine.getKeySettings(noteIndex);
    var effects = SynthApp.AudioEngine.getEffects();

    var osc = audioCtx.createOscillator();
    osc.type = ks.waveform;
    osc.frequency.value = frequency;

    var gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1.0, startTime + ks.attack);
    gainNode.gain.linearRampToValueAtTime(ks.sustain, startTime + ks.attack + ks.decay);
    gainNode.gain.setValueAtTime(ks.sustain, endTime);
    gainNode.gain.linearRampToValueAtTime(0, endTime + ks.release);

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
    osc.stop(endTime + ks.release + 0.2);

    playbackNodes.push(osc, gainNode, dryGain, reverbNode, reverbGain, delayNode, delayGain, delayFeedback, noteMaster);
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

  function destroyPlaybackNodes() {
    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (!audioCtx) { playbackNodes = []; return; }

    var now = audioCtx.currentTime;
    for (var i = 0; i < playbackNodes.length; i++) {
      try {
        var node = playbackNodes[i];
        if (node && node.stop && node.type === 'oscillator') {
          node.stop(now);
        }
        if (node && node.disconnect) {
          node.disconnect();
        }
      } catch (e) {}
    }
    playbackNodes = [];
  }

  function startProgressTracking() {
    stopProgressTracking();
    playbackProgressTimer = setInterval(function() {
      updateProgress();
    }, 50);
  }

  function stopProgressTracking() {
    if (playbackProgressTimer) {
      clearInterval(playbackProgressTimer);
      playbackProgressTimer = null;
    }
    highlightPlaybackNote(-1);
  }

  function updateProgress() {
    if (!playing) {
      stopProgressTracking();
      return;
    }

    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (!audioCtx) return;

    var elapsed = audioCtx.currentTime - playbackStartCtxTime;
    var total = playbackTotalDuration;

    if (onProgressUpdate) {
      onProgressUpdate({
        elapsed: elapsed,
        total: total,
        progress: total > 0 ? Math.min(1, elapsed / total) : 0
      });
    }

    var currentNote = findCurrentNote(elapsed);
    if (onNoteHighlight) {
      onNoteHighlight(currentNote);
    }

    if (elapsed >= total + 0.5) {
      stopPlayback();
    }
  }

  function findCurrentNote(elapsed) {
    for (var i = 0; i < recordedNotes.length; i++) {
      var n = recordedNotes[i];
      if (elapsed >= n.startTime && elapsed < n.startTime + n.duration) {
        return n.noteIndex;
      }
    }
    return -1;
  }

  function seekPlayback(seekTime) {
    if (!playing) {
      playRecording(seekTime);
      return;
    }
    stopPlayback();
    setTimeout(function() {
      playRecording(seekTime);
    }, 50);
  }

  function stopPlayback() {
    playing = false;
    if (playbackTimer) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }
    stopProgressTracking();
    destroyPlaybackNodes();
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

  function updateNote(index, params) {
    if (index < 0 || index >= recordedNotes.length) return;
    if (params.startTime !== undefined) recordedNotes[index].startTime = params.startTime;
    if (params.duration !== undefined) recordedNotes[index].duration = params.duration;
    if (params.noteIndex !== undefined) {
      recordedNotes[index].noteIndex = params.noteIndex;
      recordedNotes[index].frequency = SynthApp.NOTE_FREQUENCIES[params.noteIndex];
    }
    notifyState();
  }

  function deleteNote(index) {
    if (index < 0 || index >= recordedNotes.length) return;
    recordedNotes.splice(index, 1);
    notifyState();
  }

  function exportJSON() {
    var keySettings = SynthApp.AudioEngine.getAllKeySettings();
    var data = {
      version: '2.0',
      createdAt: new Date().toISOString(),
      keySettings: keySettings,
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

  function validateImportData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.notes)) return false;
    if (data.notes.length === 0) return false;

    for (var i = 0; i < data.notes.length; i++) {
      var n = data.notes[i];
      if (typeof n.noteIndex !== 'number' || n.noteIndex < 0 || n.noteIndex > 7) return false;
      if (typeof n.frequency !== 'number' || n.frequency <= 0) return false;
      if (typeof n.startTime !== 'number' || n.startTime < 0) return false;
      if (typeof n.duration !== 'number' || n.duration <= 0) return false;
    }
    return true;
  }

  function validateKeySettings(settings) {
    if (!settings || !Array.isArray(settings)) return false;
    for (var i = 0; i < settings.length; i++) {
      var s = settings[i];
      if (!s || typeof s.waveform !== 'string') return false;
      if (typeof s.attack !== 'number') return false;
      if (typeof s.decay !== 'number') return false;
      if (typeof s.sustain !== 'number') return false;
      if (typeof s.release !== 'number') return false;
    }
    return true;
  }

  function importJSON(file, importTimbre) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!validateImportData(data)) {
          console.warn('导入失败：JSON 文件格式不正确或内容无效，原有录音保持不变');
          return;
        }

        var parsedNotes = data.notes.map(function(n) {
          return {
            noteIndex: n.noteIndex,
            frequency: n.frequency,
            startTime: n.startTime,
            duration: n.duration,
            noteOff: true
          };
        });

        stopPlayback();
        recordedNotes = parsedNotes;

        if (importTimbre && data.keySettings && validateKeySettings(data.keySettings)) {
          SynthApp.AudioEngine.restoreAllKeySettings(data.keySettings);
        }

        notifyState();
      } catch (err) {
        console.warn('导入失败：JSON 解析错误，原有录音保持不变');
      }
    };
    reader.onerror = function() {
      console.warn('导入失败：无法读取文件，原有录音保持不变');
    };
    reader.readAsText(file);
  }

  function setOnStateChange(callback) {
    onStateChange = callback;
  }

  function setOnProgressUpdate(callback) {
    onProgressUpdate = callback;
  }

  function setOnNoteHighlight(callback) {
    onNoteHighlight = callback;
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
    finalizeHeldNotes: finalizeHeldNotes,
    playRecording: playRecording,
    seekPlayback: seekPlayback,
    stopPlayback: stopPlayback,
    clearRecording: clearRecording,
    isRecording: isRecording,
    isPlaying: isPlaying,
    getRecordedNotes: getRecordedNotes,
    getTotalDuration: getTotalDuration,
    updateNote: updateNote,
    deleteNote: deleteNote,
    exportJSON: exportJSON,
    importJSON: importJSON,
    setOnStateChange: setOnStateChange,
    setOnProgressUpdate: setOnProgressUpdate,
    setOnNoteHighlight: setOnNoteHighlight
  };
})();