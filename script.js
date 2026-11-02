const $ = id => document.getElementById(id);
const STORAGE_KEY = "thousand-scorekeeper-v1";

let game = null;
let draft = [];
let currentPlayer = 0;
let rawInput = "";
let editingLastRound = false;

function roundScore(value) {
  if (value === 0) return 0;
  return Math.sign(value) * Math.round(Math.abs(value) / 5) * 5;
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
}

function getTotal(playerIndex) {
  return game.rounds.reduce((sum, round) =>
    sum + round.entries[playerIndex].score, 0);
}

function getRUsed(playerIndex) {
  const roundsToCount = editingLastRound
    ? game.rounds.slice(0, -1)
    : game.rounds;

  return roundsToCount.reduce((sum, round) =>
    sum + (round.entries[playerIndex].type === "R" ? 1 : 0), 0);
}

function saveGame() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch (error) {
    console.warn("Не удалось сохранить игру", error);
  }
}

function showSetup() {
  $("setup").hidden = false;
  $("game").hidden = true;
  $("modal").hidden = true;
  renderNameFields();
}

function renderNameFields() {
  const count = Number($("playerCount").value);
  const oldNames = [...document.querySelectorAll(".name-input")]
    .map(input => input.value);

  $("nameFields").innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="name-field">
      <label for="playerName${i}">Игрок ${i + 1}</label>
      <input
        class="name-input"
        id="playerName${i}"
        maxlength="15"
        minlength="1"
        autocomplete="off"
        placeholder="Имя игрока ${i + 1}"
        value="${escapeText(oldNames[i] || "")}"
      >
    </div>
  `).join("");
}

$("playerCount").addEventListener("change", renderNameFields);

function startGame() {
  const inputs = [...document.querySelectorAll(".name-input")];
  const names = inputs.map(input => input.value.trim());

  if (names.some(name => name.length < 1 || name.length > 15)) {
    alert("Имя каждого игрока должно содержать от 1 до 15 символов.");
    return;
  }

  if (names.some((name, i) =>
    names.slice(0, i).some(previous =>
      previous.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru")
    )
  )) {
    if (!confirm("Есть игроки с одинаковыми именами. Продолжить?")) return;
  }

  game = {
    players: names,
    rounds: []
  };

  saveGame();
  renderGame();
}

function renderGame() {
  if (!game) return;

  $("setup").hidden = true;
  $("game").hidden = false;
  $("modal").hidden = true;

  const count = game.players.length;
  const roundIndex = game.rounds.length;
  const dealerIndex = (count - (roundIndex % count)) % count;

  $("roundTitle").textContent = `Раунд ${roundIndex + 1}`;
  $("roundCount").textContent =
    `${roundIndex} ${roundIndex === 1 ? "сыгран" :
      roundIndex >= 2 && roundIndex <= 4 ? "сыграно" : "сыграно"}`;

  $("players").innerHTML = game.players.map((name, i) => {
    const total = getTotal(i);
    const used = getRUsed(i);
    const isDealer = i === dealerIndex;

    return `
      <article class="player-card ${isDealer ? "active-player" : ""}">
        <div class="player-top">
          <div class="player-name">${escapeText(name)}</div>
          ${isDealer
            ? '<span class="turn-dot" title="Прикуп"></span>'
            : ""}
        </div>
        <div class="score ${total < 0 ? "negative" : ""}">
          ${total > 0 ? "+" : ""}${total}
        </div>
        <div class="player-meta">
          <span>${isDealer ? "На прикупе" : "в игре"}</span>
          <span><strong>R ${3 - used}/3</strong></span>
        </div>
      </article>
    `;
  }).join("");

  $("undoBtn").disabled = game.rounds.length === 0;
  renderHistory();
}

function renderHistory() {
  if (!game.rounds.length) {
    $("history").innerHTML =
      '<div class="empty-history">Здесь появятся очки сыгранных раундов</div>';
    return;
  }

  $("history").innerHTML = `
    <div class="history-list">
      ${game.rounds.map((round, roundIndex) => {
        const index = game.rounds.length - 1 - roundIndex;
        const actualRound = game.rounds[index];

        const dealerIndex = Number.isInteger(actualRound.dealerIndex)
          ? actualRound.dealerIndex
          : (game.players.length - (index % game.players.length)) % game.players.length;

        return `
          <article class="history-card">
            <div class="history-title">Раунд ${index + 1}</div>
            ${actualRound.entries.map((entry, i) => `
              <div class="history-row">
                <span class="history-player">
                  ${i === dealerIndex ? '<span class="history-dealer-dot" title="Игрок на прикупе"></span>' : ''}
                  ${escapeText(game.players[i])}
                  ${entry.type === "R" ? " · R" + entry.rIndex :
                    entry.type === "peach" ? " · 🍑" : ""}
                </span>
                <span class="${
                  entry.score < 0 ? "negative-text" :
                  entry.score > 0 ? "positive" : ""
                }">${entry.score > 0 ? "+" : ""}${entry.score}</span>
              </div>
            `).join("")}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function openRound() {
  editingLastRound = false;
  draft = [];
  currentPlayer = 0;
  openPlayerModal();
}

function editLastRound() {
  if (!game || !game.rounds.length) return;

  editingLastRound = true;
  draft = [];
  currentPlayer = 0;
  openPlayerModal();
}

function openPlayerModal() {
  const oldEntry = editingLastRound
    ? game.rounds[game.rounds.length - 1].entries[currentPlayer]
    : null;
  rawInput = oldEntry && oldEntry.type === "number"
    ? String(oldEntry.score)
    : "";
  $("modal").hidden = false;
  $("modalError").textContent = "";

  const name = game.players[currentPlayer];
  const roundNumber = editingLastRound ? game.rounds.length : game.rounds.length + 1;
  $("modalSubtitle").textContent =
    `${editingLastRound ? "ИЗМЕНЕНИЕ · " : ""}РАУНД ${roundNumber} · ИГРОК ${currentPlayer + 1} ИЗ ${game.players.length}`;
  $("modalTitle").textContent = name;

  $("turnProgress").innerHTML = game.players.map((_, i) =>
    `<div class="turn-step ${
      i < currentPlayer ? "done" :
      i === currentPlayer ? "current" : ""
    }"></div>`
  ).join("");

  renderRButtons();
  updateDisplay();

  $("confirmBtn").textContent =
    currentPlayer === game.players.length - 1
      ? "Завершить раунд ✓"
      : "Следующий игрок →";
}

function renderRButtons() {
  const playerIndex = currentPlayer;
  const usedEarlier = getRUsed(playerIndex);

  $("rospisButtons").innerHTML = [1, 2, 3].map(n => {
    const used = n <= usedEarlier;

    return `
      <button class="rospis-btn ${used ? "used" : ""}"
        data-r="${n}" ${used ? "disabled" : ""}>
        R${n}
      </button>
    `;
  }).join("");
}

function updateDisplay() {
  $("rawScore").textContent = rawInput || "0";

  const value = rawInput === "" || rawInput === "-"
    ? 0
    : Number(rawInput);

  $("roundedHint").textContent =
    `Будет записано: ${roundScore(value) > 0 ? "+" : ""}${roundScore(value)}`;
}

function addKey(key) {
  $("modalError").textContent = "";

  if (key === "backspace") {
    rawInput = rawInput.slice(0, -1);
  } else if (key === "minus") {
    rawInput = rawInput.startsWith("-")
      ? rawInput.slice(1)
      : "-" + rawInput;
  } else {
    if (rawInput.replace("-", "").length >= 7) return;
    rawInput += key;
  }

  updateDisplay();
}

$("keypad").addEventListener("click", event => {
  const button = event.target.closest("[data-key]");
  if (button) addKey(button.dataset.key);
});

$("rospisButtons").addEventListener("click", event => {
  const button = event.target.closest("[data-r]");
  if (!button || button.disabled) return;

  const rIndex = Number(button.dataset.r);

  draft.push({
    playerIndex: currentPlayer,
    score: 0,
    type: "R",
    rIndex
  });

  nextPlayer();
});

$("peachBtn").addEventListener("click", () => {
  draft.push({
    playerIndex: currentPlayer,
    score: 0,
    type: "peach"
  });

  nextPlayer();
});

function confirmScore() {
  if (rawInput === "-") {
    $("modalError").textContent = "Введи число после знака минус.";
    return;
  }

  const value = rawInput === "" ? 0 : Number(rawInput);

  if (!Number.isFinite(value)) {
    $("modalError").textContent = "Некорректное число.";
    return;
  }

  draft.push({
    playerIndex: currentPlayer,
    score: roundScore(value),
    type: "number"
  });

  nextPlayer();
}

function nextPlayer() {
  currentPlayer++;

  if (currentPlayer < game.players.length) {
    openPlayerModal();
    return;
  }

  const entries = Array(game.players.length);

  for (const entry of draft) {
    entries[entry.playerIndex] = {
      score: entry.score,
      type: entry.type,
      ...(entry.rIndex ? { rIndex: entry.rIndex } : {})
    };
  }

  if (entries.some(entry => !entry)) {
    $("modalError").textContent = "Не все игроки заполнили раунд.";
    return;
  }

  if (editingLastRound) {
    const lastRound = game.rounds[game.rounds.length - 1];
    lastRound.entries = entries;
    // dealerIndex сохраняем: редактирование очков не меняет прикуп.
    editingLastRound = false;
  } else {
    const count = game.players.length;
    const dealerIndex = (count - (game.rounds.length % count)) % count;
    game.rounds.push({ entries, dealerIndex });
  }

  saveGame();
  renderGame();
}

function cancelModal() {
  if (draft.length &&
      !confirm("Отменить ввод? Незавершённый раунд не будет сохранён.")) {
    return;
  }

  draft = [];
  editingLastRound = false;
  $("modal").hidden = true;
}

$("startBtn").addEventListener("click", startGame);
$("enterBtn").addEventListener("click", openRound);
$("confirmBtn").addEventListener("click", confirmScore);
$("closeModalBtn").addEventListener("click", cancelModal);
$("cancelBtn").addEventListener("click", cancelModal);

$("undoBtn").addEventListener("click", editLastRound);

$("newGameBtn").addEventListener("click", () => {
  if (!confirm("Начать новую партию? Текущая партия будет заменена.")) return;

  game = null;
  draft = [];
  editingLastRound = false;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Не удалось очистить сохранение", error);
  }

  $("playerCount").value = "3";
  showSetup();
});

function restoreGame() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;

    const parsed = JSON.parse(saved);

    if (
      !parsed ||
      !Array.isArray(parsed.players) ||
      !Array.isArray(parsed.rounds) ||
      ![3, 4].includes(parsed.players.length) ||
      parsed.players.some(name =>
        typeof name !== "string" || name.length < 1 || name.length > 15
      ) ||
      parsed.rounds.some(round =>
        !round || !Array.isArray(round.entries) ||
        round.entries.length !== parsed.players.length ||
        round.entries.some(entry =>
          !entry || !Number.isFinite(entry.score) ||
          !["number", "R", "peach"].includes(entry.type) ||
          (entry.type === "R" && ![1, 2, 3].includes(entry.rIndex))
        )
      )
    ) {
      return false;
    }

    game = parsed;
    return true;
  } catch (error) {
    return false;
  }
}

if (restoreGame()) {
  renderGame();
} else {
  renderNameFields();
}
