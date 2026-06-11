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
    return Object.keys(presets).sort();
  }

  function getPreset(name) {
    return presets[name] || null;
  }

  function savePreset(name, keySettings) {
    presets[name] = {
      name: name,
      createdAt: new Date().toISOString(),
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

  function renamePreset(oldName, newName) {
    if (!presets[oldName] || presets[newName]) return false;
    presets[newName] = presets[oldName];
    presets[newName].name = newName;
    delete presets[oldName];
    save();
    return true;
  }

  load();

  return {
    load: load,
    getAllNames: getAllNames,
    getPreset: getPreset,
    savePreset: savePreset,
    deletePreset: deletePreset,
    renamePreset: renamePreset
  };
})();