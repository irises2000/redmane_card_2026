import {
  canvas,
  ctx,
  MANE_SEGMENTS,
  MANE_LENGTH_RATIO,
  THICK_PORTION,
  MANE_ROOT_JITTER,
  POINTER_INFLUENCE_RADIUS,
  POINTER_FORCE_MULTIPLIER,
  RIBBON_SNAP_STRENGTH,
  GREETING_TEXT,
  TEXT_COLOR,
  TEXT_FONT_FAMILY,
  TEXT_WEIGHT,
  TEXT_SIZE_RATIO,
  TEXT_START_OFFSET,
} from "./config.js";

let manes = [];

export function getManes() {
  return manes;
}

export function setManes(next) {
  manes = next;
}

export function getLayoutValues() {
  const segmentLength = canvas.width / MANE_LENGTH_RATIO;
  const fullManeLength = MANE_SEGMENTS * segmentLength;

  const thickLimit = Math.floor((MANE_SEGMENTS + 1) * THICK_PORTION);
  const thickManeLength = thickLimit * segmentLength;

  const verticalRootX = canvas.width * 0.5;
  const R = verticalRootX;

  const cx = 0;
  const cy = thickManeLength + R;

  const startAngle = -Math.PI / 2;
  const endAngle = 0;

  const arcLen = R * (endAngle - startAngle);

  const endX = cx + R * Math.cos(endAngle);
  const endY = cy + R * Math.sin(endAngle);

  const vertLen = Math.max(0, canvas.height - endY);
  const totalLen = arcLen + vertLen;

  return {
    segmentLength,
    fullManeLength,
    thickManeLength,
    thickLimit,
    verticalRootX,
    R,
    cx,
    cy,
    startAngle,
    endAngle,
    arcLen,
    endX,
    endY,
    vertLen,
    totalLen,
  };
}

export function initManes(getRibbonById) {
  manes = [];

  const layout = getLayoutValues();
  const spacing = 4;
  const maneCount = Math.max(2, Math.floor(layout.totalLen / spacing));

  for (let i = 0; i < maneCount; i++) {
    const t = i / (maneCount - 1);
    const dist = t * layout.totalLen;

    let x, y;
    let dirX = 1;
    let dirY = 0;

    if (dist <= layout.arcLen) {
      const u = dist / layout.arcLen;
      const angle =
        layout.startAngle + u * (layout.endAngle - layout.startAngle);

      x = layout.cx + layout.R * Math.cos(angle);
      y = layout.cy + layout.R * Math.sin(angle);

      const vx = x - layout.cx;
      const vy = y - layout.cy;
      const len = Math.hypot(vx, vy) || 1;
      dirX = vx / len;
      dirY = vy / len;
    } else {
      const u =
        layout.vertLen > 0 ? (dist - layout.arcLen) / layout.vertLen : 0;
      x = layout.endX;
      y = layout.endY + u * layout.vertLen;
      dirX = 1;
      dirY = 0;
    }

    manes.push(new ManeStrand(x, y, dirX, dirY, i, maneCount, getRibbonById));
  }
}

class ManeStrand {
  constructor(x, y, dirX, dirY, index, total, getRibbonById) {
    this.baseX = x;
    this.baseY = y;
    this.dirX = dirX;
    this.dirY = dirY;
    this.index = index;
    this.segments = MANE_SEGMENTS;
    this.segmentLength = (canvas.width * 0.5) / MANE_SEGMENTS;
    this.points = [];
    this.velocities = [];
    this.touched = false;
    this.touchStrength = 0;
    this.windPhase = Math.random() * Math.PI * 2;
    this.windSpeed = 0.02 + Math.random() * 0.015;
    this.boundRibbonId = null;
    this.boundSegmentIndex = null;
    this.getRibbonById = getRibbonById;

    const hue = 5 + (index / total) * 20;
    this.color = `hsl(${hue}, 85%, 55%)`;
    this.rootColor = `hsl(${hue}, 95%, 72%)`;

    for (let i = 0; i <= this.segments; i++) {
      const px = x + i * this.segmentLength * this.dirX;
      const py = y + i * this.segmentLength * this.dirY;

      this.points.push({ x: px, y: py, baseX: px, baseY: py });
      this.velocities.push({ x: 0, y: 0 });
    }
  }

  getBoundRibbon() {
    if (this.boundRibbonId === null) return null;
    return this.getRibbonById(this.boundRibbonId);
  }

  bindToRibbon(ribbonId, segmentIndex) {
    this.boundRibbonId = ribbonId;
    this.boundSegmentIndex = segmentIndex;
  }

  unbindRibbon() {
    this.boundRibbonId = null;
    this.boundSegmentIndex = null;
  }

  update(mouseX, mouseY, mouseDown) {
    this.points[0].x = this.points[0].baseX;
    this.points[0].y = this.points[0].baseY;

    this.windPhase += this.windSpeed;

    for (let i = 1; i < this.points.length; i++) {
      const dx = mouseX - this.points[i].x;
      const dy = mouseY - this.points[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < POINTER_INFLUENCE_RADIUS && mouseDown) {
        this.touched = true;
        this.touchStrength = Math.max(
          this.touchStrength,
          1 - dist / POINTER_INFLUENCE_RADIUS,
        );

        const force =
          (POINTER_INFLUENCE_RADIUS - dist) / POINTER_INFLUENCE_RADIUS;

        if (dist > 0.0001) {
          this.velocities[i].x +=
            (dx / dist) * force * POINTER_FORCE_MULTIPLIER;
          this.velocities[i].y +=
            (dy / dist) * force * POINTER_FORCE_MULTIPLIER;
        }
      }
    }

    const boundRibbon = this.getBoundRibbon();

    for (let i = 1; i < this.points.length; i++) {
      this.velocities[i].y += 0.15;

      const windStrength = Math.sin(this.windPhase + i * 0.3) * 0.3;
      this.velocities[i].x += windStrength * 0.1;
      this.velocities[i].y += Math.cos(this.windPhase + i * 0.5) * 0.08;

      if (this.touched) {
        this.velocities[i].x +=
          (Math.random() - 0.5) * this.touchStrength * 0.35;
        this.velocities[i].y +=
          (Math.random() - 0.5) * this.touchStrength * 0.35;
      }

      const isBoundPoint = boundRibbon && i === this.boundSegmentIndex;
      const returnStrength = isBoundPoint ? 0 : 0.035;

      this.velocities[i].x +=
        (this.points[i].baseX - this.points[i].x) * returnStrength;
      this.velocities[i].y +=
        (this.points[i].baseY - this.points[i].y) * returnStrength;

      if (boundRibbon && i === this.boundSegmentIndex) {
        this.velocities[i].x *= 0.35;
        this.velocities[i].y *= 0.35;

        this.points[i].x +=
          (boundRibbon.x - this.points[i].x) * RIBBON_SNAP_STRENGTH;
        this.points[i].y +=
          (boundRibbon.y - this.points[i].y) * RIBBON_SNAP_STRENGTH;
      }

      this.points[i].x += this.velocities[i].x;
      this.points[i].y += this.velocities[i].y;

      this.velocities[i].x *= 0.52;
      this.velocities[i].y *= 0.52;
    }

    for (let pass = 0; pass < 3; pass++) {
      this.points[0].x = this.points[0].baseX;
      this.points[0].y = this.points[0].baseY;

      const ribbonNow = this.getBoundRibbon();
      if (ribbonNow && this.boundSegmentIndex !== null) {
        const idx = this.boundSegmentIndex;
        this.points[idx].x = ribbonNow.x;
        this.points[idx].y = ribbonNow.y;
      }

      for (let i = 1; i < this.points.length; i++) {
        const dx = this.points[i].x - this.points[i - 1].x;
        const dy = this.points[i].y - this.points[i - 1].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const diff = this.segmentLength - dist;
        const percent = diff / dist;

        const offsetX = dx * percent * 0.5;
        const offsetY = dy * percent * 0.5;

        if (i - 1 !== 0) {
          this.points[i - 1].x -= offsetX;
          this.points[i - 1].y -= offsetY;
        }

        this.points[i].x += offsetX;
        this.points[i].y += offsetY;
      }
    }

    this.touchStrength *= 0.95;
    if (this.touchStrength < 0.01) {
      this.touched = false;
    }
  }

  draw() {
    ctx.save();

    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);

    for (let i = 1; i < this.points.length - 1; i++) {
      const xc = (this.points[i].x + this.points[i + 1].x) / 2;
      const yc = (this.points[i].y + this.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(this.points[i].x, this.points[i].y, xc, yc);
    }

    const last = this.points[this.points.length - 1];
    ctx.lineTo(last.x, last.y);

    const gradient = ctx.createLinearGradient(
      this.points[0].x,
      this.points[0].y,
      last.x,
      last.y,
    );
    gradient.addColorStop(0, this.rootColor);
    gradient.addColorStop(0.15, this.color);
    gradient.addColorStop(0.5, this.color);
    gradient.addColorStop(1, "rgba(196, 30, 58, 0)");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.rootColor;
    ctx.stroke();

    ctx.restore();
  }
}

export function updateAndDrawManes(mouseX, mouseY, mouseDown) {
  manes.forEach((mane) => {
    mane.update(mouseX, mouseY, mouseDown);
    mane.draw();
  });
}

function getTextFontSize() {
  return Math.max(18, canvas.width * TEXT_SIZE_RATIO);
}

function setTextStyle() {
  const fontSize = getTextFontSize();
  ctx.font = `${TEXT_WEIGHT} ${fontSize}px ${TEXT_FONT_FAMILY}`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

function measureTextSequence(text) {
  setTextStyle();
  const widths = [];
  let total = 0;

  for (const char of text) {
    const w = ctx.measureText(char).width;
    widths.push(w);
    total += w;
  }

  return { widths, total };
}

function getPointOnSpine(distance) {
  const layout = getLayoutValues();

  if (distance <= layout.arcLen) {
    const u = layout.arcLen > 0 ? distance / layout.arcLen : 0;
    const angle = layout.startAngle + u * (layout.endAngle - layout.startAngle);

    const x = layout.cx + layout.R * Math.cos(angle);
    const y = layout.cy + layout.R * Math.sin(angle);

    return {
      x,
      y,
      tangentAngle: angle + Math.PI / 2,
      normalX: Math.cos(angle),
      normalY: Math.sin(angle),
    };
  }

  const d = distance - layout.arcLen;
  const u = layout.vertLen > 0 ? d / layout.vertLen : 0;

  return {
    x: layout.endX,
    y: layout.endY + u * layout.vertLen,
    tangentAngle: Math.PI / 2,
    normalX: 1,
    normalY: 0,
  };
}

export function drawTextOnSpine() {
  const layout = getLayoutValues();
  setTextStyle();

  const text = GREETING_TEXT;
  const { widths, total } = measureTextSequence(text);
  if (total <= 0) return;

  const textOffset = layout.thickManeLength * 0.5;
  let cursor = TEXT_START_OFFSET;

  for (let i = 0; i < text.length; i++) {
    const charWidth = widths[i];
    const charCenter = cursor + charWidth / 2;
    if (charCenter >= layout.totalLen) break;

    const p = getPointOnSpine(charCenter);
    const drawX = p.x + p.normalX * textOffset;
    const drawY = p.y + p.normalY * textOffset;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(p.tangentAngle);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();

    cursor += charWidth;
  }
}
