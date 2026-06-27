/**
 * Tests solo mode: 1 human + 3 server bots. Plays human turns until a hand ends.
 * Run: node test-solo.js   (server must be running)
 */
const WebSocket = require("ws");

const PORT = process.env.PORT || 8765;
const URL = `ws://127.0.0.1:${PORT}`;

function getPlayOptions(tile, leftEnd, rightEnd) {
  if (leftEnd === null) return [{ side: "first" }];
  const o = [];
  if (tile.a === leftEnd || tile.b === leftEnd) o.push({ side: "left" });
  if (tile.a === rightEnd || tile.b === rightEnd) o.push({ side: "right" });
  return o;
}

const ws = new WebSocket(URL);
let state = null;
let acted = false;
let waitingForMove = false;

ws.on("open", () => {
  console.log("Terhubung. Membuat game solo (vs 3 bot)…");
  ws.send(JSON.stringify({ type: "createSolo", name: "Aldi" }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "joined") {
    console.log(`Bergabung di kursi ${msg.seat}, ruangan ${msg.roomCode}`);
    return;
  }
  if (msg.type !== "state") return;
  state = msg.state;

  if (state.status !== "lobby") {
    const botNames = state.connected.filter((p) => p.isBot).map((p) => p.name).join(", ");
    if (!acted) {
      console.log(`Bot di meja: ${botNames}`);
      console.log("Permainan dimulai. Bot akan jalan otomatis.\n");
      acted = true;
    }

    if (state.phase === "roundEnd") {
      console.log(`\nHand selesai: ${state.roundResult?.summaryLines?.[0] || ""}`);
      console.log(`Skor: Tim A ${state.teamScores[0]} — Tim B ${state.teamScores[1]}`);
      console.log("\n\u2713 Mode solo berfungsi: manusia + 3 bot main sampai hand selesai.");
      ws.close();
      process.exit(0);
    }

    if (!state.isYourTurn) {
      waitingForMove = false;
      return;
    }

    if (waitingForMove) {
      return;
    }
    waitingForMove = true;

    const hand = state.yourHand;
    let moved = false;
    for (let i = 0; i < hand.length; i += 1) {
      const opts = getPlayOptions(hand[i], state.leftEnd, state.rightEnd);
      if (opts.length > 0) {
        ws.send(JSON.stringify({ type: "play", tileIndex: i, side: opts[0].side }));
        console.log(`Anda main ${hand[i].a}|${hand[i].b}`);
        moved = true;
        break;
      }
    }
    if (!moved) {
      ws.send(JSON.stringify({ type: "pass" }));
      console.log("Anda lewat (tidak ada kartu cocok)");
    }
  }
});

ws.on("error", (e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error("FAIL: timeout, hand tidak selesai dalam 30 detik");
  process.exit(1);
}, 30000);
