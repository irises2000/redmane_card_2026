import {
  ctx,
  RIBBON_CAPTURE_RADIUS,
  RIBBON_TOGGLE_RADIUS,
  BEAD_RADIUS,
  getRandomRibbonColor,
} from "./config.js";

let ribbons = [];

export function getRibbons() {
  return ribbons;
}

export function getRibbonById(id) {
  return ribbons.find((r) => r.id === id) || null;
}

export function createRibbon(x, y, manes) {
  const id = `${Date.now()}-${Math.random()}`;
  const MAX_BIND_COUNT = 15;
  const candidateBindings = [];

  manes.forEach((mane) => {
    if (mane.boundRibbonId !== null) return;

    let bestIndex = -1;
    let bestDist = Infinity;

    for (let i = 1; i < mane.points.length; i++) {
      const dx = x - mane.points[i].x;
      const dy = y - mane.points[i].y;
      const dist = Math.hypot(dx, dy);

      if (dist < RIBBON_CAPTURE_RADIUS && dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    if (bestIndex !== -1) {
      candidateBindings.push({ mane, segmentIndex: bestIndex, dist: bestDist });
    }
  });

  if (candidateBindings.length === 0) return;

  candidateBindings.sort((a, b) => a.dist - b.dist);
  const selectedBindings = candidateBindings.slice(0, MAX_BIND_COUNT);

  const ribbon = {
    id,
    x,
    y,
    color: getRandomRibbonColor(),
  };

  ribbons.push(ribbon);

  selectedBindings.forEach(({ mane, segmentIndex }) => {
    mane.bindToRibbon(id, segmentIndex);
  });
}

export function removeRibbon(ribbonId, manes) {
  ribbons = ribbons.filter((r) => r.id !== ribbonId);

  manes.forEach((mane) => {
    if (mane.boundRibbonId === ribbonId) {
      mane.unbindRibbon();
    }
  });
}

export function findRibbonAtPoint(x, y) {
  let hitRibbon = null;
  let bestDist = Infinity;

  ribbons.forEach((ribbon) => {
    const dx = x - ribbon.x;
    const dy = y - ribbon.y;
    const dist = Math.hypot(dx, dy);

    if (dist < RIBBON_TOGGLE_RADIUS && dist < bestDist) {
      bestDist = dist;
      hitRibbon = ribbon;
    }
  });

  return hitRibbon;
}

export function handleBindTap(x, y, manes) {
  const existingRibbon = findRibbonAtPoint(x, y);
  if (existingRibbon) {
    removeRibbon(existingRibbon.id, manes);
    return;
  }
  createRibbon(x, y, manes);
}

function drawRibbon(ribbon) {
  ctx.save();
  ctx.translate(ribbon.x, ribbon.y);

  const radius = BEAD_RADIUS;
  const beadGradient = ctx.createRadialGradient(
    -radius * 0.28,
    -radius * 0.3,
    radius * 0.08,
    0,
    0,
    radius,
  );

  beadGradient.addColorStop(0, ribbon.color.highlight);
  beadGradient.addColorStop(0.22, ribbon.color.mid);
  beadGradient.addColorStop(0.5, ribbon.color.base);
  beadGradient.addColorStop(1, ribbon.color.base);

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = beadGradient;
  ctx.fill();

  ctx.restore();
}

export function drawRibbons() {
  ribbons.forEach(drawRibbon);
}
