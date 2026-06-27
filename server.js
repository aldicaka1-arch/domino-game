const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8765;
const TARGET_SCORE = 100;
const TURN_SECONDS = 30;
const MAX_CHAT = 40;
const TEAM_FOR_PLAYER = [0, 1, 0, 1];
const TEAM_NAMES = ["Tim A", "Tim B"];

const app = express();
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

function createDeck() {
  const deck = [];
  for (let a = 0; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) {
      deck.push({ a, b, id: `${a}-${b}`, pips: a + b });
    }
  }
  return deck;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function handPipTotal(hand) {
  return hand.reduce((sum, tile) => sum + tile.pips, 0);
}

function teamForPlayer(playerIndex) {
  return TEAM_FOR_PLAYER[playerIndex];
}

function findHighestDouble(hands) {
  for (let value = 6; value >= 0; value -= 1) {
    for (let player = 0; player < 4; player += 1) {
      const index = hands[player].findIndex((tile) => tile.a === value && tile.b === value);
      if (index !== -1) {
        return { player, tileIndex: index, tile: hands[player][index] };
      }
    }
  }
  return null;
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

function newLeftEnd(tile, boardLeftEnd) {
  return tile.a === boardLeftEnd ? tile.b : tile.a;
}

function newRightEnd(tile, boardRightEnd) {
  return tile.a === boardRightEnd ? tile.b : tile.a;
}

function playableTilesForPlayer(game, playerIndex) {
  const hand = game.hands[playerIndex];
  const playable = [];
  hand.forEach((tile, index) => {
    const options = getPlayOptions(tile, game.leftEnd, game.rightEnd);
    if (options.length > 0) {
      playable.push({ index, tile, options });
    }
  });
  return playable;
}

function canPlayerPlay(game, playerIndex) {
  return playableTilesForPlayer(game, playerIndex).length > 0;
}

function createGameState() {
  return {
    hands: [[], [], [], []],
    board: [],
    leftEnd: null,
    rightEnd: null,
    currentPlayer: 0,
    passStreak: 0,
    teamScores: [0, 0],
    handNumber: 1,
    nextLeader: null,
    phase: "lobby",
    message: "",
    roundResult: null,
    matchOver: false,
  };
}

function createRoom(roomCode) {
  return {
    code: roomCode,
    seats: [null, null, null, null],
    names: ["", "", "", ""],
    bots: [false, false, false, false],
    hostSeat: 0,
    game: createGameState(),
    status: "lobby",
    chat: [],
    turnDeadline: null,
    turnTimer: null,
    botTimer: null,
  };
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  room.turnDeadline = null;
}

function startTurnTimer(room) {
  clearTurnTimer(room);
  const game = room.game;
  if (game.phase !== "playing") {
    return;
  }
  if (room.bots[game.currentPlayer]) {
    room.turnDeadline = null;
    room.botTimer = setTimeout(() => botMove(room), 900);
    return;
  }
  room.turnDeadline = Date.now() + TURN_SECONDS * 1000;
  room.turnTimer = setTimeout(() => onTurnTimeout(room), TURN_SECONDS * 1000);
}

function botMove(room) {
  room.botTimer = null;
  const game = room.game;
  if (game.phase !== "playing") {
    return;
  }
  const seat = game.currentPlayer;
  if (!room.bots[seat]) {
    return;
  }
  const playable = playableTilesForPlayer(game, seat);
  if (playable.length > 0) {
    playable.sort((a, b) => {
      const ad = a.tile.a === a.tile.b ? 1 : 0;
      const bd = b.tile.a === b.tile.b ? 1 : 0;
      if (ad !== bd) {
        return bd - ad;
      }
      return b.tile.pips - a.tile.pips;
    });
    const choice = playable[0];
    playTile(room, seat, choice.index, choice.options[0].side);
  } else {
    passTurn(room, seat);
  }
}

function isSeatTaken(room, seat) {
  return room.seats[seat] !== null || room.bots[seat];
}

function onTurnTimeout(room) {
  room.turnTimer = null;
  const game = room.game;
  if (game.phase !== "playing") {
    return;
  }
  const player = game.currentPlayer;
  const playable = playableTilesForPlayer(game, player);
  if (playable.length > 0) {
    const choice = playable[0];
    playTile(room, player, choice.index, choice.options[0].side);
    return;
  }
  passTurn(room, player);
}

function addChatMessage(room, seat, text) {
  room.chat.push({
    id: `${Date.now()}-${seat}`,
    seat,
    name: room.names[seat],
    text,
    time: Date.now(),
  });
  if (room.chat.length > MAX_CHAT) {
    room.chat = room.chat.slice(-MAX_CHAT);
  }
}

function randomRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function tileLabel(tile) {
  return `${tile.a}|${tile.b}`;
}

function findLowestPipPlayerOnTeam(game, team) {
  let bestPlayer = 0;
  let bestTotal = Infinity;
  for (let player = 0; player < 4; player += 1) {
    if (teamForPlayer(player) !== team) {
      continue;
    }
    const total = handPipTotal(game.hands[player]);
    if (total < bestTotal) {
      bestTotal = total;
      bestPlayer = player;
    }
  }
  return bestPlayer;
}

function autoOpenFirstTile(room, playerIndex, tileIndex) {
  const game = room.game;
  const tile = game.hands[playerIndex].splice(tileIndex, 1)[0];
  game.board.push({
    tile,
    orientation: tile.a === tile.b ? "vertical" : "horizontal",
  });
  game.leftEnd = tile.a;
  game.rightEnd = tile.b;
  game.passStreak = 0;
  advanceTurn(room);
}

function dealNewHand(room) {
  const game = room.game;
  const deck = shuffle(createDeck());
  game.hands = [[], [], [], []];
  for (let i = 0; i < 28; i += 1) {
    game.hands[i % 4].push(deck[i]);
  }
  game.board = [];
  game.leftEnd = null;
  game.rightEnd = null;
  game.passStreak = 0;
  game.phase = "playing";
  game.roundResult = null;
  game.message = "";
  room.status = "playing";

  if (game.nextLeader === null) {
    const opener = findHighestDouble(game.hands);
    game.currentPlayer = opener.player;
    game.message = `${room.names[opener.player]} membuka dengan ${tileLabel(opener.tile)}.`;
    autoOpenFirstTile(room, opener.player, opener.tileIndex);
    return;
  }

  game.currentPlayer = game.nextLeader;
  game.message = `${room.names[game.currentPlayer]} memimpin hand ini.`;
  startTurnTimer(room);
  broadcastRoom(room);
}

function endHand(room, result) {
  const game = room.game;
  game.phase = "roundEnd";
  room.status = "roundEnd";

  let points = 0;
  let winningTeam = null;
  let summaryLines = [];

  if (result.type === "domino") {
    const winner = result.winner;
    winningTeam = teamForPlayer(winner);
    points = game.hands.reduce((sum, hand, index) => {
      if (index === winner) {
        return sum;
      }
      return sum + handPipTotal(hand);
    }, 0);
    game.teamScores[winningTeam] += points;
    game.nextLeader = winner;
    summaryLines = [
      `${room.names[winner]} habis kartu.`,
      `${TEAM_NAMES[winningTeam]} +${points} poin.`,
    ];
  } else {
    const teamTotals = [0, 0];
    game.hands.forEach((hand, index) => {
      teamTotals[teamForPlayer(index)] += handPipTotal(hand);
    });

    if (teamTotals[0] < teamTotals[1]) {
      points = teamTotals[1] - teamTotals[0];
      winningTeam = 0;
      game.teamScores[0] += points;
      game.nextLeader = findLowestPipPlayerOnTeam(game, 0);
      summaryLines = [
        "Hand macet — tim dengan pip terendah menang.",
        `${TEAM_NAMES[0]} +${points} (${teamTotals[0]} vs ${teamTotals[1]}).`,
      ];
    } else if (teamTotals[1] < teamTotals[0]) {
      points = teamTotals[0] - teamTotals[1];
      winningTeam = 1;
      game.teamScores[1] += points;
      game.nextLeader = findLowestPipPlayerOnTeam(game, 1);
      summaryLines = [
        "Hand macet — tim dengan pip terendah menang.",
        `${TEAM_NAMES[1]} +${points} (${teamTotals[1]} vs ${teamTotals[0]}).`,
      ];
    } else {
      game.nextLeader = game.currentPlayer;
      summaryLines = ["Hand macet — seri, tanpa poin."];
    }
  }

  game.roundResult = { ...result, points, winningTeam, summaryLines };
  if (game.teamScores[0] >= TARGET_SCORE || game.teamScores[1] >= TARGET_SCORE) {
    game.matchOver = true;
  }
  clearTurnTimer(room);
  broadcastRoom(room);
}

function advanceTurn(room) {
  const game = room.game;
  if (game.phase !== "playing") {
    clearTurnTimer(room);
    broadcastRoom(room);
    return;
  }
  game.currentPlayer = (game.currentPlayer + 1) % 4;
  startTurnTimer(room);
  broadcastRoom(room);
}

function playTile(room, playerIndex, tileIndex, side) {
  const game = room.game;
  if (game.phase !== "playing" || game.currentPlayer !== playerIndex) {
    return false;
  }

  const hand = game.hands[playerIndex];
  const tile = hand[tileIndex];
  if (!tile) {
    return false;
  }

  const options = getPlayOptions(tile, game.leftEnd, game.rightEnd);
  if (!options.some((option) => option.side === side)) {
    return false;
  }

  hand.splice(tileIndex, 1);

  if (side === "first") {
    game.board.push({
      tile,
      orientation: tile.a === tile.b ? "vertical" : "horizontal",
    });
    game.leftEnd = tile.a;
    game.rightEnd = tile.b;
  } else if (side === "left") {
    game.leftEnd = newLeftEnd(tile, game.leftEnd);
    game.board.unshift({ tile, orientation: "horizontal" });
  } else {
    game.rightEnd = newRightEnd(tile, game.rightEnd);
    game.board.push({ tile, orientation: "horizontal" });
  }

  game.passStreak = 0;
  game.message = `${room.names[playerIndex]} main ${tileLabel(tile)}.`;

  if (hand.length === 0) {
    endHand(room, { type: "domino", winner: playerIndex });
    return true;
  }

  advanceTurn(room);
  return true;
}

function passTurn(room, playerIndex) {
  const game = room.game;
  if (game.phase !== "playing" || game.currentPlayer !== playerIndex) {
    return false;
  }
  if (canPlayerPlay(game, playerIndex)) {
    return false;
  }

  game.passStreak += 1;
  game.message = `${room.names[playerIndex]} lewat.`;

  if (game.passStreak >= 4) {
    endHand(room, { type: "blocked" });
    return true;
  }

  advanceTurn(room);
  return true;
}

function buildPublicState(room, seat) {
  const game = room.game;
  const tileCounts = game.hands.map((hand) => hand.length);
  const connected = room.seats.map((client, index) => ({
    seat: index,
    name: room.names[index] || null,
    connected: Boolean(client) || room.bots[index],
    isBot: room.bots[index],
    tileCount: tileCounts[index],
    team: teamForPlayer(index),
  }));

  return {
    roomCode: room.code,
    status: room.status,
    hostSeat: room.hostSeat,
    yourSeat: seat,
    yourTeam: teamForPlayer(seat),
    partnerSeat: (seat + 2) % 4,
    names: room.names,
    connected,
    board: game.board,
    leftEnd: game.leftEnd,
    rightEnd: game.rightEnd,
    currentPlayer: game.currentPlayer,
    teamScores: game.teamScores,
    handNumber: game.handNumber,
    phase: game.phase,
    message: game.message,
    roundResult: game.roundResult,
    matchOver: game.matchOver,
    targetScore: TARGET_SCORE,
    turnSeconds: TURN_SECONDS,
    turnDeadline: room.turnDeadline,
    chat: room.chat,
    yourHand: game.hands[seat],
    isYourTurn: game.phase === "playing" && game.currentPlayer === seat,
    canPass: game.phase === "playing" && game.currentPlayer === seat && !canPlayerPlay(game, seat),
  };
}

function sendToClient(client, payload) {
  if (client && client.readyState === 1) {
    client.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room) {
  room.seats.forEach((client, seat) => {
    if (!client) {
      return;
    }
    sendToClient(client, {
      type: "state",
      state: buildPublicState(room, seat),
    });
  });
}

function findRoomByClient(ws) {
  for (const room of rooms.values()) {
    const seat = room.seats.indexOf(ws);
    if (seat !== -1) {
      return { room, seat };
    }
  }
  return null;
}

function removeClient(ws) {
  const found = findRoomByClient(ws);
  if (!found) {
    return;
  }
  const { room, seat } = found;
  room.seats[seat] = null;
  room.names[seat] = "";
  if (room.seats.every((client) => client === null)) {
    clearTurnTimer(room);
    rooms.delete(room.code);
    return;
  }
  if (room.hostSeat === seat) {
    room.hostSeat = room.seats.findIndex((client) => client !== null);
  }
  broadcastRoom(room);
}

function assignSeat(room) {
  for (let i = 0; i < 4; i += 1) {
    if (!isSeatTaken(room, i)) {
      return i;
    }
  }
  return -1;
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendToClient(ws, { type: "error", message: "Pesan tidak valid." });
      return;
    }

    if (msg.type === "create") {
      const name = String(msg.name || "Pemain").trim().slice(0, 20) || "Pemain";
      let code = randomRoomCode();
      while (rooms.has(code)) {
        code = randomRoomCode();
      }
      const room = createRoom(code);
      room.seats[0] = ws;
      room.names[0] = name;
      room.hostSeat = 0;
      rooms.set(code, room);
      sendToClient(ws, { type: "joined", roomCode: code, seat: 0 });
      broadcastRoom(room);
      return;
    }

    if (msg.type === "createSolo") {
      const name = String(msg.name || "Pemain").trim().slice(0, 20) || "Pemain";
      let code = randomRoomCode();
      while (rooms.has(code)) {
        code = randomRoomCode();
      }
      const room = createRoom(code);
      room.seats[0] = ws;
      room.names[0] = name;
      room.bots = [false, true, true, true];
      room.names[1] = "Bot Budi";
      room.names[2] = "Bot Citra";
      room.names[3] = "Bot Dewi";
      room.hostSeat = 0;
      rooms.set(code, room);
      sendToClient(ws, { type: "joined", roomCode: code, seat: 0 });
      room.game = createGameState();
      room.game.phase = "playing";
      dealNewHand(room);
      return;
    }

    if (msg.type === "join") {
      const code = String(msg.roomCode || "").trim();
      const name = String(msg.name || "Pemain").trim().slice(0, 20) || "Pemain";
      const room = rooms.get(code);
      if (!room) {
        sendToClient(ws, { type: "error", message: "Ruangan tidak ditemukan." });
        return;
      }
      if (room.status !== "lobby") {
        sendToClient(ws, { type: "error", message: "Permainan sudah berjalan." });
        return;
      }
      const seat = assignSeat(room);
      if (seat === -1) {
        sendToClient(ws, { type: "error", message: "Ruangan penuh (4/4)." });
        return;
      }
      room.seats[seat] = ws;
      room.names[seat] = name;
      sendToClient(ws, { type: "joined", roomCode: code, seat });
      broadcastRoom(room);
      return;
    }

    const found = findRoomByClient(ws);
    if (!found) {
      sendToClient(ws, { type: "error", message: "Belum gabung ruangan." });
      return;
    }

    const { room, seat } = found;

    if (msg.type === "start") {
      if (seat !== room.hostSeat) {
        sendToClient(ws, { type: "error", message: "Hanya host yang bisa mulai." });
        return;
      }
      if (room.seats.some((client) => client === null)) {
        sendToClient(ws, { type: "error", message: "Tunggu 4 pemain dulu." });
        return;
      }
      room.game = createGameState();
      room.game.phase = "playing";
      dealNewHand(room);
      return;
    }

    if (msg.type === "play") {
      const ok = playTile(room, seat, msg.tileIndex, msg.side);
      if (!ok) {
        sendToClient(ws, { type: "state", state: buildPublicState(room, seat) });
      }
      return;
    }

    if (msg.type === "pass") {
      const ok = passTurn(room, seat);
      if (!ok) {
        sendToClient(ws, { type: "state", state: buildPublicState(room, seat) });
      }
      return;
    }

    if (msg.type === "nextHand") {
      if (room.status !== "roundEnd" || room.game.matchOver) {
        return;
      }
      if (seat !== room.hostSeat) {
        sendToClient(ws, { type: "error", message: "Hanya host yang lanjut hand berikutnya." });
        return;
      }
      room.game.handNumber += 1;
      dealNewHand(room);
      return;
    }

    if (msg.type === "newGame") {
      if (seat !== room.hostSeat) {
        sendToClient(ws, { type: "error", message: "Hanya host yang bisa reset." });
        return;
      }
      clearTurnTimer(room);
      room.game = createGameState();
      room.chat = [];
      if (room.bots.some(Boolean)) {
        room.game.phase = "playing";
        dealNewHand(room);
        return;
      }
      room.status = "lobby";
      broadcastRoom(room);
      return;
    }

    if (msg.type === "chat") {
      const text = String(msg.text || "").trim().slice(0, 120);
      if (!text) {
        return;
      }
      addChatMessage(room, seat, text);
      broadcastRoom(room);
    }
  });

  ws.on("close", () => {
    removeClient(ws);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Domino server: http://0.0.0.0:${PORT}`);
  console.log("Setiap pemain buka URL ini di HP masing-masing (WiFi yang sama).");
});
