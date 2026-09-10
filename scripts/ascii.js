(function () {
  const RAMP = ' .:-=+*#%@';

  // Shared look: letter size is pinned in px and the column count derived from
  // each element's width, so type renders identically across the whole page.
  const FONT_PX = 4.5;
  const INVERT = true;
  const GAMMA = 2.5;
  const FRAME_MS = 1000 / 20;
  const MIN_SIZE = 100;
  const TOUCH = window.matchMedia && window.matchMedia('(hover: none)').matches;

  const CELL_ASPECT = 0.5;

  function rowsFor(cols, aspect) {
    return Math.max(1, Math.round((cols / aspect) * CELL_ASPECT));
  }

  // Center-crop `source` to `aspect` and sample it down to a cols x rows grid of
  // luminance values. Shared by the ASCII pass and the segmentation mask.
  function sampleLums(source, cols, rows, targetAspect) {
    const sw = source.naturalWidth || source.videoWidth || source.width;
    const sh = source.naturalHeight || source.videoHeight || source.height;
    if (!sw || !sh) return null;

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

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cols, rows);

    let data;
    try {
      data = ctx.getImageData(0, 0, cols, rows).data;
    } catch (e) {
      return null;
    }

    const out = new Float32Array(cols * rows);
    for (let k = 0; k < out.length; k++) {
      const i = k * 4;
      out[k] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    }
    return out;
  }

  function rampChar(lum, invert, gamma) {
    const last = RAMP.length - 1;
    if (gamma && gamma !== 1) lum = Math.pow(lum, gamma);
    const level = Math.round(lum * last);
    return RAMP[invert ? last - level : level];
  }

  function sampleToAscii(source, cols, targetAspect, invert, gamma) {
    const sw = source.naturalWidth || source.videoWidth || source.width;
    const sh = source.naturalHeight || source.videoHeight || source.height;
    if (!sw || !sh) return '';
    const aspect = targetAspect || sw / sh;
    const rows = rowsFor(cols, aspect);
    const lums = sampleLums(source, cols, rows, aspect);
    if (!lums) return '';

    let out = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        out += rampChar(lums[y * cols + x], invert, gamma);
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

  // A cell is roughly 0.6em wide; the glyph sits below ~0.28 of the line box,
  // which is the empty band trimmed off the top edge of a masked silhouette.
  const GLYPH_TOP_GAP = 0.28;

  function colsFor(width, px) {
    return Math.max(20, Math.round(width / ((px || FONT_PX) * 0.6)));
  }

  // The overlay is positioned over the element rather than wrapping it, so the
  // element's own sizing is left untouched.
  function attachOverlay(el, live) {
    const parent = el.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    const data = el.dataset || {};
    const invert = data.asciiInvert !== undefined ? true : INVERT;
    const gamma = data.asciiGamma ? parseFloat(data.asciiGamma) : GAMMA;
    const fontPx = data.asciiFont ? parseFloat(data.asciiFont) : FONT_PX;

    const pre = document.createElement('pre');
    pre.className = 'ascii-overlay';
    pre.setAttribute('aria-hidden', 'true');

    // A segmentation mask clips the overlay to the subject so the rest of the
    // photo shows through. The mask is quantized to the character grid first —
    // masking the raw silhouette would slice through glyphs mid-shape.
    const maskImg = data.asciiMask ? new Image() : null;
    if (maskImg) maskImg.src = data.asciiMask;
    const cutoff = data.asciiMaskCutoff ? parseFloat(data.asciiMaskCutoff) : 0.5;

    const applyBlockMask = (cols, rows, aspect) => {
      const cover = sampleLums(maskImg, cols, rows, aspect);
      if (!cover) return;
      // Build the mask at the element's exact device-pixel size and snap every
      // block edge to a whole pixel. Any other size means the browser rescales
      // the mask and interpolates its alpha into a soft, blurry border.
      const dpr = window.devicePixelRatio || 1;
      const c = document.createElement('canvas');
      c.width = Math.round(el.offsetWidth * dpr);
      c.height = Math.round(el.offsetHeight * dpr);
      const cw = c.width / cols;
      const chh = c.height / rows;
      const cx = c.getContext('2d');
      cx.fillStyle = '#000';
      for (let y = 0; y < rows; y++) {
        const y1 = Math.round((y + 1) * chh);
        for (let x = 0; x < cols; x++) {
          const k = y * cols + x;
          if (cover[k] < cutoff) continue;
          // On the silhouette's top edge there is no row above to fill the
          // glyph's leading, so drop the cell's empty band and hug the letters.
          const exposed = y === 0 || cover[k - cols] < cutoff;
          const y0 = Math.round((y + (exposed ? GLYPH_TOP_GAP : 0)) * chh);
          const x0 = Math.round(x * cw), x1 = Math.round((x + 1) * cw);
          cx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
      const url = 'url("' + c.toDataURL() + '")';
      pre.style.webkitMaskImage = url;
      pre.style.maskImage = url;
      pre.style.webkitMaskSize = '100% 100%';
      pre.style.maskSize = '100% 100%';
      pre.style.webkitMaskRepeat = 'no-repeat';
      pre.style.maskRepeat = 'no-repeat';
    };

    parent.appendChild(pre);

    let cols = 90;

    const place = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      pre.style.left = el.offsetLeft + 'px';
      pre.style.top = el.offsetTop + 'px';
      pre.style.width = w + 'px';
      pre.style.height = h + 'px';
      pre.style.borderRadius = getComputedStyle(el).borderRadius;

      cols = colsFor(w, fontPx);
      const rows = rowsFor(cols, w / h);
      // Derive the type metrics from the box and the grid rather than from the
      // nominal font size: rounding cols/rows otherwise leaves the text short of
      // the bottom edge, and the mask blocks stop lining up with the characters.
      pre.style.fontSize = (w / cols / 0.6) + 'px';
      pre.style.lineHeight = (h / rows) + 'px';

      if (maskImg && maskImg.complete) applyBlockMask(cols, rows, w / h);
    };

    const paint = () => {
      const aspect = el.offsetWidth / el.offsetHeight;
      pre.textContent = sampleToAscii(el, cols, aspect, invert, gamma);
    };

    let raf = null;
    let lastDraw = 0;

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;
      paint();
    };

    const show = async () => {
      await whenReady(el);
      if (maskImg) await whenReady(maskImg);
      place();
      pre.classList.add('visible');
      if (live) {
        if (raf === null) raf = requestAnimationFrame(draw);
      } else {
        paint();
      }
    };

    const hide = () => {
      pre.classList.remove('visible');
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    };

    if (TOUCH) {
      el.addEventListener('click', () => {
        if (pre.classList.contains('visible')) hide();
        else show();
      });
    } else {
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
    }

    window.addEventListener('resize', () => {
      if (pre.classList.contains('visible')) place();
    });
  }


  function eligibleImage(img) {
    if (img.dataset.asciiMask) return false;
    const src = img.getAttribute('src') || '';
    if (/\.svg($|\?)/i.test(src)) return false;
    // GIFs are skipped: drawImage only samples the frame on screen, so the
    // overlay reads as a frozen still rather than the animation playing.
    if (/\.gif($|\?)/i.test(src)) return false;
    return img.offsetWidth >= MIN_SIZE && img.offsetHeight >= MIN_SIZE;
  }

  function init() {
    document.querySelectorAll('img[data-ascii-mask]').forEach((img) => {
      if (img.complete) attachOverlay(img, false);
      else img.addEventListener('load', () => attachOverlay(img, false), { once: true });
    });
    // Videos are hover-only: on touch there is no hover, and tapping a clip to
    // freeze it into ASCII is not what anyone expects from a playing video.
    if (!TOUCH) document.querySelectorAll('video').forEach((v) => attachOverlay(v, true));
    document.querySelectorAll('img').forEach((img) => {
      const attach = () => { if (eligibleImage(img)) attachOverlay(img, false); };
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
