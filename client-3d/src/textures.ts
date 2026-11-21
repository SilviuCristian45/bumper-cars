import * as THREE from 'three';

// Procedural textures drawn on a 2D canvas at startup (no external assets).

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Diamond-plate steel, tiled across the floor. */
export function diamondPlate(size: number): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  g.fillStyle = '#6d6a78';
  g.fillRect(0, 0, size, size);
  const n = 4;
  const cell = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = (i + 0.5) * cell;
      const cy = (j + 0.5) * cell;
      const angle = (i + j) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
      g.save();
      g.translate(cx, cy);
      g.rotate(angle);
      g.fillStyle = '#8f8c9c';
      g.fillRect(-cell * 0.32, -cell * 0.07, cell * 0.64, cell * 0.14);
      g.fillStyle = '#4c4957';
      g.fillRect(-cell * 0.32, cell * 0.03, cell * 0.64, cell * 0.04);
      g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dark red and black hazard stripes for the floor lost to the shrinking ring. */
export function hazardStripes(size: number): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  g.fillStyle = '#16091d';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#4a1022';
  // Two diagonal bands per tile, drawn three times so they wrap seamlessly.
  for (let k = -1; k <= 1; k++) {
    for (const start of [0, 0.5]) {
      const x0 = (start + k) * size;
      g.beginPath();
      g.moveTo(x0, size);
      g.lineTo(x0 + size * 0.25, size);
      g.lineTo(x0 + size * 1.25, 0);
      g.lineTo(x0 + size, 0);
      g.closePath();
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft white dot for sparks and glows (additive blending). */
export function glowDot(size = 64): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dark blob under a car when real shadows are off. */
export function blobShadow(size = 64): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
