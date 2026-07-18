(function () {
  "use strict";

  const WIN_SCORE = 10000;
  const DICE_COUNT = 6;

  const state = {
    players: [],
    playerTypes: [],
    currentPlayerIndex: 0,
    totalScores: [],
    roundScore: 0,
    dice: [],
    selectedDice: new Set(),
    frozenDice: new Set(),
    hasRolled: false,
    canBank: false,
    gameOver: false,
    isRolling: false,
    isMacke: false,
    computerThinking: false,
    hasFrozen: false,
    turnEnding: false,
  };

  const $setup = document.getElementById("setup");
  const $game = document.getElementById("game");
  const $winner = document.getElementById("winner");
  const $playersSetup = document.getElementById("players-setup");
  const $addPlayer = document.getElementById("add-player");
  const $addComputer = document.getElementById("add-computer");
  const $startGame = document.getElementById("start-game");
  const $setupError = document.getElementById("setup-error");
  const $activePlayer = document.getElementById("active-player");
  const $playersList = document.getElementById("players-list");
  const $diceContainer = document.getElementById("dice-container");
  const $roundScore = document.getElementById("round-score");
  const $selectionScore = document.getElementById("selection-score");
  const $currentPlayerName = document.getElementById("current-player-name");
  const $message = document.getElementById("message");
  const $rollBtn = document.getElementById("roll-btn");
  const $bankBtn = document.getElementById("bank-btn");
  const $winnerName = document.getElementById("winner-name");
  const $winnerScore = document.getElementById("winner-score");
  const $newGame = document.getElementById("new-game");

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Würfelsound: kurze "Klack"-Impulse via Web Audio API (kein Asset nötig).
  // AudioContext wird erst bei erstem Wurf erstellt (User-Gesture-Policy).
  let audioCtx = null;

  function playDiceClick(delaySec) {
    const t = audioCtx.currentTime + delaySec;
    const duration = 0.03 + Math.random() * 0.02;

    // Körniges Klack-Geräusch: kurzer Rausch-Burst mit Bandpass
    const noiseLen = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, noiseLen, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 2200 + Math.random() * 1800;
    bandpass.Q.value = 0.8;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.7, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(bandpass).connect(noiseGain).connect(audioCtx.destination);
    noise.start(t);
    noise.stop(t + duration);

    // Hoher "Klack"-Anteil: kurzer Sinus, sehr schnell fallend
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800 + Math.random() * 600, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + duration * 0.7);

    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.15, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.5);

    osc.connect(oscGain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  function playRollSound() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      // 4–6 unregelmäßige Klacks verteilt über die 600ms-Rollanimation
      const clicks = rand(4, 6);
      for (let i = 0; i < clicks; i++) {
        playDiceClick((i / clicks) * 0.5 + Math.random() * 0.06);
      }
    } catch (e) {
      // Sound ist optional — Spielfluss nie blockieren
    }
  }

  function showMessage(text, type = "info") {
    $message.textContent = text;
    $message.className = type;
  }

  function clearMessage() {
    $message.textContent = "";
    $message.className = "";
  }

  function switchScreen(name) {
    [$setup, $game, $winner].forEach((s) => s.classList.remove("active"));
    if (name === "setup") $setup.classList.add("active");
    if (name === "game") $game.classList.add("active");
    if (name === "winner") $winner.classList.add("active");
  }

  // Score calculation for a set of dice values
  function scoreDice(values) {
    const counts = {};
    values.forEach((v) => (counts[v] = (counts[v] || 0) + 1));

    let score = 0;
    let used = 0;

    for (let v = 1; v <= 6; v++) {
      const c = counts[v] || 0;
      if (c >= 3) {
        used += 3;
        score += v === 1 ? 1000 : v * 100;
      }
    }

    const ones = counts[1] || 0;
    const fives = counts[5] || 0;
    const tripleOnes = Math.min(ones, 3) >= 3 ? 1 : 0;
    const tripleFives = Math.min(fives, 3) >= 3 ? 1 : 0;

    const singleOnes = ones - tripleOnes * 3;
    const singleFives = fives - tripleFives * 3;

    used += singleOnes + singleFives;
    score += singleOnes * 100 + singleFives * 50;

    return { score, used };
  }

  function canScore(values) {
    return scoreDice(values).score > 0;
  }

  function selectedScore() {
    const values = Array.from(state.selectedDice).map(
      (i) => state.dice[i].value
    );
    return scoreDice(values).score;
  }

  function isValidSelection() {
    const values = Array.from(state.selectedDice).map(
      (i) => state.dice[i].value
    );
    const { score, used } = scoreDice(values);
    return score > 0 && used === values.length;
  }

  function countByValue(values) {
    const counts = {};
    values.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    return counts;
  }

  // Build DOM for a 3D die with six faces
  function createDie(index, value) {
    const wrapper = document.createElement("div");
    wrapper.className = "die-wrapper";
    wrapper.dataset.index = index;

    const die = document.createElement("div");
    die.className = "die";

    // Create faces in order: front(1), back(6), left(2), right(5), top(3), bottom(4)
    const faceValues = [1, 6, 2, 5, 3, 4];
    faceValues.forEach((faceValue) => {
      const face = document.createElement("div");
      face.className = `die-face face-${faceValue}`;
      for (let p = 0; p < faceValue; p++) {
        const pip = document.createElement("span");
        pip.className = "pip";
        face.appendChild(pip);
      }
      die.appendChild(face);
    });

    // Set orientation to show the current value
    die.classList.add(`show-${value}`);

    wrapper.appendChild(die);
    wrapper.addEventListener("click", () => onDieClick(index));
    return wrapper;
  }

  function renderDice() {
    $diceContainer.innerHTML = "";
    if (state.dice.length === 0) {
      // Render placeholder dice before first roll
      for (let i = 0; i < DICE_COUNT; i++) {
        const el = createDie(i, 1);
        el.classList.add("frozen");
        $diceContainer.appendChild(el);
      }
      return;
    }
    state.dice.forEach((d, i) => {
      const el = createDie(i, d.value);
      if (state.frozenDice.has(i)) {
        el.classList.add("frozen");
      }
      if (state.selectedDice.has(i)) {
        el.classList.add("selected");
      }
      if (d.rolling) {
        el.querySelector(".die").classList.add("rolling");
      }
      $diceContainer.appendChild(el);
    });
  }

  function updateScoreboard() {
    const activeIndex = state.currentPlayerIndex;
    const activeName = state.players[activeIndex];
    const activeScore = state.totalScores[activeIndex];

    $activePlayer.className = "score-card active";
    if (activeScore >= WIN_SCORE) $activePlayer.classList.add("winner");
    const activeIcon = state.playerTypes[activeIndex] === "computer" ? "🤖 " : "";
    $activePlayer.innerHTML = `<span class="name">${activeIcon}${escapeHtml(activeName)}</span><span class="score">${activeScore}</span>`;

    $playersList.innerHTML = "";
    state.players.forEach((name, i) => {
      if (i === activeIndex) return;
      const chip = document.createElement("div");
      chip.className = "player-chip";
      if (state.totalScores[i] >= WIN_SCORE) chip.classList.add("winner");
      const chipIcon = state.playerTypes[i] === "computer" ? "🤖 " : "";
      chip.innerHTML = `<span class="chip-name">${chipIcon}${escapeHtml(name)}</span><span class="chip-score">${state.totalScores[i]}</span>`;
      $playersList.appendChild(chip);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function updateStats() {
    $roundScore.textContent = state.roundScore;
    $selectionScore.textContent = selectedScore();
    $currentPlayerName.textContent = state.players[state.currentPlayerIndex] || "-";
  }

  function setControls() {
    const isComputer = state.playerTypes[state.currentPlayerIndex] === "computer";
    $bankBtn.disabled =
      (!state.canBank && !state.isMacke) ||
      state.isRolling ||
      isComputer ||
      state.turnEnding;
    $rollBtn.disabled =
      state.isRolling || isComputer || state.isMacke || state.turnEnding;
  }

  function onDieClick(index) {
    if (state.playerTypes[state.currentPlayerIndex] === "computer") return;
    if (state.isRolling || state.frozenDice.has(index)) return;
    if (!state.hasRolled) {
      showMessage("Würfle zuerst!", "warning");
      return;
    }

    if (state.selectedDice.has(index)) {
      state.selectedDice.delete(index);
    } else {
      state.selectedDice.add(index);
    }

    renderDice();
    updateStats();
    validateSelection();
    setControls();
  }

  function validateSelection() {
    if (state.selectedDice.size === 0) {
      clearMessage();
      state.canBank = false;
      return;
    }
    if (isValidSelection()) {
      state.canBank = true;
      showMessage("Gültige Auswahl. Würfle oder steig ein.", "success");
    } else {
      state.canBank = false;
      showMessage("Ungültige Auswahl. Nur wertbare Würfel markieren.", "danger");
    }
  }

  function rollDice() {
    if (state.isRolling || state.gameOver || state.turnEnding) return;

    // Prevent rolling again before selecting at least one scoring die
    if (state.hasRolled && state.selectedDice.size === 0 && !state.hasFrozen) {
      showMessage("Wähle mindestens einen wertbaren Würfel aus, bevor du wieder würfelst.", "warning");
      return;
    }

    if (state.selectedDice.size > 0) {
      if (!isValidSelection()) {
        showMessage("Wähle nur wertbare Würfel aus.", "danger");
        return;
      }
      freezeSelection();
    }

    const available = DICE_COUNT - state.frozenDice.size;
    if (available === 0) {
      state.frozenDice.clear();
      showMessage("Alle Würfel verbraucht! Du darfst mit 6 neuen weiterwürfeln.", "success");
    }

    state.isRolling = true;
    state.selectedDice.clear();
    state.hasRolled = true;
    state.canBank = false;
    state.isMacke = false;
    state.hasFrozen = false;
    clearMessage();
    setControls();

    state.dice = new Array(DICE_COUNT).fill(null).map((_, i) => {
      if (state.frozenDice.has(i)) {
        return { value: state.dice[i].value, rolling: false };
      }
      return { value: rand(1, 6), rolling: true };
    });

    renderDice();
    playRollSound();

    setTimeout(() => {
      state.dice.forEach((d) => {
        d.rolling = false;
      });
      renderDice();
      state.isRolling = false;
      setControls();
      evaluateRoll();
    }, 600);
  }

  function evaluateRoll() {
    const activeValues = state.dice
      .map((d, i) => (state.frozenDice.has(i) ? null : d.value))
      .filter((v) => v !== null);

    if (!canScore(activeValues)) {
      state.isMacke = true;
      state.canBank = false;
      showMessage("Macke! Schreibe auf, um den Zug zu beenden.", "danger");
      updateStats();
      setControls();
      scheduleComputerAction();
      return;
    }

    state.isMacke = false;
    state.canBank = false;
    showMessage("Wähle wertbare Würfel aus.", "info");
    scheduleComputerAction();
  }

  function freezeSelection() {
    const selected = Array.from(state.selectedDice);
    const values = selected.map((i) => state.dice[i].value);
    const { score } = scoreDice(values);

    state.roundScore += score;
    state.canBank = true;
    state.hasFrozen = true;
    selected.forEach((i) => state.frozenDice.add(i));
    state.selectedDice.clear();
    updateStats();
  }

  function bankScore() {
    if (state.isRolling || state.gameOver || state.turnEnding) return;

    // Macke end: allow banking with 0 points
    if (state.isMacke) {
      endMackeTurn();
      return;
    }

    if (!state.canBank) return;

    if (state.selectedDice.size > 0) {
      if (!isValidSelection()) {
        showMessage("Wähle nur wertbare Würfel aus.", "danger");
        return;
      }
      freezeSelection();
    }

    state.turnEnding = true;
    setControls();
    state.totalScores[state.currentPlayerIndex] += state.roundScore;
    showMessage(`${state.players[state.currentPlayerIndex]} bekommt ${state.roundScore} Punkte!`, "success");
    updateScoreboard();

    if (state.totalScores[state.currentPlayerIndex] >= WIN_SCORE) {
      endGame();
      return;
    }

    setTimeout(nextTurn, 900);
  }

  function endMackeTurn() {
    state.turnEnding = true;
    setControls();
    showMessage(`Macke! ${state.players[state.currentPlayerIndex]} verliert die Runde.`, "danger");
    setTimeout(nextTurn, 900);
  }

  function nextTurn() {
    state.currentPlayerIndex =
      (state.currentPlayerIndex + 1) % state.players.length;
    state.roundScore = 0;
    state.dice = [];
    state.selectedDice.clear();
    state.frozenDice.clear();
    state.hasRolled = false;
    state.canBank = false;
    state.isRolling = false;
    state.isMacke = false;
    state.hasFrozen = false;
    state.turnEnding = false;
    clearMessage();

    renderDice();
    updateScoreboard();
    updateStats();
    setControls();
    showMessage(`Drücke "Würfeln", um deinen Zug zu starten.`, "info");
    scheduleComputerAction();
  }

  function endGame() {
    state.gameOver = true;
    const winner = state.players[state.currentPlayerIndex];
    const score = state.totalScores[state.currentPlayerIndex];
    $winnerName.textContent = winner;
    $winnerScore.textContent = `${score} Punkte`;
    switchScreen("winner");
  }

  // ========== COMPUTER AI ==========

  function isComputerTurn() {
    return state.playerTypes[state.currentPlayerIndex] === "computer";
  }

  function scheduleComputerAction() {
    if (!isComputerTurn() || state.gameOver || state.isRolling || state.computerThinking) return;
    state.computerThinking = true;
    setTimeout(() => {
      computerTurnStep();
      state.computerThinking = false;
    }, 1100);
  }

  function computerTurnStep() {
    if (!isComputerTurn() || state.gameOver || state.isRolling || state.turnEnding) return;

    // Handle Macke: press bank to end turn
    if (state.isMacke) {
      bankScore();
      return;
    }

    // First action of turn: roll
    if (!state.hasRolled) {
      rollDice();
      return;
    }

    // After a roll: decide what to do
    const choice = chooseBestComputerMove();
    if (!choice || choice.score === 0) {
      // Should not happen (Macke handled above), but safety fallback
      rollDice();
      return;
    }

    // Select dice visually
    state.selectedDice = new Set(choice.indices);
    renderDice();
    updateStats();

    showMessage(`Computer wählt ${choice.score} Punkte...`, "info");

    setTimeout(() => {
      if (!isComputerTurn() || state.gameOver) return;
      freezeSelection();
      setControls();

      // Decide: bank or roll again?
      if (shouldBank()) {
        showMessage(`Computer schreibt ${state.roundScore} Punkte auf.`, "success");
        setTimeout(() => bankScore(), 800);
      } else {
        showMessage("Computer würfelt weiter...", "info");
        setTimeout(() => rollDice(), 800);
      }
    }, 900);
  }

  // Returns the best subset of currently available dice indices for the computer.
  // Prefers subsets that use more dice when scores tie.
  function chooseBestComputerMove() {
    const availableIndices = [];
    state.dice.forEach((d, i) => {
      if (!state.frozenDice.has(i)) availableIndices.push(i);
    });
    const n = availableIndices.length;
    if (n === 0) return null;

    let best = null;

    for (let mask = 1; mask < (1 << n); mask++) {
      const indices = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) indices.push(availableIndices[i]);
      }
      const values = indices.map((i) => state.dice[i].value);
      const { score, used } = scoreDice(values);
      if (score > 0 && used === values.length) {
        if (
          !best ||
          score > best.score ||
          (score === best.score && indices.length > best.indices.length)
        ) {
          best = { indices, score };
        }
      }
    }
    return best;
  }

  function shouldBank() {
    const remainingDice = DICE_COUNT - state.frozenDice.size;
    const potentialTotal = state.totalScores[state.currentPlayerIndex] + state.roundScore;
    const computerTotal = state.totalScores[state.currentPlayerIndex];
    const maxOpponent = Math.max(...state.totalScores);
    const behind = maxOpponent - computerTotal;

    // Win if possible
    if (potentialTotal >= WIN_SCORE) return true;

    // All dice frozen -> fresh 6 dice, always roll again
    if (remainingDice === 0) return false;

    // With plenty of dice left, be bold
    if (remainingDice >= 3) {
      if (behind > 1500 && state.roundScore < 500) return false;
      if (state.roundScore >= 800) return true;
      return false;
    }

    // With 1-2 dice left, bank a reasonable amount
    const target = computerTotal >= 7000 ? 400 : 250;
    if (state.roundScore >= target) return true;

    // Far behind: try to catch up even with few dice
    if (behind > 2000 && state.roundScore < 400) return false;

    return false;
  }

  // ========== SETUP ==========

  const COMPUTER_NAMES = [
    "Robo", "Kalle", "Doro", "Hanni", "Fritz", "Greta", "Otto", "Berta",
    "Klara", "Hugo", "Emil", "Luise", "Walter", "Erika", "Paul", "Anna"
  ];

  function getRandomComputerName() {
    const existing = new Set(state.players);
    // Also avoid names already present in setup rows
    Array.from($playersSetup.querySelectorAll(".player-name")).forEach((input) => {
      if (input.value.trim()) existing.add(input.value.trim());
    });
    const available = COMPUTER_NAMES.filter((n) => !existing.has(n));
    if (available.length === 0) return `Computer ${existing.size + 1}`;
    return available[rand(0, available.length - 1)];
  }

  function addPlayerRow(type = "human") {
    if ($playersSetup.children.length >= 8) return;
    const row = document.createElement("div");
    row.className = "player-input-row";
    row.dataset.type = type;

    if (type === "computer") {
      const name = getRandomComputerName();
      row.innerHTML = `
        <span class="computer-badge">🤖</span>
        <input type="text" class="player-name" placeholder="${escapeHtml(name)}" maxlength="20" value="${escapeHtml(name)}" />
        <button type="button" class="remove-player" title="Entfernen">×</button>
      `;
      row.querySelector(".remove-player").addEventListener("click", () => {
        row.remove();
        updatePlaceholders();
      });
    } else {
      row.innerHTML = `
        <input type="text" class="player-name" placeholder="Spielername" maxlength="20" />
      `;
    }
    $playersSetup.appendChild(row);
    updatePlaceholders();
  }

  function updatePlaceholders() {
    let humanCount = 0;
    let computerCount = 0;
    Array.from($playersSetup.children).forEach((row) => {
      const input = row.querySelector(".player-name");
      if (row.dataset.type === "computer") {
        computerCount++;
      } else {
        humanCount++;
        input.placeholder = "Spielername";
      }
    });
  }

  function setupGame() {
    const rows = Array.from($playersSetup.querySelectorAll(".player-input-row"));
    const entries = rows
      .map((row) => ({
        name: row.querySelector(".player-name").value.trim(),
        type: row.dataset.type || "human",
      }))
      .filter((e) => e.name !== "");

    if (entries.length < 2) {
      $setupError.textContent = "Mindestens 2 Spieler mit Namen eingeben.";
      return;
    }

    const names = entries.map((e) => e.name);
    const unique = new Set(names);
    if (unique.size !== names.length) {
      $setupError.textContent = "Jeder Spieler braucht einen eindeutigen Namen.";
      return;
    }

    state.players = names;
    state.playerTypes = entries.map((e) => e.type);
    state.totalScores = new Array(entries.length).fill(0);
    state.currentPlayerIndex = 0;
    state.roundScore = 0;
    state.dice = [];
    state.selectedDice.clear();
    state.frozenDice.clear();
    state.hasRolled = false;
    state.canBank = false;
    state.gameOver = false;
    state.isMacke = false;
    state.computerThinking = false;
    state.hasFrozen = false;
    state.turnEnding = false;

    updateScoreboard();
    updateStats();
    renderDice();
    setControls();
    clearMessage();
    showMessage(`Drücke "Würfeln", um deinen Zug zu starten.`, "info");
    switchScreen("game");
    scheduleComputerAction();
  }

  // ========== INIT ==========

  // Initial single human player row
  addPlayerRow("human");

  $addPlayer.addEventListener("click", () => addPlayerRow("human"));
  $addComputer.addEventListener("click", () => addPlayerRow("computer"));
  $startGame.addEventListener("click", setupGame);
  $rollBtn.addEventListener("click", rollDice);
  $bankBtn.addEventListener("click", bankScore);
  $newGame.addEventListener("click", () => {
    // Reset setup screen to single empty human player
    $playersSetup.innerHTML = "";
    addPlayerRow("human");
    $setupError.textContent = "";
    switchScreen("setup");
  });

  $playersSetup.addEventListener("keydown", (e) => {
    if (e.key === "Enter") setupGame();
  });

  // Debug API for testing
  window.MackeGame = {
    DebugAudio: { playRollSound },
    getState: () => ({
      players: state.players,
      playerTypes: state.playerTypes,
      currentPlayer: state.currentPlayerIndex,
      totalScores: state.totalScores,
      roundScore: state.roundScore,
      dice: state.dice.map((d) => d.value),
      selected: Array.from(state.selectedDice),
      frozen: Array.from(state.frozenDice),
      canBank: state.canBank,
      hasRolled: state.hasRolled,
    }),
    forceRoll: (values) => {
      state.dice = values.map((v) => ({ value: v, rolling: false }));
      state.selectedDice.clear();
      state.frozenDice.clear();
      state.hasRolled = true;
      state.isRolling = false;
      state.canBank = false;
      renderDice();
      updateStats();
      validateSelection();
      setControls();
      evaluateRoll();
    },
    setCurrentPlayer: (index) => {
      state.currentPlayerIndex = index;
      state.roundScore = 0;
      state.dice = [];
      state.selectedDice.clear();
      state.frozenDice.clear();
      state.hasRolled = false;
      state.canBank = false;
      state.isMacke = false;
      renderDice();
      updateScoreboard();
      updateStats();
      setControls();
      clearMessage();
      scheduleComputerAction();
    },
  };
})();
