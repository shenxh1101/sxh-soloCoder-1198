var SynthApp = window.SynthApp || {};

(function() {
  var audioEngine = SynthApp.AudioEngine;
  var recorder = SynthApp.Recorder;
  var oscilloscope = SynthApp.Oscilloscope;
  var timbreManager = SynthApp.TimbreManager;

  var pressedKeys = {};
  var selectedTimelineNote = -1;
  var isSeeking = false;

  function init() {
    oscilloscope.init('oscilloscope');

    bindKeys();
    bindWaveformButtons();
    bindADSR();
    bindEffects();
    bindPresets();
    bindRecorder();
    bindFile();
    bindTimbrePresets();
    bindTimeline();
    bindQuantize();
    bindSegments();
    bindImportDialog();
    bindProgressBar();
    bindMetronome();
    bindTimeSignature();
    bindSegmentOptions();

    recorder.setOnStateChange(updateRecorderUI);
    recorder.setOnProgressUpdate(updateProgressUI);
    recorder.setOnNoteHighlight(highlightPlaybackKey);

    syncSettingsFromRecorder();
    renderTimbreList();
    renderSegments();
    renderTimeline();
  }

  function syncSettingsFromRecorder() {
    document.getElementById('bpmInput').value = recorder.getBPM();
    var ts = recorder.getTimeSignature();
    document.getElementById('timesigNum').value = ts.num;
    document.getElementById('timesigDen').value = ts.den;
    document.getElementById('metronomeBtn').classList.toggle('active', recorder.isMetronomeOn());
    document.getElementById('countInBtn').classList.toggle('active', recorder.isCountInOn());
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

  function highlightPlaybackKey(noteIndex) {
    var allKeys = document.querySelectorAll('.key-btn');
    allKeys.forEach(function(k) {
      k.classList.remove('playback-highlight');
    });
    if (noteIndex >= 0) {
      var btn = document.querySelector('.key-btn[data-note="' + noteIndex + '"]');
      if (btn) btn.classList.add('playback-highlight');
    }
  }

  function ensureKeySelected() {
    var selKey = audioEngine.getSelectedKey();
    if (selKey < 0) {
      selectKey(0);
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

        ensureKeySelected();
        refreshUIForKey(audioEngine.getSelectedKey());
      });
    });
  }

  function bindTimbrePresets() {
    document.getElementById('saveTimbreBtn').addEventListener('click', function() {
      var name = prompt('请输入音色方案名称：');
      if (!name || !name.trim()) return;
      name = name.trim();

      var note = prompt('请输入备注说明（可选）：') || '';

      var existingNames = timbreManager.getAllNames();
      if (existingNames.indexOf(name) !== -1) {
        if (!confirm('方案 "' + name + '" 已存在，是否覆盖？')) return;
      }

      var allSettings = audioEngine.getAllKeySettings();
      timbreManager.savePreset(name, allSettings, note);
      renderTimbreList();
      document.getElementById('timbreSelect').value = name;
      showTimbreInfo(name);
    });

    document.getElementById('timbreSelect').addEventListener('change', function() {
      var name = this.value;
      if (!name) {
        document.getElementById('timbreInfo').style.display = 'none';
        document.getElementById('favoriteBtn').style.display = 'none';
        return;
      }
      var preset = timbreManager.getPreset(name);
      if (!preset || !preset.keySettings) return;

      audioEngine.restoreAllKeySettings(preset.keySettings);

      ensureKeySelected();
      refreshUIForKey(audioEngine.getSelectedKey());

      showTimbreInfo(name);
    });

    document.getElementById('deleteTimbreBtn').addEventListener('click', function() {
      var name = document.getElementById('timbreSelect').value;
      if (!name) return;
      if (!confirm('确定删除方案 "' + name + '" 吗？')) return;
      timbreManager.deletePreset(name);
      renderTimbreList();
      document.getElementById('timbreInfo').style.display = 'none';
      document.getElementById('favoriteBtn').style.display = 'none';
    });

    document.getElementById('favoriteBtn').addEventListener('click', function() {
      var name = document.getElementById('timbreSelect').value;
      if (!name) return;
      var isFav = timbreManager.toggleFavorite(name);
      var btn = document.getElementById('favoriteBtn');
      btn.textContent = isFav ? '\u2605' : '\u2606';
      btn.classList.toggle('favorited', isFav);
      renderTimbreList();
    });
  }

  function showTimbreInfo(name) {
    var preset = timbreManager.getPreset(name);
    var infoDiv = document.getElementById('timbreInfo');
    var favBtn = document.getElementById('favoriteBtn');

    if (!preset) {
      infoDiv.style.display = 'none';
      favBtn.style.display = 'none';
      return;
    }

    infoDiv.style.display = 'block';
    favBtn.style.display = '';

    var isFav = preset.favorite;
    favBtn.textContent = isFav ? '\u2605' : '\u2606';
    favBtn.classList.toggle('favorited', isFav);

    infoDiv.textContent = preset.note || '无备注';
  }

  function renderTimbreList() {
    var select = document.getElementById('timbreSelect');
    var names = timbreManager.getAllNames();
    var currentVal = select.value;

    select.innerHTML = '<option value="">-- 选择方案 --</option>';
    for (var i = 0; i < names.length; i++) {
      var preset = timbreManager.getPreset(names[i]);
      var isFav = preset && preset.favorite;
      var opt = document.createElement('option');
      opt.value = names[i];
      opt.textContent = (isFav ? '\u2605 ' : '') + names[i];
      select.appendChild(opt);
    }

    if (names.indexOf(currentVal) !== -1) {
      select.value = currentVal;
    } else {
      document.getElementById('timbreInfo').style.display = 'none';
      document.getElementById('favoriteBtn').style.display = 'none';
    }
  }

  function bindTimeline() {
    var canvas = document.getElementById('timelineCanvas');
    if (!canvas) return;

    canvas.addEventListener('click', function(e) {
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;

      var notes = recorder.getRecordedNotes();
      var totalDur = recorder.getTotalDuration();
      if (totalDur <= 0 || notes.length === 0) return;

      var scaledW = rect.width;
      var noteH = 18;
      var noteGap = 3;
      var topPad = 28;

      var clicked = -1;
      for (var i = notes.length - 1; i >= 0; i--) {
        var n = notes[i];
        var nx = (n.startTime / totalDur) * scaledW;
        var nw = Math.max(4, (n.duration / totalDur) * scaledW);
        var ny = topPad + i * (noteH + noteGap);
        if (x >= nx && x <= nx + nw && y >= ny && y <= ny + noteH) {
          clicked = i;
          break;
        }
      }

      selectTimelineNote(clicked);
    });

    canvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      var tlWrap = document.getElementById('timelineWrap');
      if (tlWrap) {
        tlWrap.scrollLeft += e.deltaY;
      }
    });
  }

  function selectTimelineNote(index) {
    selectedTimelineNote = index;
    renderTimeline();
    showTimelineEditor(index);
  }

  function showTimelineEditor(index) {
    var panel = document.getElementById('timelineEdit');
    if (!panel) return;

    if (index < 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';

    var notes = recorder.getRecordedNotes();
    var n = notes[index];
    if (!n) { panel.style.display = 'none'; return; }

    document.getElementById('editNoteIndex').value = n.noteIndex;
    document.getElementById('editStartTime').value = n.startTime.toFixed(2);
    document.getElementById('editDuration').value = n.duration.toFixed(2);

    var totalDur = recorder.getTotalDuration();
    document.getElementById('editTotalDur').textContent = totalDur.toFixed(2) + 's';

    document.getElementById('applyEditBtn').onclick = function() {
      var newNoteIdx = parseInt(document.getElementById('editNoteIndex').value);
      var newStart = parseFloat(document.getElementById('editStartTime').value);
      var newDur = parseFloat(document.getElementById('editDuration').value);

      if (isNaN(newNoteIdx) || newNoteIdx < 0 || newNoteIdx > 7) return;
      if (isNaN(newStart) || newStart < 0) return;
      if (isNaN(newDur) || newDur <= 0) return;

      recorder.updateNote(index, {
        noteIndex: newNoteIdx,
        startTime: newStart,
        duration: newDur
      });
      renderTimeline();
      showTimelineEditor(index);
    };

    document.getElementById('deleteEditBtn').onclick = function() {
      recorder.deleteNote(index);
      selectedTimelineNote = -1;
      panel.style.display = 'none';
      renderTimeline();
    };
  }

  function renderTimeline() {
    var canvas = document.getElementById('timelineCanvas');
    if (!canvas) return;

    var notes = recorder.getRecordedNotes();
    var totalDur = recorder.getTotalDuration();

    if (totalDur <= 0) totalDur = 4;

    var wrap = document.getElementById('timelineWrap');
    var wrapW = wrap ? wrap.clientWidth : 800;

    var rulerH = 22;
    var noteH = 18;
    var noteGap = 3;
    var topPad = rulerH + 6;
    var totalH = Math.max(60, rulerH + topPad + notes.length * (noteH + noteGap) + 8);

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(wrapW, 800) * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = Math.max(wrapW, 800) + 'px';
    canvas.style.height = totalH + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var colors = [
      '#00f0ff', '#ff00aa', '#ffb000', '#00ff88',
      '#ff6040', '#a060ff', '#ffd040', '#40c0ff'
    ];

    var scaledW = Math.max(wrapW, 800);

    ctx.clearRect(0, 0, scaledW, totalH);

    var bpm = recorder.getBPM();
    var ts = recorder.getTimeSignature();
    var beatDur = 60 / bpm;
    var measureDur = beatDur * ts.num;

    var totalMeasures = Math.max(1, Math.ceil(totalDur / measureDur));
    var paddedDur = totalMeasures * measureDur;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, scaledW, rulerH);

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textBaseline = 'middle';

    for (var m = 0; m < totalMeasures; m++) {
      var mx = (m * measureDur / paddedDur) * scaledW;
      var mw = (measureDur / paddedDur) * scaledW;

      ctx.fillStyle = m % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)';
      ctx.fillRect(mx, rulerH, mw, totalH - rulerH);

      ctx.strokeStyle = 'rgba(0,240,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, rulerH);
      ctx.lineTo(mx, totalH);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0,240,255,0.5)';
      ctx.fillText('M' + (m + 1), mx + 4, rulerH / 2);

      for (var b = 1; b < ts.num; b++) {
        var bx = mx + (b * beatDur / paddedDur) * scaledW;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(bx, rulerH);
        ctx.lineTo(bx, totalH);
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textBaseline = 'bottom';
    for (var tm = 0; tm <= totalDur; tm += 1) {
      var tmx = (tm / paddedDur) * scaledW;
      ctx.fillText(tm + 's', tmx + 3, totalH - 2);
    }

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var nx = (n.startTime / paddedDur) * scaledW;
      var nw = Math.max(4, (n.duration / paddedDur) * scaledW);
      var ny = topPad + i * (noteH + noteGap);

      var color = colors[n.noteIndex % colors.length];

      ctx.fillStyle = i === selectedTimelineNote ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)';
      ctx.fillRect(nx, ny, nw, noteH);

      ctx.fillStyle = color;
      ctx.fillRect(nx + 1, ny + 1, nw - 2, noteH - 2);

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = '9px "Share Tech Mono", monospace';
      ctx.textBaseline = 'middle';
      var label = SynthApp.NOTE_NAMES[n.noteIndex] + ' ' + n.duration.toFixed(1) + 's';
      if (nw > 40) {
        ctx.fillText(label, nx + 4, ny + noteH / 2);
      }
    }
  }

  function bindSegments() {
    document.getElementById('addSegmentBtn').addEventListener('click', function() {
      recorder.addSegment();
      renderSegments();
      renderTimeline();
      updateSegmentOptions();
      selectedTimelineNote = -1;
      var panel = document.getElementById('timelineEdit');
      if (panel) panel.style.display = 'none';
      updateQuantizeUI();
    });

    document.getElementById('copySegmentBtn').addEventListener('click', function() {
      recorder.copySegment(recorder.getActiveSegmentIndex());
      renderSegments();
      renderTimeline();
      updateSegmentOptions();
    });

    document.getElementById('deleteSegmentBtn').addEventListener('click', function() {
      if (recorder.getSegments().length <= 1) return;
      recorder.deleteSegment(recorder.getActiveSegmentIndex());
      renderSegments();
      renderTimeline();
      updateSegmentOptions();
      selectedTimelineNote = -1;
      var panel = document.getElementById('timelineEdit');
      if (panel) panel.style.display = 'none';
      updateQuantizeUI();
    });

    document.getElementById('loopSegmentBtn').addEventListener('click', function() {
      var isLoop = recorder.toggleLoop();
      var btn = document.getElementById('loopSegmentBtn');
      btn.classList.toggle('loop-active', isLoop);
      btn.textContent = isLoop ? 'LOOP:ON' : 'LOOP';
    });
  }

  function renderSegments() {
    var container = document.getElementById('segmentsContainer');
    if (!container) return;

    var segs = recorder.getSegments();
    var activeIdx = recorder.getActiveSegmentIndex();

    container.innerHTML = '';
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var btn = document.createElement('button');
      btn.className = 'segment-tab' + (i === activeIdx ? ' active' : '');
      var repLabel = seg.repeatCount > 1 ? ' x' + seg.repeatCount : '';
      btn.textContent = seg.name + repLabel;
      btn.title = seg.notes.length + ' 个音符 | 重复 ' + (seg.repeatCount || 1) + ' 次';
      btn.setAttribute('data-index', i);

      (function(idx) {
        btn.addEventListener('click', function() {
          recorder.setActiveSegment(idx);
          renderSegments();
          renderTimeline();
          updateSegmentOptions();
          updateQuantizeUI();
          selectedTimelineNote = -1;
          var panel = document.getElementById('timelineEdit');
          if (panel) panel.style.display = 'none';
        });

        btn.addEventListener('dblclick', function() {
          var newName = prompt('重命名片段：', segs[idx].name);
          if (newName && newName.trim()) {
            recorder.renameSegment(idx, newName.trim());
            renderSegments();
          }
        });
      })(i);

      container.appendChild(btn);
    }
  }

  function bindSegmentOptions() {
    document.getElementById('moveSegUpBtn').addEventListener('click', function() {
      recorder.moveSegmentUp(recorder.getActiveSegmentIndex());
      renderSegments();
      renderTimeline();
      updateSegmentOptions();
      updateQuantizeUI();
    });

    document.getElementById('moveSegDownBtn').addEventListener('click', function() {
      recorder.moveSegmentDown(recorder.getActiveSegmentIndex());
      renderSegments();
      renderTimeline();
      updateSegmentOptions();
      updateQuantizeUI();
    });

    document.getElementById('renameSegBtn').addEventListener('click', function() {
      var idx = recorder.getActiveSegmentIndex();
      var segs = recorder.getSegments();
      if (idx < 0 || idx >= segs.length) return;
      var newName = prompt('重命名片段：', segs[idx].name);
      if (newName && newName.trim()) {
        recorder.renameSegment(idx, newName.trim());
        renderSegments();
      }
    });

    document.getElementById('repeatCount').addEventListener('change', function() {
      var count = parseInt(this.value) || 1;
      recorder.setSegmentRepeat(recorder.getActiveSegmentIndex(), count);
      this.value = recorder.getSegmentRepeat(recorder.getActiveSegmentIndex());
      renderSegments();
    });

    document.getElementById('playAllBtn').addEventListener('click', function() {
      if (recorder.isPlaying()) {
        recorder.stopPlayback();
        highlightPlaybackKey(-1);
      }
      if (recorder.isRecording()) {
        var heldKeys = getHeldNoteIndices();
        if (heldKeys.length > 0) {
          recorder.finalizeHeldNotes(heldKeys);
        }
        releaseAllKeys();
        recorder.stopRecording();
        renderTimeline();
        renderSegments();
      }
      recorder.playAllSegments();
    });
  }

  function updateSegmentOptions() {
    var idx = recorder.getActiveSegmentIndex();
    document.getElementById('repeatCount').value = recorder.getSegmentRepeat(idx);
  }

  function bindQuantize() {
    document.getElementById('bpmInput').addEventListener('change', function() {
      var val = parseInt(this.value) || 120;
      recorder.setBPM(val);
      this.value = recorder.getBPM();
      renderTimeline();
    });

    document.getElementById('quantize4Btn').addEventListener('click', function() {
      recorder.quantizeNotes(recorder.getBPM(), 4);
      renderTimeline();
      updateQuantizeUI();
    });

    document.getElementById('quantize8Btn').addEventListener('click', function() {
      recorder.quantizeNotes(recorder.getBPM(), 8);
      renderTimeline();
      updateQuantizeUI();
    });

    document.getElementById('quantize16Btn').addEventListener('click', function() {
      recorder.quantizeNotes(recorder.getBPM(), 16);
      renderTimeline();
      updateQuantizeUI();
    });

    document.getElementById('undoQuantizeBtn').addEventListener('click', function() {
      recorder.undoQuantize();
      renderTimeline();
      updateQuantizeUI();
    });
  }

  function updateQuantizeUI() {
    var undoBtn = document.getElementById('undoQuantizeBtn');
    undoBtn.disabled = !recorder.hasQuantizeUndo();
  }

  function bindTimeSignature() {
    document.getElementById('timesigNum').addEventListener('change', function() {
      var num = parseInt(this.value) || 4;
      var den = parseInt(document.getElementById('timesigDen').value) || 4;
      recorder.setTimeSignature(num, den);
      renderTimeline();
    });

    document.getElementById('timesigDen').addEventListener('change', function() {
      var num = parseInt(document.getElementById('timesigNum').value) || 4;
      var den = parseInt(this.value) || 4;
      recorder.setTimeSignature(num, den);
      renderTimeline();
    });
  }

  function bindMetronome() {
    document.getElementById('metronomeBtn').addEventListener('click', function() {
      var isOn = !recorder.isMetronomeOn();
      recorder.setMetronome(isOn);
      this.classList.toggle('active', isOn);
      if (isOn && recorder.isRecording()) {
        recorder.startMetronome();
      }
    });

    document.getElementById('countInBtn').addEventListener('click', function() {
      var isOn = !recorder.isCountInOn();
      recorder.setCountIn(isOn);
      this.classList.toggle('active', isOn);
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
        renderTimeline();
        renderSegments();
        recorder.stopMetronome();
        document.getElementById('metronomeBtn').classList.remove('active');
        recorder.setMetronome(false);
      } else {
        if (recorder.isPlaying()) {
          recorder.stopPlayback();
        }
        selectedTimelineNote = -1;
        var panel = document.getElementById('timelineEdit');
        if (panel) panel.style.display = 'none';
        recorder.startRecording();
      }
    });

    document.getElementById('stopBtn').addEventListener('click', function() {
      if (recorder.isRecording() || recorder.isCountingInActive()) {
        var heldKeys = getHeldNoteIndices();
        if (heldKeys.length > 0) {
          recorder.finalizeHeldNotes(heldKeys);
        }
        releaseAllKeys();
        recorder.stopRecording();
        renderTimeline();
        renderSegments();
        recorder.stopMetronome();
        document.getElementById('metronomeBtn').classList.remove('active');
        recorder.setMetronome(false);
      }
      if (recorder.isPlaying()) {
        recorder.stopPlayback();
        highlightPlaybackKey(-1);
      }
    });

    document.getElementById('playBtn').addEventListener('click', function() {
      if (recorder.isPlaying()) {
        recorder.stopPlayback();
        highlightPlaybackKey(-1);
      } else {
        if (recorder.isRecording()) {
          var heldKeys = getHeldNoteIndices();
          if (heldKeys.length > 0) {
            recorder.finalizeHeldNotes(heldKeys);
          }
          releaseAllKeys();
          recorder.stopRecording();
          renderTimeline();
          renderSegments();
        }
        recorder.playRecording();
      }
    });

    document.getElementById('clearBtn').addEventListener('click', function() {
      recorder.clearRecording();
      recorder.stopMetronome();
      document.getElementById('metronomeBtn').classList.remove('active');
      recorder.setMetronome(false);
      selectedTimelineNote = -1;
      var panel = document.getElementById('timelineEdit');
      if (panel) panel.style.display = 'none';
      renderTimeline();
      renderSegments();
      updateQuantizeUI();
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
        var file = e.target.files[0];
        var data = null;
        var reader = new FileReader();
        reader.onload = function(ev) {
          try {
            data = JSON.parse(ev.target.result);
          } catch (err) {}

          if (data && data.keySettings && Array.isArray(data.keySettings) && data.keySettings.length >= 8) {
            showImportDialog(file);
          } else {
            recorder.importJSON(file, false, function() {
              syncSettingsFromRecorder();
              renderTimeline();
              renderSegments();
              updateSegmentOptions();
              updateQuantizeUI();
            });
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      }
    });
  }

  function bindImportDialog() {
    document.getElementById('importCancel').addEventListener('click', function() {
      hideImportDialog();
    });

    document.getElementById('importConfirm').addEventListener('click', function() {
      var radio = document.querySelector('input[name="importMode"]:checked');
      var importTimbre = radio && radio.value === 'full';
      var pendingFile = document.getElementById('importDialog')._pendingFile;

      if (pendingFile) {
        recorder.importJSON(pendingFile, importTimbre, function() {
          syncSettingsFromRecorder();
          if (importTimbre) {
            ensureKeySelected();
            refreshUIForKey(audioEngine.getSelectedKey());
          }
          renderTimeline();
          renderSegments();
          updateSegmentOptions();
          updateQuantizeUI();
        });
      }
      hideImportDialog();
    });
  }

  function showImportDialog(file) {
    var dialog = document.getElementById('importDialog');
    dialog._pendingFile = file;
    dialog.style.display = 'flex';
  }

  function hideImportDialog() {
    var dialog = document.getElementById('importDialog');
    dialog.style.display = 'none';
    dialog._pendingFile = null;
  }

  function bindProgressBar() {
    var progressBar = document.getElementById('progressBar');

    progressBar.addEventListener('input', function() {
      isSeeking = true;
    });

    progressBar.addEventListener('change', function() {
      var total = recorder.isPlayingAllActive() ? recorder.getAllSegmentsDuration() : recorder.getTotalDuration();
      var seekTime = (parseFloat(progressBar.value) / 1000) * total;
      recorder.seekPlayback(seekTime);
      isSeeking = false;
    });

    progressBar.addEventListener('mousedown', function() {
      isSeeking = true;
    });
  }

  function updateProgressUI(info) {
    if (isSeeking) return;

    var progressBar = document.getElementById('progressBar');
    var progressTime = document.getElementById('progressTime');
    var beatPos = document.getElementById('beatPosition');
    var progressSection = document.getElementById('playbackProgress');

    if (info.total > 0) {
      progressSection.style.display = 'flex';
      var val = Math.round(info.progress * 1000);
      progressBar.value = val;
      progressBar.max = 1000;
      progressTime.textContent = formatTime(info.elapsed) + ' / ' + formatTime(info.total);
      if (info.beatPosition) {
        beatPos.textContent = 'M' + info.beatPosition.measure + ' B' + info.beatPosition.beat;
        beatPos.style.display = 'inline';
      }
    }
  }

  function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.floor((seconds % 1) * 10);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + ms;
  }

  function updateRecorderUI(state) {
    var recordBtn = document.getElementById('recordBtn');
    var stopBtn = document.getElementById('stopBtn');
    var playBtn = document.getElementById('playBtn');
    var indicator = document.getElementById('recIndicator');
    var statusText = document.getElementById('recStatus');
    var progressSection = document.getElementById('playbackProgress');
    var beatPos = document.getElementById('beatPosition');

    recordBtn.classList.remove('recording');
    playBtn.classList.remove('playing');
    indicator.classList.remove('recording', 'playing');

    if (state.countingIn) {
      indicator.classList.add('recording');
      statusText.textContent = '倒计时...';
      stopBtn.disabled = false;
      progressSection.style.display = 'none';
      beatPos.style.display = 'none';
    } else if (state.recording) {
      recordBtn.classList.add('recording');
      indicator.classList.add('recording');
      statusText.textContent = '录制中...';
      stopBtn.disabled = false;
      progressSection.style.display = 'none';
      beatPos.style.display = 'none';
    } else if (state.playing) {
      playBtn.classList.add('playing');
      indicator.classList.add('playing');
      statusText.textContent = recorder.isPlayingAllActive() ? '播放全部...' : '回放中...';
      stopBtn.disabled = false;
    } else {
      var noteCount = recorder.getRecordedNotes().length;
      var segCount = state.segmentCount || 1;
      var allDur = recorder.getAllSegmentsDuration();
      var durStr = allDur > 0 ? ' | ' + allDur.toFixed(1) + 's' : '';
      statusText.textContent = state.hasNotes
        ? segCount + ' 片段 | ' + noteCount + ' 音符' + durStr
        : '就绪';
      stopBtn.disabled = true;
      progressSection.style.display = 'none';
      beatPos.style.display = 'none';
      highlightPlaybackKey(-1);
    }

    if (!state.recording && !state.playing && !state.countingIn) {
      renderTimeline();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('resize', function() {
    renderTimeline();
  });
})();