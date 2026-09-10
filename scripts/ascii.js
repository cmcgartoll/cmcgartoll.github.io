(function () {
  const RAMP = ' .:-=+*#%@';

  // Shared look: letter size is pinned in px and the column count derived from
  // each element's width, so type renders identically across the whole page.
  const FONT_PX = 7;
  const INVERT = true;
  const GAMMA = 1.6;
  const FRAME_MS = 1000 / 20;
  const MIN_SIZE = 100;

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
      if (!(img instanceof HTMLImageElement)) resolve();
      else if (img.complete && (img.naturalWidth || 0) > 0) resolve();
      else img.addEventListener('load', () => resolve(), { once: true });
    });
  }

  function colsFor(width) {
    return Math.max(20, Math.round(width / (FONT_PX * 0.6)));
  }

  function styleType(pre) {
    pre.style.fontSize = FONT_PX + 'px';
    pre.style.lineHeight = '1.2';
  }

  // The profile photo carries its own wrapper markup so it can stay circular.
  function setupImagePeek(wrapper) {
    const img = wrapper.querySelector('img');
    const pre = wrapper.querySelector('.ascii-peek-text');
    if (!img || !pre) return;
    const explicitCols = parseInt(wrapper.dataset.asciiCols || '0', 10);
    const invert = wrapper.dataset.asciiInvert !== undefined;
    const gamma = parseFloat(wrapper.dataset.asciiGamma || '1');
    let rendered = false;

    const render = async () => {
      if (rendered) return;
      await whenReady(img);
      const cols = explicitCols || colsFor(wrapper.clientWidth);
      styleType(pre);
      pre.textContent = sampleToAscii(img, cols, 1, invert, gamma);
      rendered = true;
    };

    wrapper.addEventListener('mouseenter', render);
    wrapper.addEventListener('focusin', render);
  }

  // Everything else gets an overlay positioned over the element rather than a
  // wrapper, so the existing inline sizing on each tag is left untouched.
  function attachOverlay(el, live) {
    const parent = el.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    const pre = document.createElement('pre');
    pre.className = 'ascii-video-text';
    pre.setAttribute('aria-hidden', 'true');
    parent.appendChild(pre);

    let cols = 90;

    const place = () => {
      pre.style.left = el.offsetLeft + 'px';
      pre.style.top = el.offsetTop + 'px';
      pre.style.width = el.offsetWidth + 'px';
      pre.style.height = el.offsetHeight + 'px';
      pre.style.borderRadius = getComputedStyle(el).borderRadius;
      cols = colsFor(el.offsetWidth);
      styleType(pre);
    };

    const paint = () => {
      const aspect = el.offsetWidth / el.offsetHeight;
      pre.textContent = sampleToAscii(el, cols, aspect, INVERT, GAMMA);
    };

    let raf = null;
    let lastDraw = 0;

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;
      paint();
    };

    el.addEventListener('mouseenter', async () => {
      await whenReady(el);
      place();
      pre.classList.add('visible');
      if (live) {
        if (raf === null) raf = requestAnimationFrame(draw);
      } else {
        paint();
      }
    });

    el.addEventListener('mouseleave', () => {
      pre.classList.remove('visible');
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    });

    window.addEventListener('resize', () => {
      if (pre.classList.contains('visible')) place();
    });
  }

  function eligibleImage(img) {
    if (img.closest('[data-ascii-peek]')) return false;
    if (/\.svg($|\?)/i.test(img.getAttribute('src') || '')) return false;
    return img.offsetWidth >= MIN_SIZE && img.offsetHeight >= MIN_SIZE;
  }

  function init() {
    document.querySelectorAll('[data-ascii-peek]').forEach(setupImagePeek);
    document.querySelectorAll('video').forEach((v) => attachOverlay(v, true));
    document.querySelectorAll('img').forEach((img) => {
      // GIFs keep animating, so they get the live loop; stills render once.
      const animated = /\.gif($|\?)/i.test(img.getAttribute('src') || '');
      const attach = () => { if (eligibleImage(img)) attachOverlay(img, animated); };
      if (img.complete) attach();
      else img.addEventListener('load', attach, { once: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AsciiArt = { sampleToAscii };
})();
