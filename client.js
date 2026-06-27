(() => {
  "use strict";

  const PIP_LAYOUTS = {
    0: [],
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 4, 7, 3, 6, 9],
  };

  const SEAT_LABELS = ["Anda", "Kiri", "Mitra", "Kanan"];

  let ws = null;
  let mySeat = null;
  let isHost = false;
  let gameState = null;
  let selectedTileIndex = null;
  let timerInterval = null;
  let lastChatLen = 0;

  const $ = (id) => document.getElementById(id);

  const screens = {
    lobby: $("screen-lobby"),
    waiting: $("screen-waiting"),
    game: $("screen-game"),
  };

  const els = {
    inputName: $("input-name"),
    inputCode: $("input-code"),
    lobbyError: $("lobby-error"),
    displayCode: $("display-code"),
    playerCount: $("player-count"),
    playerList: $("player-list"),
    waitingHint: $("waiting-hint"),
    btnStart: $("btn-start"),
    waitScoreA: $("wait-score-a"),
    waitScoreB: $("wait-score-b"),
    scoreA: $("score-a"),
    scoreB: $("score-b"),
    handNum: $("hand-num"),
    gameRoomCode: $("game-room-code"),
    turnLine: $("turn-line"),
    seatLeft: $("seat-left"),
    seatMid: $("seat-mid"),
    seatRight: $("seat-right"),
    seatYou: $("seat-you"),
    btnLeaveGame: $("btn-leave-game"),
    endLeft: $("end-left"),
    endRight: $("end-right"),
    boardChain: $("board-chain"),
    boardScroll: $("board-scroll"),
    gameMsg: $("game-msg"),
    myHand: $("my-hand"),
    myCount: $("my-count"),
    btnPass: $("btn-pass"),
    btnPlayLeft: $("btn-play-left"),
    btnPlayRight: $("btn-play-right"),
    btnLeftNum: $("btn-left-num"),
    btnRightNum: $("btn-right-num"),
    modalRound: $("modal-round"),
    modalRoundTitle: $("modal-round-title"),
    modalRoundBody: $("modal-round-body"),
    modalRoundList: $("modal-round-list"),
    btnNextHand: $("btn-next-hand"),
    modalHostNote: $("modal-host-note"),
    modalWin: $("modal-win"),
    modalWinTitle: $("modal-win-title"),
    modalWinBody: $("modal-win-body"),
    toast: $("toast"),
    chatFabWait: $("chat-fab-wait"),
    chatFabGame: $("chat-fab-game"),
    chatDrawerWait: $("chat-drawer-wait"),
    chatDrawerGame: $("chat-drawer-game"),
    chatMessagesWait: $("chat-messages-wait"),
    chatMessagesGame: $("chat-messages-game"),
    chatFormWait: $("chat-form-wait"),
    chatFormGame: $("chat-form-game"),
    dropZones: $("drop-zones"),
    dropLeft: $("drop-left"),
    dropRight: $("drop-right"),
    dragHint: $("drag-hint"),
    boardPanel: $("board-panel"),
  };

  let drag = null;

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== name);
    });
  }

  function showError(message) {
    els.lobbyError.hidden = false;
    els.lobbyError.textContent = message;
  }

  function clearError() {
    els.lobbyError.hidden = true;
    els.lobbyError.textContent = "";
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    window.setTimeout(() => {
      els.toast.hidden = true;
    }, 2800);
  }

  function wsUrl() {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}`;
  }

  function connect() {
    if (ws) {
      ws.close();
    }
    ws = new WebSocket(wsUrl());

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "error") {
        showToast(msg.message);
        return;
      }

      if (msg.type === "joined") {
        mySeat = msg.seat;
        isHost = msg.seat === 0;
        els.displayCode.textContent = msg.roomCode;
        els.gameRoomCode.textContent = msg.roomCode;
        showScreen("waiting");
        clearError();
        return;
      }

      if (msg.type === "state") {
        gameState = msg.state;
        isHost = gameState.yourSeat === gameState.hostSeat;
        renderState(gameState);
      }
    };

    ws.onclose = () => {
      showToast("Koneksi terputus.");
    };
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function relativeSeat(absSeat, mySeatNum) {
    return (absSeat - mySeatNum + 4) % 4;
  }

  function tileLabel(tile) {
    return `${tile.a}|${tile.b}`;
  }

  function getPlayOptions(tile, leftEnd, rightEnd) {
    if (leftEnd === null) {
      return [{ side: "first" }];
    }
    const options = [];
    if (tile.a === leftEnd || tile.b === leftEnd) {
      options.push({ side: "left" });
    }
    if (tile.a === rightEnd || tile.b === rightEnd) {
      options.push({ side: "right" });
    }
    return options;
  }

  function createDominoElement(tile, opts = {}) {
    const {
      orientation = "vertical",
      playable = false,
      selected = false,
      disabled = false,
      onClick = null,
    } = opts;

    const domino = document.createElement("div");
    domino.className = "domino";
    if (orientation === "horizontal") {
      domino.classList.add("horizontal-board");
    } else {
      domino.classList.add("vertical-board");
    }
    if (playable) domino.classList.add("playable");
    if (selected) domino.classList.add("selected");
    if (disabled) domino.classList.add("disabled");

    const isHoriz = orientation === "horizontal";
    const halves = isHoriz ? ["left", "right"] : ["top", "bottom"];
    const values = [tile.a, tile.b];

    halves.forEach((cls, idx) => {
      const half = document.createElement("div");
      half.className = `half ${cls}`;
      const value = values[idx];
      for (let cell = 1; cell <= 9; cell += 1) {
        const pip = document.createElement("span");
        pip.className = value === 6 ? "pip six" : "pip";
        if (!PIP_LAYOUTS[value].includes(cell)) {
          pip.classList.add("hidden");
        }
        half.appendChild(pip);
      }
      domino.appendChild(half);
    });

    if (onClick) {
      domino.addEventListener("click", onClick);
    }

    return domino;
  }

  function renderWaiting(state) {
    const connectedCount = state.connected.filter((p) => p.connected && p.name).length;
    els.playerCount.textContent = String(connectedCount);
    els.waitScoreA.textContent = String(state.teamScores[0]);
    els.waitScoreB.textContent = String(state.teamScores[1]);

    els.playerList.innerHTML = "";
    for (let seat = 0; seat < 4; seat += 1) {
      const info = state.connected[seat];
      const li = document.createElement("li");
      if (info.connected && info.name) {
        li.className = seat === state.yourSeat ? "you" : "";
        const teamClass = info.team === 0 ? "a" : "b";
        li.innerHTML = `
          <span>${info.name}${seat === state.yourSeat ? " (Anda)" : ""}${seat === state.hostSeat ? " · Host" : ""}</span>
          <span class="seat-badge ${teamClass}">${info.team === 0 ? "Tim A" : "Tim B"} · Kursi ${seat + 1}</span>
        `;
      } else {
        li.className = "empty";
        li.textContent = `Kursi ${seat + 1} — menunggu pemain…`;
      }
      els.playerList.appendChild(li);
    }

    els.btnStart.disabled = connectedCount < 4 || state.yourSeat !== state.hostSeat;
    els.waitingHint.textContent = connectedCount < 4
      ? "Bagikan kode ruangan ke 3 pemain lain."
      : state.yourSeat === state.hostSeat
        ? "Semua pemain siap! Tekan mulai."
        : "Menunggu host memulai permainan…";
  }

  function fillSeat(el, posClass, absSeat, roleLabel, state) {
    const info = state.connected[absSeat];
    const isActive = state.phase === "playing" && state.currentPlayer === absSeat;
    const isYou = absSeat === state.yourSeat;
    const teamClass = info.team === 0 ? "teamA" : "teamB";
    const name = info.name || `Pemain ${absSeat + 1}`;
    const initial = escapeHtml((name.charAt(0) || "?").toUpperCase());
    const score = state.teamScores[info.team];
    const target = state.targetScore;

    el.className = `seat ${posClass} ${teamClass}${isActive ? " active" : ""}${isYou ? " is-you" : ""}`;
    el.innerHTML = `
      <div class="avatar-wrap">
        ${isActive ? '<div class="ring"></div>' : ""}
        <div class="avatar">${initial}</div>
        <div class="tiles-badge">${info.tileCount}</div>
        ${isActive ? '<div class="sec-badge"></div>' : ""}
      </div>
      <div class="plate">
        <span class="prole">${escapeHtml(roleLabel)}</span>
        <span class="pname">${escapeHtml(name)}</span>
        <span class="pscore">${score}/${target}</span>
      </div>
    `;
  }

  function renderSeats(state) {
    fillSeat(els.seatLeft, "pos-left", (state.yourSeat + 3) % 4, "Kiri", state);
    fillSeat(els.seatMid, "pos-mid", (state.yourSeat + 2) % 4, "Mitra", state);
    fillSeat(els.seatRight, "pos-right", (state.yourSeat + 1) % 4, "Kanan", state);
    fillSeat(els.seatYou, "pos-you", state.yourSeat, "Anda", state);
  }

  function getCssPx(name, fallback) {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.width = `var(${name})`;
    document.body.appendChild(probe);
    const px = Number.parseFloat(getComputedStyle(probe).width);
    probe.remove();
    return Number.isFinite(px) ? px : fallback;
  }

  /*
   * For each tile in the board chain, determine whether it is "chain-flipped":
   *   flipped=false → tile.a is the left/connecting end, tile.b faces right
   *   flipped=true  → tile.b is the left/connecting end, tile.a faces right
   *
   * leftEnd is the exposed pip on the left side of board[0].
   */
  function getChainDirections(board, leftEnd) {
    if (!board || board.length === 0) return [];
    const dirs = [];
    const first = board[0].tile;
    // If first.a === leftEnd, a is the open left side → not flipped
    dirs.push({ flipped: first.a !== leftEnd });
    for (let i = 1; i < board.length; i++) {
      const prev = board[i - 1].tile;
      const prevFlipped = dirs[i - 1].flipped;
      // The pip on the RIGHT (chain-right) of the previous tile
      const prevRight = prevFlipped ? prev.a : prev.b;
      const curr = board[i].tile;
      // curr's chain-left must equal prevRight
      // If curr.a === prevRight → a is the connecting (left) side → not flipped
      dirs.push({ flipped: curr.a !== prevRight });
    }
    return dirs;
  }

  /*
   * Board layout — ZiMAD-style snake:
   * long horizontal row → vertical turn column → next row back the other way.
   * This makes row changes visually connected, like the reference image, instead
   * of looking like separate wrapped text lines.
   */
  function buildBoardLayout(entries, availW, availH) {
    const tw = getCssPx("--board-tile-w", 24);
    const th = getCssPx("--board-tile-h", tw * 1.92);
    const gx = 0;
    const balakExtra = Math.ceil((th - tw) / 2); // how much a vertical balak sticks out
    const horizontalMaxW = Math.max(th * 4, availW - tw);
    const turnSlots = availH >= th * 5 ? 3 : 2;
    const rowStep = turnSlots * th;
    const raw = [];
    let idx = 0;
    let rowTop = 0;
    let startX = 0;
    let dir = 1; // 1 = left→right, -1 = right→left

    while (idx < entries.length) {
      let cursorX = startX;
      let usedW = 0;
      let placedInRow = 0;

      while (idx < entries.length) {
        const entry = entries[idx];
        const isBalak = entry.tile.a === entry.tile.b;
        const advance = isBalak ? tw : th;

        if (placedInRow > 0 && usedW + advance > horizontalMaxW) {
          break;
        }

        const left = dir === 1 ? cursorX : cursorX - advance;

        raw.push(isBalak
          ? {
              left,
              top: rowTop - balakExtra,
              orientation: "vertical",
              direction: dir === 1 ? "right" : "left",
            }
          : {
              left,
              top: rowTop,
              orientation: "horizontal",
              direction: dir === 1 ? "right" : "left",
            });
        cursorX += dir * advance;
        usedW += advance + gx;
        placedInRow += 1;
        idx += 1;
      }

      if (idx >= entries.length) break;

      const turnLeft = dir === 1 ? cursorX : cursorX - tw;

      for (let slot = 0; slot < turnSlots && idx < entries.length; slot += 1) {
        raw.push({
          left: turnLeft,
          top: rowTop + slot * th,
          orientation: "vertical",
          direction: "down",
        });
        idx += 1;
      }

      rowTop += rowStep;
      startX = dir === 1 ? turnLeft : turnLeft + tw;
      dir *= -1;
    }

    // Shift everything down if any tile has negative top (from balak on first row)
    const minTop = raw.reduce((m, p) => Math.min(m, p.top), 0);
    const shift = minTop < 0 ? -minTop : 0;
    const positions = raw.map((p) => ({ ...p, top: p.top + shift }));

    const maxRight = positions.reduce((m, p) => Math.max(m, p.left + (p.orientation === "horizontal" ? th : tw)), 0);
    const maxBottom = positions.reduce((m, p) => Math.max(m, p.top + (p.orientation === "horizontal" ? tw : th)), 0);
    const minLeft = positions.reduce((m, p) => Math.min(m, p.left), 0);
    const minTopAfterShift = positions.reduce((m, p) => Math.min(m, p.top), 0);
    const normalizeX = minLeft < 0 ? -minLeft : 0;
    const normalizeY = minTopAfterShift < 0 ? -minTopAfterShift : 0;
    positions.forEach((p) => {
      p.left += normalizeX;
      p.top += normalizeY;
    });
    const totalW = maxRight + normalizeX;
    const totalH = maxBottom + normalizeY;

    return { positions, tw, th, totalW, totalH };
  }

  function renderBoard(state) {
    els.boardChain.innerHTML = "";
    els.endLeft.textContent = state.leftEnd === null ? "—" : String(state.leftEnd);
    els.endRight.textContent = state.rightEnd === null ? "—" : String(state.rightEnd);

    if (state.board.length === 0) {
      const empty = document.createElement("p");
      empty.className = "board-empty";
      empty.textContent = "Menunggu kartu pembuka…";
      els.boardChain.appendChild(empty);
      return;
    }

    const scrollEl = els.boardScroll;
    const availW = Math.max(100, scrollEl.clientWidth - 16);
    const availH = Math.max(60, scrollEl.clientHeight - 16);
    const { positions, totalW, totalH } = buildBoardLayout(state.board, availW, availH);

    // Compute which end of each tile faces chain-left (for correct pip orientation)
    const dirs = getChainDirections(state.board, state.leftEnd);

    const canvasW = Math.max(availW, totalW + 8);
    const canvasH = Math.max(availH, totalH + 8);
    const offsetX = Math.round((canvasW - totalW) / 2);
    const offsetY = Math.round((canvasH - totalH) / 2);

    els.boardChain.style.width = `${canvasW}px`;
    els.boardChain.style.height = `${canvasH}px`;

    state.board.forEach((entry, idx) => {
      const pos = positions[idx];
      const isBalak = entry.tile.a === entry.tile.b;

      const chainFlipped = dirs[idx] ? dirs[idx].flipped : false;
      const visualFlip = pos.direction === "left" ? !chainFlipped : chainFlipped;

      // For non-balak tiles, swapping a↔b shows the tile flipped (pip mirror).
      // For balak, both halves are identical so flipping has no visual effect.
      const displayTile = (visualFlip && !isBalak)
        ? { a: entry.tile.b, b: entry.tile.a }
        : entry.tile;

      const domino = createDominoElement(displayTile, { orientation: pos.orientation });
      domino.classList.add("board-piece");
      domino.style.left = `${pos.left + offsetX}px`;
      domino.style.top = `${pos.top + offsetY}px`;
      els.boardChain.appendChild(domino);
    });

    window.requestAnimationFrame(() => {
      scrollEl.scrollLeft = Math.max(0, (scrollEl.scrollWidth - scrollEl.clientWidth) / 2);
      scrollEl.scrollTop = Math.max(0, (scrollEl.scrollHeight - scrollEl.clientHeight) / 2);
    });
  }

  function renderMyHand(state) {
    if (drag) {
      return;
    }
    els.myHand.innerHTML = "";
    const hand = state.yourHand || [];
    els.myCount.textContent = String(hand.length);

    const sorted = hand
      .map((tile, index) => ({ tile, index }))
      .sort((a, b) => a.tile.a - b.tile.a || a.tile.b - b.tile.b);

    sorted.forEach(({ tile, index }) => {
      const options = state.isYourTurn
        ? getPlayOptions(tile, state.leftEnd, state.rightEnd)
        : [];
      const domino = createDominoElement(tile, {
        orientation: "vertical",
        playable: options.length > 0,
        selected: selectedTileIndex === index,
        disabled: state.isYourTurn && options.length === 0,
      });

      if (options.length > 0) {
        domino.addEventListener("pointerdown", (e) => beginDrag(e, index, tile, options, domino));
      }
      els.myHand.appendChild(domino);
    });

    els.dragHint.textContent = state.isYourTurn
      ? "Tarik kartu ke papan untuk main"
      : "Tunggu giliran Anda…";
  }

  function sideForZone(zone, options) {
    const wantLeft = zone === els.dropLeft;
    if (options.some((o) => o.side === "first")) {
      return "first";
    }
    if (wantLeft && options.some((o) => o.side === "left")) {
      return "left";
    }
    if (!wantLeft && options.some((o) => o.side === "right")) {
      return "right";
    }
    return null;
  }

  function highlightValidZones(options) {
    const leftOk = options.some((o) => o.side === "left" || o.side === "first");
    const rightOk = options.some((o) => o.side === "right" || o.side === "first");
    els.dropLeft.classList.toggle("valid", leftOk);
    els.dropRight.classList.toggle("valid", rightOk);
  }

  function clearZones() {
    [els.dropLeft, els.dropRight].forEach((z) => z.classList.remove("valid", "hot"));
  }

  function zoneAt(x, y) {
    for (const z of [els.dropLeft, els.dropRight]) {
      if (!z.classList.contains("valid")) {
        continue;
      }
      const r = z.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top - 40 && y <= r.bottom + 10) {
        return z;
      }
    }
    return null;
  }

  function beginDrag(e, index, tile, options, sourceEl) {
    if (!gameState || !gameState.isYourTurn || e.button === 2) {
      return;
    }
    e.preventDefault();
    drag = { index, tile, options, sourceEl, ghost: null, moved: false, startX: e.clientX, startY: e.clientY };
    sourceEl.classList.add("dragging");
    els.boardPanel.classList.add("dragging");
    highlightValidZones(options);
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onDragEnd);
    document.addEventListener("pointercancel", onDragEnd);
  }

  function ensureGhost() {
    if (drag.ghost) {
      return;
    }
    const ghost = drag.sourceEl.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.classList.remove("dragging", "playable");
    document.body.appendChild(ghost);
    drag.ghost = ghost;
  }

  function onDragMove(e) {
    if (!drag) {
      return;
    }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 8) {
      return;
    }
    drag.moved = true;
    ensureGhost();
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;

    const zone = zoneAt(e.clientX, e.clientY);
    els.dropLeft.classList.toggle("hot", zone === els.dropLeft);
    els.dropRight.classList.toggle("hot", zone === els.dropRight);
  }

  function onDragEnd(e) {
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragEnd);
    document.removeEventListener("pointercancel", onDragEnd);
    if (!drag) {
      return;
    }

    const current = drag;
    drag = null;

    if (current.ghost) {
      current.ghost.remove();
    }
    current.sourceEl.classList.remove("dragging");
    els.boardPanel.classList.remove("dragging");

    let played = false;
    if (current.moved) {
      const zone = zoneAt(e.clientX, e.clientY);
      if (zone) {
        const side = sideForZone(zone, current.options);
        if (side) {
          send({ type: "play", tileIndex: current.index, side });
          selectedTileIndex = null;
          played = true;
        }
      }
    } else {
      onTileClick(current.index, current.options);
    }

    clearZones();
    if (!played && gameState) {
      renderMyHand(gameState);
      updateActions(gameState);
    }
  }

  function updateActions(state) {
    els.btnPass.disabled = !state.canPass;

    const showPlay = state.isYourTurn && selectedTileIndex !== null;
    const tile = showPlay ? state.yourHand[selectedTileIndex] : null;
    const options = tile ? getPlayOptions(tile, state.leftEnd, state.rightEnd) : [];

    const canLeft = options.some((o) => o.side === "left" || o.side === "first");
    const canRight = options.some((o) => o.side === "right" || o.side === "first");

    els.btnPlayLeft.disabled = !showPlay || !canLeft;
    els.btnPlayRight.disabled = !showPlay || !canRight;

    els.btnLeftNum.textContent = state.leftEnd === null ? "" : `(${state.leftEnd})`;
    els.btnRightNum.textContent = state.rightEnd === null ? "" : `(${state.rightEnd})`;

    if (options.length === 1 && options[0].side === "first") {
      els.btnLeftNum.textContent = "(buka)";
      els.btnRightNum.textContent = "(buka)";
    }
  }

  function onTileClick(index, options) {
    if (!gameState || !gameState.isYourTurn || options.length === 0) {
      return;
    }

    if (options.length === 1 && options[0].side === "first") {
      send({ type: "play", tileIndex: index, side: "first" });
      selectedTileIndex = null;
      return;
    }

    selectedTileIndex = selectedTileIndex === index ? null : index;
    renderMyHand(gameState);
    updateActions(gameState);
  }

  function renderTurnLine(state) {
    if (state.phase === "roundEnd") {
      els.turnLine.textContent = "Hand selesai";
      els.turnLine.classList.add("waiting");
      stopTimerUi();
      return;
    }

    if (state.isYourTurn) {
      els.turnLine.textContent = "Giliran Anda!";
      els.turnLine.classList.remove("waiting");
    } else {
      const name = state.names[state.currentPlayer] || `Pemain ${state.currentPlayer + 1}`;
      els.turnLine.textContent = `Giliran ${name}`;
      els.turnLine.classList.add("waiting");
    }

    updateTimerUi(state);
  }

  function stopTimerUi() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerUi(state) {
    if (state.phase !== "playing" || !state.turnDeadline) {
      stopTimerUi();
      return;
    }

    function tick() {
      if (!gameState || !gameState.turnDeadline) {
        return;
      }
      const left = Math.max(0, Math.ceil((gameState.turnDeadline - Date.now()) / 1000));
      const total = gameState.turnSeconds || 30;
      const p = Math.max(0, Math.min(1, left / total));
      const ring = document.querySelector(".seat.active .ring");
      const sec = document.querySelector(".seat.active .sec-badge");
      if (ring) {
        const color = left <= 5 ? "#e85b5b" : "var(--gold)";
        ring.style.background = `conic-gradient(${color} ${p * 360}deg, rgba(0,0,0,0.5) 0)`;
      }
      if (sec) {
        sec.textContent = String(left);
      }
    }

    tick();
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    timerInterval = setInterval(tick, 250);
  }

  function renderChat(state, container) {
    const chat = state.chat || [];
    container.innerHTML = "";
    if (chat.length === 0) {
      container.innerHTML = '<p class="chat-msg system">Belum ada pesan.</p>';
      return;
    }
    chat.forEach((msg) => {
      const p = document.createElement("p");
      p.className = "chat-msg";
      const you = msg.seat === state.yourSeat ? " (Anda)" : "";
      p.innerHTML = `<span class="chat-name">${escapeHtml(msg.name)}${you}:</span>${escapeHtml(msg.text)}`;
      container.appendChild(p);
    });
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function maybeNotifyChat(state) {
    const chat = state.chat || [];
    if (chat.length > lastChatLen && lastChatLen > 0) {
      const latest = chat[chat.length - 1];
      if (latest.seat !== state.yourSeat) {
        showToast(`${latest.name}: ${latest.text.slice(0, 40)}`);
      }
    }
    lastChatLen = chat.length;
  }

  function setupChatUi() {
    const pairs = [
      [els.chatFabWait, els.chatDrawerWait],
      [els.chatFabGame, els.chatDrawerGame],
    ];
    pairs.forEach(([fab, drawer]) => {
      fab.addEventListener("click", () => {
        drawer.hidden = !drawer.hidden;
      });
    });
    document.querySelectorAll(".chat-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.close;
        $(id).hidden = true;
      });
    });
    [els.chatFormWait, els.chatFormGame].forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        const text = input.value.trim();
        if (text) {
          send({ type: "chat", text });
          input.value = "";
        }
      });
    });
  }

  function showRoundModal(state) {
    if (!state.roundResult) {
      return;
    }

    const { type, summaryLines, winningTeam, points } = state.roundResult;
    els.modalRoundTitle.textContent = type === "domino" ? "Domino!" : "Hand Macet";
    els.modalRoundBody.textContent = summaryLines[0] || "";
    els.modalRoundList.innerHTML = summaryLines.slice(1).map((line) => `<li>${line}</li>`).join("");

    if (points > 0 && winningTeam !== null) {
      els.modalRoundList.innerHTML += `<li>Skor: Tim A ${state.teamScores[0]} — Tim B ${state.teamScores[1]}</li>`;
    }

    const canNext = isHost && !state.matchOver;
    els.btnNextHand.hidden = !canNext;
    els.modalHostNote.hidden = isHost || state.matchOver;
    els.modalRound.showModal();
  }

  function showWinModal(state) {
    const myTeam = state.yourTeam;
    const teamAWins = state.teamScores[0] >= state.targetScore;
    const winnerTeam = teamAWins ? 0 : 1;
    const iWin = myTeam === winnerTeam;

    els.modalWinTitle.textContent = iWin ? "Tim Anda Menang!" : "Tim Lawan Menang";
    els.modalWinBody.textContent = iWin
      ? `Selamat! Skor akhir Tim A ${state.teamScores[0]} — Tim B ${state.teamScores[1]}.`
      : `Skor akhir Tim A ${state.teamScores[0]} — Tim B ${state.teamScores[1]}.`;
    els.modalWin.showModal();
  }

  let lastPhase = null;
  let lastMatchOver = false;

  function renderState(state) {
    maybeNotifyChat(state);
    renderChat(state, els.chatMessagesWait);
    renderChat(state, els.chatMessagesGame);

    if (state.status === "lobby") {
      showScreen("waiting");
      renderWaiting(state);
      return;
    }

    showScreen("game");
    els.scoreA.textContent = String(state.teamScores[0]);
    els.scoreB.textContent = String(state.teamScores[1]);
    els.handNum.textContent = String(state.handNumber);
    els.gameRoomCode.textContent = state.roomCode;
    els.gameMsg.textContent = state.message || "";

    renderSeats(state);
    renderBoard(state);
    renderMyHand(state);
    updateActions(state);
    renderTurnLine(state);

    if (state.phase === "roundEnd" && lastPhase !== "roundEnd") {
      showRoundModal(state);
    }

    if (state.matchOver && !lastMatchOver) {
      showWinModal(state);
    }

    lastPhase = state.phase;
    lastMatchOver = state.matchOver;
  }

  $("btn-solo").addEventListener("click", () => {
    clearError();
    connect();
    ws.addEventListener("open", () => {
      send({ type: "createSolo", name: els.inputName.value });
    }, { once: true });
  });

  $("btn-create").addEventListener("click", () => {
    clearError();
    connect();
    ws.addEventListener("open", () => {
      send({ type: "create", name: els.inputName.value });
    }, { once: true });
  });

  $("btn-join").addEventListener("click", () => {
    clearError();
    const code = els.inputCode.value.trim();
    if (code.length !== 4) {
      showError("Masukkan kode ruangan 4 digit.");
      return;
    }
    connect();
    ws.addEventListener("open", () => {
      send({ type: "join", roomCode: code, name: els.inputName.value });
    }, { once: true });
  });

  $("btn-start").addEventListener("click", () => send({ type: "start" }));
  $("btn-leave").addEventListener("click", () => window.location.reload());
  els.btnLeaveGame.addEventListener("click", () => window.location.reload());

  els.btnPass.addEventListener("click", () => {
    selectedTileIndex = null;
    send({ type: "pass" });
  });

  els.btnPlayLeft.addEventListener("click", () => {
    if (selectedTileIndex === null) {
      return;
    }
    const tile = gameState.yourHand[selectedTileIndex];
    const options = getPlayOptions(tile, gameState.leftEnd, gameState.rightEnd);
    const side = options.some((o) => o.side === "left")
      ? "left"
      : options.some((o) => o.side === "first")
        ? "first"
        : null;
    if (side) {
      send({ type: "play", tileIndex: selectedTileIndex, side });
      selectedTileIndex = null;
    }
  });

  els.btnPlayRight.addEventListener("click", () => {
    if (selectedTileIndex === null) {
      return;
    }
    const tile = gameState.yourHand[selectedTileIndex];
    const options = getPlayOptions(tile, gameState.leftEnd, gameState.rightEnd);
    const side = options.some((o) => o.side === "right")
      ? "right"
      : options.some((o) => o.side === "first")
        ? "first"
        : null;
    if (side) {
      send({ type: "play", tileIndex: selectedTileIndex, side });
      selectedTileIndex = null;
    }
  });

  function playSelectedToSide(preferred) {
    if (selectedTileIndex === null || !gameState) {
      return;
    }
    const tile = gameState.yourHand[selectedTileIndex];
    const options = getPlayOptions(tile, gameState.leftEnd, gameState.rightEnd);
    const side = options.some((o) => o.side === preferred)
      ? preferred
      : options.some((o) => o.side === "first")
        ? "first"
        : null;
    if (side) {
      send({ type: "play", tileIndex: selectedTileIndex, side });
      selectedTileIndex = null;
    }
  }

  els.dropLeft.addEventListener("click", () => playSelectedToSide("left"));
  els.dropRight.addEventListener("click", () => playSelectedToSide("right"));

  els.btnNextHand.addEventListener("click", () => {
    els.modalRound.close();
    send({ type: "nextHand" });
  });

  $("btn-new-match").addEventListener("click", () => {
    els.modalWin.close();
    send({ type: "newGame" });
    showScreen("waiting");
  });

  const savedName = localStorage.getItem("domino-name");
  if (savedName) {
    els.inputName.value = savedName;
  }

  els.inputName.addEventListener("change", () => {
    localStorage.setItem("domino-name", els.inputName.value.trim());
  });

  setupChatUi();
})();
