var SynthApp = window.SynthApp || {};

SynthApp.Recorder = (function() {
  var recording = false;
  var playing = false;
  var segments = [{ id: 0, name: '片段 1', notes: [] }];
  var activeSegmentIndex = 0;
  var isLooping = false;
  var recordingStartTime = 0;
  var playbackTimer = null;
  var playbackNodes = [];
  var playbackStartCtxTime = 0;
  var playbackTotalDuration = 0;
  var playbackSeekOffset = 0;
  var playbackProgressTimer = null;
  var onStateChange = null;
  var onProgressUpdate = null;
  var onNoteHighlight = null;
  var quantizeBackup = null;
  var nextSegmentId = 1;

  function getActiveNotes() {
    return segments[activeSegmentIndex].notes;
  }

  function startRecording() {
    getActiveNotes().length = 0;
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

    getActiveNotes().push({
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
    var notes = getActiveNotes();

    for (var i = notes.length - 1; i >= 0; i--) {
      if (notes[i].noteIndex === noteIndex && !notes[i].noteOff) {
        notes[i].duration = endTime - notes[i].startTime;
        notes[i].noteOff = true;
        break;
      }
    }
  }

  function finalizeHeldNotes(heldNoteIndices) {
    if (!recording) return;
    var now = performance.now() / 1000;
    var endTime = now - recordingStartTime;
    var notes = getActiveNotes();

    for (var j = 0; j < heldNoteIndices.length; j++) {
      var noteIndex = heldNoteIndices[j];
      for (var i = notes.length - 1; i >= 0; i--) {
        if (notes[i].noteIndex === noteIndex && !notes[i].noteOff) {
          notes[i].duration = Math.max(0.01, endTime - notes[i].startTime);
          notes[i].noteOff = true;
          break;
        }
      }
    }
  }

  function getTotalDuration() {
    var maxEnd = 0;
    var notes = getActiveNotes();
    for (var i = 0; i < notes.length; i++) {
      var end = notes[i].startTime + notes[i].duration;
      if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
  }

  function playRecording(seekOffset) {
    var notes = getActiveNotes();
    if (notes.length === 0) return;
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
    playbackSeekOffset = offset;
    playbackStartCtxTime = audioCtx.currentTime;

    var now = audioCtx.currentTime;

    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
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
        if (isLooping && playing) {
          loopRestart();
        } else {
          stopPlayback();
        }
      }, remaining);
    }
  }

  function loopRestart() {
    destroyPlaybackNodes();
    stopProgressTracking();

    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (!audioCtx) return;
    var totalDur = getTotalDuration();
    playbackTotalDuration = totalDur;
    playbackSeekOffset = 0;
    playbackStartCtxTime = audioCtx.currentTime;

    var now = audioCtx.currentTime;
    var notes = getActiveNotes();

    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      var startTime = now + note.startTime;
      var endTime = startTime + note.duration;
      scheduleNotePlayback(note.noteIndex, note.frequency, startTime, endTime);
    }

    startProgressTracking();

    playbackTimer = setTimeout(function() {
      if (isLooping && playing) {
        loopRestart();
      } else {
        stopPlayback();
      }
    }, totalDur * 1000 + 500);
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

    var elapsed = playbackSeekOffset + (audioCtx.currentTime - playbackStartCtxTime);
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
      if (isLooping && playing) {
        loopRestart();
      } else {
        stopPlayback();
      }
    }
  }

  function findCurrentNote(elapsed) {
    var notes = getActiveNotes();
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
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
    getActiveNotes().length = 0;
    recording = false;
    notifyState();
  }

  function isRecording() {
    return recording;
  }

  function isPlaying() {
    return playing;
  }

  function isLoopingActive() {
    return isLooping;
  }

  function toggleLoop() {
    isLooping = !isLooping;
    return isLooping;
  }

  function getRecordedNotes() {
    return getActiveNotes();
  }

  function updateNote(index, params) {
    var notes = getActiveNotes();
    if (index < 0 || index >= notes.length) return;
    if (params.startTime !== undefined) notes[index].startTime = params.startTime;
    if (params.duration !== undefined) notes[index].duration = params.duration;
    if (params.noteIndex !== undefined) {
      notes[index].noteIndex = params.noteIndex;
      notes[index].frequency = SynthApp.NOTE_FREQUENCIES[params.noteIndex];
    }
    notifyState();
  }

  function deleteNote(index) {
    var notes = getActiveNotes();
    if (index < 0 || index >= notes.length) return;
    notes.splice(index, 1);
    notifyState();
  }

  function quantizeNotes(bpm, gridDivision) {
    var notes = getActiveNotes();
    if (notes.length === 0) return;

    quantizeBackup = notes.map(function(n) {
      return {
        noteIndex: n.noteIndex,
        frequency: n.frequency,
        startTime: n.startTime,
        duration: n.duration,
        noteOff: n.noteOff
      };
    });

    var beatDuration = 60 / bpm;
    var gridSize = beatDuration / gridDivision;

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      n.startTime = Math.round(n.startTime / gridSize) * gridSize;
      n.duration = Math.max(gridSize, Math.round(n.duration / gridSize) * gridSize);
    }

    notifyState();
  }

  function undoQuantize() {
    if (!quantizeBackup) return;
    var notes = getActiveNotes();
    notes.length = 0;
    for (var i = 0; i < quantizeBackup.length; i++) {
      notes.push(quantizeBackup[i]);
    }
    quantizeBackup = null;
    notifyState();
  }

  function hasQuantizeUndo() {
    return quantizeBackup !== null;
  }

  function getSegments() {
    return segments;
  }

  function getActiveSegmentIndex() {
    return activeSegmentIndex;
  }

  function setActiveSegment(index) {
    if (index >= 0 && index < segments.length) {
      activeSegmentIndex = index;
      notifyState();
    }
  }

  function addSegment() {
    var name = '片段 ' + (segments.length + 1);
    segments.push({ id: nextSegmentId, name: name, notes: [] });
    nextSegmentId++;
    activeSegmentIndex = segments.length - 1;
    notifyState();
  }

  function copySegment(index) {
    if (index < 0 || index >= segments.length) return;
    var src = segments[index];
    var newSeg = {
      id: nextSegmentId,
      name: src.name + ' (副本)',
      notes: src.notes.map(function(n) {
        return {
          noteIndex: n.noteIndex,
          frequency: n.frequency,
          startTime: n.startTime,
          duration: n.duration,
          noteOff: n.noteOff
        };
      })
    };
    nextSegmentId++;
    segments.splice(index + 1, 0, newSeg);
    activeSegmentIndex = index + 1;
    notifyState();
  }

  function deleteSegment(index) {
    if (segments.length <= 1) return;
    if (index < 0 || index >= segments.length) return;
    segments.splice(index, 1);
    if (activeSegmentIndex >= segments.length) {
      activeSegmentIndex = segments.length - 1;
    }
    notifyState();
  }

  function exportJSON() {
    var keySettings = SynthApp.AudioEngine.getAllKeySettings();
    var data = {
      version: '3.0',
      createdAt: new Date().toISOString(),
      keySettings: keySettings,
      segments: segments.map(function(seg) {
        return {
          name: seg.name,
          notes: seg.notes.map(function(n) {
            return {
              noteIndex: n.noteIndex,
              frequency: n.frequency,
              startTime: n.startTime,
              duration: n.duration
            };
          })
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

    if (data.segments && Array.isArray(data.segments)) {
      if (data.segments.length === 0) return false;
      for (var s = 0; s < data.segments.length; s++) {
        var seg = data.segments[s];
        if (!Array.isArray(seg.notes)) return false;
        for (var i = 0; i < seg.notes.length; i++) {
          var n = seg.notes[i];
          if (typeof n.noteIndex !== 'number' || n.noteIndex < 0 || n.noteIndex > 7) return false;
          if (typeof n.frequency !== 'number' || n.frequency <= 0) return false;
          if (typeof n.startTime !== 'number' || n.startTime < 0) return false;
          if (typeof n.duration !== 'number' || n.duration <= 0) return false;
        }
      }
      return true;
    }

    if (Array.isArray(data.notes)) {
      if (data.notes.length === 0) return false;
      for (var j = 0; j < data.notes.length; j++) {
        var note = data.notes[j];
        if (typeof note.noteIndex !== 'number' || note.noteIndex < 0 || note.noteIndex > 7) return false;
        if (typeof note.frequency !== 'number' || note.frequency <= 0) return false;
        if (typeof note.startTime !== 'number' || note.startTime < 0) return false;
        if (typeof note.duration !== 'number' || note.duration <= 0) return false;
      }
      return true;
    }

    return false;
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

  function importJSON(file, importTimbre, onComplete) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!validateImportData(data)) {
          console.warn('导入失败：JSON 文件格式不正确或内容无效，原有录音保持不变');
          if (onComplete) onComplete();
          return;
        }

        stopPlayback();

        if (data.segments && Array.isArray(data.segments)) {
          segments = data.segments.map(function(seg, idx) {
            return {
              id: idx,
              name: seg.name || ('片段 ' + (idx + 1)),
              notes: seg.notes.map(function(n) {
                return {
                  noteIndex: n.noteIndex,
                  frequency: n.frequency,
                  startTime: n.startTime,
                  duration: n.duration,
                  noteOff: true
                };
              })
            };
          });
          nextSegmentId = segments.length;
          activeSegmentIndex = 0;
        } else if (data.notes && Array.isArray(data.notes)) {
          segments = [{
            id: 0,
            name: '片段 1',
            notes: data.notes.map(function(n) {
              return {
                noteIndex: n.noteIndex,
                frequency: n.frequency,
                startTime: n.startTime,
                duration: n.duration,
                noteOff: true
              };
            })
          }];
          nextSegmentId = 1;
          activeSegmentIndex = 0;
        }

        if (importTimbre && data.keySettings && validateKeySettings(data.keySettings)) {
          SynthApp.AudioEngine.restoreAllKeySettings(data.keySettings);
        }

        notifyState();
        if (onComplete) onComplete();
      } catch (err) {
        console.warn('导入失败：JSON 解析错误，原有录音保持不变');
        if (onComplete) onComplete();
      }
    };
    reader.onerror = function() {
      console.warn('导入失败：无法读取文件，原有录音保持不变');
      if (onComplete) onComplete();
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
        hasNotes: getActiveNotes().length > 0,
        segmentCount: segments.length,
        activeSegment: activeSegmentIndex
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
    isLoopingActive: isLoopingActive,
    toggleLoop: toggleLoop,
    getRecordedNotes: getRecordedNotes,
    getTotalDuration: getTotalDuration,
    updateNote: updateNote,
    deleteNote: deleteNote,
    quantizeNotes: quantizeNotes,
    undoQuantize: undoQuantize,
    hasQuantizeUndo: hasQuantizeUndo,
    getSegments: getSegments,
    getActiveSegmentIndex: getActiveSegmentIndex,
    setActiveSegment: setActiveSegment,
    addSegment: addSegment,
    copySegment: copySegment,
    deleteSegment: deleteSegment,
    exportJSON: exportJSON,
    importJSON: importJSON,
    setOnStateChange: setOnStateChange,
    setOnProgressUpdate: setOnProgressUpdate,
    setOnNoteHighlight: setOnNoteHighlight
  };
})();