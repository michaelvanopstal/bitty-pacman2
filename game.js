// Bitty Pacman – dot-baan uit MAZE, alles weer geschaald met pathScale

// ---------------------------------------------------------------------------
// CANVASSEN
// ---------------------------------------------------------------------------
const mazeCanvas = document.getElementById("mazeCanvas");
const mazeCtx = mazeCanvas ? mazeCanvas.getContext("2d") : null;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

// Fullscreen HUD canvas voor highscore paneel
const hudCanvas = document.getElementById("hudCanvas");
const hudCtx = hudCanvas ? hudCanvas.getContext("2d") : null;

// Houd CSS pixel afmetingen bij voor clearRect / positioning
let hudW = window.innerWidth;
let hudH = window.innerHeight;

// ---------------------------------------------------------------------------
// STAP 5: MOBILE HIGHSCORE BUTTON + SLIDE PANEL TOGGLE
// (werkt alleen als de elementen bestaan; desktop blijft ongewijzigd)
// ---------------------------------------------------------------------------
const hsBtn = document.getElementById("highscoreToggleBtn");
const hsPanel = document.getElementById("highscorePanel");

if (hsBtn && hsPanel) {
  hsBtn.addEventListener("click", async () => {
    const isOpen = hsPanel.classList.toggle("open");
    hsPanel.setAttribute("aria-hidden", (!isOpen).toString());

    // ✅ Als panel OPENT: altijd meteen vullen (local) + server refresh
    if (isOpen) {
      if (typeof loadHighscoresFromLocal === "function") {
        loadHighscoresFromLocal();
      }
      if (typeof renderMobileHighscoreList === "function") {
        renderMobileHighscoreList();
      }

      // server refresh (optioneel)
      if (typeof loadHighscoresFromServer === "function") {
        try {
          await loadHighscoresFromServer();
        } catch (e) {}
      }
    }

    // ✅ Als game over is, en jij sluit highscores → login paneel terug
    if (isMobileLayout && gameOver && pendingLoginAfterGameOver && !isOpen) {
      pendingLoginAfterGameOver = false;

      // we willen opnieuw starten NA login click
      pendingStartAfterLogin = true;

      // toon login view (niet logout view)
      if (typeof setLoggedInUI === "function") setLoggedInUI(false);
      if (typeof updatePlayerCardHeader === "function") updatePlayerCardHeader(false);

      // naam alvast invullen als hij al bestond
      const nameInput = document.getElementById("playerNameInput");
      if (nameInput) nameInput.value = (playerProfile?.name || "");

      // iOS zoom reset
      if (typeof iosResetZoom === "function") {
        iosResetZoom();
      }

      if (typeof showMobileLoginModal === "function") {
        showMobileLoginModal();
      }
    }
  });
}

if (typeof window.isMobileInput === "undefined") {
  window.isMobileInput = false;
}


// swipe state
let touchStartX = 0;
let touchStartY = 0;

// ✅ Mobile login modal helpers
let pendingStartAfterLogin = false;
let pendingLoginAfterGameOver = false;


// helper: richting zetten (gebruikt dezelfde flow als keyboard)
function setPacmanDir(dx, dy) {
  // player bestaat misschien nog niet bij load; daarom extra check
  if (typeof player === "undefined" || !player) return;
  player.nextDir = { x: dx, y: dy };
}

function enableTouchControls() {
  // voorkeur: swipen op gameShell (als die bestaat), anders op canvas
  const touchTarget =
    document.getElementById("gameShell") ||
    document.getElementById("gameCanvas");

  if (!touchTarget) return;

  // START
  touchTarget.addEventListener(
    "touchstart",
    (e) => {
      if (!window.isMobileInput) return;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    },
    { passive: true }
  );

  // END → richting bepalen
  touchTarget.addEventListener(
    "touchend",
    (e) => {
      if (!window.isMobileInput) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      const threshold = 25; // swipe drempel
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        // horizontaal
        setPacmanDir(dx > 0 ? 1 : -1, 0);
      } else {
        // verticaal
        setPacmanDir(0, dy > 0 ? 1 : -1);
      }
    },
    { passive: true }
  );
}

// activeer listeners (ze doen pas iets als isMobileInput=true)
enableTouchControls();


function resizeHudCanvas() {
  if (!hudCanvas || !hudCtx) return;

  const dpr = window.devicePixelRatio || 1;

  hudW = window.innerWidth;
  hudH = window.innerHeight;

  hudCanvas.width  = Math.floor(hudW * dpr);
  hudCanvas.height = Math.floor(hudH * dpr);

  // Teken in CSS pixels
  hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeHudCanvas);
resizeHudCanvas();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Tab gaat “slapen” → stop de loop netjes
    if (loopRafId !== null) {
      cancelAnimationFrame(loopRafId);
      loopRafId = null;
    }
  } else {
    // Tab is weer actief → start loop opnieuw (maar voorkom dubbele loop)
    if (loopRafId === null) {
      loopRafId = requestAnimationFrame(loop);
    }
  }
});


let isMobileLayout = false;
let isMobileInput = false;

const lifeIconConfigDesktop = {
  enabled: true,
  // 👇 desktop positie (zoals het nu is)
  baseX: 20,
  baseY: 170,
  spacing: 40,
  scale: 0.7,
};

const lifeIconConfigMobile = {
  enabled: true,
  baseX: 20,
  baseY: 55,
  spacing: 24,
  scale: 0.40,
};


// actieve config (wordt gezet door applyResponsiveLayout)
let lifeIconConfig = lifeIconConfigDesktop;

function detectMobileLayout() {
  return window.innerWidth <= 820;
}

function detectTouchDevice() {
  return (
    ("maxTouchPoints" in navigator && navigator.maxTouchPoints > 0) ||
    ("ontouchstart" in window)
  );
}

// Tablet + phone input range (voorkomt touch-laptops)
function detectTouchInputPreferred() {
  const w = window.innerWidth;
  return detectTouchDevice() && w <= 1024;
}

function applyResponsiveLayout() {
  // Layout blijft op je bestaande breakpoint
  isMobileLayout = detectMobileLayout();

  // ✅ Input los van layout:
  // tablet + phone => touch
  // laptop/desktop => keyboard
  isMobileInput = detectTouchInputPreferred();
  window.isMobileInput = isMobileInput;

  // ✅ CSS hook (voor touch-action / tweaks)
  document.body.classList.toggle("touchInput", isMobileInput);

  // ✅ lives-icoontjes: kies de juiste config per layout
  if (
    typeof lifeIconConfigDesktop !== "undefined" &&
    typeof lifeIconConfigMobile !== "undefined"
  ) {
    lifeIconConfig = isMobileLayout ? lifeIconConfigMobile : lifeIconConfigDesktop;
  }

  const gameShell = document.getElementById("gameShell");
  if (!gameShell) return;

  // ─────────────────────────────
  // DESKTOP: alles resetten
  // ─────────────────────────────
  if (!isMobileLayout) {
    document.documentElement.style.setProperty("--scale", 1);

    gameShell.style.transform = "";
    gameShell.style.transformOrigin = "";
    gameShell.style.left = "";
    gameShell.style.top = "";

    document.getElementById("highscorePanel")?.classList.remove("open");
    return;
  }

  // ─────────────────────────────
  // MOBILE LAYOUT: handmatig tunen
  // ─────────────────────────────
  const base = 900;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  /* 🔧 HANDMATIGE TWEAKS */
  const manualScaleBoost = 1.30; // ← maak groter
  const manualOffsetX = 22;      // ← pixels naar rechts
  const manualOffsetY = 0;       // ← meestal 0 laten

  // automatische schaal
  let s = Math.min(vw / base, vh / base);

  // handmatige schaal boost
  s *= manualScaleBoost;

  document.documentElement.style.setProperty("--scale", s.toFixed(4));

  // gecentreerde positie
  const scaledW = base * s;
  const scaledH = base * s;

  let offsetX = (vw - scaledW) / 2;
  let offsetY = (vh - scaledH) / 2;

  // handmatige correctie
  offsetX += manualOffsetX;
  offsetY += manualOffsetY;

  // toepassen
  gameShell.style.transformOrigin = "top left";
  gameShell.style.transform =
    `translate(${Math.round(offsetX)}px, ${Math.round(offsetY)}px) scale(${s})`;
}

window.addEventListener("resize", applyResponsiveLayout);
window.addEventListener("orientationchange", applyResponsiveLayout);
applyResponsiveLayout();


// ---------------------------------------------------------------------------
// HIGHSCORE PANEL CONFIG (HUD)
// ---------------------------------------------------------------------------
const highscoreConfig = {
  enabled: true,

  // positionering op SCHERM (hudCanvas)
  anchor: "left-middle",
  offsetX: 60,
  offsetY: 0,

  // schaal
  scale: 0.7,
  textScale: 0.60,

  // basis maat van panel (handig voor consistentie)
  baseW: 420,
  baseH: 700
};




// --- SPEED CONFIG (Google Pacman verhoudingen) ---
const TILE_SIZE = 32;

const SPEED_CONFIG = {
  // Pacman – basis
  playerSpeed: 2.8,

  // Ghosts net iets langzamer dan Pacman (± 90%)
  ghostSpeed:       2.8 * 0.90,  // ≈ 2.52

  // In tunnels flink trager
  ghostTunnelSpeed: 2.8 * 0.45,  // ≈ 1.26

  // In frightened mode nog wat trager
  ghostFrightSpeed: 2.8 * 0.60,  // ≈ 1.68

  ghostEyesSpeed: 7.2,
};
// --- GHOST MODES & SCHEMA ---
const GHOST_MODE_SCATTER    = 0;
const GHOST_MODE_CHASE      = 1;
const GHOST_MODE_FRIGHTENED = 2;
const GHOST_MODE_EATEN      = 3;
const GHOST_MODE_IN_PEN     = 4;
const GHOST_MODE_LEAVING    = 5;

// Level 1 (jouw “oude” schema)
const GHOST_MODE_SEQUENCE_L1 = [
  { mode: GHOST_MODE_SCATTER, durationMs: 2 * 1000 },
  { mode: GHOST_MODE_CHASE,   durationMs: 40 * 1000 },
  { mode: GHOST_MODE_SCATTER, durationMs:  2 * 1000 },
  { mode: GHOST_MODE_CHASE,   durationMs:  Infinity },
];

// Level 2 (houd jouw huidige waarden hier)
const GHOST_MODE_SEQUENCE_L2 = [
  { mode: GHOST_MODE_SCATTER, durationMs:  4 * 1000 },
  { mode: GHOST_MODE_CHASE,   durationMs: 50 * 1000 },
  { mode: GHOST_MODE_SCATTER, durationMs:  4 * 1000 },
  { mode: GHOST_MODE_CHASE,   durationMs:  Infinity },
];

// Level 3 (extra agressief)
const GHOST_MODE_SEQUENCE_L3 = [
  { mode: GHOST_MODE_SCATTER, durationMs:  5 * 1000 },
  { mode: GHOST_MODE_CHASE,   durationMs: 60 * 1000 },
  { mode: GHOST_MODE_SCATTER, durationMs:  5 * 1000 },
  { mode: GHOST_MODE_CHASE,   durationMs:  Infinity },
];

function getGhostModeSequenceForLevel() {
  if (currentLevel === 3 || currentLevel === 4) return GHOST_MODE_SEQUENCE_L3;
  if (currentLevel === 2) return GHOST_MODE_SEQUENCE_L2;
  return GHOST_MODE_SEQUENCE_L1; // level 1
}


// Globale mode-status
let globalGhostMode      = GHOST_MODE_SCATTER;
let ghostModeIndex       = 0;
let ghostModeElapsedTime = 0;
let wowBonusActive = false;
let wowBonusTimer = 0;


// DOT GROOTTES
const DOT_RADIUS   = 3;   // gewone dots
const POWER_RADIUS = 7;   // grotere power-dots (blijven vanuit dezelfde middenpositie)

// Animatie voor knipperende power-dots
let powerDotPhase = 0;
const POWER_DOT_BLINK_SPEED = 0.12; // hoe hoger, hoe sneller ze "pulseren"


// LEVEL 4 AURA / DARKNESS
// Radius is in scherm-pixels (niet tiles)
const LEVEL4_AURA_BASE_RADIUS  = 120; // normaal zicht (kleiner = enger)
const LEVEL4_AURA_POWER_RADIUS = 190; // bij power dot / frightened mode

// Laatste gebruikte radius (handig als we later ogen/extra effecten doen)
let level4AuraRadius = LEVEL4_AURA_BASE_RADIUS;


// Clyde schakelt naar corner als hij binnen deze afstand is (in tiles)
// Lager = sneller jagen, minder snel wegrennen
let CLYDE_SCATTER_DISTANCE_TILES = 4;
let CLYDE_SCATTER_DISTANCE2 = CLYDE_SCATTER_DISTANCE_TILES * CLYDE_SCATTER_DISTANCE_TILES;

// --- FRIGHTENED MODE VARIABELEN ---
let frightTimer = 0;
let frightFlash = false;
let ghostEatChain = 0;
// Hoe vaak vuurmode is gestart in dit level (aantal power-dots gegeten)
let frightActivationCount = 0;

// Frightened langer + laatste 5 sec knipperen
let FRIGHT_DURATION_MS = 12000;   // vuur duurt 12 sec (pas aan naar smaak)
let FRIGHT_FLASH_MS    = 5000;    // in de laatste 5 sec gaat het knipperen
// ─────────────────────────────────────────────
// 🔥 VUURMODE (FRIGHTENED) DUUR PER LEVEL
// ─────────────────────────────────────────────
const FRIGHT_CONFIG_BY_LEVEL = {
  1: { durationMs: 12000, flashMs: 5000 },  // Level 1
  2: { durationMs: 10000, flashMs: 4000 },  // Level 2
  3: { durationMs:  8000, flashMs: 3000 },  // Level 3
  4: { durationMs:  8000, flashMs: 3000 },  // Level 4 (zelfde als level 3)
};

// helper: haalt juiste config op (fallback naar level 1)
function getFrightConfigForLevel() {
  return FRIGHT_CONFIG_BY_LEVEL[currentLevel] || FRIGHT_CONFIG_BY_LEVEL[1];
}

// ───────────────────────────────────────────────
// BITTY OVERLAY CONFIG
// ───────────────────────────────────────────────
let bittyVisible = true;    // zet op false als je 'm tijdelijk wilt verbergen
let bittyPosX    = 820;     // positie vanaf linkerkant van het scherm (px)
let bittyPosY    = 100;     // positie vanaf bovenkant van het scherm (px)
let bittyScale   = 0.9;     // 1.0 = origineel, 2.0 = 2x zo groot, etc.

// --- 4-GHOST BONUS + COIN BONUS ---
let fourGhostBonusTriggered = false;    // binnen huidige fire-mode al gegeven?
let coinBonusActive = false;           // loopt de 20s coin-fase?
let coinBonusTimer = 0;                // ms resterend voor coins
const COIN_BONUS_DURATION = 20000;     // 20 sec
let coinPickupIndex = 0;
const coinSequence = [250, 500, 1000, 2000];
let coinPulsePhase = 0;

const coins = [];                      // actieve coins in het speelveld
const COIN_RADIUS = TILE_SIZE * 0.8;
const bittyBonusSound = new Audio("bittybonussound.mp3");
bittyBonusSound.loop = false;
bittyBonusSound.volume = 0.8; // of naar smaak

const coinSound = new Audio("coinsoundbitty.mp3");
coinSound.loop = false;
coinSound.volume = 0.7;

// Kersen systeem
let cherry = null;           // { x, y, active }
let cherriesSpawned = 0;     // maximaal 3
let dotsEaten = 0;           // tellen we bij in updatePlayer()
let nextCherryThresholds = [50, 120, 200]; // ritme voor kers (vroeg in level)
const cherryImg = new Image();
cherryImg.src = "kersen.png";

const cherrySound = new Audio("kersensound.mp3");
cherrySound.volume = 0.9;

// Aardbei systeem
let strawberry = null;              // { x, y, active }
let strawberriesSpawned = 0;        // bijvoorbeeld max 2 per level
let nextStrawberryThresholds = [140, 220]; // ritme: iets later in het level
const strawberryImg = new Image();
strawberryImg.src = "aarbei.png";

// ─────────────────────────────────────────────
// CANNON SYSTEM (Level 2) — HUD cannons + maze bullets
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// 🟦 Bitty Bonus HUD icon
// ─────────────────────────────────────────────
const bittyBonusImg = new Image();
bittyBonusImg.src = "bittybonus.png";

// schaal/positie instelbaar
const bittyBonusIconConfig = {
  enabled: true,
  x: 140,     // pas aan
  y: 450,     // pas aan
  scale: 0.8  // pas aan
};


const bananaImg = new Image();
bananaImg.src = "banaan.png";

let banana = null;
let bananasSpawned = 0;
let nextBananaThresholds = [60, 150, 260]; // voorbeeld ritme, pas aan
const bananaIconConfig = { enabled: true, x: 690, y: 450, scale: 0.8 };

// ─────────────────────────────────────────────
// 🍐 PEER SYSTEM (LEVEL 3 ONLY)
// ─────────────────────────────────────────────
const pearImg = new Image();
pearImg.src = "peer.png";

let pear = null;       // { x, y, active }
let pearsSpawned = 0;  // exact 3 per level

// ✅ precies 3 spawns in level 3
// ✅ geen overlap met kers/aardbei/banaan thresholds (50,120,200 / 140,220 / 60,150,260)
let nextPearThresholds = [90, 190, 280];

// HUD icoon (naast banaan)
const pearIconConfig = { enabled: true, x: 650, y: 450, scale: 1.0 };


// Fine-tune bullet X binnen de lane (pixels, positief = naar rechts)
let CANNON_LANE_LEFT_OFFSET_PX  = 0;
let CANNON_LANE_RIGHT_OFFSET_PX = 0;

// Bullet start (pixels). Negatief = van boven buiten beeld naar binnen
const CANNON_BULLET_START_Y = -20;

// Wave triggers
let cannonWave1Triggered = false;
let cannonWave2Triggered = false;
let cannonWave3Triggered = false;
let cannonWaveTriggered = [];
let cannonWaveTimeoutIds = [];

// Actieve bullets
const activeCannonballs = [];

// Dots thresholds (wanneer waves starten)
const CANNON_WAVE_THRESHOLDS = [40, 80, 120, 180, 250, 300, 340,  380];


// Welke kolommen (lanes) gebruikt de bullet? (0-based tile columns)
const CANNON_LANE_LEFT_COL  = 6;   // “baantje 5”
const CANNON_LANE_RIGHT_COL = 21;  // “baantje 20”

// HUD-positie van de cannons (pixels op het scherm / canvas)
const cannonHUD = {
  left:  { x: 236, y: 1, scale: 0.7 },
  right: { x: 579, y: 1, scale: 0.7 }
};

// Cannon sprite
const cannonImg = new Image();
cannonImg.src = "cannon.png";


// === EXTRA LIFE GOAL TRACKING (per fire-mode run) ===
let fireRunGhostsEaten = 0;         // telt ghosts gegeten tijdens 1 fright (max 4)
let fireRunCoinsCollected = 0;      // telt coins gepakt tijdens 1 coinbonus (max 4)
let extraLifeAwardedThisRun = false; // voorkomt dubbele extra life in dezelfde run


let loopRafId = null;



// === 1 UP POPUP (midden in beeld) ===
let oneUpTextActive = false;
let oneUpTimer = 0;
const ONE_UP_DURATION = 1500; // ms


// Start een wave (1/2/3)
function startCannonWave(wave) {
   if (!isAdvancedLevel()) return;


  // helper: timeout opslaan zodat we 'm kunnen clearen bij death/reset
  function schedule(fn, delay) {
    const id = setTimeout(fn, delay);
    cannonWaveTimeoutIds.push(id);
  }

  if (wave === 1) {
    spawnCannonballFromLane("left");
    spawnCannonballFromLane("right");
  }

  if (wave === 2) {
    spawnCannonballFromLane("left");
    schedule(() => spawnCannonballFromLane("right"), 1000);
  }

  if (wave === 3) {
    spawnCannonballFromLane("left");
    spawnCannonballFromLane("right");
  }

  if (wave === 4) {
    spawnCannonballFromLane("left");
    schedule(() => spawnCannonballFromLane("left"), 600);
    spawnCannonballFromLane("right");
  }

  if (wave === 5) {
    spawnCannonballFromLane("left");
    spawnCannonballFromLane("right");
    schedule(() => spawnCannonballFromLane("left"), 600);
    schedule(() => spawnCannonballFromLane("right"), 600);
  }

  if (wave === 6) {
    spawnCannonballFromLane("left");
    spawnCannonballFromLane("left");
    spawnCannonballFromLane("right");
    spawnCannonballFromLane("right");
  }

  // ─────────────────────────────────────────────
  // WAVE 7 – Triple burst (links/rechts afwisselend)
  // ─────────────────────────────────────────────
  if (wave === 7) {
    spawnCannonballFromLane("left");
    schedule(() => spawnCannonballFromLane("right"), 250);
    schedule(() => spawnCannonballFromLane("left"), 500);

    schedule(() => spawnCannonballFromLane("right"), 750);
    schedule(() => spawnCannonballFromLane("left"), 1000);
    schedule(() => spawnCannonballFromLane("right"), 1250);
  }

  // ─────────────────────────────────────────────
  // WAVE 8 – Final storm: snelle dubbele bursts beide kanten
  // ─────────────────────────────────────────────
  if (wave === 8) {
    // burst 1
    spawnCannonballFromLane("left");
    spawnCannonballFromLane("right");

    // burst 2 (snel)
    schedule(() => {
      spawnCannonballFromLane("left");
      spawnCannonballFromLane("right");
    }, 300);

    // burst 3 (nog sneller/meer druk)
    schedule(() => {
      spawnCannonballFromLane("left");
      spawnCannonballFromLane("left");
      spawnCannonballFromLane("right");
      spawnCannonballFromLane("right");
    }, 650);
  }
}

// ---------------------------------------------------------------------------
// MAZE – 28 kolommen, 29 rijen. # = muur, . = dot, O = power-dot, P/G starts
// ---------------------------------------------------------------------------

const MAZE = [
  "#O........................O#",
  "#.####.##.#####.#####.####.#",
  "#.####.##.#####.#####.####.#",
  "#.####.##..###...###..####.#",
  "#.####.##..###...###...###.#",
  "#.####.##..###...###...###.#",
  "#..........................#",
  "#..........................#",
  "######.####.####.####.######",
  "######.####.####.####.######",
  "######.##.........O##.######",
  "######.##.####X###.##.######", // nieuwe rij 11 → 1 gaatje in het midden
  "######.##.####X###.##.######", // nieuwe rij 12 → zelfde gaatje
  "X.........##GGGG##.........X",
  "######.##.########.##.######",
  "######.##.########.##.######",
  "######.##O.........##.######",
  "######.##.########.##.######",
  "######.##.########.##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#...##................##...#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#O...........P............O#",
];
const ROWS = MAZE.length;
const COLS = MAZE[0].length;

// PORTAL (horizontale poort op rij met "..........##GGG###..........")
const PORTAL_ROW       = 13;        // rij 14 menselijk → index 13
const PORTAL_LEFT_COL  = 0;         // eerste punt links in die rij
const PORTAL_RIGHT_COL = COLS - 1;  // laatste punt rechts (27 bij 28 kolommen)


// Deurpositie voor de elektrische balk
// Rij 12 (menselijk) = index 11 (0-based)
const DOOR_ROW       = 11;   // regel "######.##.####X###.##.######"
// Deur loopt ongeveer van stip 12 t/m 15
const DOOR_START_COL = 12;   // linker kant deur
const DOOR_END_COL   = 16;   // 16 is "na" stip 15 → mooi tot 15

const GAME_WIDTH = COLS * TILE_SIZE;
const GAME_HEIGHT = ROWS * TILE_SIZE;

mazeCanvas.width = GAME_WIDTH;
mazeCanvas.height = GAME_HEIGHT;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// PACMAN SPRITE SHEET
// pacmansheet.png = 3 kolommen × 4 rijen
// rij 0: rechts, rij 1: links, rij 2: omhoog, rij 3: omlaag
// kolom 0..2: mond-animatie (dicht → open)
const playerImg = new Image();
playerImg.src = "pacman_sheet_32x32_4x3.png";
let playerLoaded = false;
playerImg.onload = () => playerLoaded = true;

// Frame-gegevens
const PACMAN_FRAME_COLS = 3;  // dicht, half, open
const PACMAN_FRAME_ROWS = 4;  // rechts, links, omhoog, omlaag
const PACMAN_SRC_WIDTH  = 32;
const PACMAN_SRC_HEIGHT = 32;

const PACMAN_DIRECTION_ROW = {
  right: 0,
  left: 1,
  up: 2,
  down: 3,
};
// --- GHOST EAT SOUND (als spookje wordt opgegeten) ---
const ghostEatSound = new Audio("ghosteat.mp3"); // zorg dat dit bestand bestaat
ghostEatSound.loop = false;
ghostEatSound.volume = 0.7;

// --- READY / INTRO SOUND ---
const readySound = new Audio("getready.mp3");
readySound.loop = false;
readySound.volume = 0.8;

// --- SIRENE SOUND (loopt tijdens spel, behalve in vuur-mode) ---
const sirenSound = new Audio("sirenesound.mp3");
sirenSound.loop = true;
sirenSound.volume = 0.6;

// --- SIRENE SPEED 2 (snellere sirene na 3e vuurmode) ---
const sirenSpeed2Sound = new Audio("sirenespeed2.mp3");
sirenSpeed2Sound.loop = true;
sirenSpeed2Sound.volume = 0.6;

// GAME OVER SOUND
const gameOverSound = new Audio("gameover.mp3");
gameOverSound.loop = false;
gameOverSound.volume = 1.0;

const cannonShootSound = new Audio("cannonshoot.mp3");
cannonShootSound.loop = false;
cannonShootSound.volume = 0.8;

const cannonExplosionSound = new Audio("cannonexsplosion.mp3");
cannonExplosionSound.loop = false;
cannonExplosionSound.volume = 0.9;

// ✅ 1UP / extra-life sound
const levelUpSound = new Audio("levelup sound.mp3");
levelUpSound.preload = "auto";
levelUpSound.volume = 0.9; // pas aan als je wil


let sirenSpeed2Playing = false;

let sirenPlaying = false;
let roundStarted = false; // wordt true zodra Pacman voor het eerst beweegt

// FLAGS VOOR INTRO / READY-TEKST
let introActive   = false; // zolang true: geen beweging, alleen GET READY
let showReadyText = false;

// --- SUPERFAST SIRENE (na laatste knipper-dot + einde vuurmode) ---
const superFastSirenSound = new Audio("superfastsirine.mp3");
superFastSirenSound.loop = true;
superFastSirenSound.volume = 0.75;

let superFastSirenPlaying = false;
let allPowerDotsUsed = false;  // wordt true na de allerlaatste 'O'


const cherryIconConfig = {
  enabled: true,
  x: 660,    // positie op het scherm (px)
  y: 305,    // naast of onder je lives, pas zelf aan
  scale: 0.8 // 1.0 = normaal, 1.2 = iets groter
};


// ─────────────────────────────────────────────
// ELECTRIC BARRIER HIT (ghost → sound + sparks)
// ─────────────────────────────────────────────
const ELECTRIC_SFX_PATH = "Electric_SHOCK_sound.mp3"; // <-- pas aan indien nodig
const electricShockSfx = new Audio(ELECTRIC_SFX_PATH);
electricShockSfx.preload = "auto";

let electricSparks = []; // tijdelijke effectjes rond ghosts


// ─────────────────────────────────────────────
// SPIKY ROLLING BALL (LEVEL 3 ONLY) - NO IMAGE
// ─────────────────────────────────────────────
let spikyBall = null;

function isSpikyBallTile(c, r) {
  if (!spikyBall || !spikyBall.active) return false;
  return spikyBall.c === c && spikyBall.r === r;
}


function drawCherryIcon() {
  if (!cherryIconConfig.enabled) return;
  if (!cherryImg || !cherryImg.complete) return;

  const size = TILE_SIZE * cherryIconConfig.scale * pacmanScale;
  const x = cherryIconConfig.x;
  const y = cherryIconConfig.y;

  ctx.drawImage(
    cherryImg,
    x - size / 2,
    y - size / 2,
    size,
    size
  );
}

// Aardbei HUD-icoon (vast op canvas, los van de spawns in het doolhof)
const strawberryIconConfig = {
  enabled: true,
  x: 700,    // schuif waar je wilt; bv. rechts van de kers
  y: 303,    // zelfde hoogte als cherryIconConfig voor een nette lijn
  scale: 0.8 // zelfde schaal als kers
};

function drawStrawberryIcon() {
  if (!strawberryIconConfig.enabled) return;
  if (!strawberryImg || !strawberryImg.complete) return;

  const size = TILE_SIZE * strawberryIconConfig.scale * pacmanScale;
  const x = strawberryIconConfig.x;
  const y = strawberryIconConfig.y;

  ctx.drawImage(
    strawberryImg,
    x - size / 2,
    y - size / 2,
    size,
    size
  );
}

function drawPear() {
  if (!pear || !pear.active) return;

  const size = TILE_SIZE * 1.1;
  ctx.drawImage(pearImg, pear.x - size / 2, pear.y - size / 2, size, size);
}

function drawPearIcon() {
  if (!pearIconConfig.enabled) return;
  if (!pearImg || !pearImg.complete) return;

  const size = TILE_SIZE * pearIconConfig.scale * pacmanScale;
  const x = pearIconConfig.x;
  const y = pearIconConfig.y;

  ctx.drawImage(
    pearImg,
    x - size / 2,
    y - size / 2,
    size,
    size
  );
}


function playGhostEatSound() {
  try {
    const s = ghostEatSound.cloneNode();  // kopie zodat ze kunnen overlappen
    s.volume = ghostEatSound.volume;
    s.play().catch(() => {});
  } catch (e) {
    // negeren
  }
}

// --- EYES SOUND (als spook-ogen teruglopen) ---
const eyesSound = new Audio("eyessound.mp3");
eyesSound.loop = true;
eyesSound.volume = 0.6; // pas aan naar smaak

let eyesSoundPlaying = false;

// --- GHOST FIRE (FRIGHTENED) SOUND ---
const ghostFireSound = new Audio("ghotsfiremode.mp3");
ghostFireSound.loop = true;
ghostFireSound.volume = 0.6; // pas aan naar smaak

let ghostFireSoundPlaying = false;

function updateGhostAudioState() {
  // PRIORITEIT: EYES (EATEN) > FIREMODE (frightTimer) > niets

  const anyEaten = ghosts.some(g => g.mode === GHOST_MODE_EATEN);

  if (anyEaten) {
    // 👀 ogen aan
    if (!eyesSoundPlaying) {
      eyesSoundPlaying = true;
      eyesSound.currentTime = 0;
      eyesSound.play().catch(() => {});
    }

    // 🔥 vuurmode uit (altijd uit als er ogen actief zijn)
    if (ghostFireSoundPlaying) {
      ghostFireSoundPlaying = false;
      ghostFireSound.pause();
      ghostFireSound.currentTime = 0;
    }
    return;
  }

  // Geen ogen actief → vuurmode alleen als timer nog loopt
  const fireActive = (typeof frightTimer !== "undefined" && frightTimer > 0);

  if (fireActive) {
    // 🔥 vuurmode aan
    if (!ghostFireSoundPlaying) {
      ghostFireSoundPlaying = true;
      ghostFireSound.currentTime = 0;
      ghostFireSound.play().catch(() => {});
    }

    // 👀 ogen uit
    if (eyesSoundPlaying) {
      eyesSoundPlaying = false;
      eyesSound.pause();
      eyesSound.currentTime = 0;
    }
  } else {
    // Niets actief → alles uit
    if (ghostFireSoundPlaying) {
      ghostFireSoundPlaying = false;
      ghostFireSound.pause();
      ghostFireSound.currentTime = 0;
    }
    if (eyesSoundPlaying) {
      eyesSoundPlaying = false;
      eyesSound.pause();
      eyesSound.currentTime = 0;
    }
  }
}


function updateFrightSound() {
  updateGhostAudioState();
}
function updateEyesSound() {
  updateGhostAudioState();
}





// ---------------------------------------------------------------------------
// SCHALING (voor dots + speler + ghosts)
// ---------------------------------------------------------------------------

let mazeScale = 0.90;
let mazeOffsetX = 0;
let mazeOffsetY = 0;

// aparte schaal voor breedte (X) en hoogte (Y)
let pathScaleX  = 0.72;  // deze liet je dots al goed aansluiten in de BREEDTE
let pathScaleY  = 0.75;  // iets groter dan X → rekt dots in de HOOGTE

let pathOffsetX = 75;
let pathOffsetY = 55;

let mouthPhase   = 0;
let mouthSpeed   = 0;
let eatingTimer  = 0;
const EATING_DURATION = 200; // ms

const eatSound = new Audio("pacmaneatingdots.mp3");
// Niet loopen: één compleet deuntje per dot
eatSound.loop = false;
eatSound.volume = 0.35;

// Helper: speel altijd het hele deuntje af, zonder vorige af te kappen
function playDotSound() {
  try {
    const s = eatSound.cloneNode();  // kopie zodat vorige rustig kan uitspelen
    s.volume = eatSound.volume;
    s.play().catch(() => {
      // sommige browsers blokkeren audio zonder user interactie
    });
  } catch (e) {
    // veilig negeren
  }
}


// ---------------------------------------------------------------------------
// SCORE, STATE
// ---------------------------------------------------------------------------

const SCORE_DOT = 10;
const SCORE_POWER = 50;

let score = 0;
let lives = 3;
let gameRunning = true;
let gameOver = false;
let frame = 0;
// ✅ RUN TIMER (blijft over levens heen)
let runTimeMs = 0;
let timerRunning = false;
let lastShownSecond = -1; // om DOM-updates te beperken (netter)


// ───────────────────────────────────────────────
// LEVEL SYSTEM
// ───────────────────────────────────────────────
let currentLevel = 1;
let readyLabel   = "GET READY!";  // level 1 tekst
// ───────────────────────────────────────────────
// VISUELE LIVES ALS PACMAN-ICOONTJES
// ───────────────────────────────────────────────


let gameTime = 0; // ms sinds start / laatste reset

// SCALES
let pacmanScale = 1.6;   // standaard 1.4 → iets groter
let ghostScale  = 2.0;   // standaard 1.2 → iets groter

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const timeEl = document.getElementById("time");
const messageEl = document.getElementById("message");
const messageTextEl = document.getElementById("messageText");

// ELECTRICITY OVERLAY (px-coördinaten op gameCanvas)
let electricPhase = 0;

// basispositie van de balk
const E_START_X_BASE = 450;
const E_END_X_BASE   = 520;
const E_Y_BASE       = 360;

// 👉 alleen deze twee hoef je straks aan te passen
let ELECTRIC_OFFSET_X = -82;  // - is links, + is rechts
let ELECTRIC_OFFSET_Y = -24;  // - is omhoog, + is omlaag
// ───────────────────────────────────────────────
// PACMAN DEATH ANIMATIE
// ───────────────────────────────────────────────
let isDying = false;          // zijn we nu een death animatie aan het afspelen?
let deathAnimTime = 0;        // ms hoeveel tijd al in de animatie
let deathAnimDuration = 1400; // default duur (ms), wordt gesync'd met de sound

const pacmanDeathSound = new Audio("pacmandeadsound.mp3");
pacmanDeathSound.loop = false;
pacmanDeathSound.volume = 0.8;

// Zodra de metadata geladen is, kennen we de echte duur van het geluid
pacmanDeathSound.addEventListener("loadedmetadata", () => {
  if (!isNaN(pacmanDeathSound.duration) && pacmanDeathSound.duration > 0) {
    deathAnimDuration = pacmanDeathSound.duration * 1000; // sec → ms
  }
});


const STORAGE_VARIANT = (() => {
  try {
    return window.matchMedia && window.matchMedia("(max-width: 820px)").matches
      ? "mobile"
      : "desktop";
  } catch (e) {
    return "desktop";
  }
})();

const HIGHSCORE_KEY_BASE = "bittyHighscores";
const PLAYER_PROFILE_KEY_BASE = "bittyPlayerProfile";
const LAST_RUN_KEY_BASE = "lastRunResult";

function getHighscoreKey() { return HIGHSCORE_KEY_BASE; }

function getPlayerProfileKey() { return `${PLAYER_PROFILE_KEY_BASE}_${STORAGE_VARIANT}`; }
function getLastRunKey()       { return `${LAST_RUN_KEY_BASE}_${STORAGE_VARIANT}`; }

const USE_SERVER_HIGHSCORES = true;


const HIGHSCORE_MAX = 10;

const API_BASE = `${window.location.origin}/pacman/bitty_pacman_api/api_pacman/`;

const PACMAN_SAVE_SCORE_URL = `${API_BASE}pacman_save_score.php`;
const PACMAN_GET_SCORES_URL = `${API_BASE}pacman_get_scores.php`;

let highscoreList = [];
const highscoreAvatarCache = new Map();


function loadHighscores() {
  try {
    const raw = localStorage.getItem(getHighscoreKey());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // basic sanitize
    return arr.map(x => ({
      name: (x?.name || "Unknown").toString().slice(0, 16),
      avatarDataUrl: (x?.avatarDataUrl || "").toString(),
      score: Number(x?.score || 0) || 0,
      timeMs: Number(x?.timeMs || 0) || 0,
      level: Number(x?.level || 1) || 1,
      endedAt: Number(x?.endedAt || Date.now()) || Date.now(),
    }));
  } catch (e) {
    return [];
  }
}

// Highscores van de server ophalen en in highscoreList stoppen
async function loadHighscoresFromServer() {
  try {
    const res = await fetch(PACMAN_GET_SCORES_URL, { cache: "no-store" });
    const serverList = await res.json();
    if (!Array.isArray(serverList)) return;

    const mapped = serverList.map(row => ({
      name: (row.name || "Unknown").toString().slice(0, 16),
      avatarDataUrl: (row.avatar || "").toString(), // ✅ hier gewijzigd
      score: Number(row.score || 0) || 0,
      timeMs: (Number(row.time_seconds || 0) || 0) * 1000,
      level: Number(row.level || 1) || 1,
      endedAt: Date.now(),
    }));

    highscoreList = mapped;
    saveHighscores(highscoreList);
    renderMobileHighscoreList();
  } catch (err) {
    console.error("Pacman highscores van server laden mislukt:", err);
  }
}


function renderMobileHighscoreList() {
  const listEl = document.getElementById("highscoreList");
  if (!listEl) return;

  const rows = [];

  for (let i = 0; i < HIGHSCORE_MAX; i++) {
    const e = highscoreList[i];

    if (!e) {
      rows.push(`
        <div class="hsRow">
          <span class="hsPos">${i + 1}.</span>
          <div class="hsAvatar hsAvatarEmpty"></div>
          <span class="hsEmpty">—</span>
        </div>
      `);
      continue;
    }

    const avatar = e.avatarDataUrl
      ? `<img class="hsAvatar" src="${e.avatarDataUrl}" />`
      : `<div class="hsAvatar hsAvatarEmpty"></div>`;

    rows.push(`
      <div class="hsRow">
        <span class="hsPos">${i + 1}.</span>
        ${avatar}
        <span class="hsName">${e.name}</span>
        <span class="hsScore">${Math.floor(e.score)}</span>
        <span class="hsTime">${formatRunTime(e.timeMs)}</span>
        <span class="hsLvl">(${e.level})</span>
      </div>
    `);
  }

  listEl.innerHTML = rows.join("");
}


function loadHighscoresFromLocal() {
  try {
    const raw = localStorage.getItem(getHighscoreKey());
    if (!raw) return false;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return false;
    highscoreList = list;
    return true;
  } catch (e) {
    return false;
  }
}


function saveHighscores(list) {
  try {
  localStorage.setItem(getHighscoreKey(), JSON.stringify(list));
  } catch (e) {}
}

function compareHighscore(a, b) {
  // 1) score desc
  if (b.score !== a.score) return b.score - a.score;
  // 2) time asc (sneller beter)
  if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
  // 3) level desc
  if (b.level !== a.level) return b.level - a.level;
  // 4) endedAt asc (stabiel)
  return a.endedAt - b.endedAt;
}

function isHighscoreWorthy(entry, list) {
  if (list.length < HIGHSCORE_MAX) return true;
  const worst = [...list].sort(compareHighscore)[HIGHSCORE_MAX - 1];
  return compareHighscore(entry, worst) < 0; // entry beter dan worst
}


function upsertHighscore(entry) {
  // Optioneel: simpele anti-duplicate (zelfde run per ongeluk 2x submitten)
  // (zelfde naam + score + time + level binnen 3 seconden)
  const DUP_WINDOW_MS = 3000;
  const isDup = highscoreList.some(e =>
    e.name === entry.name &&
    Number(e.score) === Number(entry.score) &&
    Number(e.timeMs) === Number(entry.timeMs) &&
    Number(e.level) === Number(entry.level) &&
    Math.abs(Number(e.endedAt || 0) - Number(entry.endedAt || 0)) < DUP_WINDOW_MS
  );

  if (!isDup) {
    const next = [...highscoreList, entry]
      .sort(compareHighscore)
      .slice(0, HIGHSCORE_MAX);

    highscoreList = next;
    saveHighscores(highscoreList);
  }

  // ✅ Mobile panel live bijwerken
  if (typeof renderMobileHighscoreList === "function") {
    renderMobileHighscoreList();
  }
}

function submitRunToHighscores() {
  // Player must be "logged in" (naam) om te submitten
  const nm = (playerProfile?.name || "").trim();
  if (!nm) return;

  const entry = {
    name: nm.slice(0, 16),
    avatarDataUrl: (playerProfile?.avatarDataUrl || ""),
    score: Number(score || 0) || 0,
    timeMs: Number(runTimeMs || 0) || 0,
    level: Number(currentLevel || 1) || 1,
    endedAt: Date.now(),
  };

  const serverMode =
    (typeof USE_SERVER_HIGHSCORES === "undefined") ? true : !!USE_SERVER_HIGHSCORES;

  // ✅ In LOCAL mode: alleen opslaan als het top10 waardig is (zoals je al had)
  // ✅ In SERVER mode: NOOIT blokkeren op lokale lijst (server is de waarheid)
  if (!serverMode) {
    if (!isHighscoreWorthy(entry, highscoreList)) return;
  }

  // 1) Lokaal updaten (direct feedback)
  upsertHighscore(entry);

  // 1b) Mobile paneel meteen verversen als het open is
  const hsPanel = document.getElementById("highscorePanel");
  if (hsPanel && hsPanel.classList.contains("open")) {
    if (typeof renderMobileHighscoreList === "function") {
      renderMobileHighscoreList();
    }
  }

  // 2) Server sync alleen doen in serverMode
  if (!serverMode) return;

  // 3) Server POST (score + avatar) + daarna server opnieuw laden
  try {
    fetch(PACMAN_SAVE_SCORE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: entry.name,
        score: entry.score,
        level: entry.level,
        time_seconds: Math.floor(entry.timeMs / 1000), // ms → seconden
        avatar: entry.avatarDataUrl || ""
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          // probeer error-tekst te lezen (handig bij debugging)
          let txt = "";
          try { txt = await res.text(); } catch (e) {}
          throw new Error(`HTTP ${res.status} ${txt}`.trim());
        }

        // ✅ server is nu de waarheid → opnieuw ophalen
        if (typeof loadHighscoresFromServer === "function") {
          await loadHighscoresFromServer();
        }
      })
      .catch(err => {
        console.error("Pacman highscore naar server sturen mislukt:", err);
        // Lokaal blijft staan (direct feedback). Eventueel kun je hier nog een kleine toast tonen.
      });
  } catch (err) {
    console.error("Pacman highscore naar server sturen gaf een fout:", err);
  }
}


function getAvatarImage(dataUrl) {
  if (!dataUrl) return null;
  if (highscoreAvatarCache.has(dataUrl)) return highscoreAvatarCache.get(dataUrl);

  const img = new Image();
  img.src = dataUrl;
  highscoreAvatarCache.set(dataUrl, img);
  return img;
}

// init load (eenmalig): eerst lokaal, dan proberen van server
highscoreList = loadHighscores();
renderMobileHighscoreList();

if (USE_SERVER_HIGHSCORES) {
  loadHighscoresFromServer();
}



function isAdvancedLevel() {
  return currentLevel === 2 || currentLevel === 3 || currentLevel === 4;
}

function applySpeedsForLevel() {
  const BASE_SPEED = 2.8;

  if (currentLevel === 1) {
    // ✅ Level 1: rustig / basis
    SPEED_CONFIG.playerSpeed      = BASE_SPEED * 1.20; // ≈ 3.36
    SPEED_CONFIG.ghostSpeed       = SPEED_CONFIG.playerSpeed * 0.95;
    SPEED_CONFIG.ghostTunnelSpeed = SPEED_CONFIG.playerSpeed * 0.45;
    SPEED_CONFIG.ghostFrightSpeed = SPEED_CONFIG.playerSpeed * 0.60;

  } else if (currentLevel === 2) {
    // Level 2: duidelijk sneller
    SPEED_CONFIG.playerSpeed      = BASE_SPEED * 1.25; // ≈ 3.50
    SPEED_CONFIG.ghostSpeed       = SPEED_CONFIG.playerSpeed * 0.97;
    SPEED_CONFIG.ghostTunnelSpeed = SPEED_CONFIG.playerSpeed * 0.48;
    SPEED_CONFIG.ghostFrightSpeed = SPEED_CONFIG.playerSpeed * 0.65;

  } else if (currentLevel === 3) {
    // Level 3: hoogste snelheid + agressie
    SPEED_CONFIG.playerSpeed      = BASE_SPEED * 1.40; // ≈ 3.92
    SPEED_CONFIG.ghostSpeed       = SPEED_CONFIG.playerSpeed * 0.98;
    SPEED_CONFIG.ghostTunnelSpeed = SPEED_CONFIG.playerSpeed * 0.58;
    SPEED_CONFIG.ghostFrightSpeed = SPEED_CONFIG.playerSpeed * 0.76;

  } else if (currentLevel === 4) {
    // 🔥 Level 4: eigen tuning
    SPEED_CONFIG.playerSpeed      = BASE_SPEED * 1.25; // ≈ 3.50

    // 👉 ALS Pacman nu sneller voelt dan spookjes:
    // Zet ghostSpeed iets boven playerSpeed (bijv. 1.02 - 1.08)
    SPEED_CONFIG.ghostSpeed       = SPEED_CONFIG.playerSpeed * 0.99;

    SPEED_CONFIG.ghostTunnelSpeed = SPEED_CONFIG.playerSpeed * 0.48;
    SPEED_CONFIG.ghostFrightSpeed = SPEED_CONFIG.playerSpeed * 0.65;
  }

  // ─────────────────────────────────────────────
  // Bestaande entiteiten direct updaten
  // ─────────────────────────────────────────────
  if (player) {
    player.speed = SPEED_CONFIG.playerSpeed;
  }

  if (Array.isArray(ghosts)) {
    ghosts.forEach(g => {
      switch (g.mode) {
        case GHOST_MODE_FRIGHTENED:
          g.speed = SPEED_CONFIG.ghostFrightSpeed;
          break;

        case GHOST_MODE_SCATTER:
        case GHOST_MODE_CHASE:
          g.speed = SPEED_CONFIG.ghostSpeed;
          break;

        case GHOST_MODE_EATEN:
          g.speed = SPEED_CONFIG.ghostEyesSpeed; // blijft je vaste oogjes speed
          break;
      }
    });
  }

  // ─────────────────────────────────────────────
  // Clyde vlucht-afstand per level (INDIVIDUEEL)
  // ─────────────────────────────────────────────
  if (typeof CLYDE_SCATTER_DISTANCE_TILES !== "undefined") {
    if (currentLevel === 4) {
      // Level 4: Clyde bijna niet bang
      CLYDE_SCATTER_DISTANCE_TILES = 2.5;

    } else if (currentLevel === 3) {
      // Level 3: Clyde slim maar nog voorzichtig
      CLYDE_SCATTER_DISTANCE_TILES = 3.0;

    } else {
      // Level 1 & 2: klassiek Pacman-gedrag
      CLYDE_SCATTER_DISTANCE_TILES = 4.0;
    }

    // ✅ alleen herberekenen als tiles bestaat
    if (typeof CLYDE_SCATTER_DISTANCE2 !== "undefined") {
      CLYDE_SCATTER_DISTANCE2 =
        CLYDE_SCATTER_DISTANCE_TILES * CLYDE_SCATTER_DISTANCE_TILES;
    }
  }
} // ✅ BELANGRIJK: deze } miste, daardoor kreeg je Unexpected end of input


// ---------------------------------------------------------------------------
// MAZE helpers
// ---------------------------------------------------------------------------

function formatRunTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function updateTimeHud() {
  if (!timeEl) return;

  const sec = Math.floor(runTimeMs / 1000);
  if (sec === lastShownSecond) return;

  lastShownSecond = sec;
  timeEl.textContent = formatRunTime(runTimeMs);
}

// ───────────────────────────────────────────────
// PLAYER CARD (Login/Logout + Avatar) — DOM overlay
// ───────────────────────────────────────────────
const playerCardCfg = {
  visible: true,
  x: null,   // null = auto position once
  y: null,
};

let playerProfile = {
  name: "",
  avatarDataUrl: ""
};

function loadPlayerProfile() {
  try {
    const raw = localStorage.getItem(getPlayerProfileKey());
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      playerProfile.name = (obj.name || "").toString();
      playerProfile.avatarDataUrl = (obj.avatarDataUrl || "").toString();
    }
  } catch (e) {}
}

function savePlayerProfile() {
  try {
    localStorage.setItem(getPlayerProfileKey(), JSON.stringify(playerProfile));
  } catch (e) {}
}



function setPlayerCardPositionAutoOnce() {
  // ✅ VASTE POSITIE (pas deze 2 waarden aan naar smaak)
  playerCardCfg.x = 1040;  // linkspositie
  playerCardCfg.y = 80;   // toppositie
}



function applyPlayerCardTransform() {
  const card = document.getElementById("playerCard");
  if (!card) return;

  card.style.display = playerCardCfg.visible ? "block" : "none";
  card.style.left = playerCardCfg.x + "px";
  card.style.top  = playerCardCfg.y + "px";
}

function setLoggedInUI(isLoggedIn) {
  const loginView = document.getElementById("loginView");
  const hudView   = document.getElementById("hudView");
  const hudName   = document.getElementById("playerHudName");
  const hudAvatar = document.getElementById("avatarHud");
  const preview   = document.getElementById("avatarPreview");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!loginView || !hudView) return;

  if (isLoggedIn) {
    loginView.classList.add("hidden");
    hudView.classList.remove("hidden");

    // ✅ BOVENIN: header wordt avatar + naam
    updatePlayerCardHeader(true);

    // ❌ ONDERIN: naam en grote avatar weg (mich... en het grote plaatje)
    if (hudName) {
      hudName.textContent = "";
      hudName.style.display = "none";
    }
    if (hudAvatar) {
      hudAvatar.src = "";
      hudAvatar.style.display = "none";
    }

    // ✅ HUD container perfect centreren (fix horizontaal + verticaal)
    hudView.style.display = "flex";
    hudView.style.flexDirection = "column";
    hudView.style.alignItems = "center";
    hudView.style.justifyContent = "center";

    // ✅ ONDERIN: alleen logout button, echt gecentreerd
    if (logoutBtn) {
      logoutBtn.style.display = "inline-flex";
      logoutBtn.style.margin = "0";
      logoutBtn.style.position = "static";
      logoutBtn.style.left = "";
      logoutBtn.style.right = "";
      logoutBtn.style.alignSelf = "center";
      logoutBtn.style.justifySelf = "center";
    }

  } else {
    hudView.classList.add("hidden");
    loginView.classList.remove("hidden");

    // ✅ Header terug naar PLAYER
    updatePlayerCardHeader(false);

    // preview (optioneel)
    if (preview) {
      preview.src = playerProfile.avatarDataUrl || "";
      preview.style.display = playerProfile.avatarDataUrl ? "block" : "none";
    }

    // ✅ Reset HUD centering styles
    hudView.style.display = "";
    hudView.style.flexDirection = "";
    hudView.style.alignItems = "";
    hudView.style.justifyContent = "";

    // Reset styles zodat alles "normaal" is als je ooit weer HUD dingen terug wil
    if (hudName) hudName.style.display = "";
    if (hudAvatar) hudAvatar.style.display = "";
    if (logoutBtn) {
      logoutBtn.style.margin = "";
      logoutBtn.style.position = "";
      logoutBtn.style.left = "";
      logoutBtn.style.right = "";
      logoutBtn.style.alignSelf = "";
      logoutBtn.style.justifySelf = "";
    }
  }
}




function updatePlayerCardHeader(isLoggedIn) {
  const header = document.getElementById("playerCardHeader");
  if (!header) return;

  // Reset header styling/inhoud
  header.innerHTML = "";

  if (!isLoggedIn) {
    // Uitgelogd → gewoon "PLAYER"
    header.textContent = "PLAYER";
    return;
  }

  // Ingelogd → avatar (optioneel) + naam
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "10px";

  // Avatar (alleen als er één gekozen is)
  if (playerProfile.avatarDataUrl) {
    const img = document.createElement("img");
    img.src = playerProfile.avatarDataUrl;
    img.alt = "Avatar";
    img.style.width = "34px";
    img.style.height = "34px";
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";
    img.style.display = "block";
    wrapper.appendChild(img);
  }

  const nameSpan = document.createElement("span");
  nameSpan.textContent = (playerProfile.name || "PLAYER").toUpperCase();
  wrapper.appendChild(nameSpan);

  header.appendChild(wrapper);
}


function showMobileHudModal() {
  // alleen relevant op mobile
  if (!isMobileLayout) return;

  const overlay = document.getElementById("loginOverlay");
  const card = document.getElementById("playerCard");

  // toon overlay
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }

  // toon card
  if (card) {
    card.classList.remove("hidden");
  }

  // force HUD view (START+LOGOUT)
  if (typeof setLoggedInUI === "function") setLoggedInUI(true);
  if (typeof updatePlayerCardHeader === "function") updatePlayerCardHeader(true);

  // iOS zoom reset (voor de zekerheid)
  if (typeof iosResetZoom === "function") iosResetZoom();
}


function showMobileLoginModal() {
  const overlay = document.getElementById("loginOverlay");
  const card = document.getElementById("playerCard");

  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }

  if (card) {
    card.classList.remove("hidden");   // ✅ toon card via class
  }

  // input blokkeren tot login
  window.isMobileInput = false;
  isMobileInput = false;

  // spel bevriezen tot login
  gameRunning = false;
  timerRunning = false;
}

function hideMobileLoginModal() {
  const overlay = document.getElementById("loginOverlay");
  const card = document.getElementById("playerCard");

  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }

  if (isMobileLayout && card) {
    card.classList.add("hidden");      // ✅ verberg card via class
  }

  // input weer aan op mobiel
  if (isMobileLayout) {
    window.isMobileInput = true;
    isMobileInput = true;
  }

  // ✅ iPhone zoom fix (je had hem al, maar hier is de beste plek)
  if (typeof iosResetZoom === "function") {
    iosResetZoom();
  }
}

function iosResetZoom() {
  // iOS Safari kan ingezoomd blijven na input-focus
  if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) return;

  // blur actieve input
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }

  // kleine "kick" om viewport te herpakken
  window.scrollTo(window.scrollX, window.scrollY);

  // Soms helpt dit extra (zonder layout te slopen)
  document.body.style.webkitTextSizeAdjust = "100%";
}

function initPlayerCard() {
  const card = document.getElementById("playerCard");
  if (!card) return;

  const header    = document.getElementById("playerCardHeader");
  const chooseBtn = document.getElementById("chooseAvatarBtn");
  const fileInput = document.getElementById("avatarInput");
  const loginBtn  = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const startBtn  = document.getElementById("startBtn"); // ✅ NEW
  const nameInput = document.getElementById("playerNameInput");
  const preview   = document.getElementById("avatarPreview");

  loadPlayerProfile();

  // vaste positie
  setPlayerCardPositionAutoOnce();
  applyPlayerCardTransform();

  if (header) header.style.cursor = "default";

  // Start state
  const loggedIn = !!(playerProfile && playerProfile.name);

  if (nameInput) nameInput.value = playerProfile.name || "";

  if (preview) {
    preview.src = playerProfile.avatarDataUrl || "";
    preview.style.display = playerProfile.avatarDataUrl ? "block" : "none";
  }

  // zet UI + header meteen correct
  setLoggedInUI(loggedIn);
  updatePlayerCardHeader(loggedIn);

  // Avatar kiezen knop
  if (chooseBtn && fileInput) {
    chooseBtn.addEventListener("click", () => fileInput.click());
  }

  // Avatar upload
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;

      const reader = new FileReader();
      reader.onload = () => {
        playerProfile.avatarDataUrl = String(reader.result || "");
        savePlayerProfile();

        if (preview) {
          preview.src = playerProfile.avatarDataUrl;
          preview.style.display = "block";
        }

        const hudAvatar = document.getElementById("avatarHud");
        if (hudAvatar) {
          hudAvatar.src = playerProfile.avatarDataUrl || "";
          hudAvatar.style.display = playerProfile.avatarDataUrl ? "block" : "none";
        }

        // header direct updaten
        updatePlayerCardHeader(!!(playerProfile && playerProfile.name));
      };
      reader.readAsDataURL(f);
    });
  }

  // LOGIN
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      const nm = (nameInput?.value || "").trim().slice(0, 10);
      if (!nm) return;

      // sla speler op
      playerProfile.name = nm;
      savePlayerProfile();

      // input leegmaken
      if (nameInput) nameInput.value = "";

      // UI naar "ingelogd"
      setLoggedInUI(true);
      updatePlayerCardHeader(true);

      // 📱 MOBILE FLOW (jouw bestaande flow laten staan)
      if (isMobileLayout) {
        hideMobileLoginModal();

        if (typeof iosResetZoom === "function") {
          iosResetZoom();
        }

        // op mobiel: starten als game nog niet loopt
        if (!gameRunning && !gameOver) {
          pendingStartAfterLogin = false;
          startNewGame();
        }
      }
    });
  }

  // START (desktop + mobile): start opnieuw als game niet loopt
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      // Als je modal open is op mobile, weg ermee (safe)
      if (isMobileLayout && typeof hideMobileLoginModal === "function") {
        hideMobileLoginModal();
      }

      // Alleen starten als game niet loopt
      if (!gameRunning) {
        startNewGame();
      }
    });
  }

  // LOGOUT
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      playerProfile.name = "";
      savePlayerProfile();

      if (nameInput) nameInput.value = "";

      setLoggedInUI(false);
      updatePlayerCardHeader(false);
    });
  }
}




let currentMaze = MAZE.slice(); // voor zichtbare dots

function updateBittyPanel() {
  const panel = document.getElementById("bittyPanel");
  if (!panel) return;

  // zichtbaar / onzichtbaar
  panel.style.display = bittyVisible ? "block" : "none";

  // positie + schaal
  panel.style.transform =
    `translate(${bittyPosX}px, ${bittyPosY}px) scale(${bittyScale})`;
}


function getTile(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return "#";
  return currentMaze[r][c];
}

function setTile(c, r, ch) {
  let row = currentMaze[r].split("");
  row[c] = ch;
  currentMaze[r] = row.join("");
}

// Alleen ".", "O", "P", "G" zijn pad – rest is muur
function isWall(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
  const t = MAZE[r][c];

  // X = onzichtbare dot/pad
  return !(t === "." || t === "O" || t === "P" || t === "G" || t === "X");
}

function tileCenter(c, r) {
  return { x: (c + 0.5) * TILE_SIZE, y: (r + 0.5) * TILE_SIZE };
}

function findPositions() {
  let pac = null;
  let ghostStarts = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAZE[r][c] === "P") pac = { c, r };
      if (MAZE[r][c] === "G") ghostStarts.push({ c, r });
    }
  }

  // midden van de 3 ghost tiles bepalen
  if (ghostStarts.length > 0) {
    const avgC = Math.round(ghostStarts.reduce((s,g)=>s+g.c,0) / ghostStarts.length);
    const avgR = Math.round(ghostStarts.reduce((s,g)=>s+g.r,0) / ghostStarts.length);
    return { pac, ghostPen: { c: avgC, r: avgR }, ghostStarts };
  }

  return { pac, ghostPen: null, ghostStarts: [] };
}

const { pac, ghostPen, ghostStarts } = findPositions();
const startGhostTile = ghostPen;

// kolombreedte van de pen bepalen (voor eventueel gebruik – maar nu niet nodig)
let penColMin = null;
let penColMax = null;
if (ghostStarts.length > 0) {
  penColMin = Math.min(...ghostStarts.map(g => g.c));
  penColMax = Math.max(...ghostStarts.map(g => g.c));
}


function startSiren() {
  if (sirenPlaying) return;
  sirenPlaying = true;
  sirenSound.currentTime = 0;
  sirenSound.play().catch(() => {});
}

function stopSiren() {
  if (!sirenPlaying) return;
  sirenPlaying = false;
  sirenSound.pause();
  sirenSound.currentTime = 0;
}

function startSirenSpeed2() {
  if (sirenSpeed2Playing) return;
  sirenSpeed2Playing = true;
  sirenSpeed2Sound.currentTime = 0;
  sirenSpeed2Sound.play().catch(() => {});
}

function stopSirenSpeed2() {
  if (!sirenSpeed2Playing) return;
  sirenSpeed2Playing = false;
  sirenSpeed2Sound.pause();
  sirenSpeed2Sound.currentTime = 0;
}

// SUPERFAST
function startSuperFastSiren() {
  if (superFastSirenPlaying) return;
  superFastSirenPlaying = true;
  superFastSirenSound.currentTime = 0;
  superFastSirenSound.play().catch(() => {});
}

function stopSuperFastSiren() {
  if (!superFastSirenPlaying) return;
  superFastSirenPlaying = false;
  superFastSirenSound.pause();
  superFastSirenSound.currentTime = 0;
}

function stopAllSirens() {
  stopSiren();
  stopSirenSpeed2();
  stopSuperFastSiren();
}

function updateSirenSound() {
  const anyFright = ghosts.some(g => g.mode === GHOST_MODE_FRIGHTENED);

  // Geen sirenes tijdens intro, game over of vóór eerste beweging
  if (!gameRunning || introActive || gameOver || !roundStarted) {
    stopAllSirens();
    return;
  }

  // 🔥 Tijdens vuurmode → GEEN sirenes
  if (anyFright) {
    stopAllSirens();
    return;
  }

  // 🟣 SUPERFAST SIRENE:
  // Alleen als ALLE knipper-dots (O) op zijn én vuurmode nu echt voorbij is
  if (allPowerDotsUsed) {
    stopSiren();
    stopSirenSpeed2();
    if (!superFastSirenPlaying) {
      startSuperFastSiren();
    }
    return;
  }

  // 🔵 Na de 3e vuurmode → snelle sirene
  if (typeof frightActivationCount !== "undefined" && frightActivationCount >= 3) {
    stopSiren();
    stopSuperFastSiren();
    if (!sirenSpeed2Playing) {
      startSirenSpeed2();
    }
    return;
  }

  // 🟡 Standaard sirene
  stopSirenSpeed2();
  stopSuperFastSiren();
  if (!sirenPlaying) {
    startSiren();
  }
}


// INTRO STARTEN
function startIntro() {
  introActive   = true;
  showReadyText = true;
  gameRunning   = false; // alles bevriezen

  roundStarted = false;

  // ✅ GAME OVER MUZIEK STOPPEN BIJ NIEUWE GAME
  if (typeof gameOverSound !== "undefined" && gameOverSound) {
    gameOverSound.pause();
    gameOverSound.currentTime = 0;
  }
  
  // zeker weten dat alle sounds uit zijn
  if (eyesSoundPlaying) {
    eyesSoundPlaying = false;
    eyesSound.pause();
    eyesSound.currentTime = 0;
  }
  if (ghostFireSoundPlaying) {
    ghostFireSoundPlaying = false;
    ghostFireSound.pause();
    ghostFireSound.currentTime = 0;
  }

  if (typeof stopAllSirens === "function") {
    stopAllSirens();
  } else if (sirenPlaying) {
    stopSiren();
  }

  readySound.currentTime = 0;
  readySound.play().catch(() => {});
}

// als ready-deuntje klaar is → spel starten + sirene aan
readySound.addEventListener("ended", () => {
  introActive   = false;
  showReadyText = false;
  gameRunning   = true;

  // Sirene nog NIET starten hier.
  // We wachten tot Pacman echt gaat bewegen (roundStarted in updatePlayer).
});


function startCoinBonus() {
  // ✅ Altijd oude coins weg (ook als ze er nog stonden)
  coins.length = 0;

  // ✅ Nieuwe set van 4 coins voorbereiden
  prepareCoinsForBonus();

  // ✅ Coin-bonus actief + timer opnieuw starten
  coinBonusActive = true;
  coinBonusTimer = COIN_BONUS_DURATION;

  // ✅ Puntenvolgorde opnieuw: 250 → 500 → 1000 → 2000
  coinPickupIndex = 0;

  // ✅ Nieuwe coin-run → teller resetten
  fireRunCoinsCollected = 0;

  // ✅ Zorg dat 1UP weer mogelijk is
  extraLifeAwardedThisRun = false;
}




function endCoinBonus() {
  coinBonusActive = false;
  coinBonusTimer = 0;
  coins.length = 0; // verwijder alle coins uit het veld
}


// ---------------------------------------------------------------------------
// ENTITIES
// ---------------------------------------------------------------------------



// --- PACMAN ---
const player = {
  x: tileCenter(pac.c, pac.r).x,
  y: tileCenter(pac.c, pac.r).y,
  dir:     { x: 0, y: 0 },
  nextDir: { x: 0, y: 0 },
  speed: SPEED_CONFIG.playerSpeed,
  facingRow: PACMAN_DIRECTION_ROW.right, // laatste kijkrichting
  isMoving: false,                       // ← NIEUW
};
// --- GHOSTS ---
const ghosts = [
  {
    id: 1, // Blinky
    x: tileCenter(ghostStarts[0].c, ghostStarts[0].r).x,
    y: tileCenter(ghostStarts[0].c, ghostStarts[0].r).y,
    dir: { x: 0, y: -1 },
    speed: SPEED_CONFIG.ghostSpeed,
    released: false,
    releaseTime: 0,          // komt direct als eerste naar buiten
    hasExitedBox: false,
    mode: GHOST_MODE_SCATTER,
    scatterTile: { c: 26, r: 1 }, // top-right corner
    targetTile:  { c: pac.c, r: pac.r },
  },
  {
    id: 2, // Pinky
    x: tileCenter(ghostStarts[1].c, ghostStarts[1].r).x,
    y: tileCenter(ghostStarts[1].c, ghostStarts[1].r).y,
    dir: { x: 0, y: -1 },
    speed: SPEED_CONFIG.ghostSpeed,
    released: false,
    releaseTime: 2000,       // 3s later
    hasExitedBox: false,
    mode: GHOST_MODE_SCATTER,
    scatterTile: { c: 1, r: 1 }, // top-left corner
    targetTile:  { c: pac.c, r: pac.r },
  },
  {
    id: 3, // Inky
    x: tileCenter(ghostStarts[2].c, ghostStarts[2].r).x,
    y: tileCenter(ghostStarts[2].c, ghostStarts[2].r).y,
    dir: { x: 0, y: -1 },
    speed: SPEED_CONFIG.ghostSpeed,
    released: false,
    releaseTime: 4000,       // 6s later
    hasExitedBox: false,
    mode: GHOST_MODE_SCATTER,
    scatterTile: { c: 26, r: 27 }, // bottom-right
    targetTile:  { c: pac.c, r: pac.r },
  },
  {
    id: 4, // Clyde
    x: tileCenter(ghostStarts[3].c, ghostStarts[3].r).x,
    y: tileCenter(ghostStarts[3].c, ghostStarts[3].r).y,
    dir: { x: 0, y: -1 },
    speed: SPEED_CONFIG.ghostSpeed,
    released: false,
    releaseTime: 6000,       // 9s later
    hasExitedBox: false,
    mode: GHOST_MODE_SCATTER,
    scatterTile: { c: 1, r: 27 },  // bottom-left
    targetTile:  { c: pac.c, r: pac.r },
  },
];



// ---------------------------------------------------------------------------
// ZWEVENDE SCORES (200 / 400 / 800 / 1600 boven spookje)
// ---------------------------------------------------------------------------
const floatingScores = [];

function spawnFloatingScore(x, y, value) {
  floatingScores.push({
    x,
    y,
    value,
    life: 1000 // ms zichtbaar
  });
}

function updateFloatingScores(deltaMs) {
  for (let i = floatingScores.length - 1; i >= 0; i--) {
    const fs = floatingScores[i];
    fs.life -= deltaMs;
    fs.y -= 0.03 * deltaMs; // langzaam omhoog zweven

    if (fs.life <= 0) {
      floatingScores.splice(i, 1);
    }
  }
}
function updateCannonballs(deltaMs) {
  for (let i = activeCannonballs.length - 1; i >= 0; i--) {
    const b = activeCannonballs[i];

    // ───── EXPLOSIE-FASE ─────
    if (b.exploding) {
      b.explodeTime += deltaMs;
      if (b.explodeTime > 400) {
        activeCannonballs.splice(i, 1);
      }
      continue;
    }

    // ───── BEWEGING ─────
    b.y += b.vy;

    let hitSomething = false;

    // ───── HIT MET PACMAN ─────
    const distP = Math.hypot(player.x - b.x, player.y - b.y);
    if (distP < b.radius + TILE_SIZE * 0.4) {
      hitSomething = true;
      startPacmanDeath();   // zelfde als door ghost geraakt
    }

    // ───── HIT MET GHOSTS ─────
    for (const g of ghosts) {
      const distG = Math.hypot(g.x - b.x, g.y - b.y);
      if (distG < b.radius + TILE_SIZE * 0.4) {
        hitSomething = true;

        // ghost wordt “ogen” → terug naar pen
        g.mode  = GHOST_MODE_EATEN;
        g.speed = SPEED_CONFIG.ghostEyesSpeed;

        g.targetTile = { c: startGhostTile.c, r: startGhostTile.r };
      }
    }

    // ───── EIND VAN DE BAAN / MUUR ─────
    // we checken de maze-tile: als daar een muur is, explodeert hij
    const c = Math.floor(b.x / TILE_SIZE);
    const r = Math.floor(b.y / TILE_SIZE);

   // Alleen walls checken zodra de bullet echt in de maze zit
if (b.y >= 0) {
  if (isWall(c, r) || b.y > GAME_HEIGHT - TILE_SIZE) {
    hitSomething = true;
  }
} else {
  // bovenin: nog niks doen, gewoon doorvliegen
  if (b.y > GAME_HEIGHT - TILE_SIZE) hitSomething = true;
}


    // ───── EXPLOSIE STARTEN ─────
    if (hitSomething) {
      b.exploding = true;
      b.explodeTime = 0;

      cannonExplosionSound.currentTime = 0;
      cannonExplosionSound.play().catch(()=>{});
    }
  }
}

// Wrapper zodat loop() gewoon updateCannons kan aanroepen
function updateCannons(deltaMs) {
  updateCannonballs(deltaMs);
}


function drawFloatingScores() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  floatingScores.forEach(fs => {
    const alpha = Math.max(0, fs.life / 1000);
    ctx.globalAlpha = alpha;

    // Pixel-achtige look + dubbel formaat
    ctx.font = "bold 32px 'Courier New', monospace";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;

    const text = fs.value.toString();

    // Zwarte rand (pixel/arcade vibe)
    ctx.strokeText(text, fs.x, fs.y);
    // Witte vulling
    ctx.fillText(text, fs.x, fs.y);
  });

  ctx.restore();
}


function spawnCherry() {
  // Zoek een random plek in het doolhof die geen muur is
  let attempts = 0;

  while (attempts < 500) {
    const c = Math.floor(Math.random() * COLS);
    const r = Math.floor(Math.random() * ROWS);

    // muur? overslaan
    if (isWall(c, r)) {
      attempts++;
      continue;
    }

    // startposities / speciale tiles overslaan
    const ch = MAZE[r][c];
    if (ch === "P" || ch === "G" || ch === "X") {
      attempts++;
      continue;
    }

    const pos = tileCenter(c, r);

    cherry = {
      x: pos.x,
      y: pos.y,
      active: true
    };

    cherriesSpawned++;
    console.log("🍒 Cherry spawned at", c, r);
    return;
  }

  console.warn("Kon geen geldige plek voor cherry vinden.");
}

function spawnStrawberry() {
  // Zelfde logica als cherry, maar bewaak ook dat hij niet exact op de kers spawnt
  let attempts = 0;

  while (attempts < 500) {
    const c = Math.floor(Math.random() * COLS);
    const r = Math.floor(Math.random() * ROWS);

    if (isWall(c, r)) {
      attempts++;
      continue;
    }

    const ch = MAZE[r][c];
    if (ch === "P" || ch === "G" || ch === "X") {
      attempts++;
      continue;
    }

    const pos = tileCenter(c, r);

    // Niet bovenop een actieve kers spawnen
    if (cherry && cherry.active) {
      const d = Math.hypot(cherry.x - pos.x, cherry.y - pos.y);
      if (d < TILE_SIZE) {
        attempts++;
        continue;
      }
    }

    strawberry = {
      x: pos.x,
      y: pos.y,
      active: true
    };

    strawberriesSpawned++;
    console.log("🍓 Strawberry spawned at", c, r);
    return;
  }

  console.warn("Kon geen geldige plek voor strawberry vinden.");
}

function spawnBanana() {
  let attempts = 0;

  while (attempts < 500) {
    const c = Math.floor(Math.random() * COLS);
    const r = Math.floor(Math.random() * ROWS);

    if (isWall(c, r)) { attempts++; continue; }

    const ch = MAZE[r][c];
    if (ch === "P" || ch === "G" || ch === "X") { attempts++; continue; }

    const pos = tileCenter(c, r);

    // Niet bovenop andere fruit spawnen
    if (cherry && cherry.active && Math.hypot(cherry.x - pos.x, cherry.y - pos.y) < TILE_SIZE) {
      attempts++; continue;
    }
    if (strawberry && strawberry.active && Math.hypot(strawberry.x - pos.x, strawberry.y - pos.y) < TILE_SIZE) {
      attempts++; continue;
    }

    banana = { x: pos.x, y: pos.y, active: true };
    bananasSpawned++;
    console.log("🍌 Banana spawned at", c, r);
    return;
  }

  console.warn("Kon geen geldige plek voor banana vinden.");
}

function spawnPear() {
  // ✅ level 3 only
  if (currentLevel !== 3) return;

  let attempts = 0;

  while (attempts < 500) {
    const c = Math.floor(Math.random() * COLS);
    const r = Math.floor(Math.random() * ROWS);

    if (isWall(c, r)) { attempts++; continue; }

    const ch = MAZE[r][c];
    if (ch === "P" || ch === "G" || ch === "X") { attempts++; continue; }

    const pos = tileCenter(c, r);

    // Niet bovenop andere fruit spawnen
    if (cherry && cherry.active && Math.hypot(cherry.x - pos.x, cherry.y - pos.y) < TILE_SIZE) {
      attempts++; continue;
    }
    if (strawberry && strawberry.active && Math.hypot(strawberry.x - pos.x, strawberry.y - pos.y) < TILE_SIZE) {
      attempts++; continue;
    }
    if (banana && banana.active && Math.hypot(banana.x - pos.x, banana.y - pos.y) < TILE_SIZE) {
      attempts++; continue;
    }
    if (pear && pear.active && Math.hypot(pear.x - pos.x, pear.y - pos.y) < TILE_SIZE) {
      attempts++; continue;
    }

    pear = { x: pos.x, y: pos.y, active: true };
    pearsSpawned++;
    console.log("🍐 Pear spawned at", c, r);
    return;
  }

  console.warn("Kon geen geldige plek voor pear vinden.");
}


function spawnSpikyBallForLevel3() {
  if (currentLevel !== 3 && currentLevel !== 4) {
    spikyBall = null;
    return;
  }

  // zoek random pad-tile (geen muur, geen P/G/X)
  let attempts = 0;
  while (attempts < 500) {
    const c = Math.floor(Math.random() * COLS);
    const r = Math.floor(Math.random() * ROWS);

    if (isWall(c, r)) { attempts++; continue; }

    const ch = MAZE[r][c];

// ❌ nooit spawnen op ghost-pen, ghost-starts of blocked tiles
if (
  ch === "G" ||     // ghost start / pen
  ch === "X" ||     // blocked tile
  ch === "P" ||     // pacman start (veilig)
  ch === "S" ||     // (optioneel) speciale tiles als je die hebt
  ch === "H"        // (optioneel) home/house
) {
  attempts++;
  continue;
}


    const size = TILE_SIZE * 1.2;
    const radius = size * 0.38;

    spikyBall = {
      active: true,
      c, r,
      x: tileCenter(c, r).x,
      y: tileCenter(c, r).y,
      dir: { x: 1, y: 0 },
      speed: 0.6,     // langzaam door het veld

      // rolling visual
      angle: 0,
      radius: radius,
      size: size
    };
    return;
  }

  spikyBall = null;
}
function resetEntities() {
  // ─────────────────────────────────────────────
  // PACMAN DEATH STATE RESETTEN
  // ─────────────────────────────────────────────
  if (typeof isDying !== "undefined") {
    isDying = false;
  }
  if (typeof deathAnimTime !== "undefined") {
    deathAnimTime = 0;
  }
  if (typeof pacmanDeathSound !== "undefined") {
    pacmanDeathSound.pause();
    pacmanDeathSound.currentTime = 0;
  }

  // ─────────────────────────────────────────────
  // LEVEL-SPEEDS OPNIEUW TOEPASSEN
  // (belangrijk bij level switch + life verlies)
  // ─────────────────────────────────────────────
  if (typeof applySpeedsForLevel === "function") {
    applySpeedsForLevel();
  }

  // ─────────────────────────────────────────────
  // 🔥 VUURMODE (FRIGHTENED) TIMING PER LEVEL
  // ─────────────────────────────────────────────
  if (typeof getFrightConfigForLevel === "function") {
    const fc = getFrightConfigForLevel();
    if (fc && typeof fc.durationMs === "number") FRIGHT_DURATION_MS = fc.durationMs;
    if (fc && typeof fc.flashMs === "number")    FRIGHT_FLASH_MS    = fc.flashMs;
  }

  // ─────────────────────────────────────────────
  // MAZE & POWER-DOTS
  // ─────────────────────────────────────────────
  currentMaze = MAZE.slice();
  allPowerDotsUsed = false;

  // ─────────────────────────────────────────────
  // PACMAN RESET
  // ─────────────────────────────────────────────
  player.x = tileCenter(pac.c, pac.r).x;
  player.y = tileCenter(pac.c, pac.r).y;
  player.dir     = { x: 0, y: 0 };
  player.nextDir = { x: 0, y: 0 };
  player.speed   = SPEED_CONFIG.playerSpeed;

  // ─────────────────────────────────────────────
  // FRIGHT / GHOST CHAIN RESET
  // ─────────────────────────────────────────────
  frightTimer   = 0;
  frightFlash   = false;
  ghostEatChain = 0;

  // ✅ EXTRA LIFE RUN TRACKING RESET (nieuw)
  fireRunGhostsEaten = 0;
  fireRunCoinsCollected = 0;
  extraLifeAwardedThisRun = false;

  // ✅ 1 UP POPUP RESET (nieuw)
  oneUpTextActive = false;
  oneUpTimer = 0;

  globalGhostMode      = GHOST_MODE_SCATTER;
  ghostModeIndex       = 0;
  ghostModeElapsedTime = 0;

  // ─────────────────────────────────────────────
  // GHOSTS RESET
  // ─────────────────────────────────────────────
  const base = 0;                       // gameTime wordt hieronder op 0 gezet → release schema vanaf 0
  const delays = [0, 2000, 4000, 6000]; // ✅ exact zoals vroeger

  ghosts.forEach((g, index) => {
    const startTile = ghostStarts[index] || ghostPen;

    g.x = tileCenter(startTile.c, startTile.r).x;
    g.y = tileCenter(startTile.c, startTile.r).y;

    g.dir = { x: 0, y: -1 };
    g.nextDir = g.dir;

    g.released = false;
    g.hasExitedBox = false;

    // ✅ BELANGRIJK: bij nieuw level / volledige reset moeten ze weer door de balk kunnen
    g.hasExitedHouse = false;

    // ✅ BELANGRIJK: 1x-trigger reset (voorkomt “vast hangen” in electric zone state)
    g.wasInElectricZone = false;

    g.speed = SPEED_CONFIG.ghostSpeed;
    g.mode  = GHOST_MODE_SCATTER;

    // ✅ releaseTime opnieuw zetten RELATIEF aan start van ronde
    g.releaseTime = base + (delays[index] ?? 0);

    g.targetTile = g.scatterTile
      ? { c: g.scatterTile.c, r: g.scatterTile.r }
      : null;

    // EATEN-tracking reset (veilig)
    g.eatenStartTime = null;
    g.lastDistToPen = null;
    g.lastDistImprovementTime = null;
  });

  gameTime = 0;
  roundStarted = false;

  // ─────────────────────────────────────────────
  // ✅ NEW: SPIKY BALL RESET/SPAWN (LEVEL 3 ONLY)
  // ─────────────────────────────────────────────
  if (typeof spawnSpikyBallForLevel3 === "function") {
    spawnSpikyBallForLevel3();
  } else {
    // fallback: als de functie nog niet bestaat, zet hem uit
    if (typeof spikyBall !== "undefined" && spikyBall) spikyBall.active = false;
  }

  // ─────────────────────────────────────────────
  // 4-GHOST BONUS / COIN BONUS RESET
  // ─────────────────────────────────────────────
  if (typeof fourGhostBonusTriggered !== "undefined") {
    fourGhostBonusTriggered = false;
  }
  if (typeof wowBonusActive !== "undefined") {
    wowBonusActive = false;
    wowBonusTimer  = 0;
  }

  if (typeof endCoinBonus === "function") {
    endCoinBonus();
  } else {
    if (typeof coinBonusActive !== "undefined") coinBonusActive = false;
    if (typeof coinBonusTimer !== "undefined") coinBonusTimer = 0;
    if (Array.isArray(coins)) coins.length = 0;
  }

  // ─────────────────────────────────────────────
  // 🍒🍓🍌🍐 FRUIT RESET
  // ─────────────────────────────────────────────
  if (typeof cherry !== "undefined") cherry = null;
  if (typeof cherriesSpawned !== "undefined") cherriesSpawned = 0;

  if (typeof strawberry !== "undefined") strawberry = null;
  if (typeof strawberriesSpawned !== "undefined") strawberriesSpawned = 0;

  // 🍌 banaan reset
  if (typeof banana !== "undefined") banana = null;
  if (typeof bananasSpawned !== "undefined") bananasSpawned = 0;

  // 🍐 peer reset
  if (typeof pear !== "undefined") pear = null;
  if (typeof pearsSpawned !== "undefined") pearsSpawned = 0;

  if (typeof dotsEaten !== "undefined") dotsEaten = 0;

  // ─────────────────────────────────────────────
  // 💣 CANNON SYSTEM RESET (LEVEL 2 + 3)
  // ─────────────────────────────────────────────

  // ✅ nieuw schaalbaar wavesysteem resetten
  if (typeof cannonWaveTriggered !== "undefined") {
    cannonWaveTriggered = [];
  }

  // ✅ alle geplande cannon spawns stoppen (belangrijk bij death/reset/level switch)
  if (typeof cannonWaveTimeoutIds !== "undefined" && Array.isArray(cannonWaveTimeoutIds)) {
    cannonWaveTimeoutIds.forEach(id => clearTimeout(id));
    cannonWaveTimeoutIds.length = 0;
  }

  // ✅ actieve bullets altijd weg
  if (Array.isArray(activeCannonballs)) {
    activeCannonballs.length = 0;
  }

  // (oud systeem mag blijven staan; breekt niks)
  if (typeof cannonWave1Triggered !== "undefined") cannonWave1Triggered = false;
  if (typeof cannonWave2Triggered !== "undefined") cannonWave2Triggered = false;
  if (typeof cannonWave3Triggered !== "undefined") cannonWave3Triggered = false;

  // ✅ HUD state reset (alleen als het bestaat)
  if (typeof cannonHUD !== "undefined" && cannonHUD) {
    if (cannonHUD.left)  cannonHUD.left.active  = false;
    if (cannonHUD.right) cannonHUD.right.active = false;
  }

  // ─────────────────────────────────────────────
  // 🔊 GELUIDEN RESET
  // ─────────────────────────────────────────────
  eyesSoundPlaying = false;
  if (eyesSound) {
    eyesSound.pause();
    eyesSound.currentTime = 0;
  }

  ghostFireSoundPlaying = false;
  if (ghostFireSound) {
    ghostFireSound.pause();
    ghostFireSound.currentTime = 0;
  }

  frightActivationCount = 0;
  stopAllSirens();
}



function resetAfterDeath() {
  // ─────────────────────────────────────────────
  // ✅ FULL LEVEL RESTART ON DEATH (DOTS + FRUIT)
  // ─────────────────────────────────────────────

  // 1) Zet de maze terug naar de originele layout van dit level
  // (Dit werkt omdat jij levels[] / currentMaze gebruikt in je game)
  if (typeof levels !== "undefined" && levels[currentLevel - 1]) {
    // diepe kopie zodat je niet het origineel muteert
    currentMaze = levels[currentLevel - 1].map(row => row.slice());
  }

  // 2) Dots counter reset (fruit thresholds werken weer vanaf 0)
  if (typeof dotsEaten !== "undefined") dotsEaten = 0;

  // 3) Fruit counters reset (zodat ze opnieuw kunnen spawnen)
  if (typeof cherriesSpawned !== "undefined") cherriesSpawned = 0;
  if (typeof strawberriesSpawned !== "undefined") strawberriesSpawned = 0;
  if (typeof bananasSpawned !== "undefined") bananasSpawned = 0;
  if (typeof pearsSpawned !== "undefined") pearsSpawned = 0;

  // 4) Despawn huidige fruit (voor de zekerheid)
  if (typeof cherry !== "undefined" && cherry) cherry.active = false;
  if (typeof strawberry !== "undefined" && strawberry) strawberry.active = false;
  if (typeof banana !== "undefined" && banana) banana.active = false;
  if (typeof pear !== "undefined" && pear) pear.active = false;

  // 5) Cannon wave triggers reset (anders blijven ze "al getriggerd")
  if (typeof cannonWaveTriggered !== "undefined" && Array.isArray(cannonWaveTriggered)) {
    cannonWaveTriggered = cannonWaveTriggered.map(() => false);
  }

  // 6) (optioneel/veilig) power-dot state reset
  if (typeof allPowerDotsUsed !== "undefined") allPowerDotsUsed = false;

  // ─────────────────────────────────────────────
  // PACMAN RESET
  // ─────────────────────────────────────────────
  player.x = tileCenter(pac.c, pac.r).x;
  player.y = tileCenter(pac.c, pac.r).y;
  player.dir = { x: 0, y: 0 };
  player.nextDir = { x: 0, y: 0 };

  // ─────────────────────────────────────────────
  // GHOSTS RESET (met juiste 2s release timing)
  // ─────────────────────────────────────────────
 const base = gameTime;                 // 🔑 huidig gameTime als referentie
const delays = [0, 2000, 4000, 6000];  // ✅ exact zoals vroeger

ghosts.forEach((g, index) => {
  const startTile = ghostStarts[index] || ghostPen;

  // Positie reset
  g.x = tileCenter(startTile.c, startTile.r).x;
  g.y = tileCenter(startTile.c, startTile.r).y;

  // Richting & beweging
  g.dir = { x: 0, y: -1 };
  g.nextDir = g.dir;

  // Release / pen status
  g.released = false;
  g.hasExitedBox = false;

  // 🔑 ESSENTIEEL: electric-balk flags resetten
  g.hasExitedHouse = false;     // mag opnieuw 1x door de balk
  g.wasInElectricZone = false;  // voorkomt vastzitten in zone

  // Mode & snelheid
  g.mode  = GHOST_MODE_SCATTER;
  g.speed = SPEED_CONFIG.ghostSpeed;

  // Target reset (veilig)
  g.targetTile = g.scatterTile
    ? { c: g.scatterTile.c, r: g.scatterTile.r }
    : null;

  // ✅ Release timing exact zoals vroeger, maar correct relatief aan gameTime
  g.releaseTime = base + (delays[index] ?? 0);

  // EATEN-tracking reset (veiligheid)
  g.eatenStartTime = null;
  g.lastDistToPen = null;
  g.lastDistImprovementTime = null;
});


  // ─────────────────────────────────────────────
  // FRIGHT / CHAINS RESET
  // ─────────────────────────────────────────────
  frightTimer = 0;
  frightFlash = false;
  ghostEatChain = 0;

  // ─────────────────────────────────────────────
  // ✅ COIN BONUS / WOW RESET BIJ DOODGAAN
  // ─────────────────────────────────────────────
  wowBonusActive = false;
  wowBonusTimer  = 0;

  // Stop coin-bonus en verwijder coins uit het veld
  if (typeof endCoinBonus === "function") {
    endCoinBonus(); // coinBonusActive=false, coinBonusTimer=0, coins.length=0
  } else {
    // fallback (voor het geval endCoinBonus ooit ontbreekt)
    if (typeof coinBonusActive !== "undefined") coinBonusActive = false;
    if (typeof coinBonusTimer !== "undefined") coinBonusTimer = 0;
    if (typeof coins !== "undefined" && Array.isArray(coins)) coins.length = 0;
  }

  // Reset pickup volgorde (250→500→1000→2000)
  coinPickupIndex = 0;

  // Reset run-tracking (zodat je niet “verdergaat” na death)
  fireRunGhostsEaten = 0;
  fireRunCoinsCollected = 0;
  extraLifeAwardedThisRun = false;

  // Veiligheid: 4-ghost bonus vlag resetten
  fourGhostBonusTriggered = false;

  // ─────────────────────────────────────────────
  // ROUND STATE
  // ─────────────────────────────────────────────
  roundStarted = false;
  gameRunning = true;
}





// ---------------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------------
window.addEventListener("keydown", (e) => {

  // ─────────────────────────────────────────────
  // 📱 MOBILE/TABLET → GEEN KEYBOARD INPUT
  // (touch controls nemen over)
  // ─────────────────────────────────────────────
  if (isMobileInput) return;

  // ─────────────────────────────────────────────
  // ⛔️ VOORKOM PAGE SCROLL (PIJLTJES + SPATIE)
  // ─────────────────────────────────────────────
  if (
    e.key === "ArrowUp" ||
    e.key === "ArrowDown" ||
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight" ||
    e.code === "Space"
  ) {
    e.preventDefault();
  }

  // ─────────────────────────────────────────────
  // SPACE → RESTART BIJ GAME OVER
  // ─────────────────────────────────────────────
  if (e.code === "Space") {
    if (gameOver) startNewGame();
    return;
  }

  // ─────────────────────────────────────────────
  // PACMAN INPUT (DESKTOP)
  // ─────────────────────────────────────────────
  let dx = 0, dy = 0;

  if (e.key === "ArrowUp")    dy = -1;
  if (e.key === "ArrowDown")  dy = 1;
  if (e.key === "ArrowLeft")  dx = -1;
  if (e.key === "ArrowRight") dx = 1;

  // Alleen updaten als er echt een richting is
  if (dx !== 0 || dy !== 0) {
    player.nextDir = { x: dx, y: dy };
  }
});


// ---------------------------------------------------------------------------
// MOVEMENT
// ---------------------------------------------------------------------------
function canMove(ent, dir) {
  const nx = ent.x + dir.x * ent.speed;
  const ny = ent.y + dir.y * ent.speed;
  const c = Math.floor(nx / TILE_SIZE);
  const r = Math.floor(ny / TILE_SIZE);

  // ✅ Spiky ball tile blokkeert ALLES, behalve EATEN-ghosts (terugzwevende oogjes)
  if (isSpikyBallTile(c, r)) {
    if (!ent || ent.mode !== GHOST_MODE_EATEN) return false;
  }

  return !isWall(c, r);
}


function snapToCenter(ent) {
  const c = Math.round(ent.x / TILE_SIZE - 0.5);
  const r = Math.round(ent.y / TILE_SIZE - 0.5);
  const mid = tileCenter(c, r);

  if (ent.dir.x !== 0) ent.y = mid.y;
  if (ent.dir.y !== 0) ent.x = mid.x;
}

// ---------------------------------------------------------------------------
// UPDATE PLAYER
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// PLAYER INTERSECTION CHECK
// ---------------------------------------------------------------------------

// Een tile is een kruispunt als hij meer dan 2 open richtingen heeft
// Tile waar je mag sturen tijdens het rijden (bocht of kruising)
function isTurnTile(c, r) {
  const up    = !isWall(c,   r - 1);
  const down  = !isWall(c,   r + 1);
  const left  = !isWall(c-1, r);
  const right = !isWall(c+1, r);

  let exits = 0;
  if (up) exits++;
  if (down) exits++;
  if (left) exits++;
  if (right) exits++;

  // Rechte gang (links+rechts OF boven+onder) → GEEN stuurpunt
  const straight =
    (left && right && !up && !down) ||
    (up && down && !left && !right);

  // Bocht (L-vorm) of kruising (3 of 4 kanten open) → wel stuurpunt
  return exits >= 2 && !straight;
}


function updatePlayer() {

  const prevX = player.x;
  const prevY = player.y;

  const c = Math.round(player.x / TILE_SIZE - 0.5);
  const r = Math.round(player.y / TILE_SIZE - 0.5);

  const mid  = tileCenter(c, r);
  const dist = Math.hypot(player.x - mid.x, player.y - mid.y);
  const atCenter = dist < 6;

  const isStopped = (player.dir.x === 0 && player.dir.y === 0);
  const blocked   = !isStopped && !canMove(player, player.dir);

  const wantsReverse =
    player.nextDir.x === -player.dir.x &&
    player.nextDir.y === -player.dir.y;

  // ─────────────────────────────────────────────
  // RICHTING KIEZEN
  // ─────────────────────────────────────────────
  let mayChange = false;

  if (blocked) {
    player.dir = { x: 0, y: 0 };
    mayChange = true;
  }
  else if (isStopped) {
    mayChange = true;
  }
  else if (atCenter && (wantsReverse || isTurnTile(c, r))) {
    mayChange = true;
  }

  if (mayChange && canMove(player, player.nextDir)) {
    player.dir = { ...player.nextDir };
  }

  // ─────────────────────────────────────────────
  // BEWEGEN
  // ─────────────────────────────────────────────
  if (canMove(player, player.dir)) {
    player.x += player.dir.x * player.speed;
    player.y += player.dir.y * player.speed;
  }

  player.isMoving = (player.x !== prevX || player.y !== prevY);

  if (!roundStarted && player.isMoving && !introActive && !gameOver) {
  roundStarted = true;

  // ✅ timer start bij eerste beweging
  timerRunning = true;
}

  snapToCenter(player);
  applyPortal(player);

  // ─────────────────────────────────────────────
  // EET-TIMER
  // ─────────────────────────────────────────────
  if (eatingTimer > 0) {
    eatingTimer -= 16.67;
    if (eatingTimer < 0) eatingTimer = 0;
  }

  const ch = getTile(c, r);

  // ─────────────────────────────────────────────
  // DOT / POWER DOT
  // ─────────────────────────────────────────────
  if (ch === "." || ch === "O") {

    setTile(c, r, " ");
    score += (ch === "O" ? SCORE_POWER : SCORE_DOT);
    scoreEl.textContent = score;

    playDotSound();
    eatingTimer = EATING_DURATION;

    if (typeof dotsEaten !== "undefined") {
      dotsEaten++;

      // ─────────────────────────────────────────────
      // 🍒🍓🍌🍐 FRUIT SPAWN TRIGGERS (DOT COUNT)
      // ─────────────────────────────────────────────

      // Cherry: thresholds [50, 120, 200] (max 3)
      if (
        cherriesSpawned < nextCherryThresholds.length &&
        dotsEaten >= nextCherryThresholds[cherriesSpawned] &&
        (!cherry || !cherry.active)
      ) {
        spawnCherry();
      }

      // Strawberry: thresholds [140, 220] (max 2)
      if (
        strawberriesSpawned < nextStrawberryThresholds.length &&
        dotsEaten >= nextStrawberryThresholds[strawberriesSpawned] &&
        (!strawberry || !strawberry.active)
      ) {
        spawnStrawberry();
      }

      // Banana: thresholds [60, 150, 260] (max 3)
      if (
        bananasSpawned < nextBananaThresholds.length &&
        dotsEaten >= nextBananaThresholds[bananasSpawned] &&
        (!banana || !banana.active)
      ) {
        spawnBanana();
      }

      // Pear: only on level 3 thresholds [90, 190, 280] (max 3)
        if (
    (currentLevel === 3 || currentLevel === 4) &&
    pearsSpawned < nextPearThresholds.length &&
    dotsEaten >= nextPearThresholds[pearsSpawned] &&
    (!pear || !pear.active)
  ) {
    spawnPear();
  }


      // ─────────────────────────────────────────────
      // 🔫 CANNON WAVE TRIGGERS (LEVEL 2 + 3)
      // ─────────────────────────────────────────────
      if (isAdvancedLevel()) {
        for (let i = 0; i < CANNON_WAVE_THRESHOLDS.length; i++) {
          if (
            dotsEaten >= CANNON_WAVE_THRESHOLDS[i] &&
            !cannonWaveTriggered[i]
          ) {
            cannonWaveTriggered[i] = true;
            startCannonWave(i + 1); // wave nummer = index + 1
          }
        }
      }
    }

    // ─────────────────────────────────────────────
    // POWER DOT (fire mode)
    // ─────────────────────────────────────────────
    if (ch === "O") {

      // 🔑 BELANGRIJK:
      // Alleen resetten als er GEEN coin-bonus actief is
      if (!coinBonusActive) {
        fireRunGhostsEaten = 0;
        fireRunCoinsCollected = 0;
        extraLifeAwardedThisRun = false;
      }

      frightActivationCount++;
      frightTimer   = FRIGHT_DURATION_MS;
      frightFlash   = false;
      ghostEatChain = 0;
      fourGhostBonusTriggered = false;

      ghosts.forEach((g) => {
        if (
          (g.mode === GHOST_MODE_SCATTER || g.mode === GHOST_MODE_CHASE) &&
          g.released &&
          g.hasExitedBox
        ) {
          g.mode  = GHOST_MODE_FRIGHTENED;
          g.speed = SPEED_CONFIG.ghostFrightSpeed;
          g.dir.x = -g.dir.x;
          g.dir.y = -g.dir.y;
        }
      });
    }

    // ─────────────────────────────────────────────
    // CHECK POWER DOTS / LEVEL OVER
    // ─────────────────────────────────────────────
    const anyPowerDotsLeft = currentMaze.some(row => row.includes("O"));
    if (!anyPowerDotsLeft) {
      allPowerDotsUsed = true;
    }

    const anyDotsLeft =
      currentMaze.some(row => row.includes(".")) ||
      currentMaze.some(row => row.includes("O"));

    if (!anyDotsLeft && typeof onAllDotsCleared === "function") {
      onAllDotsCleared();
    }
  }

  // ─────────────────────────────────────────────
  // MOND-ANIMATIE
  // ─────────────────────────────────────────────
  if (eatingTimer > 0) {
    mouthSpeed = 0.30;
  } else {
    mouthSpeed = player.isMoving ? 0.08 : 0.0;
  }
}



function onAllDotsCleared() {
  console.log("✨ All dots cleared!");
  if (currentLevel === 1) {
    currentLevel = 2;
    readyLabel = "LEVEL 2";
  } else if (currentLevel === 2) {
    currentLevel = 3;
    readyLabel = "LEVEL 3";
  } else if (currentLevel === 3) {
    currentLevel = 4;
    readyLabel = "LEVEL 4";
  } else {
    console.log("🎉 Alle levels klaar!");
    return;
  }


  // Nieuwe speeds instellen
  applySpeedsForLevel();

  // Alles resetten voor nieuw level (speler, ghosts, dots, fruit, cannons, etc.)
  resetEntities();

  // Intro: in de stijl van GET READY
  showReadyText = true;
  introActive   = true;
  gameRunning   = false;

  // Get-ready sound opnieuw gebruiken
  readySound.currentTime = 0;
  readySound.play().catch(() => {});
}

function startFourGhostBonus(triggerX, triggerY) {
  // 1) WOW overlay activeren
  wowBonusActive = true;
  wowBonusTimer = 1500; // ms zichtbaar, bv. 1.5 sec

  // 2) Jingle afspelen
  try {
    bittyBonusSound.currentTime = 0;
    bittyBonusSound.play().catch(() => {});
  } catch (e) {}

  // 3) Coins voorbereiden (maar pas echt laten bewegen na WOW)
  prepareCoinsForBonus();
}



function setGhostTarget(g) {
  // Pacman-tile en richting
  const playerC = Math.round(player.x / TILE_SIZE - 0.5);
  const playerR = Math.round(player.y / TILE_SIZE - 0.5);
  const dir = player.dir;

  // 1) EATEN: ogen terug naar start-vak
  if (g.mode === GHOST_MODE_EATEN) {
    if (startGhostTile) {
      g.targetTile = { c: startGhostTile.c, r: startGhostTile.r };
    } else {
      g.targetTile = { c: playerC, r: playerR }; // fallback
    }
    return;
  }

  // 1b) Als ghost net is gereleased maar nog in de box zit → forceer naar uitgang
  if (
    g.released &&
    !g.hasExitedBox &&
    (g.mode === GHOST_MODE_SCATTER || g.mode === GHOST_MODE_CHASE)
  ) {
    if (startGhostTile) {
      // target net boven het midden van de pen (richting deur)
      g.targetTile = { c: startGhostTile.c, r: startGhostTile.r - 2 };
      return;
    }
  }

  // 2) FRIGHTENED / IN_PEN → geen gericht target, random gedrag
  if (
    g.mode === GHOST_MODE_FRIGHTENED ||
    g.mode === GHOST_MODE_IN_PEN ||
    g.mode === GHOST_MODE_LEAVING
  ) {
    g.targetTile = null;
    return;
  }

  // 3) Alleen SCATTER & CHASE krijgen echt een target
  if (g.mode !== GHOST_MODE_SCATTER && g.mode !== GHOST_MODE_CHASE) {
    g.targetTile = null;
    return;
  }

  // SCATTER: altijd naar eigen hoek
  if (g.mode === GHOST_MODE_SCATTER) {
    if (g.scatterTile) {
      g.targetTile = { c: g.scatterTile.c, r: g.scatterTile.r };
    } else {
      g.targetTile = { c: playerC, r: playerR }; // fallback
    }
    return;
  }

  // Vanaf hier: CHASE-mode
  // 1) Blinky – direct op Pacman
  if (g.id === 1) {
    g.targetTile = { c: playerC, r: playerR };
    return;
  }

  // 2) Pinky – 4 tiles voor Pacman, met klassieke "up bug"
  if (g.id === 2) {
    let tx = playerC + 4 * dir.x;
    let ty = playerR + 4 * dir.y;

    if (dir.y === -1) {
      tx -= 4;
    }

    g.targetTile = { c: tx, r: ty };
    return;
  }

  // 3) Inky – 2 tiles voor Pacman, dan vector vanaf Blinky verdubbelen
  if (g.id === 3) {
    const blinky = ghosts.find(gg => gg.id === 1) || g;

    const blC = Math.round(blinky.x / TILE_SIZE - 0.5);
    const blR = Math.round(blinky.y / TILE_SIZE - 0.5);

    let px2 = playerC + 2 * dir.x;
    let py2 = playerR + 2 * dir.y;

    if (dir.y === -1) {
      px2 -= 2;
    }

    const vx = px2 - blC;
    const vy = py2 - blR;

    const tx = blC + 2 * vx;
    const ty = blR + 2 * vy;

    g.targetTile = { c: tx, r: ty };
    return;
  }

  // 4) Clyde – ver weg: Pacman, dichtbij: eigen corner
  if (g.id === 4) {
    const gC = Math.round(g.x / TILE_SIZE - 0.5);
    const gR = Math.round(g.y / TILE_SIZE - 0.5);

    const dx = gC - playerC;
    const dy = gR - playerR;
    const dist2 = dx * dx + dy * dy;

    if (dist2 >= CLYDE_SCATTER_DISTANCE2) {
      g.targetTile = { c: playerC, r: playerR };
    } else {
      if (g.scatterTile) {
        g.targetTile = { c: g.scatterTile.c, r: g.scatterTile.r };
      } else {
        g.targetTile = { c: playerC, r: playerR };
      }
    }
    return;
  }

  // fallback: onbekende id → Pacman
  g.targetTile = { c: playerC, r: playerR };
}

function updateOneGhost(g) {
  if (g.mode === GHOST_MODE_EATEN) {
    g.speed = SPEED_CONFIG.ghostEyesSpeed;
  }

  // Huidige tile & tile-midden berekenen
  const c   = Math.round(g.x / TILE_SIZE - 0.5);
  const r   = Math.round(g.y / TILE_SIZE - 0.5);
  const mid = tileCenter(c, r);
  const dist = Math.hypot(g.x - mid.x, g.y - mid.y);

  // Nieuw: check of huidige richting geblokkeerd is
  const blocked = !canMove(g, g.dir);

  // Pen-centrum (voorkeur ghostPen, anders startGhostTile)
  const penTile = (typeof ghostPen !== "undefined" && ghostPen)
    ? ghostPen
    : startGhostTile; // fallback

  // EATEN-timer + vooruitgang naar pen bijhouden (voor slimme safety reset)
  if (g.mode === GHOST_MODE_EATEN && penTile) {
    const tileDistNow =
      Math.abs(c - penTile.c) + Math.abs(r - penTile.r); // Manhattan afstand

    if (g.eatenStartTime == null) {
      // Eerste frame dat hij ogen is
      g.eatenStartTime = gameTime;
      g.lastDistToPen = tileDistNow;
      g.lastDistImprovementTime = gameTime;
    } else {
      // Kijkt of hij dichterbij is gekomen
      if (tileDistNow < g.lastDistToPen) {
        g.lastDistToPen = tileDistNow;
        g.lastDistImprovementTime = gameTime;
      }
    }
  } else {
    // Zodra hij geen ogen meer is → reset alle EATEN-tracking
    g.eatenStartTime = null;
    g.lastDistToPen = null;
    g.lastDistImprovementTime = null;
  }

  // Target berekenen obv mode + ghost-type
  setGhostTarget(g);

  const dirs = [
    { x:  1, y:  0 },  // rechts
    { x: -1, y:  0 },  // links
    { x:  0, y:  1 },  // omlaag
    { x:  0, y: -1 }   // omhoog
  ];

  // --- FIX A: center-tolerantie schaalt met snelheid (kruispunten niet missen) ---
  const centerEps = Math.max(1.0, g.speed * 0.6);
  const atCenter = dist < centerEps;

  if (atCenter || blocked) {
    // Alle opties behalve reverse
    const nonRev = dirs.filter(d => !(d.x === -g.dir.x && d.y === -g.dir.y));

function canStep(d) {
      const nc = c + d.x;
      const nr = r + d.y;

      if (isWall(nc, nr)) return false;

      // ─────────────────────────────────────────────
      // NEW: eenmaal uit via electric balk → nooit meer terug door de balk
      // EATEN (ogen) mogen wel naar binnen (hier: ogen mogen WEL)
      // ─────────────────────────────────────────────
      if (g.hasExitedHouse && g.mode !== GHOST_MODE_EATEN) {
        if (nr === DOOR_ROW && nc >= DOOR_START_COL && nc <= DOOR_END_COL) {
          return false; // blokkeer het opnieuw betreden van de deur-tiles
        }
      }

      // eenmaal uit het hok → niet terug erin
      // MAAR ogen (EATEN) mogen WEL naar binnen
      if (penTile && g.hasExitedBox && g.mode !== GHOST_MODE_EATEN) {
        const tileChar = (MAZE[nr] && MAZE[nr][nc]) ? MAZE[nr][nc] : "#";

        if (tileChar === "G" || (nc === penTile.c && nr === penTile.r)) {
          return false;
        }
      }

      return true;
    }

    // Eerst opties zonder omkeren
    let opts = nonRev.filter(canStep);

    // Als die leeg zijn → probeer alle richtingen
    if (opts.length === 0) opts = dirs.filter(canStep);

    if (opts.length > 0) {
      let chosen = null;

      // 1) FRIGHTENED → random bewegen
      if (g.mode === GHOST_MODE_FRIGHTENED) {
        chosen = opts[Math.floor(Math.random() * opts.length)];
      }

      // 2) SCATTER / CHASE / EATEN → target volgen
      else if (
        g.targetTile &&
        (g.mode === GHOST_MODE_SCATTER ||
         g.mode === GHOST_MODE_CHASE   ||
         g.mode === GHOST_MODE_EATEN)
      ) {
        const tx = g.targetTile.c;
        const ty = g.targetTile.r;

        const prefOrder = [
          { x: 0,  y: -1 },  // up
          { x: -1, y: 0 },   // left
          { x: 0,  y: 1 },   // down
          { x: 1,  y: 0 },   // right
        ];

        let best = null;
        let bestDist2 = Infinity;

        for (const pref of prefOrder) {
          const option = opts.find(o => o.x === pref.x && o.y === pref.y);
          if (!option) continue;

          const nc2 = c + option.x;
          const nr2 = r + option.y;
          const dx  = tx - nc2;
          const dy  = ty - nr2;
          const d2  = dx * dx + dy * dy;

          if (d2 < bestDist2) {
            bestDist2 = d2;
            best = option;
          }
        }

        chosen = best || opts[0];
      }

      // 3) FALLBACK (IN_PEN / LEAVING zonder target) → random
      else {
        chosen = opts[Math.floor(Math.random() * opts.length)];
      }

      g.dir = chosen;
      // bij het kiezen van een nieuwe richting zetten we hem netjes op tile-center
      g.x = mid.x;
      g.y = mid.y;
    }
  }

  // Verplaats ghost
  const speed = g.speed;

  if (canMove(g, g.dir)) {
    g.x += g.dir.x * speed;
    g.y += g.dir.y * speed;
  }

  // Center correctie & portals
  snapToCenter(g);
  applyPortal(g);

  // ─────────────────────────────────────────────
  // ELECTRIC BARRIER CHECK
  // - Normale ghosts: sound + sparks + mark exit
  // - EATEN eyes: GEEN sound / GEEN sparks
  // ─────────────────────────────────────────────
  const gc = Math.round(g.x / TILE_SIZE - 0.5);
  const gr = Math.round(g.y / TILE_SIZE - 0.5);

  const inElectricZone =
    (gr === DOOR_ROW && gc >= DOOR_START_COL && gc <= DOOR_END_COL);

  // 1x trigger per doorgang
  if (inElectricZone && !g.wasInElectricZone) {
    g.wasInElectricZone = true;

    // Alleen NORMALE ghosts triggeren electric sound + effect
    if (g.mode !== GHOST_MODE_EATEN) {
      // MARK: ghost heeft het huis verlaten
      if (!g.hasExitedHouse) {
        g.hasExitedHouse = true;
      }

      playElectricShock();
      spawnElectricSparks(g.x, g.y);
    }

  } else if (!inElectricZone && g.wasInElectricZone) {
    g.wasInElectricZone = false;
  }

  // Check wanneer ghost definitief het hok verlaat
  if (penTile) {
    const tileRow = Math.round(g.y / TILE_SIZE - 0.5);

    if (!g.hasExitedBox && tileRow < penTile.r - 1) {
      g.hasExitedBox = true;
    }
  }

  // --- EATEN → ogen terug in het hok aangekomen? ---
  if (g.mode === GHOST_MODE_EATEN && penTile) {
    const tileDist =
      Math.abs(c - penTile.c) + Math.abs(r - penTile.r); // Manhattan afstand

    const noProgressTooLong =
      g.lastDistImprovementTime != null &&
      (gameTime - g.lastDistImprovementTime) > 8000 &&
      tileDist > 2;

    if (tileDist <= 2 || noProgressTooLong) {
      const penCenter = tileCenter(penTile.c, penTile.r);
      g.x = penCenter.x;
      g.y = penCenter.y;

      g.mode         = GHOST_MODE_SCATTER;
      g.speed        = SPEED_CONFIG.ghostSpeed;
      g.released     = false;
      g.hasExitedBox = false;
      g.hasExitedHouse = false;


      if (g.scatterTile) {
        g.targetTile = { c: g.scatterTile.c, r: g.scatterTile.r };
      } else {
        g.targetTile = null;
      }

      g.releaseTime = gameTime + 1000;
    }
  }

  // Debug-log BINNEN de functie
  if (g.mode === GHOST_MODE_EATEN && penTile) {
    const tileDist =
      Math.abs(c - penTile.c) + Math.abs(r - penTile.r);
    console.log(
      "👀 EATEN",
      g.color,
      "tile:", c, r,
      "pen:", penTile.c, penTile.r,
      "dist:", tileDist
    );
  }
}



function tryAwardExtraLife(pointsJustCollected) {
  // al gegeven in deze run?
  if (extraLifeAwardedThisRun) return;

  // ✅ moet echt de 4e coin zijn
  if (fireRunCoinsCollected !== 4) return;

  // ✅ moet de 2000-coin zijn
  if (pointsJustCollected !== 2000) return;

  // ✅ fire-run doel: 4 ghosts + 4 coins
  if (fireRunGhostsEaten === 4) {
    lives++;
    if (livesEl) livesEl.textContent = lives;

    extraLifeAwardedThisRun = true;

    // 🎉 1 UP popup
    oneUpTextActive = true;
    oneUpTimer = ONE_UP_DURATION;

    // 🔊 level-up sound tegelijk met 1 UP
    try {
      if (typeof levelUpSound !== "undefined") {
        levelUpSound.currentTime = 0;
        levelUpSound.play().catch(() => {});
      }
    } catch (e) {}

    console.log("⭐ EXTRA LIFE: 4 ghosts + 4 coins, awarded on 2000 coin!");
  }
}


function updateSpikyBall() {
  if (!spikyBall || !spikyBall.active) return;
  if (currentLevel !== 3 && currentLevel !== 4) return;

  // vorige positie voor "rolling"
  const px = spikyBall.x;
  const py = spikyBall.y;

  // tile waar hij ongeveer zit
  const c = Math.round(spikyBall.x / TILE_SIZE - 0.5);
  const r = Math.round(spikyBall.y / TILE_SIZE - 0.5);
  const mid = tileCenter(c, r);
  const dist = Math.hypot(spikyBall.x - mid.x, spikyBall.y - mid.y);

  // ✅ FIX: veel kleinere center-drempel
  const EPS = 0.15;               // eventueel 0.2 als je wilt
  const atCenter = dist < EPS;

  // als hij op center is: kies nieuwe richting (random open paden)
  if (atCenter) {
    spikyBall.c = c; spikyBall.r = r;
    spikyBall.x = mid.x; spikyBall.y = mid.y;

    const dirs = [
      { x:  1, y:  0 },
      { x: -1, y:  0 },
      { x:  0, y:  1 },
      { x:  0, y: -1 }
    ];

    const nonReverse = dirs.filter(d => !(d.x === -spikyBall.dir.x && d.y === -spikyBall.dir.y));

    const ok = (d) => {
      const nc = c + d.x;
      const nr = r + d.y;
      return !isWall(nc, nr);
    };

    let options = nonReverse.filter(ok);
    if (options.length === 0) options = dirs.filter(ok);

    if (options.length > 0) {
      spikyBall.dir = options[Math.floor(Math.random() * options.length)];
    }
  }

  // beweeg constant langzaam
  const nx = spikyBall.x + spikyBall.dir.x * spikyBall.speed;
  const ny = spikyBall.y + spikyBall.dir.y * spikyBall.speed;
  const nc = Math.floor(nx / TILE_SIZE);
  const nr = Math.floor(ny / TILE_SIZE);

  if (!isWall(nc, nr)) {
    spikyBall.x = nx;
    spikyBall.y = ny;
  } else {
    // forceer center zodat hij opnieuw kiest
    spikyBall.x = tileCenter(c, r).x;
    spikyBall.y = tileCenter(c, r).y;
  }

  // portals (werkt met ent.x/y)
  applyPortal(spikyBall);

  // rolling: afstand -> rotatie
  const moved = Math.hypot(spikyBall.x - px, spikyBall.y - py);
  const sign = (spikyBall.dir.x !== 0) ? spikyBall.dir.x : spikyBall.dir.y;
  spikyBall.angle += sign * moved / Math.max(1, spikyBall.radius);

  // (optioneel maar goed) blocking tile sync
  spikyBall.c = Math.floor(spikyBall.x / TILE_SIZE);
  spikyBall.r = Math.floor(spikyBall.y / TILE_SIZE);
}


function updateGhosts() {
  ghosts.forEach((g) => {
    // Release-timer respecteren
    if (!g.released) {
      if (gameTime >= g.releaseTime) {
        g.released = true;
      } else {
        return; // deze ghost nog niet updaten
      }
    }

    updateOneGhost(g);
  });
}


function updateGhostGlobalMode(deltaMs) {
  // actuele fase in de sequence
    const seq = getGhostModeSequenceForLevel();

  const current = seq[ghostModeIndex];

  // tijd optellen in huidige mode (alleen als niet Infinity)
  if (current.durationMs !== Infinity) {
    ghostModeElapsedTime += deltaMs;

    if (ghostModeElapsedTime >= current.durationMs) {
      const oldMode = current.mode;

      // naar volgende fase
      ghostModeIndex = Math.min(ghostModeIndex + 1, seq.length - 1);
      ghostModeElapsedTime = 0;

      const newMode = seq[ghostModeIndex].mode;
      globalGhostMode = newMode;

      // Bij scatter ↔ chase wissel: alle ghosts omdraaien
      if (
        (oldMode === GHOST_MODE_SCATTER && newMode === GHOST_MODE_CHASE) ||
        (oldMode === GHOST_MODE_CHASE   && newMode === GHOST_MODE_SCATTER)
      ) {
        ghosts.forEach((g) => {
          if (
            g.mode === GHOST_MODE_SCATTER ||
            g.mode === GHOST_MODE_CHASE
          ) {
            g.dir.x = -g.dir.x;
            g.dir.y = -g.dir.y;
          }
        });
      }
    }
  }

  // globale mode pushen naar individuele ghosts (zolang ze geen frightened/eaten zijn)
  ghosts.forEach((g) => {
    if (g.mode === GHOST_MODE_SCATTER || g.mode === GHOST_MODE_CHASE) {
      g.mode = globalGhostMode;
    }
  });
}
function updateCoins(deltaMs) {
  coinBonusTimer -= deltaMs;
  if (coinBonusTimer <= 0) {
    endCoinBonus();
    return;
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const cObj = coins[i];

    if (cObj.taken) {
      coins.splice(i, 1);
      continue;
    }

    const dist = Math.hypot(player.x - cObj.x, player.y - cObj.y);

    if (dist < TILE_SIZE * 0.6) {
      cObj.taken = true;

      // punten in vaste volgorde (4e pickup = 2000)
      const points = coinSequence[coinPickupIndex] || 2000;
      coinPickupIndex++;

      // ✅ tel coins in deze run
      fireRunCoinsCollected = Math.min(4, fireRunCoinsCollected + 1);

      // ✅ extra life alleen checken bij deze pickup (en intern beperken tot 4e + 2000)
      tryAwardExtraLife(points);

      score += points;
      scoreEl.textContent = score;

      spawnFloatingScore(cObj.x, cObj.y, points);

      try {
        const s = coinSound.cloneNode();
        s.volume = coinSound.volume;
        s.play().catch(() => {});
      } catch (e) {}
    }
  }
}

// ---------------------------------------------------------------------------
// COLLISION
// ---------------------------------------------------------------------------
function checkCollision() {
  // Als Pacman al in een death-animatie zit of het is game over,
  // willen we geen nieuwe collision meer verwerken.
  if (typeof isDying !== "undefined" && isDying) return;
  if (gameOver) return;

  let playerDies = false;

  // ✅ NEW: SPIKY BALL collision (alleen level 3)
  // Als Pacman de rollende stekelbal raakt → leven eraf (via startPacmanDeath)
  if (
    typeof currentLevel !== "undefined" &&
    currentLevel === 3 &&
    typeof spikyBall !== "undefined" &&
    spikyBall &&
    spikyBall.active
  ) {
    const distSpiky = Math.hypot(player.x - spikyBall.x, player.y - spikyBall.y);
    if (distSpiky < TILE_SIZE * 0.65) {
      playerDies = true;
    }
  }

  for (const g of ghosts) {
    // alleen actieve ghosts
    if (!g.released) continue;

    const dist = Math.hypot(player.x - g.x, player.y - g.y);
    if (dist >= TILE_SIZE * 0.6) continue;

    // 1) FRIGHTENED → Pacman eet ghost
    if (g.mode === GHOST_MODE_FRIGHTENED) {
      // score-chain: 200, 400, 800, 1600
      ghostEatChain++;
      let ghostScore = 200;
      if (ghostEatChain === 2) ghostScore = 400;
      else if (ghostEatChain === 3) ghostScore = 800;
      else if (ghostEatChain >= 4) ghostScore = 1600;

      // ✅ extra-life run tracking: tel ghosts tijdens deze fire-run (max 4)
      fireRunGhostsEaten = Math.min(4, fireRunGhostsEaten + 1);

      // 4-ghost bonus check
      if (
        frightTimer > 0 &&              // we zitten nog in fire-mode
        !fourGhostBonusTriggered &&     // nog niet eerder gedaan in deze fire-mode
        ghostEatChain >= 4              // 4e spookje in deze chain
      ) {
        fourGhostBonusTriggered = true;
        startFourGhostBonus(g.x, g.y);  // nieuwe functie (coördinaten: waar 4e ghost zat)
      }

      score += ghostScore;
      scoreEl.textContent = score;

      // 🔊 geluidje bij eten van spookje
      playGhostEatSound();

      // ⬆️ zwevende score boven het spookje
      spawnFloatingScore(g.x, g.y - TILE_SIZE * 0.6, ghostScore);

      // Ghost wordt ogen in EATEN-mode, sneller terug naar hok
      g.mode  = GHOST_MODE_EATEN;
      g.speed = SPEED_CONFIG.ghostEyesSpeed; // ✅ vaste oogjes-snelheid (niet level-scaled)
      g.targetTile = { c: startGhostTile.c, r: startGhostTile.r };

      continue;
    }

    // 2) Normale modes (scatter/chase) → Pacman sterft
    if (g.mode === GHOST_MODE_SCATTER || g.mode === GHOST_MODE_CHASE) {
      playerDies = true;
      break;
    }

    // 3) EATEN / IN_PEN / LEAVING → negeren (ogen/ghost in hok)
  }

  // 🍒 KERS-COLLISION (alleen als Pacman niet doodgaat deze frame)
  if (!playerDies && typeof cherry !== "undefined" && cherry && cherry.active) {
    const distCherry = Math.hypot(player.x - cherry.x, player.y - cherry.y);
    if (distCherry < TILE_SIZE * 0.6) {
      // Kers oppakken
      cherry.active = false;

      // +100 punten
      score += 100;
      scoreEl.textContent = score;

      // zwevende +100 score boven de kers
      if (typeof spawnFloatingScore === "function") {
        spawnFloatingScore(cherry.x, cherry.y - TILE_SIZE * 0.6, 100);
      }

      // 🔊 kers-geluid
      if (typeof cherrySound !== "undefined") {
        cherrySound.currentTime = 0;
        cherrySound.play().catch(() => {});
      }
    }
  }

  // 🍌 BANAAN-COLLISION (+700 punten, zelfde geluid als kers/aarbei)
  if (!playerDies && typeof banana !== "undefined" && banana && banana.active) {
    const distBan = Math.hypot(player.x - banana.x, player.y - banana.y);
    if (distBan < TILE_SIZE * 0.6) {
      // Banaan oppakken
      banana.active = false;

      // +700 punten
      score += 700;
      scoreEl.textContent = score;

      // zwevende +700 score boven de banaan
      if (typeof spawnFloatingScore === "function") {
        spawnFloatingScore(banana.x, banana.y - TILE_SIZE * 0.6, 700);
      }

      // 🔊 zelfde sound als kers/aardbei
      if (typeof cherrySound !== "undefined") {
        cherrySound.currentTime = 0;
        cherrySound.play().catch(() => {});
      }
    }
  }

  // 🍓 AARDBEI-COLLISION (300 punten, zelfde geluid als kers)
  if (!playerDies && typeof strawberry !== "undefined" && strawberry && strawberry.active) {
    const distStraw = Math.hypot(player.x - strawberry.x, player.y - strawberry.y);
    if (distStraw < TILE_SIZE * 0.6) {
      // Aardbei oppakken
      strawberry.active = false;

      // +300 punten
      score += 300;
      scoreEl.textContent = score;

      // zwevende +300 score boven de aardbei
      if (typeof spawnFloatingScore === "function") {
        spawnFloatingScore(strawberry.x, strawberry.y - TILE_SIZE * 0.6, 300);
      }

      // 🔊 zelfde sound als kers
      if (typeof cherrySound !== "undefined") {
        cherrySound.currentTime = 0;
        cherrySound.play().catch(() => {});
      }
    }
  }

  // 🍐 PEER-COLLISION (LEVEL 3 ONLY, +1200 punten, zelfde geluid als kers)
  if (
    !playerDies &&
    currentLevel === 3 &&
    typeof pear !== "undefined" &&
    pear && pear.active
  ) {
    const distPear = Math.hypot(player.x - pear.x, player.y - pear.y);
    if (distPear < TILE_SIZE * 0.6) {
      // Peer oppakken
      pear.active = false;

      // +1200 punten
      score += 1200;
      scoreEl.textContent = score;

      // zwevende +1200 score boven de peer
      if (typeof spawnFloatingScore === "function") {
        spawnFloatingScore(pear.x, pear.y - TILE_SIZE * 0.6, 1200);
      }

      // 🔊 zelfde sound als kers
      if (typeof cherrySound !== "undefined") {
        cherrySound.currentTime = 0;
        cherrySound.play().catch(() => {});
      }
    }
  }

  if (playerDies) {
    // NIEUW: geen lives-- en reset meer hier, maar
    // de death-animatie met sound starten.
    if (typeof startPacmanDeath === "function") {
      startPacmanDeath();
    } else {
      // Fallback naar oud gedrag als de functie nog niet bestaat
      lives--;
      livesEl.textContent = lives;

      if (lives <= 0) {
        gameRunning = false;
        gameOver = true;
        messageTextEl.textContent = "Game Over";
        messageEl.classList.remove("hidden");
      } else {
        resetEntities();
      }
    }
  }
}
function handleGhostSpikyBallCollision() {
  // Geen bal → geen collision
  if (!spikyBall || !spikyBall.active) return;

  // Alleen in level 3 + 4 actief
  if (currentLevel !== 3 && currentLevel !== 4) return;

  const ballRadius = spikyBall.radius || (TILE_SIZE * 0.45);

  // ─────────────────────────────────────────────
  // 1. PACMAN vs SPIKY BALL
  // ─────────────────────────────────────────────
  if (player && !isDying) {
    const pacRadius = player.radius || (TILE_SIZE * 0.45);

    const dxP = player.x - spikyBall.x;
    const dyP = player.y - spikyBall.y;
    const hitDistP = ballRadius + pacRadius * 0.9;
    const dist2P = dxP * dxP + dyP * dyP;

    if (dist2P < hitDistP * hitDistP) {
      // Pacman gaat dood door spiky ball
      startPacmanDeath?.("spikyBall");
      return; // meteen stoppen, rest doet er niet meer toe
    }
  }

  // ─────────────────────────────────────────────
  // 2. GHOSTS vs SPIKY BALL
  // ─────────────────────────────────────────────
  const ghostHitRadius = ballRadius + TILE_SIZE * 0.35;
  const ghostHitRadius2 = ghostHitRadius * ghostHitRadius;

  if (!Array.isArray(ghosts)) return;

  for (const g of ghosts) {
    if (!g) continue;

    // Ogen die al teruglopen naar de box slaan we over
    if (g.mode === GHOST_MODE_EATEN) continue;

    const dx = g.x - spikyBall.x;
    const dy = g.y - spikyBall.y;
    const dist2 = dx * dx + dy * dy;

    if (dist2 < ghostHitRadius2) {
      // 👻 Ghost wordt geraakt door spiky ball → ogen terug naar startblok
      g.mode = GHOST_MODE_EATEN;

      // ogen speed als die bestaat, anders normale ghostSpeed
      g.speed = (SPEED_CONFIG && SPEED_CONFIG.ghostEyesSpeed)
        ? SPEED_CONFIG.ghostEyesSpeed
        : (SPEED_CONFIG ? SPEED_CONFIG.ghostSpeed : 2.5);

      // terug naar start-positie / huis
      if (typeof g.startCol !== "undefined" && typeof g.startRow !== "undefined") {
        g.targetTile = { c: g.startCol, r: g.startRow };
      } else if (typeof g.homeCol !== "undefined" && typeof g.homeRow !== "undefined") {
        g.targetTile = { c: g.homeCol, r: g.homeRow };
      }

      // eventueel sound
      try {
        playGhostEatSound?.();
      } catch (e) {}
    }
  }
}




// ---------------------------------------------------------------------------
// BACKGROUND PNG
// ---------------------------------------------------------------------------

const levelImage = new Image();
levelImage.src = "bitty_pacman.png";

let levelReady = false;
levelImage.onload = () => levelReady = true;

function drawMazeBackground() {
  mazeCtx.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height);
  if (levelReady) {
    mazeCtx.save();
    mazeCtx.translate(mazeOffsetX, mazeOffsetY);
    mazeCtx.scale(mazeScale, mazeScale);
    mazeCtx.drawImage(levelImage, 0, 0, mazeCanvas.width, mazeCanvas.height);
    mazeCtx.restore();
  }
}

function startPacmanDeath() {
  if (isDying) return; // dubbele start voorkomen

  isDying = true;
  deathAnimTime = 0;

  // Spel stilzetten
  gameRunning = false;
  // ✅ timer pauzeren bij death
timerRunning = false;


  // Alle andere geluiden stoppen
  stopAllSirens?.();
  if (ghostFireSoundPlaying) {
    ghostFireSoundPlaying = false;
    ghostFireSound.pause();
    ghostFireSound.currentTime = 0;
  }
  if (eyesSoundPlaying) {
    eyesSoundPlaying = false;
    eyesSound.pause();
    eyesSound.currentTime = 0;
  }

  // Pacman death sound starten
  pacmanDeathSound.currentTime = 0;
  pacmanDeathSound.play().catch(() => {});
}


// ---------------------------------------------------------------------------
// DOTS – nu weer geschaald met pathScale
// ---------------------------------------------------------------------------

function drawDots() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = getTile(c, r);
      if (t !== "." && t !== "O") continue;

      const x = c * TILE_SIZE + TILE_SIZE / 2;
      const y = r * TILE_SIZE + TILE_SIZE / 2;

      if (t === ".") {
        // Gewone dot – zoals je gewend bent
        ctx.fillStyle = "#ffb8ae";
        ctx.beginPath();
        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === "O") {
        // Power-dot: groter + pulserend knipper effect

        // basis radius + kleine puls (tussen 0.9x en 1.1x)
        const pulse = 0.9 + 0.2 * ((Math.sin(powerDotPhase * 2) + 1) / 2);
        const rad = POWER_RADIUS * pulse;

        ctx.save();

        // zachte gloed + iets helderdere kleur
        const alpha = 0.7 + 0.3 * ((Math.sin(powerDotPhase * 2) + 1) / 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
  }
}


// ---------------------------------------------------------------------------
// PLAYER & GHOST DRAW
// ---------------------------------------------------------------------------



const cannonBulletImg = new Image();
cannonBulletImg.src = "canonbullet.png"; // je kogel-sprite
let cannonBulletLoaded = false;
cannonBulletImg.onload = () => { cannonBulletLoaded = true; };

const coinImg = new Image();
coinImg.src = "bittybonus.png";
let coinImgLoaded = false;
coinImg.onload = () => { coinImgLoaded = true; };

const ghostEyesImg = new Image();
ghostEyesImg.src = "eyes.png";
let ghostEyesLoaded = false;
ghostEyesImg.onload = () => (ghostEyesLoaded = true);


const ghost1Img = new Image();
ghost1Img.src = "bitty-ghost.png";
let ghost1Loaded = false;
ghost1Img.onload = () => ghost1Loaded = true;

const ghost2Img = new Image();
ghost2Img.src = "Beefcake-bitkey (1).png";
let ghost2Loaded = false;
ghost2Img.onload = () => ghost2Loaded = true;

const ghost3Img = new Image();
ghost3Img.src = "Orange-man.png";
let ghost3Loaded = false;
ghost3Img.onload = () => ghost3Loaded = true;

const ghost4Img = new Image();
ghost4Img.src = "Beholder.png";
let ghost4Loaded = false;
ghost4Img.onload = () => ghost4Loaded = true;

function drawFireAura(ctx, intensity, radius) {
  ctx.save();
  // Vlammen moeten licht geven → kleuren optellen
  ctx.globalCompositeOperation = "lighter";

  // Zelfde instellingen voor ALLE levels (1 t/m 4)
  const layers        = 2;    // aantal ringen
  const baseParticles = 14;   // aantal “vonken” per ring
  const alphaBase     = 0.08; // basis-transparantie

  for (let layer = 0; layer < layers; layer++) {
    const particles = baseParticles + layer * 6;

    for (let i = 0; i < particles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = radius * (0.7 + Math.random() * 0.4);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;

      const size = radius * (0.15 + Math.random() * 0.15);

      // Kleur: rood/oranje vuur
      const r = 255;
      const g = 80 + Math.floor(Math.random() * 120); // 80–200
      const b = 0;

      // transparantie → afhankelijk van intensiteit
      const a = alphaBase * intensity;

      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawGhosts() {
  const size = TILE_SIZE * ghostScale;

  for (const g of ghosts) {
    ctx.save();
    ctx.translate(g.x, g.y);

    // === 1. EATEN MODE ===
    if (g.mode === GHOST_MODE_EATEN) {

      // 🌐 LEVEL 1–3 → klassieke ogen
      if (currentLevel !== 4) {
        if (ghostEyesImg && ghostEyesImg.complete) {
          const eyesSize = size * 2;
          ctx.drawImage(
            ghostEyesImg,
            -eyesSize / 2,
            -eyesSize / 2,
            eyesSize,
            eyesSize
          );
        }
      }

      // LEVEL 4 → GEEN visuals hier (gaat via overlay)
      ctx.restore();
      continue;
    }

    // === 2. NORMALE GHOST (SCATTER / CHASE / FRIGHT) ===
    let img = ghost1Img;
    if (g.id === 2) img = ghost2Img;
    if (g.id === 3) img = ghost3Img;
    if (g.id === 4) img = ghost4Img;

    if (img && img.complete) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    }

    // === 3. FRIGHTENED MODE → FIRE AURA ===
    if (g.mode === GHOST_MODE_FRIGHTENED) {
      const intensity = frightFlash
        ? (frame % 20 < 10 ? 0.4 : 1.0)
        : 1.0;

      drawFireAura(ctx, intensity, size * 0.60);
    }

    ctx.restore();
  }
}






// 🔴 DEMONISCHE GHOST-OGEN OVERLAY (LEVEL 4 + VUURMODE, LIGHTWEIGHT)
function drawLevel4FrightEyesOverlay() {
  // Alleen level 4 + fright
  if (currentLevel !== 4) return;
  if (!ghosts || !Array.isArray(ghosts)) return;
  if (typeof frightTimer === "undefined" || frightTimer <= 0) return;

  // 🔧 Teken de ogen maar om de frame → halve draw-load
  if (typeof frame !== "undefined" && (frame & 1) === 1) {
    return;
  }

  ctx.save();

  // Maze-coördinaten (zelfde space als drawPlayer/drawGhosts)
  ctx.translate(pathOffsetX, pathOffsetY);
  ctx.scale(pathScaleX, pathScaleY);

  // Additieve blend voor “licht” effect, maar zónder shadowBlur
  ctx.globalCompositeOperation = "lighter";

  const size = TILE_SIZE * ghostScale;

  for (const g of ghosts) {
    if (g.mode !== GHOST_MODE_FRIGHTENED) continue;

    const x = g.x;
    const y = g.y;

    const eyeOffsetX = size * 0.16;
    const eyeOffsetY = -size * 0.12;

    // subtiele jitter / leven
    const flicker = 0.9 + Math.sin(frame * 0.25 + g.id * 10) * 0.1;

    // =========================
    // 🔥 OUTER ENERGY GLOW (GEEN BLUR, ALLEEN ALPHA)
    // =========================
    const outerRadius = size * 0.14 * flicker;

    ctx.fillStyle = "rgba(255, 40, 40, 0.32)";

    // links
    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y + eyeOffsetY, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    // rechts
    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y + eyeOffsetY, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    // =========================
    // 🔴 RODE IRIS
    // =========================
    const irisRadius = size * 0.075 * flicker;

    ctx.fillStyle = "rgba(255, 30, 30, 0.9)";

    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y + eyeOffsetY, irisRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y + eyeOffsetY, irisRadius, 0, Math.PI * 2);
    ctx.fill();

    // =========================
    // ⚪ WITTE KERN (LICHTPUNTJE)
    // =========================
    const coreRadius = size * 0.03 * flicker;

    ctx.fillStyle = "rgba(255, 255, 255, 1)";

    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y + eyeOffsetY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y + eyeOffsetY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// 🔴 LEVEL 4 — TERUGZWEVENDE DEMON-OGEN (EATEN MODE)
function drawLevel4EatenEyesOverlay() {
  if (currentLevel !== 4) return;
  if (!Array.isArray(ghosts)) return;

  ctx.save();

  // Zelfde transform als andere overlays
  ctx.translate(pathOffsetX, pathOffsetY);
  ctx.scale(pathScaleX, pathScaleY);

  ctx.globalCompositeOperation = "lighter";

  const size = TILE_SIZE * ghostScale;

  for (const g of ghosts) {
    if (g.mode !== GHOST_MODE_EATEN) continue;

    const x = g.x;
    const y = g.y;

    // Exact dezelfde oogpositie als fright-ogen
    const eyeOffsetX = size * 0.16;
    const eyeOffsetY = -size * 0.12;

    const flicker = 0.9 + Math.sin(frame * 0.25 + g.id * 6) * 0.1;

    // 🔥 outer glow
    const outerRadius = size * 0.14 * flicker;
    ctx.fillStyle = "rgba(255, 40, 40, 0.32)";

    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y + eyeOffsetY, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y + eyeOffsetY, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    // 🔴 rode iris
    const irisRadius = size * 0.075 * flicker;
    ctx.fillStyle = "rgba(255, 30, 30, 0.95)";

    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y + eyeOffsetY, irisRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y + eyeOffsetY, irisRadius, 0, Math.PI * 2);
    ctx.fill();

    // ⚪ witte kern
    const coreRadius = size * 0.03 * flicker;
    ctx.fillStyle = "rgba(255, 255, 255, 1)";

    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y + eyeOffsetY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y + eyeOffsetY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}


function prepareCoinsForBonus() {
  coins.length = 0; // oude coins weg

  // ✅ Garandeer 4 coins (als er minstens 4 vrije tiles bestaan)
  // We bouwen eerst een lijst met geldige tiles, en pakken daar 4 unieke uit.
  const valid = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (isWall(c, r)) continue;

      const ch = MAZE[r][c];
      // startvak Pacman / ghostpen / X overslaan
      if (ch === "P" || ch === "G" || ch === "X") continue;

      valid.push({ c, r });
    }
  }

  // Fisher–Yates shuffle
  for (let i = valid.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = valid[i];
    valid[i] = valid[j];
    valid[j] = tmp;
  }

  const count = Math.min(4, valid.length);
  for (let i = 0; i < count; i++) {
    const t = valid[i];
    const pos = tileCenter(t.c, t.r);
    coins.push({
      x: pos.x,
      y: pos.y,
      radius: COIN_RADIUS,
      taken: false
    });
  }

  // debug (handig): console.log("🪙 Coins spawned:", coins.length);
}


function drawWowBonusText() {
  if (!wowBonusActive) return;

  ctx.save();
  ctx.translate(pathOffsetX, pathOffsetY);
  ctx.scale(pathScaleX, pathScaleY);

  ctx.fillStyle = "#ffff00";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 6;
  ctx.font = "bold 72px 'Courier New', monospace";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const wowOffsetX = 140; // zelfde als readyOffsetX voor consistentie
  const centerX = (COLS * TILE_SIZE) / 2 + wowOffsetX;
  const centerY = player.y - TILE_SIZE * 2; // net iets hoger dan Pacman

  ctx.strokeText("WOW!", centerX, centerY);
  ctx.fillText("WOW!", centerX, centerY);

  ctx.restore();
}

function drawReadyText() {
  if (!showReadyText) return;

  ctx.save();

  ctx.translate(pathOffsetX, pathOffsetY);
  ctx.scale(pathScaleX, pathScaleY);

  ctx.fillStyle = "#ffff00";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 6;
  ctx.font = "bold 72px 'Courier New', monospace";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 👉 handmatige offset
  const readyOffsetX = 140;  // pas aan zoals jij wil
  const centerX = (COLS * TILE_SIZE) / 2 + readyOffsetX;

  const centerY = player.y - TILE_SIZE * 1.5;

  ctx.strokeText(readyLabel, centerX, centerY);
  ctx.fillText(readyLabel, centerX, centerY);

  ctx.restore();
}

function drawCherry() {
  if (!cherry || !cherry.active) return;

  const size = TILE_SIZE * 1.1; // iets groter dan dots
  ctx.drawImage(cherryImg, cherry.x - size/2, cherry.y - size/2, size, size);
}

function drawStrawberry() {
  if (!strawberry || !strawberry.active) return;

  const size = TILE_SIZE * 1.1; // zelfde schaal als kers
  ctx.drawImage(strawberryImg, strawberry.x - size/2, strawberry.y - size/2, size, size);
}

function drawBanana() {
  if (!banana || !banana.active) return;

  const size = TILE_SIZE * 1.1;
  ctx.drawImage(bananaImg, banana.x - size / 2, banana.y - size / 2, size, size);
}

function drawBittyBonusIcon() {
  if (!bittyBonusIconConfig.enabled) return;
  if (!bittyBonusImg || !bittyBonusImg.complete) return;

  const scale = (typeof pacmanScale !== "undefined") ? pacmanScale : 1;
  const size = TILE_SIZE * bittyBonusIconConfig.scale * scale;

  ctx.drawImage(
    bittyBonusImg,
    bittyBonusIconConfig.x - size / 2,
    bittyBonusIconConfig.y - size / 2,
    size,
    size
  );
}


function drawBananaIcon() {
  if (!bananaIconConfig.enabled) return;
  if (!bananaImg || !bananaImg.complete) return;

  const size = TILE_SIZE * bananaIconConfig.scale * pacmanScale;
  const x = bananaIconConfig.x;
  const y = bananaIconConfig.y;

  ctx.drawImage(
    bananaImg,
    x - size / 2,
    y - size / 2,
    size,
    size
  );
}


// 👉 hier zit de update: we gebruiken nu BASE + OFFSET
function drawElectricBarrierOverlay() {
  electricPhase += 0.3; // snelheid animatie

  const x1 = E_START_X_BASE + ELECTRIC_OFFSET_X;
  const x2 = E_END_X_BASE   + ELECTRIC_OFFSET_X;
  const baseY = E_Y_BASE    + ELECTRIC_OFFSET_Y;

  // 1) Gloeiende basis-balk
  ctx.save();
  ctx.shadowColor = "rgba(0, 255, 255, 0.9)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "rgba(0, 180, 255, 0.6)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x1, baseY);
  ctx.lineTo(x2, baseY);
  ctx.stroke();
  ctx.restore();

  // 2) Hoofd-elektrische lijn (knetterend)
  ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, baseY);

  const step = 10;
  for (let x = x1; x <= x2; x += step) {
    const freq1 = 0.25;
    const freq2 = 0.18;
    const amp = 6;

    const noise =
      Math.sin((x + electricPhase * 40) * freq1) * amp +
      Math.sin((x * 1.3 + electricPhase * 55) * freq2) * (amp * 0.7);

    ctx.lineTo(x, baseY + noise);
  }
  ctx.stroke();

  // 3) Extra fijne spark-laag
  ctx.strokeStyle = "rgba(200, 255, 255, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, baseY);

  for (let x = x1; x <= x2; x += step) {
    const freq = 0.35;
    const amp = 3;
    const noise = Math.sin((x * 1.8 + electricPhase * 70) * freq) * amp;
    ctx.lineTo(x, baseY + noise);
  }
  ctx.stroke();
}


// 🌑 LEVEL 4 DARKNESS + AURA RONDOM BITTY
function drawLevel4DarknessMask() {
  // Alleen in level 4
  if (currentLevel !== 4) return;
  if (!canvas || !ctx || !player) return;

  // Spelerpositie in SCHERM-coördinaten
  const px = pathOffsetX + player.x * pathScaleX;
  const py = pathOffsetY + player.y * pathScaleY;

  // Radius kiezen (groter tijdens frightened / vuurmode)
  let radius = LEVEL4_AURA_BASE_RADIUS;
  if (typeof frightTimer !== "undefined" && frightTimer > 0) {
    radius = LEVEL4_AURA_POWER_RADIUS;
  }
  level4AuraRadius = radius;

  ctx.save();

  // Tekenen in scherm-coördinaten
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 🔦 Radiale donkere overlay:
  // - midden: volledig transparant (alles 100% zichtbaar)
  // - buitenrand: donker
  const grad = ctx.createRadialGradient(
    px, py, 0,       // binnenste radius
    px, py, radius   // buitenste radius
  );

  // Binnenste ~70% → geen donkerte
  grad.addColorStop(0.0, "rgba(0, 0, 0, 0.0)");
  grad.addColorStop(0.7, "rgba(0, 0, 0, 0.0)");

  // Buitenrand → bijna volledig donker
  grad.addColorStop(1.0, "rgba(0, 0, 0, 0.94)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.restore();
}





function drawPlayer() {
  const size   = TILE_SIZE * pacmanScale;
  const radius = size / 2;

   if (isDying) {
    drawPacmanDeathFrame();
    return;
  }

  // ░░ Beweegt hij? ░░
  // Gebruik de echte bewegings-flag uit updatePlayer()
  const moving = player.isMoving;

  // ░░ Mond-animatie ░░
  // Update mouthPhase ALLEEN als hij beweegt of eet.
  // Als hij stil staat en niet eet, blijft mouthPhase gelijk
  // → mond blijft in de laatste frame-stand.
  if (moving || eatingTimer > 0) {
    mouthPhase += mouthSpeed;
  }

  // Mond-open (0..1) op basis van de huidige mouthPhase
  const mouthOpen = (Math.sin(mouthPhase) + 1) / 2;

  // ░░ Richting → rij in sprite sheet ░░
  if (player.dir.x > 0) {
    player.facingRow = PACMAN_DIRECTION_ROW.right;
  } else if (player.dir.x < 0) {
    player.facingRow = PACMAN_DIRECTION_ROW.left;
  } else if (player.dir.y < 0) {
    player.facingRow = PACMAN_DIRECTION_ROW.up;
  } else if (player.dir.y > 0) {
    player.facingRow = PACMAN_DIRECTION_ROW.down;
  }
  // als dir = (0,0) blijft facingRow wat hij was

  // ░░ Mond-open → kolom in sprite sheet (0..2) ░░
  let frameCol = 0;
  if (mouthOpen > 0.66)      frameCol = 2; // helemaal open
  else if (mouthOpen > 0.33) frameCol = 1; // half open
  else                       frameCol = 0; // dicht / klein

  ctx.save();
  ctx.translate(player.x, player.y);

  if (playerLoaded) {
    // Tekenen vanaf de sprite sheet
    const sx = frameCol * PACMAN_SRC_WIDTH;
    const sy = player.facingRow * PACMAN_SRC_HEIGHT;

    ctx.drawImage(
      playerImg,
      sx, sy, PACMAN_SRC_WIDTH, PACMAN_SRC_HEIGHT,
      -size / 2, -size / 2, size, size
    );
  } else {
    // Fallback: oude cirkel + mond-wedge
    const maxMouth = Math.PI / 3;
    const mouthAngle = maxMouth * mouthOpen;

    ctx.fillStyle = "#f4a428";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, -mouthAngle, mouthAngle);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
}

function fitTextToWidth(ctx, text, maxWidth, baseFontPx, fontFamily){
  let size = baseFontPx;
  ctx.font = `700 ${size}px ${fontFamily}`;
  while (ctx.measureText(text).width > maxWidth && size > 8){
    size -= 1;
    ctx.font = `700 ${size}px ${fontFamily}`;
  }
  return size;
}

function roundRectPath(ctx, x, y, w, h, r){
  const rr = Math.max(0, Math.min(r, w/2, h/2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

function drawNeonStroke(ctx, drawPathFn, opt){
  const color = opt.color || "#00d8ff";
  const lw    = opt.lineWidth || 4;
  const glow  = opt.glow ?? 12;
  const a     = opt.alpha ?? 1;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.globalAlpha = a;
  ctx.lineJoin = "round";
  ctx.lineCap  = "round";

  // glow pass
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  drawPathFn();
  ctx.stroke();

  // crisp pass
  ctx.shadowBlur = 0;
  drawPathFn();
  ctx.stroke();

  ctx.restore();
}

function getAnchorPos(screenW, screenH, panelW, panelH, cfg){
  let x = 0, y = 0;
  if (cfg.anchor === "left-middle"){
    x = cfg.offsetX;
    y = (screenH - panelH) / 2 + cfg.offsetY;
  } else {
    x = cfg.offsetX;
    y = cfg.offsetY;
  }
  return { x, y };
}

function drawBittyHighscorePanel(ctx, x, y, w, h, opts = {}) {
  const BLUE   = "#2a00ff";
  const YELLOW = "#ffcc00";

  const outerRadius = Math.round(Math.min(w, h) * 0.04);
  const borderGap   = Math.round(Math.min(w, h) * 0.015);
  const outerLine   = Math.round(Math.min(w, h) * 0.012);
  const innerLine   = Math.max(2, Math.round(outerLine * 0.7));

  const headerH = Math.round(h * 0.17);
  const sepY = y + headerH;

  // outer
  drawNeonStroke(ctx, () => roundRectPath(ctx, x, y, w, h, outerRadius), {
    color: BLUE, lineWidth: outerLine, glow: 16, alpha: 1
  });

  // inner
  drawNeonStroke(ctx, () => roundRectPath(
    ctx,
    x + borderGap,
    y + borderGap,
    w - borderGap * 2,
    h - borderGap * 2,
    Math.max(2, outerRadius - borderGap)
  ), { color: BLUE, lineWidth: innerLine, glow: 10, alpha: 1 });

  // header separator
  drawNeonStroke(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x + borderGap, sepY);
    ctx.lineTo(x + w - borderGap, sepY);
  }, { color: BLUE, lineWidth: innerLine, glow: 8, alpha: 1 });

  // title
  const textScale = (opts.textScale ?? 1);
  const title = "BITTY HIGHSCORE";

  ctx.save();
  ctx.fillStyle = YELLOW;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fontFamily = "Arial Black, Impact, system-ui, sans-serif";
  const baseFont = Math.round(headerH * 0.46 * textScale);
  const maxTextWidth = (w - borderGap * 4);

  const fittedSize = fitTextToWidth(ctx, title, maxTextWidth, baseFont, fontFamily);
  ctx.font = `700 ${fittedSize}px ${fontFamily}`;

  ctx.fillText(title, x + w / 2, y + headerH / 2);
  ctx.restore();

  // binnen blijft leeg (hier kan jij straks je scores tekenen)
}
function drawScaledBittyHighscoreHUD(hudCtx, cfg){
  if (!cfg.enabled) return;

  const BASE_W = 460;
  const BASE_H = 700;

  const panelW = BASE_W * cfg.scale;
  const panelH = BASE_H * cfg.scale;

  // ✅ pak de echte positie van je maze op het scherm
  const rect = mazeCanvas.getBoundingClientRect();
  const gap  = 1;

  // links naast de maze
  const x = rect.left - panelW - gap + (cfg.offsetX || 0);
  const y = rect.top + (rect.height - panelH) / 2 + (cfg.offsetY || 0);

  hudCtx.save();
  hudCtx.translate(x, y);
  hudCtx.scale(cfg.scale, cfg.scale);

  // 🟦 achtergrond + titel ("BITTY HIGHSCORE")
  drawBittyHighscorePanel(
    hudCtx,
    0,
    0,
    BASE_W,
    BASE_H,
    { textScale: cfg.textScale }
  );

  // 🏆 TOP 10 inhoud (positie • avatar • naam • score • tijd • level)
  drawHighscoreRows(
    hudCtx,
    BASE_W,
    BASE_H,
    { textScale: cfg.textScale }
  );

  hudCtx.restore();
}

// ---------------------------------------------------------------------------
// HIGHSCORE PANEL RENDER (Top 10 inside)
// ---------------------------------------------------------------------------
function formatScore(n) {
  // puur integer display
  return String(Math.max(0, Math.floor(n || 0)));
}

function formatTimeMs(ms) {
  return formatRunTime(ms || 0); // jij hebt formatRunTime al in game.js :contentReference[oaicite:7]{index=7}
}


function drawHighscoreRows(ctx, baseW, baseH, opts = {}) {
  // Basis layout
  const paddingX = Math.round(baseW * 0.06);
  const headerH  = Math.round(baseH * 0.17);
  const topY     = headerH + Math.round(baseH * 0.06);

  const rowH     = Math.round(baseH * 0.065);
  const avatarSz = Math.round(rowH * 0.70);

  // Font
  const font = "Courier New, monospace";
  const fontScale = opts.fontScale ?? 1;
  const fontSize = Math.round(rowH * 0.58 * (opts.textScale ?? 1) * fontScale);

  ctx.save();
  ctx.font = `700 ${fontSize}px ${font}`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";

  // 👉 HOEVEEL alles naar links schuift (instelbaar via opts)
  // opts.contentShift: number (0..1) als ratio van baseW (bijv 0.42)
  const contentShiftRatio = (typeof opts.contentShift === "number") ? opts.contentShift : 0.53;
  const contentShift = Math.round(baseW * contentShiftRatio);

  // 👉 Tekst max breedte (zodat het niet buiten beeld loopt)
  // opts.maxTextWidthRatio: bijv 0.86
  const maxTextWidthRatio = (typeof opts.maxTextWidthRatio === "number") ? opts.maxTextWidthRatio : 0.92;
  const maxTextWidth = Math.round(baseW * maxTextWidthRatio);

  // helper: tekst inkorten met …
  function ellipsize(text, maxW) {
    if (!text) return "";
    if (ctx.measureText(text).width <= maxW) return text;

    const ell = "…";
    let t = text;
    while (t.length > 0 && ctx.measureText(t + ell).width > maxW) {
      t = t.slice(0, -1);
    }
    return t.length ? (t + ell) : ell;
  }

  for (let i = 0; i < HIGHSCORE_MAX; i++) {
    const rowY = topY + i * rowH + Math.round(rowH * 0.5);
    const entry = highscoreList[i] || null;

    // ─────────────────────────────
    // 1) Positie (1. 2. 3. ...)
    // ─────────────────────────────
    const posText = `${i + 1}.`;
    ctx.fillText(posText, paddingX, rowY);

    // als er geen entry is: toon streepje (handig op canvas)
    if (!entry) {
      ctx.globalAlpha = 0.55;
      ctx.fillText("—", paddingX + Math.round(baseW * 0.07), rowY);
      ctx.globalAlpha = 1;
      continue;
    }

    // ─────────────────────────────
    // 2) Avatar (als geheel naar links geschoven)
    // ─────────────────────────────
    const avatarBaseX = paddingX + Math.round(baseW * 0.6);
    const avatarX = avatarBaseX - contentShift;
    const avatarY = rowY - Math.round(avatarSz / 2);

    if (entry.avatarDataUrl) {
      const img = getAvatarImage(entry.avatarDataUrl);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(
          avatarX + avatarSz / 2,
          avatarY + avatarSz / 2,
          avatarSz / 2,
          0,
          Math.PI * 2
        );
        ctx.clip();
        ctx.drawImage(img, avatarX, avatarY, avatarSz, avatarSz);
        ctx.restore();
      }
    }

    // ─────────────────────────────
    // 3) Tekst (compact + ruimtebesparend)
    // ─────────────────────────────
    const textX = avatarX + avatarSz + Math.round(baseW * 0.02);

    const name  = (entry.name || "Unknown").toString();
    const scoreTxt = formatScore(entry.score);
    const timeTxt  = formatTimeMs(entry.timeMs);
    const lvlTxt   = `(${Math.max(1, Math.floor(entry.level || 1))})`;

    // Compacte regel
    const line = `${name} — ${scoreTxt} — ${timeTxt} ${lvlTxt}`;

    // zorg dat het in beeld blijft
    const availableW = Math.max(20, maxTextWidth - textX);
    const safeLine = ellipsize(line, availableW);

    ctx.fillText(safeLine, textX, rowY);
  }

  ctx.restore();
}


function drawSpikyBall() {
  if (!spikyBall || !spikyBall.active) return;
  if (currentLevel !== 3 && currentLevel !== 4) return;

  const size = spikyBall.size;

  // schaduw
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(spikyBall.x, spikyBall.y + size*0.18, size*0.28, size*0.16, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // bal + rotatie
  ctx.save();
  ctx.translate(spikyBall.x, spikyBall.y);
  ctx.rotate(spikyBall.angle);

  // body
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
  ctx.fill();

  // subtiele highlight
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-size*0.12, -size*0.12, size*0.14, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // spikes (goud)
 // 🔺 echte spikes – punt altijd naar buiten
const spikes = 12;
const baseRadius = size * 0.42;
const spikeLength = size * 0.26;
const baseWidth = size * 0.12;

ctx.fillStyle = "#d4af37";

for (let i = 0; i < spikes; i++) {
  const a = (Math.PI * 2 * i) / spikes;

  // richting vector
  const dx = Math.cos(a);
  const dy = Math.sin(a);

  // basis links/rechts
  const bx1 = dx * baseRadius - dy * baseWidth * 0.5;
  const by1 = dy * baseRadius + dx * baseWidth * 0.5;

  const bx2 = dx * baseRadius + dy * baseWidth * 0.5;
  const by2 = dy * baseRadius - dx * baseWidth * 0.5;

  // punt van de spike (naar buiten)
  const px = dx * (baseRadius + spikeLength);
  const py = dy * (baseRadius + spikeLength);

  ctx.beginPath();
  ctx.moveTo(bx1, by1);
  ctx.lineTo(px, py);
  ctx.lineTo(bx2, by2);
  ctx.closePath();
  ctx.fill();
}


  // marker (maakt rollen super duidelijk)
  ctx.fillStyle = "#d4af37";
  ctx.beginPath();
  ctx.arc(size*0.18, -size*0.10, size*0.06, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}



function applyPortal(ent) {
  const c = Math.round(ent.x / TILE_SIZE - 0.5);
  const r = Math.round(ent.y / TILE_SIZE - 0.5);

  // Alleen op de portal-rij
  if (r !== PORTAL_ROW) return;

  // Naar RECHTS bewegen en rechts uit beeld → naar links poort
  if (ent.dir.x > 0 && c === PORTAL_RIGHT_COL) {
    const target = tileCenter(PORTAL_LEFT_COL, PORTAL_ROW);
    ent.x = target.x;
    return;
  }

  // Naar LINKS bewegen en links uit beeld → naar rechts poort
  if (ent.dir.x < 0 && c === PORTAL_LEFT_COL) {
    const target = tileCenter(PORTAL_RIGHT_COL, PORTAL_ROW);
    ent.x = target.x;
    return;
  }
}

// ---------------------------------------------------------------------------
// DRAWT LIVES ALS KLEINE PACMAN-ICOONTJES (VASTE POSITIE)
// ---------------------------------------------------------------------------
function drawLifeIcons() {
  if (!lifeIconConfig.enabled) return;
  if (!playerLoaded) return;
  if (!hudCtx) return;

  const { spacing, scale, baseX, baseY } = lifeIconConfig;

  // ─────────────────────────────────────────────
  // Pacman sprite (mond open, naar rechts)
  // ─────────────────────────────────────────────
  const frameCol = 2;
  const frameRow = PACMAN_DIRECTION_ROW.right;

  const srcX = frameCol * PACMAN_SRC_WIDTH;
  const srcY = frameRow * PACMAN_SRC_HEIGHT;

  const iconSize = TILE_SIZE * pacmanScale * scale;

  // ─────────────────────────────────────────────
  // VASTE POSITIE (DIT IS WAT JIJ WIL)
  // ─────────────────────────────────────────────
  const startX = baseX;
  const y      = baseY;

  // ─────────────────────────────────────────────
  // Tekenen op HUD canvas
  // ─────────────────────────────────────────────
  for (let i = 0; i < lives; i++) {
    const x = startX + i * spacing;

    hudCtx.drawImage(
      playerImg,
      srcX, srcY,
      PACMAN_SRC_WIDTH, PACMAN_SRC_HEIGHT,
      x,
      y,
      iconSize,
      iconSize
    );
  }
}

function onPlayerDeathFinished() {
  isDying = false;
  deathAnimTime = 0;

  // 🔊 Death sound resetten
  if (typeof pacmanDeathSound !== "undefined") {
    pacmanDeathSound.pause();
    pacmanDeathSound.currentTime = 0;
  }

  // Life aftrekken
  lives--;
  livesEl.textContent = lives;

  // ─────────────────────────────
  //   GAME OVER LOGICA
  // ─────────────────────────────
  if (lives <= 0) {
    gameRunning = false;
    gameOver = true;

    if (isMobileLayout) {
  showMobileHudModal();
}


    // ⏱️ TIMER STOPPEN + RUN OPSLAAN
    timerRunning = false;

    try {
      const runResult = {
        score,
        level: currentLevel,
        timeMs: runTimeMs,
        endedAt: Date.now()
      };
      localStorage.setItem("lastRunResult", JSON.stringify(runResult));
    } catch (e) {}

    // ✅ NIEUW: RUN naar Top 10 sturen (als speler ingelogd is + waardig)
    // Deze functie voegt alleen toe als het echt Top 10 is.
    if (typeof submitRunToHighscores === "function") {
      submitRunToHighscores();
    }

    // 🔊 Alle andere geluiden stoppen
    if (typeof stopAllSirens === "function") stopAllSirens();

    if (typeof eyesSound !== "undefined") {
      eyesSound.pause();
      eyesSound.currentTime = 0;
      eyesSoundPlaying = false;
    }
    if (typeof ghostFireSound !== "undefined") {
      ghostFireSound.pause();
      ghostFireSound.currentTime = 0;
      ghostFireSoundPlaying = false;
    }

    // 🔊 GAME OVER SOUND AFSPELEN
    gameOverSound.currentTime = 0;
    gameOverSound.play().catch(() => {});

    // ✅ Mobile: na game over wachten tot speler highscores bekijkt
if (isMobileLayout) {
  pendingLoginAfterGameOver = true;
}


    return; // niets meer resetten, want game is voorbij
  }

  // ─────────────────────────────
  //   NIEUW LEVEN (geen game over)
  // ─────────────────────────────
  resetAfterDeath();
}



function updateDeathAnimation(deltaMs) {
  if (!isDying) return;

  deathAnimTime += deltaMs;

  if (deathAnimTime >= deathAnimDuration) {
    onPlayerDeathFinished();
  }
}

function drawPacmanDeathFrame() {
  if (!playerLoaded) return;

  const t = Math.min(1, deathAnimTime / deathAnimDuration);

  ctx.save();
  ctx.translate(player.x, player.y);

  const baseSize = TILE_SIZE * pacmanScale;

  if (t < 0.7) {
    // Fase 1: Pacman shrink + mond verder open
    const local = t / 0.7; // 0..1 binnen fase 1
    const scale = 1 - local; // van 1 → 0

    const size = baseSize * scale;

    // mond-frame kiezen op basis van local (0..1 → kolom 0..2)
    const frameCol = Math.min(2, Math.floor(local * 3));
    const frameRow = player.facingRow || PACMAN_DIRECTION_ROW.right;

    const sx = frameCol * PACMAN_SRC_WIDTH;
    const sy = frameRow * PACMAN_SRC_HEIGHT;

    ctx.drawImage(
      playerImg,
      sx, sy, PACMAN_SRC_WIDTH, PACMAN_SRC_HEIGHT,
      -size / 2,
      -size / 2,
      size,
      size
    );
  } else {
    // Fase 2: Pacman is weg, alleen streepjes-rondje
    const local = (t - 0.7) / 0.3; // 0..1 binnen fase 2
    drawPacmanDeathRays(local);
  }

  ctx.restore();
}

function drawCannonProjectiles() {
  if (!cannonBulletImg || !cannonBulletImg.complete) return;

  for (const b of activeCannonballs) {
    if (b.exploding) {
      // simpele explosie tekenen
      const t = Math.min(1, b.explodeTime / 400);
      const maxR = b.radius * 2.5;
      const r = b.radius + (maxR - b.radius) * t;

      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffcc00";
      ctx.fillStyle = "rgba(255,120,0," + (1 - t) + ")";
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      continue;
    }

    const size = b.radius * 2;
    ctx.drawImage(
      cannonBulletImg,
      b.x - size / 2,
      b.y - size / 2,
      size,
      size
    );
  }
}

// ─────────────────────────────────────────────
// HUD CANNONS (alleen tekenen, niet geschaald)
// ─────────────────────────────────────────────
function drawCannonsHUD() {
  if (!isAdvancedLevel()) return;   // ✅ level 2 + 3
  if (!cannonImg || !cannonImg.complete) return;

  for (const key of ["left", "right"]) {
    const c = cannonHUD[key];
    const w = cannonImg.width  * c.scale;
    const h = cannonImg.height * c.scale;

    ctx.drawImage(
      cannonImg,
      c.x - w / 2,
      c.y,
      w,
      h
    );
  }
}


// ─────────────────────────────────────────────
// CANNON BULLET SPAWN (in maze)
// ─────────────────────────────────────────────
function spawnCannonballFromLane(side) {
  const laneCol =
    side === "left"
      ? CANNON_LANE_LEFT_COL
      : CANNON_LANE_RIGHT_COL;

  const laneCenter = tileCenter(laneCol, 0);

  activeCannonballs.push({
    x: laneCenter.x
        + (side === "left" ? CANNON_LANE_LEFT_OFFSET_PX : CANNON_LANE_RIGHT_OFFSET_PX),
    y: CANNON_BULLET_START_Y, // 🔥 pixel-positie
    vy: 6,
    radius: 40,
    exploding: false,
    explodeTime: 0
  });

  cannonShootSound.currentTime = 0;
  cannonShootSound.play().catch(() => {});
}
function playElectricShock() {
  try {
    const s = electricShockSfx.cloneNode(true);
    s.volume = 0.35; // zacht, arcade
    s.play().catch(() => {});
  } catch (e) {}
}

function spawnElectricSparks(x, y) {
  // kleine, korte, leuke flitsjes rond een ghost
  const count = 6; // aantal mini-sparks
  for (let i = 0; i < count; i++) {
    electricSparks.push({
      x,
      y,
      life: 180 + Math.random() * 120, // ms
      maxLife: 180 + Math.random() * 120,
      angle: Math.random() * Math.PI * 2,
      radius: 10 + Math.random() * 16,
      len: 10 + Math.random() * 14,
      seed: Math.random() * 9999
    });
  }
}

function updateElectricSparks(dt) {
  for (let i = electricSparks.length - 1; i >= 0; i--) {
    electricSparks[i].life -= dt;
    if (electricSparks[i].life <= 0) electricSparks.splice(i, 1);
  }
}

function drawElectricSparks() {
  if (!electricSparks.length) return;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  for (const s of electricSparks) {
    const t = 1 - (s.life / s.maxLife); // 0→1
    const flicker = (Math.random() * 0.6 + 0.4); // chaotisch flikkeren
    const alpha = (1 - t) * 0.9 * flicker;

    // startpunt rond ghost
    const sx = s.x + Math.cos(s.angle) * s.radius;
    const sy = s.y + Math.sin(s.angle) * s.radius;

    // eindpunt (klein stukje verder)
    const ex = sx + Math.cos(s.angle) * s.len;
    const ey = sy + Math.sin(s.angle) * s.len;

    // kleine zigzag (bliksem)
    const steps = 4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);

    for (let i = 1; i < steps; i++) {
      const p = i / steps;
      const ix = sx + (ex - sx) * p;
      const iy = sy + (ey - sy) * p;

      // random offset voor zigzag
      const off = (Math.random() - 0.5) * 8;
      const nx = ix + Math.cos(s.angle + Math.PI / 2) * off;
      const ny = iy + Math.sin(s.angle + Math.PI / 2) * off;

      ctx.lineTo(nx, ny);
    }

    ctx.lineTo(ex, ey);

    // glow + kernlijn (simpel maar nice)
    ctx.strokeStyle = `rgba(140, 220, 255, ${alpha * 0.35})`;
    ctx.shadowBlur = 12;
    ctx.shadowColor = `rgba(140, 220, 255, ${alpha})`;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.stroke();
  }

  ctx.restore();
}



// ─────────────────────────────────────────────
// PACMAN DEATH STRALEN (los effect, correct)
// ─────────────────────────────────────────────
function drawPacmanDeathRays(local) {
  const rays = 16;
  const maxRadius = TILE_SIZE * pacmanScale * 1.6;
  const innerRadius = maxRadius * 0.3;
  const outerRadius = innerRadius + (maxRadius - innerRadius) * local;

  ctx.save();
  ctx.strokeStyle = "#f4a428";
  ctx.lineWidth = 3;
  ctx.globalAlpha = 1 - (local * 0.7);

  for (let i = 0; i < rays; i++) {
    const angle = (Math.PI * 2 * i) / rays;

    const x1 = Math.cos(angle) * innerRadius;
    const y1 = Math.sin(angle) * innerRadius;
    const x2 = Math.cos(angle) * outerRadius;
    const y2 = Math.sin(angle) * outerRadius;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}


function drawCoins() {
  if (!coinImgLoaded) return;

  ctx.save();

  // pulse tussen 0.9 en 1.1
  const pulse = 0.9 + 0.2 * ((Math.sin(coinPulsePhase) + 1) / 2);

  coins.forEach(c => {
    if (c.taken) return;

    const scaledRadius = c.radius * pulse;
    const size = scaledRadius * 2;

    ctx.drawImage(
      coinImg,
      c.x - scaledRadius,
      c.y - scaledRadius,
      size,
      size
    );
  });

  ctx.restore();
}

function drawOneUpText() {
  if (!oneUpTextActive) return;

  const text = "1 UP";

  ctx.save();

  // zelfde stijl als READY / WOW
  ctx.font = "bold 72px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = canvas.width / 2;
  const y = canvas.height / 2;

  // zwarte outline
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#000000";
  ctx.strokeText(text, x, y);

  // gele fill
  ctx.fillStyle = "#ffff00";
  ctx.fillText(text, x, y);

  ctx.restore();
}


function drawGameOverText() {
  if (!gameOver) return;

  ctx.save();

  ctx.translate(pathOffsetX, pathOffsetY);
  ctx.scale(pathScaleX, pathScaleY);

  ctx.fillStyle   = "#ff0000";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth   = 6;
  ctx.font = "bold 90px 'Courier New', monospace";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const cx = (COLS * TILE_SIZE) / 2 + 140; 
  const cy = (ROWS * TILE_SIZE) / 2;

  ctx.strokeText("GAME OVER", cx, cy);
  ctx.fillText("GAME OVER", cx, cy);

  ctx.restore();
}

const FRAME_TIME = 1000 / 60; // ≈ 16.67 ms

function loop() {
  // ─────────────────────────────────────────────
  // UPDATE-FASE
  // ─────────────────────────────────────────────
  if (gameRunning && !isDying) {
    gameTime += FRAME_TIME;

    // ✅ run timer loopt alleen als hij gestart is
if (timerRunning && roundStarted && !introActive && !gameOver) {
  runTimeMs += FRAME_TIME;
  updateTimeHud();
}


    powerDotPhase += POWER_DOT_BLINK_SPEED;
    coinPulsePhase += 0.04;

    // --- FRIGHTENED TIMER UPDATE ---
    if (frightTimer > 0) {
      frightTimer -= FRAME_TIME;

      if (frightTimer <= FRIGHT_FLASH_MS) frightFlash = true;

      if (frightTimer <= 0) {
        frightTimer = 0;
        frightFlash = false;

        ghosts.forEach((g) => {
          if (g.mode === GHOST_MODE_FRIGHTENED) {
            g.mode  = globalGhostMode;
            g.speed = SPEED_CONFIG.ghostSpeed;
          }
        });
      }
    }

    updateGhostGlobalMode(FRAME_TIME);

    // --- CORE UPDATES ---
    updatePlayer();
    updateGhosts();

       // ✅ SPIKY BALL UPDATE + GHOST COLLISION (LEVEL 3 + 4)
    if (
      typeof currentLevel !== "undefined" &&
      (currentLevel === 3 || currentLevel === 4)
    ) {
      updateSpikyBall?.();
      handleGhostSpikyBallCollision?.();
    }


    checkCollision();
    updateFloatingScores(FRAME_TIME);

    // --- LEVEL 2 + 3 CANNONS UPDATE ---
    if (isAdvancedLevel() && typeof updateCannons === "function") {
      updateCannons(FRAME_TIME);
    }

    // --- WOW 4-GHOST BONUS TIMER ---
    if (wowBonusActive) {
      wowBonusTimer -= FRAME_TIME;

      if (wowBonusTimer <= 0) {
        wowBonusTimer = 0;
        wowBonusActive = false;
        if (typeof startCoinBonus === "function") startCoinBonus();
      }
    }

    // ✅ --- 1 UP POPUP TIMER (STAP 7) ---
    if (oneUpTextActive) {
      oneUpTimer -= FRAME_TIME;
      if (oneUpTimer <= 0) {
        oneUpTimer = 0;
        oneUpTextActive = false;
      }
    }

    // --- COIN BONUS UPDATE ---
    if (coinBonusActive && typeof updateCoins === "function") {
      updateCoins(FRAME_TIME);
    }

    updateEyesSound?.();
    updateFrightSound?.();
    updateSirenSound?.();
  
    updateElectricSparks(FRAME_TIME);

    frame++;

  } else if (isDying) {
    // ─────────────────────────────────────────────
    // DEATH ANIMATIE UPDATE
    // ─────────────────────────────────────────────
    updateDeathAnimation?.(FRAME_TIME);

  } else {
    // ─────────────────────────────────────────────
    // GAME STIL → SOUNDS UIT
    // ─────────────────────────────────────────────
    if (eyesSoundPlaying) {
      eyesSoundPlaying = false;
      eyesSound.pause();
      eyesSound.currentTime = 0;
    }

    if (ghostFireSoundPlaying) {
      ghostFireSoundPlaying = false;
      ghostFireSound.pause();
      ghostFireSound.currentTime = 0;
    }

    stopAllSirens?.();
  }

  // ─────────────────────────────────────────────
  // TEKEN-FASE
  // ─────────────────────────────────────────────

  drawMazeBackground();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ─────────────────────────────────────────────
  // MAZE-LAYER (GESCHAALD)
  // ─────────────────────────────────────────────
  ctx.save();
  ctx.translate(pathOffsetX, pathOffsetY);
  ctx.scale(pathScaleX, pathScaleY);

  drawDots();

  // 🍒🍓🍌 FRUIT IN MAZE
  drawCherry?.();
  drawStrawberry?.();
  drawBanana?.();

  // 🍐 Peer (LEVEL 3 ONLY)
    // 🍐 Peer (LEVEL 3 + 4)
  if (
    typeof currentLevel !== "undefined" &&
    (currentLevel === 3 || currentLevel === 4)
  ) {
    drawPear?.();
  }


  // ✅ Spiky rolling ball (LEVEL 3 + 4)
  if (
    typeof currentLevel !== "undefined" &&
    (currentLevel === 3 || currentLevel === 4)
  ) {
    drawSpikyBall?.();
  }

  drawPlayer();
  drawGhosts();
  drawElectricSparks();

  drawFloatingScores();

  if (isAdvancedLevel()) {
    drawCannonProjectiles?.();
  }

  if (coinBonusActive) {
    drawCoins?.();
  }

  drawWowBonusText?.();
  drawReadyText?.();
  drawOneUpText();

  if (gameOver && !isDying) {
    drawGameOverText?.();
  }

  // klaar met geschaalde maze-tekeningen
  ctx.restore();

  // 🌑 LEVEL 4 DARKNESS + AURA
  drawLevel4DarknessMask?.();

  // ✨ BITTY ALTIJD HELDER ZICHTBAAR IN LEVEL 4
  if (currentLevel === 4) {
    ctx.save();
    ctx.translate(pathOffsetX, pathOffsetY);
    ctx.scale(pathScaleX, pathScaleY);

    // Pacman opnieuw tekenen bovenop de darkness
    drawPlayer();

    ctx.restore();
  }

  // 🔴 RODE GHOST-OGEN OVERLAY (LEVEL 4 + VUURMODE)
  drawLevel4FrightEyesOverlay?.();

  drawLevel4EatenEyesOverlay?.();


  // ─────────────────────────────────────────────
  // HUD-LAYER (NIET GESCHAALD)
  // ─────────────────────────────────────────────
  drawCherryIcon?.();
  drawStrawberryIcon?.();
  drawBananaIcon?.();


// 🍐 Peer HUD (altijd zichtbaar)
if (typeof drawPearIcon === "function") {
  drawPearIcon();
}

// 🟦 Bitty Bonus HUD
if (typeof drawBittyBonusIcon === "function") {
  drawBittyBonusIcon();
}

// ✅ Cannon HUD (level 2 + 3)
if (isAdvancedLevel()) {
  drawCannonsHUD?.();
}

drawElectricBarrierOverlay();



if (hudCtx) {

  // altijd wissen
  hudCtx.clearRect(0, 0, hudW, hudH);

  // ❌ DESKTOP highscore HUD — NOOIT op mobiel
  if (highscoreConfig.enabled && !isMobileLayout) {
    drawScaledBittyHighscoreHUD(hudCtx, highscoreConfig);
  }

  // ✅ PACMAN LIVES — ALTIJD (desktop + mobiel)
  drawLifeIcons();
}

loopRafId = requestAnimationFrame(loop);

}



function startNewGame() {
  score = 0;
  lives = 3;
  scoreEl.textContent = score;
  livesEl.textContent = lives;

  // Nieuwe game begint altijd op level 1
  currentLevel = 1;
  readyLabel   = "GET READY!";

  // Snelheden terug naar level 1
  if (typeof applySpeedsForLevel === "function") {
    applySpeedsForLevel();
  }

  roundStarted = false;

  // ⏱️ STAP 7 + 8 — TIMER RESET + UIT BIJ NIEUWE GAME
  runTimeMs = 0;
  timerRunning = false;
  lastShownSecond = -1;
  if (typeof updateTimeHud === "function") {
    updateTimeHud();
  }

  // ✅ GAME OVER MUZIEK STOPPEN BIJ NIEUWE GAME
  if (typeof gameOverSound !== "undefined" && gameOverSound) {
    gameOverSound.pause();
    gameOverSound.currentTime = 0;
  }

  gameOver     = false;
  gameRunning  = false; // wordt pas true NA getready.mp3

  // 🔄 vuurmode-teller resetten voor nieuwe game
  if (typeof frightActivationCount !== "undefined") {
    frightActivationCount = 0;
  }

  // 🔄 4-ghost bonus + WOW-overlay resetten
  if (typeof fourGhostBonusTriggered !== "undefined") {
    fourGhostBonusTriggered = false;
  }
  if (typeof wowBonusActive !== "undefined") {
    wowBonusActive = false;
    wowBonusTimer  = 0;
  }

  // 🔄 coin-bonus resetten (alle coins weg bij nieuwe game)
  if (typeof endCoinBonus === "function") {
    endCoinBonus();
  } else {
    if (typeof coinBonusActive !== "undefined") {
      coinBonusActive = false;
    }
    if (typeof coinBonusTimer !== "undefined") {
      coinBonusTimer = 0;
    }
    if (typeof coins !== "undefined" && Array.isArray(coins)) {
      coins.length = 0;
    }
  }

  // 🔄 kersen- / aardbei- / banaan-systeem resetten bij nieuwe game
  if (typeof cherry !== "undefined") {
    cherry = null;
  }
  if (typeof cherriesSpawned !== "undefined") {
    cherriesSpawned = 0;
  }

  if (typeof strawberry !== "undefined") {
    strawberry = null;
  }
  if (typeof strawberriesSpawned !== "undefined") {
    strawberriesSpawned = 0;
  }

  // 🍌 banaan reset
  if (typeof banana !== "undefined") {
    banana = null;
  }
  if (typeof bananasSpawned !== "undefined") {
    bananasSpawned = 0;
  }

  // 🍐 peer reset
  if (typeof pear !== "undefined") {
    pear = null;
  }
  if (typeof pearsSpawned !== "undefined") {
    pearsSpawned = 0;
  }

  if (typeof dotsEaten !== "undefined") {
    dotsEaten = 0;
  }

  // 🔄 level 2 cannon-systeem resetten
  if (typeof cannonWaveTriggered !== "undefined") {
    cannonWaveTriggered = [];
  }

  if (typeof cannonWaveTimeoutIds !== "undefined" && Array.isArray(cannonWaveTimeoutIds)) {
    cannonWaveTimeoutIds.forEach(id => clearTimeout(id));
    cannonWaveTimeoutIds.length = 0;
  }

  if (typeof cannonWave1Triggered !== "undefined") {
    cannonWave1Triggered = false;
  }
  if (typeof cannonWave2Triggered !== "undefined") {
    cannonWave2Triggered = false;
  }
  if (typeof cannonWave3Triggered !== "undefined") {
    cannonWave3Triggered = false;
  }

  if (typeof activeCannonballs !== "undefined" && Array.isArray(activeCannonballs)) {
    activeCannonballs.length = 0;
  }

  // 🔊 alle sirenes uit bij nieuwe game
  if (typeof stopAllSirens === "function") {
    stopAllSirens();
  } else if (typeof stopSiren === "function") {
    stopSiren();
  }

  resetEntities();
  messageEl.classList.add("hidden");

  startIntro();
}



// Eerste init
resetEntities();
initPlayerCard();
updateBittyPanel();   // ⬅️ overlay direct goed zetten

// ✅ Highscores: direct lokaal laden + tonen, daarna server sync
loadHighscoresFromLocal();
renderMobileHighscoreList();
loadHighscoresFromServer();

// ✅ Mobile: eerst login verplicht, pas daarna intro starten
if (isMobileLayout && !(playerProfile && playerProfile.name)) {
  pendingStartAfterLogin = true;
  showMobileLoginModal();
  // geen startIntro hier
} else {
  startIntro();
}

loop();


