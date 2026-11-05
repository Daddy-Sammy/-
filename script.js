const $ = id => document.getElementById(id);
const STORAGE_KEY = "thousand-scorekeeper-v1";

let game = null;
let draft = [];
let currentPlayer = 0;
let rawInput = "";
let editingLastRound = false;
let threeNines = false;

function roundScore(value) {
  if (value === 0) return 0;
  return Math.sign(value) * Math.round(Math.abs(value) / 5) * 5;
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function getDealerIndex(round, roundIndex) {
  if (Number.isInteger(round.dealerIndex)) return round.dealerIndex;
  // Старые сохранения без dealerIndex созданы по прежней схеме: справа налево.
  const count = game.players.length;
  return (count - (roundIndex % count)) % count;
}

function getEffectiveEntryScore(entry) {
  if (Number.isFinite(entry.score)) return entry.score;
  return 0;
}

// Полностью пересчитываем состояние из истории. Благодаря этому изменение
// последнего раунда автоматически пересчитывает 555, бочки и победителя.
function calculateGameState(rounds = game.rounds) {
  const count = game.players.length;
  const states = game.players.map(() => ({
    total: 0,
    rospisUsed: 0,
    barrelFailures: 0,
    barrel: null,
    winner: false
  }));
  const roundMarks = rounds.map(() => Array(count).fill(""));

  rounds.forEach((round, roundIndex) => {
    const dealerIndex = getDealerIndex(round, roundIndex);

    for (let i = 0; i < count; i++) {
      const state = states[i];
      const entry = round.entries[i];
      const score = getEffectiveEntryScore(entry);
      const isDealer = i === dealerIndex;

      if (entry.type === "R") state.rospisUsed++;
      if (state.winner) {
        roundMarks[roundIndex][i] = "🏆 Победа";
        continue;
      }

      // Игрок уже на бочке: раунд прикупа пропускается и не входит в три попытки.
      if (state.barrel) {
        if (isDealer) {
          roundMarks[roundIndex][i] = `🛢️ ${state.barrel.attempt} · пропуск`;
          continue;
        }

        state.barrel.rounds++;
        state.barrel.progress += score;
        roundMarks[roundIndex][i] = `🛢️ ${state.barrel.attempt} · ${state.barrel.rounds}/3`;

        if (state.barrel.progress >= 120) {
          state.total = 1000;
          state.winner = true;
          state.barrel = null;
          roundMarks[roundIndex][i] = "🏆 Победа · 1000";
        } else if (state.barrel.rounds >= 3) {
          state.barrelFailures++;
          state.barrel = null;
          if (state.barrelFailures >= 3) {
            state.total = 0;
            roundMarks[roundIndex][i] = "🛢️ Сход · 0";
          } else {
            state.total = 760;
            roundMarks[roundIndex][i] = "🛢️ Сход · −120";
          }
        }
        continue;
      }

      // Если игрок уже имел 880+ после раунда прикупа, он входит на бочку
      // в начале первого следующего раунда, не являющегося прикупом.
      if (!isDealer && state.total >= 880) {
        state.total = 880;
        state.barrel = {
          attempt: state.barrelFailures + 1,
          rounds: 1,
          progress: score
        };
        roundMarks[roundIndex][i] = `🛢️ ${state.barrel.attempt} · 1/3`;
      } else {
        state.total += score;

        // Сброс только при точном совпадении итоговой суммы после раунда.
        if (state.total === 555) state.total = 0;

        if (!isDealer && state.total >= 880) {
          state.total = 880;
          state.barrel = {
            attempt: state.barrelFailures + 1,
            rounds: 0,
            progress: 0
          };
          roundMarks[roundIndex][i] = `🛢️ ${state.barrel.attempt} · вход`;
        }
      }
    }
  });

  return { states, roundMarks };
}

function getRUsed(playerIndex) {
  const roundsToCount = editingLastRound ? game.rounds.slice(0, -1) : game.rounds;
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
  const oldNames = [...document.querySelectorAll(".name-input")].map(input => input.value);
  $("nameFields").innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="name-field">
      <label for="playerName${i}">Игрок ${i + 1}</label>
      <input class="name-input" id="playerName${i}" maxlength="15" minlength="1"
        autocomplete="off" placeholder="Имя игрока ${i + 1}" value="${escapeText(oldNames[i] || "")}">
    </div>
  `).join("");
}

$("playerCount").addEventListener("change", renderNameFields);

function startGame() {
  const names = [...document.querySelectorAll(".name-input")].map(input => input.value.trim());
  if (names.some(name => name.length < 1 || name.length > 15)) {
    alert("Имя каждого игрока должно содержать от 1 до 15 символов.");
    return;
  }
  if (names.some((name, i) => names.slice(0, i).some(previous =>
    previous.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru")))) {
    if (!confirm("Есть игроки с одинаковыми именами. Продолжить?")) return;
  }
  game = { players: names, rounds: [] };
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
  const nextDealer = roundIndex === 0
    ? 0
    : (getDealerIndex(game.rounds[roundIndex - 1], roundIndex - 1) + 1) % count;
  const { states } = calculateGameState();
  const winner = states.find(state => state.winner);

  $("roundTitle").textContent = winner ? "Игра завершена" : `Раунд ${roundIndex + 1}`;
  $("roundCount").textContent = `${roundIndex} ${roundIndex === 1 ? "сыгран" : "сыграно"}`;
  $("enterBtn").disabled = Boolean(winner);
  $("enterBtn").textContent = winner ? "🏆 Партия завершена" : "+ Записать очки раунда";

  $("players").innerHTML = game.players.map((name, i) => {
    const state = states[i];
    const isDealer = i === nextDealer;
    const barrelText = state.barrel
      ? `${"🛢️".repeat(Math.min(state.barrel.attempt, 3))} · ${state.barrel.rounds}/3`
      : state.barrelFailures
        ? `${"🛢️".repeat(Math.min(state.barrelFailures, 3))} · сходов: ${state.barrelFailures}`
        : "в игре";
    const status = state.winner ? "🏆 Победитель" : isDealer ? "🔴 На прикупе" : barrelText;

    return `
      <article class="player-card ${isDealer ? "active-player" : ""} ${state.winner ? "winner-player" : ""} ${state.barrel ? "barrel-player" : ""}">
        <div class="player-top">
          <div class="player-name">${escapeText(name)}</div>
          ${isDealer ? '<span class="turn-dot" title="Прикуп"></span>' : ""}
        </div>
        <div class="score ${state.total < 0 ? "negative" : ""}">${state.total > 0 ? "+" : ""}${state.total}</div>
        <div class="player-meta">
          <span>${status}</span>
          <span><strong>R ${Math.max(0, 3 - state.rospisUsed)}/3</strong></span>
        </div>
      </article>
    `;
  }).join("");

  $("undoBtn").disabled = game.rounds.length === 0;
  renderHistory();
}

function renderHistory() {
  if (!game.rounds.length) {
    $("history").innerHTML = '<div class="empty-history">Здесь появятся очки сыгранных раундов</div>';
    return;
  }
  const { roundMarks } = calculateGameState();
  $("history").innerHTML = `
    <div class="history-list">
      ${game.rounds.map((round, reverseIndex) => {
        const index = game.rounds.length - 1 - reverseIndex;
        const actualRound = game.rounds[index];
        const dealerIndex = getDealerIndex(actualRound, index);
        return `
          <article class="history-card">
            <div class="history-title">Раунд ${index + 1}</div>
            ${actualRound.entries.map((entry, i) => {
              const special = entry.type === "R" ? " · R" :
                entry.type === "peach" ? " · 🍑" :
                entry.threeNines ? " · 3 девятки" : "";
              const mark = roundMarks[index][i];
              return `
                <div class="history-row">
                  <span class="history-player">
                    ${i === dealerIndex ? '<span class="history-dealer-dot" title="Игрок на прикупе"></span>' : ""}
                    ${escapeText(game.players[i])}${special}
                    ${mark ? `<span class="history-special-mark">${mark}</span>` : ""}
                  </span>
                  <span class="${entry.score < 0 ? "negative-text" : entry.score > 0 ? "positive" : ""}">${entry.score > 0 ? "+" : ""}${entry.score}</span>
                </div>
              `;
            }).join("")}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function openRound() {
  if (calculateGameState().states.some(state => state.winner)) return;
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
  const oldEntry = editingLastRound ? game.rounds[game.rounds.length - 1].entries[currentPlayer] : null;
  const oldBase = oldEntry && Number.isFinite(oldEntry.baseScore)
    ? oldEntry.baseScore
    : oldEntry && oldEntry.threeNines ? oldEntry.score + 120
    : oldEntry && oldEntry.type === "number" ? oldEntry.score : 0;
  rawInput = oldEntry && oldEntry.type === "number" ? String(oldBase) : "";
  threeNines = Boolean(oldEntry && oldEntry.threeNines);

  $("modal").hidden = false;
  $("modalError").textContent = "";
  const name = game.players[currentPlayer];
  const roundNumber = editingLastRound ? game.rounds.length : game.rounds.length + 1;
  $("modalSubtitle").textContent = `${editingLastRound ? "ИЗМЕНЕНИЕ · " : ""}РАУНД ${roundNumber} · ИГРОК ${currentPlayer + 1} ИЗ ${game.players.length}`;
  $("modalTitle").textContent = name;
  $("turnProgress").innerHTML = game.players.map((_, i) =>
    `<div class="turn-step ${i < currentPlayer ? "done" : i === currentPlayer ? "current" : ""}"></div>`
  ).join("");

  renderRButtons();
  updateDisplay();
  updateThreeNinesButton();
  $("confirmBtn").textContent = currentPlayer === game.players.length - 1 ? "Завершить раунд ✓" : "Следующий игрок →";
}

function renderRButtons() {
  const used = getRUsed(currentPlayer);
  const remaining = Math.max(0, 3 - used);
  $("rospisButtons").innerHTML = `
    <button class="rospis-btn" data-rospis ${remaining === 0 ? "disabled" : ""}>
      Роспись · осталось ${remaining}
    </button>
  `;
}

function updateThreeNinesButton() {
  const button = $("threeNinesBtn");
  button.classList.toggle("selected", threeNines);
  button.setAttribute("aria-pressed", String(threeNines));
}

function updateDisplay() {
  $("rawScore").textContent = rawInput || "0";
  const value = rawInput === "" || rawInput === "-" ? 0 : Number(rawInput);
  const rounded = roundScore(value);
  const finalScore = rounded - (threeNines ? 120 : 0);
  $("roundedHint").textContent = `Будет записано: ${finalScore > 0 ? "+" : ""}${finalScore}${threeNines ? " (штраф −120)" : ""}`;
}

function addKey(key) {
  $("modalError").textContent = "";
  if (key === "backspace") rawInput = rawInput.slice(0, -1);
  else if (key === "minus") rawInput = rawInput.startsWith("-") ? rawInput.slice(1) : "-" + rawInput;
  else {
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
  const button = event.target.closest("[data-rospis]");
  if (!button || button.disabled) return;
  draft.push({ playerIndex: currentPlayer, score: 0, type: "R" });
  nextPlayer();
});

$("peachBtn").addEventListener("click", () => {
  draft.push({ playerIndex: currentPlayer, score: 0, type: "peach" });
  nextPlayer();
});

$("threeNinesBtn").addEventListener("click", () => {
  threeNines = !threeNines;
  updateThreeNinesButton();
  updateDisplay();
});

function confirmScore() {
  if (rawInput === "-") {
    $("modalError").textContent = "Введи число после знака минус.";
    return;
  }
  const baseScore = roundScore(rawInput === "" ? 0 : Number(rawInput));
  if (!Number.isFinite(baseScore)) {
    $("modalError").textContent = "Некорректное число.";
    return;
  }
  draft.push({
    playerIndex: currentPlayer,
    score: baseScore - (threeNines ? 120 : 0),
    baseScore,
    threeNines,
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
      ...(entry.type === "number" ? { baseScore: entry.baseScore, threeNines: entry.threeNines } : {})
    };
  }
  if (entries.some(entry => !entry)) {
    $("modalError").textContent = "Не все игроки заполнили раунд.";
    return;
  }

  if (editingLastRound) {
    game.rounds[game.rounds.length - 1].entries = entries;
    editingLastRound = false;
  } else {
    const count = game.players.length;
    const previousDealer = game.rounds.length
      ? getDealerIndex(game.rounds[game.rounds.length - 1], game.rounds.length - 1)
      : count - 1;
    const dealerIndex = (previousDealer + 1) % count; // по часовой стрелке
    game.rounds.push({ entries, dealerIndex });
  }
  saveGame();
  renderGame();
}

function cancelModal() {
  if (draft.length && !confirm("Отменить ввод? Незавершённый раунд не будет сохранён.")) return;
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
  try { localStorage.removeItem(STORAGE_KEY); }
  catch (error) { console.warn("Не удалось очистить сохранение", error); }
  $("playerCount").value = "3";
  showSetup();
});

function restoreGame() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.rounds) ||
      ![3, 4].includes(parsed.players.length) ||
      parsed.players.some(name => typeof name !== "string" || name.length < 1 || name.length > 15) ||
      parsed.rounds.some(round => !round || !Array.isArray(round.entries) ||
        round.entries.length !== parsed.players.length ||
        (round.dealerIndex !== undefined && (!Number.isInteger(round.dealerIndex) || round.dealerIndex < 0 || round.dealerIndex >= parsed.players.length)) ||
        round.entries.some(entry => !entry || !Number.isFinite(entry.score) ||
          !["number", "R", "peach"].includes(entry.type) ||
          (entry.baseScore !== undefined && !Number.isFinite(entry.baseScore)) ||
          (entry.threeNines !== undefined && typeof entry.threeNines !== "boolean") ||
          (entry.type === "R" && entry.rIndex !== undefined && ![1, 2, 3].includes(entry.rIndex))))
    ) return false;
    game = parsed;
    return true;
  } catch (error) { return false; }
}

if (restoreGame()) renderGame();
else renderNameFields();
