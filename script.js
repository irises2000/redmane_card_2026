const canvas = document.getElementById("maneCanvas");
if (!canvas) {
  throw new Error('Cannot find canvas element with id "maneCanvas"');
}
const ctx = canvas.getContext("2d");

/* =========================
   기본 설정
========================= */
const BG_COLOR = "#c41e3a";

const MANE_SEGMENTS = 10;
const MANE_LENGTH_RATIO = 15;
const THICK_PORTION = 0.6;
const MANE_ROOT_JITTER = 3;

/* =========================
   텍스트 설정
========================= */
const CORNER_TEXT = "";
const CORNER_TEXT_COLOR = "rgba(255, 168, 168, 0.9)";
const CORNER_TEXT_FONT_FAMILY = '"MyEnglishFont", serif';
const CORNER_TEXT_WEIGHT = "400";
const CORNER_TEXT_SIZE = 18;
const CORNER_TEXT_LEFT = 24;
const CORNER_TEXT_BOTTOM = 24;

const LETTER_TEXT_COLOR = "rgba(255, 168, 168, 0.95)";
const LETTER_ENG_TEXT_COLOR = "rgba(255, 168, 168, 0.72)";
const LETTER_TEXT_FONT_FAMILY = '"MyLocalFont", serif';
const LETTER_ENG_FONT_FAMILY = '"MyEnglishFont", serif';

const LETTER_TEXT_WEIGHT = "150";
const LETTER_ENG_TEXT_WEIGHT = "400";

const LETTER_TEXT_SIZE_RATIO = 0.013;
const LETTER_ENG_TEXT_SIZE_RATIO = 0.008;
const LETTER_TEXT_START_OFFSET = 40;

const LETTER_KO_OFFSET_SCALE = 0.68;
const LETTER_ENG_OFFSET_SCALE = 0.42;

const ARC_KO_TEXT_SPACING_SCALE = 0.8;
const ARC_ENG_TEXT_SPACING_SCALE = 0.5;
const VERTICAL_KO_TEXT_SPACING_SCALE = 1.3;
const VERTICAL_ENG_TEXT_SPACING_SCALE = 1.5;

/* =========================
   구글 시트 CSV 주소
========================= */
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRKi5g-6wPn9FoAMVi82Exy8t1sluR2jNqjXgtB4eCB1U6ncqyl69d60CWrd10e4F_2eW2v7Gl9Jubs/pub?gid=0&single=true&output=csv";

/* =========================
   리본 / 구슬 설정
========================= */
const RIBBON_CAPTURE_RADIUS = 30;
const RIBBON_TOGGLE_RADIUS = 12;
const RIBBON_SNAP_STRENGTH = 0.97;
const BEAD_RADIUS = 8;
const MAX_BIND_COUNT = 10;

/* =========================
   사운드 설정
========================= */
const ribbonSound = new Audio("./horse.mp3");
ribbonSound.preload = "auto";

const HOLD_SOUND_DELAY = 2000;
let holdSoundTimer = null;
let holdSoundPlayed = false;

function playRibbonSound() {
  try {
    ribbonSound.currentTime = 0;
    ribbonSound.play().catch((err) => {
      console.warn("Sound play failed:", err);
    });
  } catch (err) {
    console.warn("Sound error:", err);
  }
}

function startHoldSoundTimer() {
  clearHoldSoundTimer();
  holdSoundPlayed = false;

  holdSoundTimer = setTimeout(() => {
    if (mouseDown && !holdSoundPlayed) {
      playRibbonSound();
      holdSoundPlayed = true;
    }
  }, HOLD_SOUND_DELAY);
}

function clearHoldSoundTimer() {
  if (holdSoundTimer) {
    clearTimeout(holdSoundTimer);
    holdSoundTimer = null;
  }
}

/* =========================
   클릭 / 드래그 판정
========================= */
const CLICK_MOVE_THRESHOLD = 6;
const CLICK_TIME_THRESHOLD = 10;
const TOUCH_TAP_TIME_THRESHOLD = 10;
const TOUCH_TAP_MOVE_THRESHOLD = 12;

/* =========================
   포인터 힘
========================= */
const POINTER_INFLUENCE_RADIUS = 70;
const POINTER_FORCE_MULTIPLIER = 20;

/* =========================
   전역 상태
========================= */
let manes = [];
let ribbons = [];
let sheetRows = [];
let selectedLetterRow = null;

let mouseX = 0;
let mouseY = 0;
let mouseDown = false;

let pointerStartX = 0;
let pointerStartY = 0;
let pointerCurrentX = 0;
let pointerCurrentY = 0;
let pointerDownTime = 0;
let pointerMoved = false;

/* =========================
   랜덤 구슬 색상
========================= */
function getRandomRibbonColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 65 + Math.random() * 25;
  const lightness = 35 + Math.random() * 20;

  return {
    base: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    mid: `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 12, 82)}%)`,
    highlight: `hsl(${hue}, ${Math.max(saturation - 10, 30)}%, ${Math.min(
      lightness + 28,
      92,
    )}%)`,
  };
}

/* =========================
   CSV 유틸
========================= */
function cleanCell(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/^"|"$/g, "")
    .replace(/""/g, '"')
    .replace(/\r/g, "")
    .trim();
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

async function loadSheetRows() {
  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const csv = await res.text();
    const rows = csv
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map(parseCSVLine);

    if (rows.length < 2) {
      sheetRows = [];
      selectedLetterRow = null;
      return;
    }

    const header = rows[0].map((v) => cleanCell(v).toLowerCase());
    const letterIndex = header.indexOf("letter");
    const engIndex = header.indexOf("eng");

    if (letterIndex === -1) {
      console.warn("CSV header must include 'letter'");
      console.log("Detected header:", header);
      sheetRows = [];
      selectedLetterRow = null;
      return;
    }

    sheetRows = rows
      .slice(1)
      .map((row) => ({
        letter: cleanCell(row[letterIndex]),
        eng: engIndex !== -1 ? cleanCell(row[engIndex]) : "",
      }))
      .filter((row) => row.letter);

    if (sheetRows.length > 0) {
      const randomIndex = Math.floor(Math.random() * sheetRows.length);
      selectedLetterRow = sheetRows[randomIndex];
    } else {
      selectedLetterRow = null;
    }
  } catch (err) {
    console.error("Failed to load sheet rows:", err);
    sheetRows = [];
    selectedLetterRow = null;
  }
}

/* =========================
   캔버스 / 갈기 배치
========================= */
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initManes();
}

function getLayoutValues() {
  const segmentLength = canvas.width / MANE_LENGTH_RATIO;
  const thickLimit = Math.floor((MANE_SEGMENTS + 1) * THICK_PORTION);
  const thickManeLength = thickLimit * segmentLength;

  const verticalRootX = canvas.width * 0.5;
  const R = verticalRootX;

  const cx = 0;
  const cy = thickManeLength + 40 + R;

  const startAngle = -Math.PI / 2;
  const endAngle = 0;

  const arcLen = R * (endAngle - startAngle);

  const endX = cx + R * Math.cos(endAngle);
  const endY = cy + R * Math.sin(endAngle);

  const vertLen = Math.max(0, canvas.height - endY);
  const totalLen = arcLen + vertLen;

  return {
    thickManeLength,
    cx,
    cy,
    R,
    startAngle,
    endAngle,
    arcLen,
    endX,
    endY,
    vertLen,
    totalLen,
  };
}

function initManes() {
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
    }

    const jitterX = (Math.random() - 0.5) * MANE_ROOT_JITTER;
    const jitterY = (Math.random() - 0.5) * MANE_ROOT_JITTER;

    manes.push(
      new ManeStrand(x + jitterX, y + jitterY, dirX, dirY, i, maneCount),
    );
  }
}

/* =========================
   갈기 클래스
========================= */
class ManeStrand {
  constructor(x, y, dirX, dirY, index, total) {
    this.index = index;
    this.segments = MANE_SEGMENTS;
    this.segmentLength = (canvas.width * 0.5) / MANE_SEGMENTS;

    this.points = [];
    this.velocities = [];
    this.touched = false;
    this.touchStrength = 0;
    this.windPhase = Math.random() * Math.PI * 2;
    this.windSpeed = 0.04 + Math.random() * 0.02;
    this.bindings = [];

    const t = index / Math.max(total - 1, 1);
    const hue = 0;
    const saturation = 90 - t * 80;
    const lightness = 52 + t * 38;
    const rootLightness = 70 + t * 24;

    this.color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    this.rootColor = `hsl(${hue}, ${Math.max(saturation - 10, 5)}%, ${rootLightness}%)`;

    for (let i = 0; i <= this.segments; i++) {
      const px = x + i * this.segmentLength * dirX;
      const py = y + i * this.segmentLength * dirY;

      this.points.push({
        x: px,
        y: py,
        baseX: px,
        baseY: py,
      });

      this.velocities.push({ x: 0, y: 0 });
    }
  }

  getBindings() {
    return this.bindings
      .map((binding) => {
        const ribbon = ribbons.find((r) => r.id === binding.ribbonId);
        if (!ribbon) return null;
        return {
          ribbon,
          segmentIndex: binding.segmentIndex,
        };
      })
      .filter(Boolean);
  }

  isSegmentBound(segmentIndex) {
    return this.bindings.some((b) => b.segmentIndex === segmentIndex);
  }

  bindToRibbon(ribbonId, segmentIndex) {
    if (this.isSegmentBound(segmentIndex)) return false;

    this.bindings.push({ ribbonId, segmentIndex });
    return true;
  }

  unbindRibbon(ribbonId) {
    this.bindings = this.bindings.filter((b) => b.ribbonId !== ribbonId);
  }

  update(mouseX, mouseY, mouseDown) {
    this.points[0].x = this.points[0].baseX;
    this.points[0].y = this.points[0].baseY;

    this.windPhase += this.windSpeed;

    for (let i = 1; i < this.points.length; i++) {
      const dx = mouseX - this.points[i].x;
      const dy = mouseY - this.points[i].y;
      const dist = Math.hypot(dx, dy);

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

    const bindings = this.getBindings();

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

      const bindingAtPoint = bindings.find((b) => b.segmentIndex === i);
      const returnStrength = bindingAtPoint ? 0 : 0.035;

      this.velocities[i].x +=
        (this.points[i].baseX - this.points[i].x) * returnStrength;
      this.velocities[i].y +=
        (this.points[i].baseY - this.points[i].y) * returnStrength;

      if (bindingAtPoint) {
        const targetRibbon = bindingAtPoint.ribbon;

        this.velocities[i].x *= 0.35;
        this.velocities[i].y *= 0.35;

        this.points[i].x +=
          (targetRibbon.x - this.points[i].x) * RIBBON_SNAP_STRENGTH;
        this.points[i].y +=
          (targetRibbon.y - this.points[i].y) * RIBBON_SNAP_STRENGTH;
      }

      this.points[i].x += this.velocities[i].x;
      this.points[i].y += this.velocities[i].y;

      this.velocities[i].x *= 0.52;
      this.velocities[i].y *= 0.52;
    }

    for (let pass = 0; pass < 3; pass++) {
      this.points[0].x = this.points[0].baseX;
      this.points[0].y = this.points[0].baseY;

      this.getBindings().forEach(({ ribbon, segmentIndex }) => {
        this.points[segmentIndex].x = ribbon.x;
        this.points[segmentIndex].y = ribbon.y;
      });

      for (let i = 1; i < this.points.length; i++) {
        const dx = this.points[i].x - this.points[i - 1].x;
        const dy = this.points[i].y - this.points[i - 1].y;
        const dist = Math.hypot(dx, dy) || 0.0001;
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

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.shadowBlur = 7;
    ctx.shadowColor = this.rootColor;
    ctx.stroke();
    ctx.restore();
  }
}

/* =========================
   spine 텍스트
========================= */
function getLetterFontSize() {
  return Math.max(24, canvas.width * LETTER_TEXT_SIZE_RATIO);
}

function getEngFontSize() {
  return Math.max(18, canvas.width * LETTER_ENG_TEXT_SIZE_RATIO);
}

function setSpineTextStyle(type = "ko") {
  if (type === "eng") {
    ctx.font = `${LETTER_ENG_TEXT_WEIGHT} ${getEngFontSize()}px ${LETTER_ENG_FONT_FAMILY}`;
    ctx.fillStyle = LETTER_ENG_TEXT_COLOR;
  } else {
    ctx.font = `${LETTER_TEXT_WEIGHT} ${getLetterFontSize()}px ${LETTER_TEXT_FONT_FAMILY}`;
    ctx.fillStyle = LETTER_TEXT_COLOR;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

function measureTextSequence(text, type = "ko") {
  setSpineTextStyle(type);

  const widths = [];
  let total = 0;

  for (const char of text) {
    const width = ctx.measureText(char).width;
    widths.push(width);
    total += width;
  }

  return { widths, total };
}

function getPointOnSpine(distance) {
  const layout = getLayoutValues();

  if (distance <= layout.arcLen) {
    const u = layout.arcLen > 0 ? distance / layout.arcLen : 0;
    const angle = layout.startAngle + u * (layout.endAngle - layout.startAngle);

    return {
      x: layout.cx + layout.R * Math.cos(angle),
      y: layout.cy + layout.R * Math.sin(angle),
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

function drawStackedTextSequenceOnSpine(koText, engText, startDistance) {
  const layout = getLayoutValues();
  const ko = koText || "";
  const eng = engText || "";

  if (!ko && !eng) return startDistance;

  const koMeasure = measureTextSequence(ko, "ko");
  const engMeasure = measureTextSequence(eng, "eng");

  let cursor = startDistance;
  const maxLength = Math.max(ko.length, eng.length);

  for (let i = 0; i < maxLength; i++) {
    const koChar = ko[i] || "";
    const engChar = eng[i] || "";

    const koWidthRaw = koChar ? koMeasure.widths[i] || 0 : 0;
    const engWidthRaw = engChar ? engMeasure.widths[i] || 0 : 0;

    const probeDistance = cursor + Math.max(koWidthRaw, engWidthRaw, 6) / 2;
    const isArc = probeDistance <= layout.arcLen;

    const koWidth =
      koWidthRaw *
      (isArc ? ARC_KO_TEXT_SPACING_SCALE : VERTICAL_KO_TEXT_SPACING_SCALE);

    const engWidth =
      engWidthRaw *
      (isArc ? ARC_ENG_TEXT_SPACING_SCALE : VERTICAL_ENG_TEXT_SPACING_SCALE);

    const stepWidth = Math.max(koWidth, engWidth, 6);
    const charCenter = cursor + stepWidth / 2;

    if (charCenter >= layout.totalLen) break;

    const p = getPointOnSpine(charCenter);

    if (koChar) {
      setSpineTextStyle("ko");
      ctx.save();
      ctx.translate(
        p.x + p.normalX * (layout.thickManeLength * LETTER_KO_OFFSET_SCALE),
        p.y + p.normalY * (layout.thickManeLength * LETTER_KO_OFFSET_SCALE),
      );
      ctx.rotate(p.tangentAngle);
      ctx.fillText(koChar, 0, 0);
      ctx.restore();
    }

    if (engChar) {
      setSpineTextStyle("eng");
      ctx.save();
      ctx.translate(
        p.x + p.normalX * (layout.thickManeLength * LETTER_ENG_OFFSET_SCALE),
        p.y + p.normalY * (layout.thickManeLength * LETTER_ENG_OFFSET_SCALE),
      );
      ctx.rotate(p.tangentAngle);
      ctx.fillText(engChar, 0, 0);
      ctx.restore();
    }

    cursor += stepWidth;
  }

  return cursor;
}

function drawSelectedLetterOnSpine() {
  if (!selectedLetterRow) return;
  drawStackedTextSequenceOnSpine(
    selectedLetterRow.letter || "",
    selectedLetterRow.eng || "",
    LETTER_TEXT_START_OFFSET,
  );
}

function drawCornerText() {
  if (!CORNER_TEXT) return;

  ctx.save();
  ctx.font = `${CORNER_TEXT_WEIGHT} ${CORNER_TEXT_SIZE}px ${CORNER_TEXT_FONT_FAMILY}`;
  ctx.fillStyle = CORNER_TEXT_COLOR;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    CORNER_TEXT,
    CORNER_TEXT_LEFT,
    canvas.height - CORNER_TEXT_BOTTOM,
  );
  ctx.restore();
}

/* =========================
   리본 생성 / 제거
========================= */
function createRibbon(x, y) {
  const id = `${Date.now()}-${Math.random()}`;
  const candidateBindings = [];

  manes.forEach((mane) => {
    let bestIndex = -1;
    let bestDist = Infinity;

    for (let i = 1; i < mane.points.length; i++) {
      if (mane.isSegmentBound(i)) continue;

      const dx = x - mane.points[i].x;
      const dy = y - mane.points[i].y;
      const dist = Math.hypot(dx, dy);

      if (dist < RIBBON_CAPTURE_RADIUS && dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    if (bestIndex !== -1) {
      candidateBindings.push({
        mane,
        segmentIndex: bestIndex,
        dist: bestDist,
      });
    }
  });

  if (candidateBindings.length === 0) return;

  candidateBindings.sort((a, b) => a.dist - b.dist);

  const ribbon = {
    id,
    x,
    y,
    color: getRandomRibbonColor(),
  };

  ribbons.push(ribbon);

  candidateBindings
    .slice(0, MAX_BIND_COUNT)
    .forEach(({ mane, segmentIndex }) => {
      mane.bindToRibbon(id, segmentIndex);
    });
}

function removeRibbon(ribbonId) {
  ribbons = ribbons.filter((r) => r.id !== ribbonId);
  manes.forEach((mane) => mane.unbindRibbon(ribbonId));
}

function findRibbonAtPoint(x, y) {
  let hitRibbon = null;
  let bestDist = Infinity;

  ribbons.forEach((ribbon) => {
    const dist = Math.hypot(x - ribbon.x, y - ribbon.y);
    if (dist < RIBBON_TOGGLE_RADIUS && dist < bestDist) {
      bestDist = dist;
      hitRibbon = ribbon;
    }
  });

  return hitRibbon;
}

/* =========================
   리본 렌더링
========================= */
function drawRibbon(ribbon) {
  ctx.save();
  ctx.translate(ribbon.x, ribbon.y);

  const beadGradient = ctx.createRadialGradient(
    -BEAD_RADIUS * 0.28,
    -BEAD_RADIUS * 0.3,
    BEAD_RADIUS * 0.08,
    0,
    0,
    BEAD_RADIUS,
  );

  beadGradient.addColorStop(0, ribbon.color.highlight);
  beadGradient.addColorStop(0.22, ribbon.color.mid);
  beadGradient.addColorStop(0.5, ribbon.color.base);
  beadGradient.addColorStop(1, ribbon.color.base);

  ctx.beginPath();
  ctx.arc(0, 0, BEAD_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = beadGradient;
  ctx.fill();

  ctx.restore();
}

function drawRibbons() {
  ribbons.forEach(drawRibbon);
}

function handleBindTap(x, y) {
  const existingRibbon = findRibbonAtPoint(x, y);

  if (existingRibbon) {
    removeRibbon(existingRibbon.id);
    return;
  }

  createRibbon(x, y);
}

/* =========================
   포인터 입력 처리
========================= */
function beginPointer(x, y) {
  mouseX = x;
  mouseY = y;
  mouseDown = true;

  pointerStartX = x;
  pointerStartY = y;
  pointerCurrentX = x;
  pointerCurrentY = y;
  pointerDownTime = performance.now();
  pointerMoved = false;

  startHoldSoundTimer();
}

function movePointer(x, y) {
  mouseX = x;
  mouseY = y;
  pointerCurrentX = x;
  pointerCurrentY = y;

  if (
    Math.hypot(
      pointerCurrentX - pointerStartX,
      pointerCurrentY - pointerStartY,
    ) > CLICK_MOVE_THRESHOLD
  ) {
    pointerMoved = true;
  }
}

function endPointer(x, y, isTouch = false) {
  mouseX = x;
  mouseY = y;
  pointerCurrentX = x;
  pointerCurrentY = y;

  const duration = performance.now() - pointerDownTime;
  const dist = Math.hypot(
    pointerCurrentX - pointerStartX,
    pointerCurrentY - pointerStartY,
  );

  const moveThreshold = isTouch
    ? TOUCH_TAP_MOVE_THRESHOLD
    : CLICK_MOVE_THRESHOLD;
  const timeThreshold = isTouch
    ? TOUCH_TAP_TIME_THRESHOLD
    : CLICK_TIME_THRESHOLD;

  const isClick =
    !pointerMoved && dist <= moveThreshold && duration <= timeThreshold;

  if (isClick) {
    handleBindTap(x, y);
  }

  mouseDown = false;
  clearHoldSoundTimer();
}

function cancelPointer() {
  mouseDown = false;
  clearHoldSoundTimer();
}

function getCanvasPointFromMouseEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function getCanvasPointFromTouch(touch) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  };
}

/* =========================
   이벤트 등록
========================= */
canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasPointFromMouseEvent(e);

  if (mouseDown) {
    movePointer(x, y);
  } else {
    mouseX = x;
    mouseY = y;
  }
});

canvas.addEventListener("mousedown", (e) => {
  const { x, y } = getCanvasPointFromMouseEvent(e);
  beginPointer(x, y);
});

canvas.addEventListener("mouseup", (e) => {
  const { x, y } = getCanvasPointFromMouseEvent(e);
  endPointer(x, y);
});

canvas.addEventListener("mouseleave", () => {
  cancelPointer();
});

canvas.addEventListener(
  "touchstart",
  (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    const { x, y } = getCanvasPointFromTouch(touch);
    beginPointer(x, y);
  },
  { passive: true },
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const { x, y } = getCanvasPointFromTouch(touch);
    movePointer(x, y);
  },
  { passive: false },
);

canvas.addEventListener("touchend", () => {
  endPointer(pointerCurrentX, pointerCurrentY, true);
});

canvas.addEventListener("touchcancel", () => {
  cancelPointer();
});

/* =========================
   렌더 루프
========================= */
function animate() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawSelectedLetterOnSpine();
  drawCornerText();

  manes.forEach((mane) => {
    mane.update(mouseX, mouseY, mouseDown);
    mane.draw();
  });

  drawRibbons();
  requestAnimationFrame(animate);
}

/* =========================
   시작
========================= */
async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  await document.fonts.load('16px "MyLocalFont"');
  await document.fonts.load('16px "MyEnglishFont"');
  await document.fonts.ready;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await loadSheetRows();
  animate();
}

init();
