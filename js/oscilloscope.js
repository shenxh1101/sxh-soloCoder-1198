var SynthApp = window.SynthApp || {};

SynthApp.Oscilloscope = (function() {
  var canvas = null;
  var ctx = null;
  var animId = null;
  var WIDTH = 0;
  var HEIGHT = 0;

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    startLoop();
  }

  function resize() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    WIDTH = rect.width;
    HEIGHT = rect.height;
    canvas.width = WIDTH * window.devicePixelRatio;
    canvas.height = HEIGHT * window.devicePixelRatio;
    ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 0.5;

    var midY = HEIGHT / 2;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(WIDTH, midY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    for (var i = 0; i < 8; i++) {
      var y = (HEIGHT / 8) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }

    for (var j = 0; j < 16; j++) {
      var x = (WIDTH / 16) * j;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
  }

  function drawWaveform() {
    var analyser = SynthApp.AudioEngine.getAnalyser();
    if (!analyser) return;

    var bufferLength = analyser.frequencyBinCount;
    var dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawGrid();

    var sliceWidth = WIDTH / bufferLength;

    ctx.beginPath();
    ctx.strokeStyle = '#ffb000';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(255, 176, 0, 0.5)';
    ctx.shadowBlur = 6;

    var x = 0;
    for (var i = 0; i < bufferLength; i++) {
      var v = dataArray[i] / 128.0;
      var y = (v * HEIGHT) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.lineTo(WIDTH, HEIGHT / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function startLoop() {
    function loop() {
      drawWaveform();
      animId = requestAnimationFrame(loop);
    }
    loop();
  }

  function stopLoop() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  return {
    init: init,
    stop: stopLoop
  };
})();