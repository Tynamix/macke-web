(function () {
  "use strict";

  const WIN_SCORE = 10000;
  const DICE_COUNT = 6;

  const state = {
    players: [],
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
  };

  const $setup = document.getElementById("setup");
  const $game = document.getElementById("game");
  const $winner = document.getElementById("winner");
  const $playersSetup = document.getElementById("players-setup");
  const $addPlayer = document.getElementById("add-player");
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
    const duration = 0.05 + Math.random() * 0.03;

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
    bandpass.frequency.value = 1500 + Math.random() * 1500;
    bandpass.Q.value = 1.2;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(bandpass).connect(noiseGain).connect(audioCtx.destination);
    noise.start(t);
    noise.stop(t + duration);

    // Tiefer "Thock"-Anteil: kurzer Sinus, schnell fallend
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180 + Math.random() * 80, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + duration);

    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.25, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

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
    $activePlayer.innerHTML = `<span class="name">${escapeHtml(activeName)}</span><span class="score">${activeScore}</span>`;

    $playersList.innerHTML = "";
    state.players.forEach((name, i) => {
      if (i === activeIndex) return;
      const chip = document.createElement("div");
      chip.className = "player-chip";
      if (state.totalScores[i] >= WIN_SCORE) chip.classList.add("winner");
      chip.innerHTML = `<span class="chip-name">${escapeHtml(name)}</span><span class="chip-score">${state.totalScores[i]}</span>`;
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
    $bankBtn.disabled = !state.canBank || state.isRolling;
    $rollBtn.disabled = state.isRolling;
  }

  function onDieClick(index) {
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
    if (state.isRolling || state.gameOver) return;

    // If previous roll was a Macke, end turn and immediately roll for the next player
    if (state.isMacke) {
      state.roundScore = 0;
      const currentName = state.players[state.currentPlayerIndex];
      showMessage(`Macke! ${currentName} kommt auf 0 Punkte.`, "danger");
      state.isMacke = false;
      state.dice = [];
      state.frozenDice.clear();
      state.selectedDice.clear();
      state.hasRolled = false;
      state.currentPlayerIndex =
        (state.currentPlayerIndex + 1) % state.players.length;
      updateScoreboard();
      updateStats();
      renderDice();
      clearMessage();
      // Continue directly into rolling for the next player
    } else {
      // Prevent rolling again before selecting at least one scoring die
      if (state.hasRolled && state.selectedDice.size === 0) {
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
      showMessage("Macke! Drücke \"Würfeln\", um den Zug zu enden.", "danger");
      updateStats();
      setControls();
      return;
    }

    state.isMacke = false;
    state.canBank = false;
    showMessage("Wähle wertbare Würfel aus.", "info");
  }

  function freezeSelection() {
    const selected = Array.from(state.selectedDice);
    const values = selected.map((i) => state.dice[i].value);
    const { score } = scoreDice(values);

    state.roundScore += score;
    state.canBank = true;
    selected.forEach((i) => state.frozenDice.add(i));
    state.selectedDice.clear();
    updateStats();
  }

  function bankScore() {
    if (!state.canBank || state.isRolling || state.gameOver) return;

    if (state.selectedDice.size > 0) {
      if (!isValidSelection()) {
        showMessage("Wähle nur wertbare Würfel aus.", "danger");
        return;
      }
      freezeSelection();
    }

    state.totalScores[state.currentPlayerIndex] += state.roundScore;
    showMessage(`${state.players[state.currentPlayerIndex]} bekommt ${state.roundScore} Punkte!`, "success");
    updateScoreboard();

    if (state.totalScores[state.currentPlayerIndex] >= WIN_SCORE) {
      endGame();
      return;
    }

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
    clearMessage();

    renderDice();
    updateScoreboard();
    updateStats();
    setControls();
    showMessage(`Drücke "Würfeln", um deinen Zug zu starten.`, "info");
  }

  function endGame() {
    state.gameOver = true;
    const winner = state.players[state.currentPlayerIndex];
    const score = state.totalScores[state.currentPlayerIndex];
    $winnerName.textContent = winner;
    $winnerScore.textContent = `${score} Punkte`;
    switchScreen("winner");
  }

  function setupGame() {
    const inputs = Array.from($playersSetup.querySelectorAll(".player-name"));
    const names = inputs.map((i) => i.value.trim()).filter((n) => n !== "");

    if (names.length < 2) {
      $setupError.textContent = "Mindestens 2 Spieler mit Namen eingeben.";
      return;
    }

    const unique = new Set(names);
    if (unique.size !== names.length) {
      $setupError.textContent = "Jeder Spieler braucht einen eindeutigen Namen.";
      return;
    }

    state.players = names;
    state.totalScores = new Array(names.length).fill(0);
    state.currentPlayerIndex = 0;
    state.roundScore = 0;
    state.dice = [];
    state.selectedDice.clear();
    state.frozenDice.clear();
    state.hasRolled = false;
    state.canBank = false;
    state.gameOver = false;
    state.isMacke = false;

    updateScoreboard();
    updateStats();
    renderDice();
    setControls();
    clearMessage();
    showMessage(`Drücke "Würfeln", um deinen Zug zu starten.`, "info");
    switchScreen("game");
  }

  $addPlayer.addEventListener("click", () => {
    if ($playersSetup.children.length >= 8) return;
    const row = document.createElement("div");
    row.className = "player-input-row";
    row.innerHTML = `<input type="text" class="player-name" placeholder="Spieler ${
      $playersSetup.children.length + 1
    }" maxlength="20" />`;
    $playersSetup.appendChild(row);
  });

  $startGame.addEventListener("click", setupGame);
  $rollBtn.addEventListener("click", rollDice);
  $bankBtn.addEventListener("click", bankScore);
  $newGame.addEventListener("click", () => {
    Array.from($playersSetup.querySelectorAll(".player-name")).forEach(
      (i) => (i.value = "")
    );
    $setupError.textContent = "";
    switchScreen("setup");
  });

  $playersSetup.addEventListener("keydown", (e) => {
    if (e.key === "Enter") setupGame();
  });

  // Debug API for testing
  window.MackeGame = {
    getState: () => ({
      players: state.players,
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
  };
})();
