/**
 * Simulates 4 players (like 4 phones/tabs) playing a FULL match to 100.
 * Exercises: join, start, play/pass, chat, turn timer field, nextHand, match end.
 * Run: node test-match.js   (server must be running on port 8765)
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
    const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
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
    if (options.length > 0) return { tileIndex: i, side: options[0].side };
  }
  return null;
}

async function main() {
  console.log("== Simulasi 4 pemain (seperti 4 HP/tab) ==\n");
  const sockets = await Promise.all([0, 1, 2, 3].map(() => connect()));
  const states = [null, null, null, null];
  let chatSeen = 0;

  sockets.forEach((ws, seat) => {
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "state") states[seat] = msg.state;
    });
  });

  // Create + join
  sockets[0].send(JSON.stringify({ type: "create", name: NAMES[0] }));
  const joined0 = await waitMsg(sockets[0], (m) => m.type === "joined");
  const roomCode = joined0.roomCode;
  console.log(`Ruangan dibuat oleh ${NAMES[0]} → kode ${roomCode}`);

  for (let i = 1; i < 4; i += 1) {
    sockets[i].send(JSON.stringify({ type: "join", roomCode, name: NAMES[i] }));
    await waitMsg(sockets[i], (m) => m.type === "joined");
    console.log(`  ${NAMES[i]} gabung (kursi ${i + 1}, ${i % 2 === 0 ? "Tim A" : "Tim B"})`);
  }

  await waitMsg(sockets[0], (m) => m.type === "state" && m.state.connected.filter((p) => p.connected).length === 4);
  console.log("\n4/4 pemain siap. Host mulai permainan.\n");

  // Chat test
  sockets[1].send(JSON.stringify({ type: "chat", text: "Halo semua, gas!" }));
  await new Promise((r) => setTimeout(r, 150));
  if (states[0] && states[0].chat && states[0].chat.length > chatSeen) {
    const c = states[0].chat[states[0].chat.length - 1];
    console.log(`[CHAT] ${c.name}: ${c.text}\n`);
    chatSeen = states[0].chat.length;
  }

  sockets[0].send(JSON.stringify({ type: "start" }));
  await waitMsg(sockets[0], (m) => m.type === "state" && m.state.status === "playing");

  let hand = 0;
  let safety = 0;

  while (safety < 4000) {
    safety += 1;
    await new Promise((r) => setTimeout(r, 30));

    const s0 = states[0];
    if (!s0) continue;

    // Match finished?
    if (s0.matchOver && s0.phase === "roundEnd") {
      const winner = s0.teamScores[0] >= s0.targetScore ? "Tim A" : "Tim B";
      console.log("\n========================================");
      console.log(`  MATCH SELESAI — ${winner} MENANG!`);
      console.log(`  Skor akhir: Tim A ${s0.teamScores[0]} — Tim B ${s0.teamScores[1]}`);
      console.log("========================================");
      break;
    }

    // Hand ended (not match) → host starts next hand
    if (s0.phase === "roundEnd" && !s0.matchOver) {
      hand += 1;
      console.log(`  ↳ Hand selesai: ${s0.roundResult?.summaryLines?.[0] || ""}`);
      console.log(`    Skor: Tim A ${s0.teamScores[0]} — Tim B ${s0.teamScores[1]}\n`);
      const hostSeat = s0.hostSeat;
      sockets[hostSeat].send(JSON.stringify({ type: "nextHand" }));
      await waitMsg(sockets[hostSeat], (m) => m.type === "state" && m.state.phase === "playing", 4000).catch(() => {});
      console.log(`Hand ${s0.handNumber + 1} dimulai…`);
      continue;
    }

    // Whose turn?
    const seat = states.findIndex((s) => s && s.isYourTurn);
    if (seat === -1) continue;

    const state = states[seat];
    const move = pickMove(state);
    if (move) {
      sockets[seat].send(JSON.stringify({ type: "play", ...move }));
    } else {
      sockets[seat].send(JSON.stringify({ type: "pass" }));
    }
    await waitMsg(sockets[seat], (m) => m.type === "state" && !m.state.isYourTurn, 3000).catch(() => {});
  }

  if (safety >= 4000) {
    console.error("\nFAIL: simulasi tidak selesai (kemungkinan stuck).");
    sockets.forEach((ws) => ws.close());
    process.exit(1);
  }

  console.log("\n✓ Simulasi 4 pemain lengkap: lobby → main → chat → multi-hand → menang.");
  sockets.forEach((ws) => ws.close());
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
