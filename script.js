const canvas = document.getElementById("maneCanvas");
const ctx = canvas.getContext("2d");

/* =========================
   1) 전체 비주얼 기본 설정
   - 배경색, 갈기/척추 기본 구조
========================= */
const BG_COLOR = "#c41e3a";
const SPINE_COLOR = "#c41e3a";

const MANE_SEGMENTS = 10; // 갈기 한 가닥의 세그먼트 수
const MANE_LENGTH_RATIO = 15; // 갈기 길이 비율
const THICK_PORTION = 0.6; // 갈기 두꺼운 구간 비율
const MANE_ROOT_JITTER = 6; // 갈기 시작점 랜덤 흔들림

/* =========================
   2) 텍스트 설정
   - 시트에서 가져온 문장이 spine을 따라 배치됨
========================= */
let GREETING_TEXT = "";
const TEXT_COLOR = "rgba(255, 235, 215, 0.9)";
const TEXT_FONT_FAMILY = '"Times New Roman", serif';
const TEXT_WEIGHT = "150";
const TEXT_SIZE_RATIO = 0.01; // 화면 대비 텍스트 크기
const TEXT_START_OFFSET = 40; // spine 시작점으로부터 텍스트 시작 위치

/* =========================
   3) 구글 시트 CSV 주소
   - name / letter 컬럼을 읽음
========================= */
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRKi5g-6wPn9FoAMVi82Exy8t1sluR2jNqjXgtB4eCB1U6ncqyl69d60CWrd10e4F_2eW2v7Gl9Jubs/pub?gid=0&single=true&output=csv";

/* =========================
   4) 구슬(묶임 포인트) 관련 설정
   - 클릭하면 갈기들이 이 점으로 모임
========================= */
const RIBBON_CAPTURE_RADIUS = 30; // 클릭한 점 주변 갈기 포착 반경
const RIBBON_TOGGLE_RADIUS = 12; // 이미 있는 구슬 제거 클릭 반경
const RIBBON_BIND_STRENGTH = 0.42; // 현재 실사용 거의 없음
const RIBBON_DAMPING = 0.72; // 현재 실사용 거의 없음
const RIBBON_SIZE = 12; // 예전 리본 기준 값, 지금은 거의 사용 안 함
const RIBBON_SNAP_STRENGTH = 0.97; // 묶인 갈기가 구슬 위치로 스냅되는 강도

/* =========================
   5) 클릭 / 드래그 판정
   - 클릭인지, 그냥 쓸어넘긴 건지 구분
========================= */
const CLICK_MOVE_THRESHOLD = 6;
const CLICK_TIME_THRESHOLD = 10;
const TOUCH_TAP_TIME_THRESHOLD = 10;
const TOUCH_TAP_MOVE_THRESHOLD = 12;

/* =========================
   6) 마우스로 갈기 쓰다듬는 힘
   - 묶임 말고, 평소 마우스 인터랙션 세기
========================= */
const POINTER_INFLUENCE_RADIUS = 70;
const POINTER_FORCE_MULTIPLIER = 20;

/* =========================
   7) 전역 상태값
========================= */
let manes = [];
let ribbons = [];
let sheetRows = [];

// 포인터 상태
let mouseX = 0;
let mouseY = 0;
let mouseDown = false;

let pointerStartX = 0;
let pointerStartY = 0;
let pointerCurrentX = 0;
let pointerCurrentY = 0;
let pointerDownTime = 0;
let pointerMoved = false;

// 곡선 spine 배치 정보
let arcCenterX = 0;
let arcCenterY = 0;
let arcRadius = 0;
let arcEndX = 0;
let arcEndY = 0;

/* =========================
   8) 랜덤 구슬 색상
========================= */
// function getRandomRibbonColor() {
//   const hue = Math.floor(Math.random() * 360);
//   const saturation = 70 + Math.random() * 20;
//   const lightness = 55 + Math.random() * 10;
//   return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
// }

function getRandomRibbonColor() {
  return "rgb(20, 20, 20)";
}

/* =========================
   9) 텍스트 / 시트 / 모달 관련
========================= */

// 셀 문자열 정리
function cleanCell(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/^"|"$/g, "")
    .replace(/""/g, '"')
    .replace(/\r/g, "")
    .trim();
}

// 이름 비교용 정규화
function normalizeName(value) {
  return cleanCell(value).normalize("NFC").replace(/\s+/g, "").toLowerCase();
}

// CSV 한 줄 파싱
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

// 시트 데이터 전체 로드
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
      .filter((row) => row.name && row.letter);

    console.log("Loaded rows:", sheetRows);
  } catch (err) {
    console.error("Failed to load sheet rows:", err);
    sheetRows = [];
  }
}

// 입력 이름과 일치하는 행 찾기
function findLetterRowByName(inputName) {
  const normalizedInput = normalizeName(inputName);
  return sheetRows.find((row) => normalizeName(row.name) === normalizedInput);
}

// 시작 시 뜨는 이름 입력 모달
function createNameModal() {
  const overlay = document.createElement("div");
  overlay.id = "nameModalOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0, 0, 0, 0)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";
  overlay.style.backdropFilter = "blur(3px)";

  const modal = document.createElement("div");
  modal.style.width = "min(60vw, 420px)";
  modal.style.background = "rgb(0, 0, 0)";
  modal.style.borderRadius = "18px";
  modal.style.padding = "22px 20px 18px";
  modal.style.boxShadow = "0 18px 45px rgba(0,0,0,0.18)";
  modal.style.fontFamily =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  modal.style.color = "#6e1e2f";

  const title = document.createElement("div");
  title.textContent = "";
  title.style.fontSize = "20px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "10px";

  const desc = document.createElement("div");
  desc.textContent = "";
  desc.style.fontSize = "14px";
  desc.style.lineHeight = "1.5";
  desc.style.opacity = "0.8";
  desc.style.marginBottom = "14px";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "수취인은 누구신지요";
  input.autocomplete = "off";
  input.style.width = "100%";
  input.style.boxSizing = "border-box";
  input.style.padding = "14px 16px";
  input.style.borderRadius = "12px";
  input.style.border = "1px solid rgba(110,30,47,0.16)";
  input.style.outline = "none";
  input.style.fontSize = "16px";
  input.style.background = "white";
  input.style.marginBottom = "12px";

  const message = document.createElement("div");
  message.style.minHeight = "20px";
  message.style.fontSize = "13px";
  message.style.color = "#b03b4f";
  message.style.marginBottom = "12px";

  const buttonWrap = document.createElement("div");
  buttonWrap.style.display = "flex";
  buttonWrap.style.justifyContent = "flex-end";
  buttonWrap.style.gap = "8px";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "닫기";
  cancelBtn.style.border = "none";
  cancelBtn.style.background = "rgba(110,30,47,0.08)";
  cancelBtn.style.color = "#6e1e2f";
  cancelBtn.style.padding = "12px 18px";
  cancelBtn.style.borderRadius = "999px";
  cancelBtn.style.cursor = "pointer";
  cancelBtn.style.fontSize = "14px";
  cancelBtn.style.fontWeight = "700";

  const submitBtn = document.createElement("button");
  submitBtn.textContent = "확인";
  submitBtn.style.border = "none";
  submitBtn.style.background = "#c41e3a";
  submitBtn.style.color = "white";
  submitBtn.style.padding = "12px 18px";
  submitBtn.style.borderRadius = "999px";
  submitBtn.style.cursor = "pointer";
  submitBtn.style.fontSize = "14px";
  submitBtn.style.fontWeight = "700";

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

  function submitName() {
    const rawInput = input.value;
    const cleanedInput = cleanCell(rawInput);

    if (!cleanedInput) {
      message.textContent = "이름을 입력해주세요.";
      return;
    }

    const matchedRow = findLetterRowByName(cleanedInput);

    if (matchedRow) {
      GREETING_TEXT = `${matchedRow.name}님, ${matchedRow.letter}`;
      closeModal();
    } else {
      GREETING_TEXT = `${cleanedInput}님, 등록된 편지가 없어요`;
      message.textContent = "같은 이름을 찾지 못했어요.";
      console.log(
        "No match for:",
        cleanedInput,
        "normalized:",
        normalizeName(cleanedInput),
        "available:",
        sheetRows.map((r) => ({
          raw: r.name,
          normalized: normalizeName(r.name),
        })),
      );
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
   10) 캔버스 / 갈기 배치
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

  const verticalRootX = canvas.width - thickManeLength;
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
  const spacing = 5;

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
   11) 갈기 한 가닥 클래스
   - update(): 물리 계산
   - draw(): 갈기 렌더링
========================= */
class ManeStrand {
  constructor(x, y, dirX, dirY, index, total) {
    this.baseX = x;
    this.baseY = y;
    this.dirX = dirX;
    this.dirY = dirY;

    this.index = index;
    this.segments = MANE_SEGMENTS;
    this.segmentLength = canvas.width / MANE_LENGTH_RATIO;
    this.points = [];
    this.velocities = [];
    this.touched = false;
    this.touchStrength = 0;
    this.windPhase = Math.random() * Math.PI * 2;
    this.windSpeed = 0.02 + Math.random() * 0.015;

    this.boundRibbonId = null;
    this.boundSegmentIndex = null;

    const hue = 0 + (index / total) * 20;
    this.color = `hsl(${hue}, 85%, 55%)`;

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
    gradient.addColorStop(0, this.color);
    gradient.addColorStop(0.5, this.color);
    gradient.addColorStop(1, "rgba(196, 30, 58, 0)");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);

    const thickLimit = Math.floor((this.segments + 1) * THICK_PORTION);

    for (let i = 1; i < thickLimit; i++) {
      const xc = (this.points[i].x + this.points[i + 1].x) / 2;
      const yc = (this.points[i].y + this.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(this.points[i].x, this.points[i].y, xc, yc);
    }

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 4 - (this.index % 2);
    ctx.lineCap = "round";
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.stroke();

    ctx.restore();
  }
}

/* =========================
   12) 텍스트 spine 위에 그리기
   - 글자 위치/크기 수정할 때 여기 참고
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
   13) spine 자체 그리기
   - 현재 animate에서 꺼져 있음
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
   14) 구슬 생성 / 제거 / 찾기
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
   15) 구슬 그리기
========================= */
function drawRibbon(ribbon) {
  ctx.save();
  ctx.translate(ribbon.x, ribbon.y);

  const radius = 10;

  // 아주 은은한 밝은 광만 남김
  // ctx.shadowBlur = 8;
  // ctx.shadowColor = "rgba(255,255,255,0.22)";

  // 메인 구슬 그라디언트
  const beadGradient = ctx.createRadialGradient(
    -radius * 0.35,
    -radius * 0.4,
    radius * 0.15,
    0,
    0,
    radius,
  );
  beadGradient.addColorStop(0, "rgba(76, 76, 76, 0.96)");
  beadGradient.addColorStop(0.2, "rgba(29, 29, 29, 0.72)");
  beadGradient.addColorStop(0.38, ribbon.color);
  beadGradient.addColorStop(1, ribbon.color);

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = beadGradient;
  ctx.fill();

  // 하이라이트 큰 점
  // ctx.shadowBlur = 0;
  // ctx.beginPath();
  // ctx.arc(-radius * 0.34, -radius * 0.34, radius * 0.24, 0, Math.PI * 2);
  // ctx.fillStyle = "rgba(255,255,255,0.92)";
  // ctx.fill();

  // 하이라이트 작은 점
  // ctx.beginPath();
  // ctx.arc(-radius * 0.06, -radius * 0.1, radius * 0.09, 0, Math.PI * 2);
  // ctx.fillStyle = "rgba(255,255,255,0.58)";
  // ctx.fill();

  // 밝은 외곽선
  // ctx.beginPath();
  // ctx.arc(0, 0, radius, 0, Math.PI * 2);
  // ctx.lineWidth = 1;
  // ctx.strokeStyle = "rgba(255,255,255,0.35)";
  // ctx.stroke();

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
   16) 포인터 입력 처리
   - 클릭/드래그/터치
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
   17) 이벤트 등록
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
   18) 렌더 루프
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
   19) 시작
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
