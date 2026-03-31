import {
  SHEET_CSV_URL,
  SHEET_WRITE_URL,
  sheetRows,
  setSheetRows,
  cleanCell,
  normalizeName,
  parseCSVLine,
  setGreetingText,
} from "./config.js";

export async function loadSheetRows() {
  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const csv = await res.text();

    const rows = csv
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map(parseCSVLine);

    if (rows.length < 2) {
      setSheetRows([]);
      return;
    }

    const header = rows[0].map((v) => cleanCell(v).toLowerCase());
    const nameIndex = header.indexOf("name");
    const letterIndex = header.indexOf("letter");

    if (nameIndex === -1 || letterIndex === -1) {
      console.warn("CSV header must include 'name' and 'letter'");
      setSheetRows([]);
      return;
    }

    const nextRows = rows
      .slice(1)
      .map((row) => ({
        name: cleanCell(row[nameIndex]),
        letter: cleanCell(row[letterIndex]),
      }))
      .filter((row) => row.name);

    setSheetRows(nextRows);
  } catch (err) {
    console.error("Failed to load sheet rows:", err);
    setSheetRows([]);
  }
}

function findLetterRowByName(inputName) {
  const normalizedInput = normalizeName(inputName);
  return sheetRows.find((row) => normalizeName(row.name) === normalizedInput);
}

async function addNameToSheet(name) {
  try {
    if (!SHEET_WRITE_URL) {
      return { success: false, message: "SHEET_WRITE_URL이 비어 있어요." };
    }

    const formData = new FormData();
    formData.append("name", name);

    const res = await fetch(SHEET_WRITE_URL, {
      method: "POST",
      body: formData,
    });

    const text = await res.text();

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

export function createNameModal() {
  const overlay = document.createElement("div");
  overlay.className = "name-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "name-modal";

  const title = document.createElement("div");
  title.className = "name-modal__title";

  const desc = document.createElement("div");
  desc.className = "name-modal__desc";

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

  modal.append(title, desc, input, message, buttonWrap);
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

    if (matchedRow && matchedRow.letter) {
      setGreetingText(`${matchedRow.name}님, ${matchedRow.letter}`);
      closeModal();
      return;
    }

    if (matchedRow && !matchedRow.letter) {
      setGreetingText(`${matchedRow.name}님, 아직 답변중`);
      closeModal();
      return;
    }

    message.textContent = "이름 추가 중...";

    const result = await addNameToSheet(cleanedInput);

    if (result.success) {
      setGreetingText(`${cleanedInput}님, 이름 추가됨`);
      setSheetRows([...sheetRows, { name: cleanedInput, letter: "" }]);
      closeModal();
    } else {
      message.textContent = result.message || "이름 추가에 실패했어요.";
    }
  }

  submitBtn.addEventListener("click", submitName);

  cancelBtn.addEventListener("click", () => {
    setGreetingText("");
    closeModal();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitName();
    if (e.key === "Escape") {
      setGreetingText("");
      closeModal();
    }
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      setGreetingText("");
      closeModal();
    }
  });

  setTimeout(() => input.focus(), 0);
}
