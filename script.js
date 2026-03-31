const canvas = document.getElementById("maneCanvas");
if (!canvas) {
  throw new Error('Cannot find canvas element with id "maneCanvas"');
}
const ctx = canvas.getContext("2d");

/* =========================
   1) 기본 비주얼 설정
========================= */
const BG_COLOR = "#c41e3a";
const SPINE_COLOR = "#c41e3a";

const MANE_SEGMENTS = 10;
const MANE_LENGTH_RATIO = 15;
const THICK_PORTION = 0.6;
const MANE_ROOT_JITTER = 3;

/* =========================
   2) 텍스트 설정
========================= */
let GREETING_TEXT = "";
const TEXT_COLOR = "rgba(255, 235, 215, 0.9)";
const TEXT_FONT_FAMILY = '"Times New Roman", serif';
const TEXT_WEIGHT = "150";
const TEXT_SIZE_RATIO = 0.01;
const TEXT_START_OFFSET = 40;

/* =========================
   3) 구글 시트 CSV 주소 / 쓰기 주소
========================= */
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRKi5g-6wPn9FoAMVi82Exy8t1sluR2jNqjXgtB4eCB1U6ncqyl69d60CWrd10e4F_2eW2v7Gl9Jubs/pub?gid=0&single=true&output=csv";

const SHEET_WRITE_URL =
  "https://script.google.com/macros/s/AKfycbz22r6ASublThTUX5_0DW6uXt3BI6Jmt-9VXJEmipJOSeswsfswD8Ji9Zegz02QvSZAPg/exec";

/* =========================
   4) 구슬/묶임 설정
========================= */
const RIBBON_CAPTURE_RADIUS = 40;
const RIBBON_TOGGLE_RADIUS = 12;
const RIBBON_BIND_STRENGTH = 0.42;
const RIBBON_DAMPING = 0.72;
const RIBBON_SIZE = 12;
const RIBBON_SNAP_STRENGTH = 0.97;
const BEAD_RADIUS = 8;

/* =========================
   5) 클릭 / 드래그 판정
========================= */
const CLICK_MOVE_THRESHOLD = 6;
const CLICK_TIME_THRESHOLD = 10;
const TOUCH_TAP_TIME_THRESHOLD = 10;
const TOUCH_TAP_MOVE_THRESHOLD = 12;

/* =========================
   6) 마우스 힘
========================= */
const POINTER_INFLUENCE_RADIUS = 70;
const POINTER_FORCE_MULTIPLIER = 20;

/* =========================
   7) 전역 상태값
========================= */
let manes = [];
let ribbons = [];
let sheetRows = [];

let mouseX = 0;
let mouseY = 0;
let mouseDown = false;

let pointerStartX = 0;
let pointerStartY = 0;
let pointerCurrentX = 0;
let pointerCurrentY = 0;
let pointerDownTime = 0;
let pointerMoved = false;

let arcCenterX = 0;
let arcCenterY = 0;
let arcRadius = 0;
let arcEndX = 0;
let arcEndY = 0;

/* =========================
   8) 랜덤 구슬 색상
========================= */
function getRandomRibbonColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 65 + Math.random() * 25;
  const lightness = 35 + Math.random() * 20;

  return {
    h: hue,
    s: saturation,
    l: lightness,
    base: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    mid: `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 12, 82)}%)`,
    highlight: `hsl(${hue}, ${Math.max(saturation - 10, 30)}%, ${Math.min(
      lightness + 28,
      92,
    )}%)`,
  };
}

/* =========================
   9) 색 혼합 유틸
========================= */
function colorToRGB(color) {
  const temp = document.createElement("canvas");
  const tctx = temp.getContext("2d");
  tctx.fillStyle = color;
  const parsed = tctx.fillStyle;
  const match = parsed.match(/\d+/g);

  if (!match || match.length < 3) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Number(match[0]),
    g: Number(match[1]),
    b: Number(match[2]),
  };
}

function mixWithWhite(color, amount = 0.5) {
  const { r, g, b } = colorToRGB(color);

  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);

  return `rgb(${nr}, ${ng}, ${nb})`;
}

/* =========================
   10) 시트 유틸
========================= */
function cleanCell(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/^"|"$/g, "")
    .replace(/""/g, '"')
    .replace(/\r/g, "")
    .trim();
}

function normalizeName(value) {
  return cleanCell(value).normalize("NFC").replace(/\s+/g, "").toLowerCase();
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
      return;
    }

    const header = rows[0].map((v) => cleanCell(v).toLowerCase());
    const nameIndex = header.indexOf("name");
    const letterIndex = header.indexOf("letter");

    if (nameIndex === -1 || letterIndex === -1) {
      console.warn("CSV header must include 'name' and 'letter'");
      console.log("Detected header:", header);
      sheetRows = [];
      return;
    }

    sheetRows = rows
      .slice(1)
      .map((row) => ({
        name: cleanCell(row[nameIndex]),
        letter: cleanCell(row[letterIndex]),
      }))
      .filter((row) => row.name);

    console.log("Loaded rows:", sheetRows);
  } catch (err) {
    console.error("Failed to load sheet rows:", err);
    sheetRows = [];
  }
}

function findLetterRowByName(inputName) {
  const normalizedInput = normalizeName(inputName);
  return sheetRows.find((row) => normalizeName(row.name) === normalizedInput);
}

async function addNameToSheet(name) {
  try {
    if (!SHEET_WRITE_URL) {
      return {
        success: false,
        message: "SHEET_WRITE_URL이 비어 있어요.",
      };
    }

    const formData = new FormData();
    formData.append("name", name);

    const res = await fetch(SHEET_WRITE_URL, {
      method: "POST",
      body: formData,
    });

    const text = await res.text();
    console.log("Apps Script raw response:", text);

    try {
      return JSON.parse(text);
    } catch {
      return {
        success: false,
        message: "응답이 JSON 형식이 아니에요.",
        raw: text,
      };
    }
  } catch (err) {
    console.error("Failed to add name to sheet:", err);
    return {
      success: false,
      message: "시트에 이름을 추가하지 못했어요.",
    };
  }
}

/* =========================
   11) 이름 입력 모달
========================= */
function createNameModal() {
  const overlay = document.createElement("div");
  overlay.className = "name-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "name-modal";

  const title = document.createElement("div");
  title.className = "name-modal__title";
  title.textContent = "";

  const desc = document.createElement("div");
  desc.className = "name-modal__desc";
  desc.textContent = "";

  const input = document.createElement("input");
  input.className = "name-modal__input";
  input.type = "text";
  input.placeholder = "수취인은 누구신지요";
  input.autocomplete = "off";

  const message = document.createElement("div");
  message.className = "name-modal__message";

  const buttonWrap = document.createElement("div");
  buttonWrap.className = "name-modal__buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "name-modal__button name-modal__button--cancel";
  cancelBtn.textContent = "닫기";

  const submitBtn = document.createElement("button");
  submitBtn.className = "name-modal__button name-modal__button--submit";
  submitBtn.textContent = "확인";

  buttonWrap.appendChild(cancelBtn);
  buttonWrap.appendChild(submitBtn);

  modal.appendChild(title);
  modal.appendChild(desc);
  modal.appendChild(input);
  modal.appendChild(message);
  modal.appendChild(buttonWrap);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function closeModal() {
    overlay.remove();
  }

  async function submitName() {
    const cleanedInput = cleanCell(input.value);

    if (!cleanedInput) {
      message.textContent = "이름을 입력해주세요.";
      return;
    }

    const matchedRow = findLetterRowByName(cleanedInput);

    // 1) name 있고 letter도 있음
    if (matchedRow && matchedRow.letter) {
      GREETING_TEXT = `${matchedRow.name}님, ${matchedRow.letter}`;
      closeModal();
      return;
    }

    // 2) name 있고 letter 비어 있음
    if (matchedRow && !matchedRow.letter) {
      GREETING_TEXT = `${matchedRow.name}님, 아직 답변중`;
      closeModal();
      return;
    }

    // 3) name 없음
    message.textContent = "이름 추가 중...";

    const result = await addNameToSheet(cleanedInput);

    if (result.success) {
      GREETING_TEXT = `${cleanedInput}님, 이름 추가됨`;
      sheetRows.push({ name: cleanedInput, letter: "" });
      closeModal();
    } else {
      message.textContent = result.message || "이름 추가에 실패했어요.";
      console.warn("Name add failed:", result);
    }
  }

  submitBtn.addEventListener("click", submitName);

  cancelBtn.addEventListener("click", () => {
    GREETING_TEXT = "";
    closeModal();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitName();
    if (e.key === "Escape") {
      GREETING_TEXT = "";
      closeModal();
    }
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      GREETING_TEXT = "";
      closeModal();
    }
  });

  setTimeout(() => input.focus(), 0);
}

/* =========================
   12) 캔버스 / 갈기 배치
========================= */
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initManes();
}

function getLayoutValues() {
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

function initManes() {
  manes = [];

  const layout = getLayoutValues();
  const spacing = 4;

  arcCenterX = layout.cx;
  arcCenterY = layout.cy;
  arcRadius = layout.R;
  arcEndX = layout.endX;
  arcEndY = layout.endY;

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

    const jitterX = (Math.random() - 0.5) * MANE_ROOT_JITTER;
    const jitterY = (Math.random() - 0.5) * MANE_ROOT_JITTER;

    manes.push(
      new ManeStrand(x + jitterX, y + jitterY, dirX, dirY, i, maneCount),
    );
  }
}

/* =========================
   13) 갈기 한 가닥 클래스
   - 여기 바람/갈기 로직은 네가 준 코드 그대로 유지
========================= */
class ManeStrand {
  constructor(x, y, dirX, dirY, index, total) {
    this.baseX = x;
    this.baseY = y;
    this.dirX = dirX;
    this.dirY = dirY;

    this.index = index;
    this.segments = MANE_SEGMENTS;

    // 갈기 총 길이 = 화면 가로의 절반
    this.segmentLength = (canvas.width * 0.5) / MANE_SEGMENTS;

    this.points = [];
    this.velocities = [];
    this.touched = false;
    this.touchStrength = 0;
    this.windPhase = Math.random() * Math.PI * 2;
    this.windSpeed = 0.02 + Math.random() * 0.015;

    this.boundRibbonId = null;
    this.boundSegmentIndex = null;

    const hue = 5 + (index / total) * 20;
    this.color = `hsl(${hue}, 85%, 55%)`;
    this.rootColor = `hsl(${hue}, 95%, 72%)`;

    for (let i = 0; i <= this.segments; i++) {
      const px = x + i * this.segmentLength * this.dirX;
      const py = y + i * this.segmentLength * this.dirY;

      this.points.push({
        x: px,
        y: py,
        baseX: px,
        baseY: py,
      });

      this.velocities.push({ x: 0, y: 0 });
    }
  }

  getBoundRibbon() {
    if (this.boundRibbonId === null) return null;
    return ribbons.find((r) => r.id === this.boundRibbonId) || null;
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

      const returnForceX =
        (this.points[i].baseX - this.points[i].x) * returnStrength;
      const returnForceY =
        (this.points[i].baseY - this.points[i].y) * returnStrength;
      this.velocities[i].x += returnForceX;
      this.velocities[i].y += returnForceY;

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
    gradient.addColorStop(0.8, this.color);
    gradient.addColorStop(1, "rgba(196, 30, 58, 0)");

    ctx.strokeStyle = gradient;

    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.shadowBlur = 5;
    ctx.shadowColor = this.rootColor;
    ctx.stroke();

    ctx.restore();
  }
}

/* =========================
   14) 텍스트 그리기
========================= */
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

    const tangentAngle = angle + Math.PI / 2;
    const normalX = Math.cos(angle);
    const normalY = Math.sin(angle);

    return { x, y, tangentAngle, normalX, normalY };
  }

  const d = distance - layout.arcLen;
  const u = layout.vertLen > 0 ? d / layout.vertLen : 0;

  const x = layout.endX;
  const y = layout.endY + u * layout.vertLen;

  return {
    x,
    y,
    tangentAngle: Math.PI / 2,
    normalX: 1,
    normalY: 0,
  };
}

function drawTextOnSpine() {
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

/* =========================
   15) spine 라인
========================= */
function drawSpine() {
  const layout = getLayoutValues();

  ctx.save();
  ctx.beginPath();

  const startX = layout.cx + layout.R * Math.cos(layout.startAngle);
  const startY = layout.cy + layout.R * Math.sin(layout.startAngle);

  ctx.moveTo(startX, startY);
  ctx.arc(
    layout.cx,
    layout.cy,
    layout.R,
    layout.startAngle,
    layout.endAngle,
    false,
  );
  ctx.lineTo(layout.endX, canvas.height);

  ctx.strokeStyle = SPINE_COLOR;
  ctx.lineWidth = Math.max(10, canvas.width * 0.035);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 0;
  ctx.stroke();

  ctx.restore();
}

/* =========================
   16) 구슬 생성 / 제거 / 탐색
========================= */
function createRibbon(x, y) {
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
      candidateBindings.push({
        mane,
        segmentIndex: bestIndex,
        dist: bestDist,
      });
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

function removeRibbon(ribbonId) {
  ribbons = ribbons.filter((r) => r.id !== ribbonId);

  manes.forEach((mane) => {
    if (mane.boundRibbonId === ribbonId) {
      mane.unbindRibbon();
    }
  });
}

function findRibbonAtPoint(x, y) {
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

/* =========================
   17) 구슬 렌더링
========================= */
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
   18) 포인터 입력 처리
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
}

function movePointer(x, y) {
  mouseX = x;
  mouseY = y;
  pointerCurrentX = x;
  pointerCurrentY = y;

  const dx = pointerCurrentX - pointerStartX;
  const dy = pointerCurrentY - pointerStartY;
  const dist = Math.hypot(dx, dy);

  if (dist > CLICK_MOVE_THRESHOLD) {
    pointerMoved = true;
  }
}

function endPointer(x, y, isTouch = false) {
  mouseX = x;
  mouseY = y;
  pointerCurrentX = x;
  pointerCurrentY = y;

  const duration = performance.now() - pointerDownTime;
  const dx = pointerCurrentX - pointerStartX;
  const dy = pointerCurrentY - pointerStartY;
  const dist = Math.hypot(dx, dy);

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
}

/* =========================
   19) 이벤트 등록
========================= */
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (mouseDown) {
    movePointer(x, y);
  } else {
    mouseX = x;
    mouseY = y;
  }
});

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  beginPointer(x, y);
});

canvas.addEventListener("mouseup", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  endPointer(x, y);
});

canvas.addEventListener("mouseleave", () => {
  mouseDown = false;
});

canvas.addEventListener(
  "touchstart",
  (e) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    beginPointer(x, y);
  },
  { passive: true },
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    movePointer(x, y);
  },
  { passive: false },
);

canvas.addEventListener("touchend", () => {
  endPointer(pointerCurrentX, pointerCurrentY, true);
});

/* =========================
   20) 렌더 루프
========================= */
function animate() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTextOnSpine();

  manes.forEach((mane) => {
    mane.update(mouseX, mouseY, mouseDown);
    mane.draw();
  });

  // drawSpine();
  drawRibbons();

  requestAnimationFrame(animate);
}

/* =========================
   21) 시작
========================= */
async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await loadSheetRows();
  createNameModal();
  animate();
}

init();
