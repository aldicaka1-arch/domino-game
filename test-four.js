/**
 * Simulates 4 players joining one room and playing until a hand ends.
 * Run: node test-four.js   (server must be running on port 8765)
 */
const WebSocket = require("ws");

const PORT = process.env.PORT || 8765;
const URL = `ws://127.0.0.1:${PORT}`;
const NAMES = ["Aldi", "Budi", "Citra", "Dewi"];

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function waitMsg(ws, filter, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout waiting for message")), timeoutMs);
    function onMessage(raw) {
      const msg = JSON.parse(raw.toString());
      if (filter(msg)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(msg);
      }
    }
    ws.on("message", onMessage);
  });
}

function getPlayOptions(tile, leftEnd, rightEnd) {
  if (leftEnd === null) return [{ side: "first" }];
  const options = [];
  if (tile.a === leftEnd || tile.b === leftEnd) options.push({ side: "left" });
  if (tile.a === rightEnd || tile.b === rightEnd) options.push({ side: "right" });
  return options;
}

function pickMove(state) {
  const hand = state.yourHand;
  for (let i = 0; i < hand.length; i += 1) {
    const options = getPlayOptions(hand[i], state.leftEnd, state.rightEnd);
    if (options.length > 0) {
      return { tileIndex: i, side: options[0].side };
    }
  }
  return null;
}

async function main() {
  console.log("Connecting 4 players…");
  const sockets = await Promise.all([0, 1, 2, 3].map(() => connect()));
  const states = [null, null, null, null];

  sockets.forEach((ws, seat) => {
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "state") {
        states[seat] = msg.state;
      }
    });
  });

  sockets[0].send(JSON.stringify({ type: "create", name: NAMES[0] }));
  const joined0 = await waitMsg(sockets[0], (m) => m.type === "joined");
  const roomCode = joined0.roomCode;
  console.log(`Room created: ${roomCode}`);

  for (let i = 1; i < 4; i += 1) {
    sockets[i].send(JSON.stringify({ type: "join", roomCode, name: NAMES[i] }));
    await waitMsg(sockets[i], (m) => m.type === "joined");
    console.log(`${NAMES[i]} joined (seat ${i})`);
  }

  await waitMsg(sockets[0], (m) => m.type === "state" && m.state.connected.filter((p) => p.connected).length === 4);

  sockets[0].send(JSON.stringify({ type: "start" }));
  await waitMsg(sockets[0], (m) => m.type === "state" && m.state.status === "playing");
  console.log("Game started!");

  sockets[0].send(JSON.stringify({ type: "chat", text: "Selamat main!" }));
  await new Promise((r) => setTimeout(r, 200));

  let moves = 0;
  const maxMoves = 80;

  while (moves < maxMoves) {
    await new Promise((r) => setTimeout(r, 50));
    const active = states.findIndex((s) => s && s.phase === "roundEnd");
    if (active !== -1) {
      console.log("Hand ended:", states[active].roundResult?.summaryLines?.[0]);
      console.log(`Score: Tim A ${states[0].teamScores[0]} — Tim B ${states[0].teamScores[1]}`);
      break;
    }

    const seat = states.findIndex((s) => s && s.isYourTurn);
    if (seat === -1) {
      continue;
    }

    const state = states[seat];
    const move = pickMove(state);
    if (move) {
      sockets[seat].send(JSON.stringify({ type: "play", ...move }));
      console.log(`${NAMES[seat]} plays ${state.yourHand[move.tileIndex].a}|${state.yourHand[move.tileIndex].b} (${move.side})`);
    } else {
      sockets[seat].send(JSON.stringify({ type: "pass" }));
      console.log(`${NAMES[seat]} passes`);
    }
    moves += 1;
    await waitMsg(sockets[seat], (m) => m.type === "state" && !m.state.isYourTurn, 3000).catch(() => {});
  }

  if (moves >= maxMoves) {
    console.error("FAIL: exceeded max moves");
    process.exit(1);
  }

  console.log("\n✓ 4-player test passed!");
  sockets.forEach((ws) => ws.close());
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
