(function () {
  const RAMP = ' .:-=+*#%@';

  function sampleToAscii(source, cols, targetAspect, invert, gamma) {
    const sw = source.naturalWidth || source.videoWidth || source.width;
    const sh = source.naturalHeight || source.videoHeight || source.height;
    if (!sw || !sh) return '';

    const srcAspect = sw / sh;
    const aspect = targetAspect || srcAspect;

    let cropX = 0, cropY = 0, cropW = sw, cropH = sh;
    if (srcAspect > aspect) {
      cropW = sh * aspect;
      cropX = (sw - cropW) / 2;
    } else if (srcAspect < aspect) {
      cropH = sw / aspect;
      cropY = (sh - cropH) / 2;
    }

    const cellAspect = 0.5;
    const rows = Math.max(1, Math.round((cols / aspect) * cellAspect));

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cols, rows);

    let data;
    try {
      data = ctx.getImageData(0, 0, cols, rows).data;
    } catch (e) {
      return '';
    }

    const last = RAMP.length - 1;
    let out = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        let lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        if (gamma && gamma !== 1) lum = Math.pow(lum, gamma);
        const level = Math.round(lum * last);
        out += RAMP[invert ? last - level : level];
      }
      if (y < rows - 1) out += '\n';
    }
    return out;
  }

  function whenReady(img) {
    return new Promise((resolve) => {
      if (img.complete && (img.naturalWidth || 0) > 0) resolve();
      else img.addEventListener('load', () => resolve(), { once: true });
    });
  }

  function sizePre(wrapper, pre, cols) {
    const w = wrapper.clientWidth;
    if (!w) return;
    const fontSize = w / (cols * 0.6);
    pre.style.fontSize = fontSize + 'px';
    pre.style.lineHeight = '1.2';
  }

  function setupImagePeek(wrapper) {
    const img = wrapper.querySelector('img');
    const pre = wrapper.querySelector('.ascii-peek-text');
    if (!img || !pre) return;
    const cols = parseInt(wrapper.dataset.asciiCols || '60', 10);
    const invert = wrapper.dataset.asciiInvert !== undefined;
    const gamma = parseFloat(wrapper.dataset.asciiGamma || '1');
    let rendered = false;

    const render = async () => {
      if (rendered) return;
      await whenReady(img);
      sizePre(wrapper, pre, cols);
      pre.textContent = sampleToAscii(img, cols, 1, invert, gamma);
      rendered = true;
    };

    wrapper.addEventListener('mouseenter', render);
    wrapper.addEventListener('focusin', render);

    window.addEventListener('resize', () => {
      if (rendered) sizePre(wrapper, pre, cols);
    });
  }

  function init() {
    document.querySelectorAll('[data-ascii-peek]').forEach(setupImagePeek);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AsciiArt = { sampleToAscii };
})();
