var SynthApp = window.SynthApp || {};

SynthApp.TimbreManager = (function() {
  var STORAGE_KEY = 'synthx1_timbres';
  var presets = {};

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        presets = JSON.parse(raw);
      }
    } catch (e) {
      presets = {};
    }
    if (!presets || typeof presets !== 'object') presets = {};
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch (e) {}
  }

  function getAllNames() {
    return Object.keys(presets).sort(function(a, b) {
      var fa = presets[a].favorite ? 0 : 1;
      var fb = presets[b].favorite ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.localeCompare(b);
    });
  }

  function getPreset(name) {
    return presets[name] || null;
  }

  function savePreset(name, keySettings, note) {
    var existing = presets[name];
    presets[name] = {
      name: name,
      createdAt: new Date().toISOString(),
      note: note || (existing ? existing.note : ''),
      favorite: existing ? existing.favorite : false,
      keySettings: keySettings.map(function(ks) {
        return {
          waveform: ks.waveform,
          attack: ks.attack,
          decay: ks.decay,
          sustain: ks.sustain,
          release: ks.release
        };
      })
    };
    save();
  }

  function deletePreset(name) {
    delete presets[name];
    save();
  }

  function toggleFavorite(name) {
    if (!presets[name]) return false;
    presets[name].favorite = !presets[name].favorite;
    save();
    return presets[name].favorite;
  }

  function updateNote(name, note) {
    if (!presets[name]) return;
    presets[name].note = note;
    save();
  }

  load();

  return {
    load: load,
    getAllNames: getAllNames,
    getPreset: getPreset,
    savePreset: savePreset,
    deletePreset: deletePreset,
    toggleFavorite: toggleFavorite,
    updateNote: updateNote
  };
})();