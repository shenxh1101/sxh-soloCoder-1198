var SynthApp = window.SynthApp || {};

SynthApp.Recorder = (function() {
  var recording = false;
  var playing = false;
  var segments = [{ id: 0, name: '片段 1', notes: [], repeatCount: 1 }];
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
  var quantizeBackups = {};
  var nextSegmentId = 1;
  var bpm = 120;
  var timeSignatureNum = 4;
  var timeSignatureDen = 4;
  var metronomeEnabled = false;
  var countInEnabled = false;
  var metronomeNodes = [];
  var metronomeTimer = null;
  var countInTimer = null;
  var isCountingIn = false;
  var isPlayingAll = false;
  var playbackAllSegIdx = 0;
  var playbackAllRep = 0;

  function getActiveNotes() {
    return segments[activeSegmentIndex].notes;
  }

  function getBeatDuration() {
    return 60 / bpm;
  }

  function startRecording() {
    if (countInEnabled && !isCountingIn) {
      startCountIn();
      return;
    }
    getActiveNotes().length = 0;
    recordingStartTime = performance.now() / 1000;
    recording = true;
    isCountingIn = false;
    startMetronome();
    notifyState();
  }

  function startCountIn() {
    isCountingIn = true;
    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (!audioCtx) {
      SynthApp.AudioEngine.init();
      audioCtx = SynthApp.AudioEngine.getAudioContext();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    notifyState();

    var beatDur = getBeatDuration();
    var countInBeats = timeSignatureNum;
    var now = audioCtx.currentTime;

    for (var i = 0; i < countInBeats; i++) {
      if (i === 0) {
        playMetronomeTickHigh(now + i * beatDur);
      } else {
        playMetronomeTick(now + i * beatDur);
      }
    }

    countInTimer = setTimeout(function() {
      isCountingIn = false;
      startRecording();
    }, countInBeats * beatDur * 1000);
  }

  function stopRecording() {
    recording = false;
    isCountingIn = false;
    if (countInTimer) { clearTimeout(countInTimer); countInTimer = null; }
    stopMetronome();
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

  function getAllSegmentsDuration() {
    var total = 0;
    for (var s = 0; s < segments.length; s++) {
      var dur = getSegmentDuration(segments[s]);
      total += dur * (segments[s].repeatCount || 1);
    }
    return total;
  }

  function getSegmentDuration(seg) {
    var maxEnd = 0;
    for (var i = 0; i < seg.notes.length; i++) {
      var end = seg.notes[i].startTime + seg.notes[i].duration;
      if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
  }

  function getBeatPosition(elapsed) {
    var beatDur = getBeatDuration();
    if (beatDur <= 0) return { measure: 1, beat: 1 };
    var totalBeats = elapsed / beatDur;
    var measure = Math.floor(totalBeats / timeSignatureNum) + 1;
    var beat = Math.floor(totalBeats % timeSignatureNum) + 1;
    return { measure: measure, beat: beat };
  }

  function playRecording(seekOffset) {
    var notes = getActiveNotes();
    if (notes.length === 0) return;
    if (playing) return;

    SynthApp.AudioEngine.init();
    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    playing = true;
    isPlayingAll = false;
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

  function playAllSegments(seekOffset) {
    if (playing) return;

    SynthApp.AudioEngine.init();
    var audioCtx = SynthApp.AudioEngine.getAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    playing = true;
    isPlayingAll = true;
    playbackAllSegIdx = 0;
    playbackAllRep = 0;
    notifyState();

    destroyPlaybackNodes();

    var offset = seekOffset || 0;
    var totalDur = getAllSegmentsDuration();
    playbackTotalDuration = totalDur;
    playbackSeekOffset = offset;
    playbackStartCtxTime = audioCtx.currentTime;

    var now = audioCtx.currentTime;
    var cumulativeTime = 0;

    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      var segDur = getSegmentDuration(seg);
      var rep = seg.repeatCount || 1;

      for (var r = 0; r < rep; r++) {
        for (var i = 0; i < seg.notes.length; i++) {
          var note = seg.notes[i];
          var absStart = cumulativeTime + note.startTime;
          var absEnd = absStart + note.duration;
          if (absEnd <= offset) continue;

          var adjustedStart = absStart - offset;
          var startTime = now + adjustedStart;
          var endTime = startTime + note.duration;

          scheduleNotePlayback(note.noteIndex, note.frequency, startTime, endTime);
        }
        cumulativeTime += segDur;
      }
    }

    startProgressTracking();

    if (totalDur > offset) {
      var remaining = (totalDur - offset) * 1000 + 500;
      playbackTimer = setTimeout(function() {
        stopPlayback();
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

    var bp = getBeatPosition(elapsed);

    if (onProgressUpdate) {
      onProgressUpdate({
        elapsed: elapsed,
        total: total,
        progress: total > 0 ? Math.min(1, elapsed / total) : 0,
        beatPosition: bp
      });
    }

    var currentNote = findCurrentNote(elapsed);
    if (onNoteHighlight) {
      onNoteHighlight(currentNote);
    }

    if (elapsed >= total + 0.5) {
      if (isLooping && playing && !isPlayingAll) {
        loopRestart();
      } else {
        stopPlayback();
      }
    }
  }

  function findCurrentNote(elapsed) {
    var notes = isPlayingAll ? getAllPlaybackNotesForSeek(elapsed) : getActiveNotes();
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (elapsed >= n.startTime && elapsed < n.startTime + n.duration) {
        return n.noteIndex;
      }
    }
    return -1;
  }

  function getAllPlaybackNotesForSeek(elapsed) {
    var result = [];
    var cumulative = 0;
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      var segDur = getSegmentDuration(seg);
      var rep = seg.repeatCount || 1;
      for (var r = 0; r < rep; r++) {
        for (var i = 0; i < seg.notes.length; i++) {
          result.push({
            noteIndex: seg.notes[i].noteIndex,
            startTime: cumulative + seg.notes[i].startTime,
            duration: seg.notes[i].duration
          });
        }
        cumulative += segDur;
      }
    }
    return result;
  }

  function seekPlayback(seekTime) {
    if (!playing) {
      if (isPlayingAll) {
        playAllSegments(seekTime);
      } else {
        playRecording(seekTime);
      }
      return;
    }
    stopPlayback();
    setTimeout(function() {
      if (isPlayingAll) {
        playAllSegments(seekTime);
      } else {
        playRecording(seekTime);
      }
    }, 50);
  }

  function stopPlayback() {
    playing = false;
    isPlayingAll = false;
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
    isCountingIn = false;
    if (countInTimer) { clearTimeout(countInTimer); countInTimer = null; }
    stopMetronome();
    notifyState();
  }

  function isRecording() {
    return recording;
  }

  function isCountingInActive() {
    return isCountingIn;
  }

  function isPlaying() {
    return playing;
  }

  function isPlayingAllActive() {
    return isPlayingAll;
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

  function quantizeNotes(bpmOverride, noteValue) {
    var notes = getActiveNotes();
    if (notes.length === 0) return;

    var useBpm = bpmOverride || bpm;
    var beatDur = 60 / useBpm;
    var gridSize = beatDur * (4 / noteValue);

    quantizeBackups[activeSegmentIndex] = notes.map(function(n) {
      return {
        noteIndex: n.noteIndex,
        frequency: n.frequency,
        startTime: n.startTime,
        duration: n.duration,
        noteOff: n.noteOff
      };
    });

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      n.startTime = Math.round(n.startTime / gridSize) * gridSize;
      n.duration = Math.max(gridSize, Math.round(n.duration / gridSize) * gridSize);
    }

    notifyState();
  }

  function undoQuantize() {
    var backup = quantizeBackups[activeSegmentIndex];
    if (!backup) return;
    var notes = getActiveNotes();
    notes.length = 0;
    for (var i = 0; i < backup.length; i++) {
      notes.push(backup[i]);
    }
    delete quantizeBackups[activeSegmentIndex];
    notifyState();
  }

  function hasQuantizeUndo() {
    return !!quantizeBackups[activeSegmentIndex];
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
    segments.push({ id: nextSegmentId, name: name, notes: [], repeatCount: 1 });
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
      }),
      repeatCount: src.repeatCount || 1
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
    delete quantizeBackups[index];
    if (activeSegmentIndex >= segments.length) {
      activeSegmentIndex = segments.length - 1;
    }
    notifyState();
  }

  function renameSegment(index, name) {
    if (index < 0 || index >= segments.length) return;
    segments[index].name = name;
    notifyState();
  }

  function moveSegmentUp(index) {
    if (index <= 0 || index >= segments.length) return;
    var tmp = segments[index];
    segments[index] = segments[index - 1];
    segments[index - 1] = tmp;
    var tmpQ = quantizeBackups[index];
    quantizeBackups[index] = quantizeBackups[index - 1];
    quantizeBackups[index - 1] = tmpQ;
    if (activeSegmentIndex === index) {
      activeSegmentIndex = index - 1;
    } else if (activeSegmentIndex === index - 1) {
      activeSegmentIndex = index;
    }
    notifyState();
  }

  function moveSegmentDown(index) {
    if (index < 0 || index >= segments.length - 1) return;
    var tmp = segments[index];
    segments[index] = segments[index + 1];
    segments[index + 1] = tmp;
    var tmpQ = quantizeBackups[index];
    quantizeBackups[index] = quantizeBackups[index + 1];
    quantizeBackups[index + 1] = tmpQ;
    if (activeSegmentIndex === index) {
      activeSegmentIndex = index + 1;
    } else if (activeSegmentIndex === index + 1) {
      activeSegmentIndex = index;
    }
    notifyState();
  }

  function setSegmentRepeat(index, count) {
    if (index < 0 || index >= segments.length) return;
    segments[index].repeatCount = Math.max(1, Math.min(99, count));
    notifyState();
  }

  function getSegmentRepeat(index) {
    if (index < 0 || index >= segments.length) return 1;
    return segments[index].repeatCount || 1;
  }

  function setBPM(value) {
    bpm = Math.max(20, Math.min(300, value));
  }

  function getBPM() {
    return bpm;
  }

  function setTimeSignature(num, den) {
    timeSignatureNum = num;
    timeSignatureDen = den;
  }

  function getTimeSignature() {
    return { num: timeSignatureNum, den: timeSignatureDen };
  }

  function setMetronome(on) {
    metronomeEnabled = on;
    if (!on) stopMetronome();
  }

  function isMetronomeOn() {
    return metronomeEnabled;
  }

  function setCountIn(on) {
    countInEnabled = on;
  }

  function isCountInOn() {
    return countInEnabled;
  }

  function playMetronomeTick(time) {
    var ctx = SynthApp.AudioEngine.getAudioContext();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.04);
    metronomeNodes.push(osc, gain);
  }

  function playMetronomeTickHigh(time) {
    var ctx = SynthApp.AudioEngine.getAudioContext();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
    metronomeNodes.push(osc, gain);
  }

  function startMetronome() {
    if (!metronomeEnabled && !isCountingIn) return;
    stopMetronome();

    var ctx = SynthApp.AudioEngine.getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    var beatDur = getBeatDuration();
    var now = ctx.currentTime;

    var nextBeatTime = Math.ceil(now / beatDur) * beatDur;
    var firstDelay = (nextBeatTime - now) * 1000;

    function scheduleTicks() {
      if ((!recording && !playing && !isCountingIn) || (!metronomeEnabled && !isCountingIn)) return;
      var t = SynthApp.AudioEngine.getAudioContext();
      if (!t) return;
      var bd = getBeatDuration();
      var n = t.currentTime;
      var upTime = Math.ceil(n / bd) * bd;
      var beatIdx = Math.round(upTime / bd);
      var isFirst = (beatIdx % timeSignatureNum === 0);
      if (isFirst) {
        playMetronomeTickHigh(upTime);
      } else {
        playMetronomeTick(upTime);
      }
      metronomeTimer = setTimeout(scheduleTicks, (upTime - n) * 1000 + 50);
    }

    metronomeTimer = setTimeout(scheduleTicks, firstDelay);
  }

  function stopMetronome() {
    if (metronomeTimer) {
      clearTimeout(metronomeTimer);
      metronomeTimer = null;
    }
    var ctx = SynthApp.AudioEngine.getAudioContext();
    if (ctx) {
      var now = ctx.currentTime;
      for (var i = 0; i < metronomeNodes.length; i++) {
        try {
          if (metronomeNodes[i].stop) metronomeNodes[i].stop(now);
          if (metronomeNodes[i].disconnect) metronomeNodes[i].disconnect();
        } catch (e) {}
      }
    }
    metronomeNodes = [];
  }

  function exportJSON() {
    var keySettings = SynthApp.AudioEngine.getAllKeySettings();
    var data = {
      version: '4.0',
      createdAt: new Date().toISOString(),
      bpm: bpm,
      timeSignature: { num: timeSignatureNum, den: timeSignatureDen },
      keySettings: keySettings,
      segments: segments.map(function(seg) {
        return {
          name: seg.name,
          repeatCount: seg.repeatCount || 1,
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

        if (data.bpm && typeof data.bpm === 'number') {
          bpm = data.bpm;
        }
        if (data.timeSignature && data.timeSignature.num) {
          timeSignatureNum = data.timeSignature.num;
          timeSignatureDen = data.timeSignature.den || 4;
        }

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
              }),
              repeatCount: seg.repeatCount || 1
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
            }),
            repeatCount: 1
          }];
          nextSegmentId = 1;
          activeSegmentIndex = 0;
        }

        quantizeBackups = {};

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
        countingIn: isCountingIn,
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
    playAllSegments: playAllSegments,
    seekPlayback: seekPlayback,
    stopPlayback: stopPlayback,
    clearRecording: clearRecording,
    isRecording: isRecording,
    isCountingInActive: isCountingInActive,
    isPlaying: isPlaying,
    isPlayingAllActive: isPlayingAllActive,
    isLoopingActive: isLoopingActive,
    toggleLoop: toggleLoop,
    getRecordedNotes: getRecordedNotes,
    getTotalDuration: getTotalDuration,
    getAllSegmentsDuration: getAllSegmentsDuration,
    getBeatPosition: getBeatPosition,
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
    renameSegment: renameSegment,
    moveSegmentUp: moveSegmentUp,
    moveSegmentDown: moveSegmentDown,
    setSegmentRepeat: setSegmentRepeat,
    getSegmentRepeat: getSegmentRepeat,
    setBPM: setBPM,
    getBPM: getBPM,
    setTimeSignature: setTimeSignature,
    getTimeSignature: getTimeSignature,
    setMetronome: setMetronome,
    isMetronomeOn: isMetronomeOn,
    setCountIn: setCountIn,
    isCountInOn: isCountInOn,
    startMetronome: startMetronome,
    stopMetronome: stopMetronome,
    exportJSON: exportJSON,
    importJSON: importJSON,
    setOnStateChange: setOnStateChange,
    setOnProgressUpdate: setOnProgressUpdate,
    setOnNoteHighlight: setOnNoteHighlight
  };
})();