/* ===================== 眼疾手快 ===================== */

(() => {
'use strict';

/* ---------- 从 GameShell 解构公共常量和工具函数 ---------- */
const { $, $$, FILES, RANKS, BOARD_SIZE, key, parseKey, fi, ri, playSound } = GameShell;

/* ---------- 常量 ---------- */
const ANIMATION_DURATION = 300;        // 动画时长(ms)
const WRONG_FLASH_DURATION = 150;      // 误点闪烁时长(ms)
const GAME_OVER_DELAY = 170;           // 游戏结束延迟(ms)
const LIGHT_SQUARE_PARITY = 0;         // 白格子的奇偶性
const SPAWN_INTERVAL_BASE = 1.6;       // 动态间隔基数(秒)
const SPAWN_INTERVAL_FACTOR = 100;     // 动态间隔分母因子
const MIN_SPAWN_INTERVAL = 100;        // 最小间隔(ms)，防止过快

/* ---------- 工具 ---------- */
const isLightSquare = k => (fi(k[0]) + ri(parseInt(k[1], 10))) % 2 === LIGHT_SQUARE_PARITY;

/**
 * 计算动态生成间隔（毫秒）
 * 公式: 1.6 * (1 - 2 * atan(bron / 100) / π) 秒
 * @param {number} bron - 已出现的坐标数量
 * @returns {number} 间隔时间（毫秒）
 */
function calcSpawnInterval(bron) {
  const seconds = SPAWN_INTERVAL_BASE * (1 - 2 * Math.atan(bron / SPAWN_INTERVAL_FACTOR) / Math.PI);
  const ms = Math.max(Math.round(seconds * 1000), MIN_SPAWN_INTERVAL);
  return ms;
}

/* ---------- 游戏状态 ---------- */
// board: 显示格子key -> 标签坐标（如 "b4"）
// 某格子X上显示"b4"，玩家点击坐标为b4的格子，格子X上的"b4"被消除
let board = {};           // 显示位置key -> 标签坐标
let labelIndex = {};      // 反向索引：标签坐标 -> [显示位置key列表]
let score = 0;
let isGameOver = false;
let spawnTimer = null;
let occupiedDisplayKeys = new Set();  // 已被占用的显示位置集合
let whiteSquares = [];               // 所有白格子key列表
let audioEnabled = true;             // 声音开关
let spawnCount = 0;                  // 已出现的坐标数量（bron）

/* ---------- DOM ---------- */
const boardEl = $('#board');

/* ---------- 事件管理 ---------- */
let squareEventController = null;
let visibilityController = null;

/* ---------- 初始化 ---------- */
function initGame() {
  board = {};
  labelIndex = {};
  score = 0;
  isGameOver = false;
  spawnCount = 0;
  occupiedDisplayKeys.clear();
  GameShell.updateScore(score);

  clearSpawnTimer();

  // 计算所有白格子
  whiteSquares = [];
  for (let r = 1; r <= BOARD_SIZE; r++) {
    for (let f of FILES) {
      if ((fi(f) + ri(r)) % 2 === LIGHT_SQUARE_PARITY) {
        whiteSquares.push(key(f, r));
      }
    }
  }

  renderBoard();
  attachSquareEvents();
  attachVisibilityEvent();

  // 启动动态定时生成
  scheduleNextSpawn();
}

/* ---------- 定时器管理 ---------- */
function clearSpawnTimer() {
  if (spawnTimer) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }
}

/**
 * 调度下一次坐标生成（使用动态间隔）
 */
function scheduleNextSpawn() {
  if (isGameOver) return;
  const interval = calcSpawnInterval(spawnCount);
  spawnTimer = setTimeout(() => {
    spawnCoordinate();
    scheduleNextSpawn();
  }, interval);
}

/* ---------- 渲染棋盘 ---------- */
function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = BOARD_SIZE; r >= 1; r--) {
    for (let f of FILES) {
      const sq = document.createElement('div');
      const k = key(f, r);
      const isLight = (fi(f) + ri(r)) % 2 === LIGHT_SQUARE_PARITY;
      sq.className = `square ${isLight ? 'light' : 'dark'}`;
      sq.dataset.key = k;

      if (board[k]) {
        sq.classList.add('occupied');
        const label = document.createElement('span');
        label.className = 'coord-label';
        label.textContent = board[k];
        sq.appendChild(label);
      }

      boardEl.appendChild(sq);
    }
  }
}

/* ---------- 事件绑定（使用 AbortController，重启时清理重建） ---------- */
function attachSquareEvents() {
  if (squareEventController) squareEventController.abort();
  squareEventController = new AbortController();
  boardEl.addEventListener('click', onBoardClick, { signal: squareEventController.signal });
}

function attachVisibilityEvent() {
  if (visibilityController) visibilityController.abort();
  visibilityController = new AbortController();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearSpawnTimer();
    } else if (!isGameOver) {
      scheduleNextSpawn();
    }
  }, { signal: visibilityController.signal });
}

function onBoardClick(e) {
  const sq = e.target.closest('.square');
  if (!sq) return;
  onSquareClick(sq);
}

/* ---------- 点击格子 ---------- */
function onSquareClick(sq) {
  if (isGameOver) return;
  const clickedKey = sq.dataset.key; // 玩家点击的格子坐标

  // 只能点击白格子，点击黑格子 → 误点，游戏结束
  if (!isLightSquare(clickedKey)) {
    sq.classList.add('wrong');
    playSound('illegal');
    endGame();
    setTimeout(() => sq.classList.remove('wrong'), WRONG_FLASH_DURATION);
    return;
  }

  // 查找所有显示位置上有这个标签的格子（使用反向索引）
  let matchedDisplayKeys = labelIndex[clickedKey] ? [...labelIndex[clickedKey]] : [];

  if (matchedDisplayKeys.length === 0) {
    // 点击的坐标没有在任何格子上显示 → 误点，游戏结束
    sq.classList.add('wrong');
    playSound('illegal');
    endGame();
    setTimeout(() => sq.classList.remove('wrong'), WRONG_FLASH_DURATION);
    return;
  }

  // 收集所有要消除的格子（匹配 + 引爆）
  // 自匹配：某个显示位置等于点击位置（格子显示自己的坐标）
  let selfMatch = matchedDisplayKeys.includes(clickedKey);

  // 先计算引爆的格子
  let blastedKeys = [];
  if (selfMatch) {
    blastedKeys = blastAllLinesKeys(clickedKey);
  } else {
    // 找到所有与点击位置在同一直线上的显示位置，合并引爆范围
    const blastedSet = new Set();
    for (const displayKey of matchedDisplayKeys) {
      const lineKeys = checkLineBlastKeys(displayKey, clickedKey);
      for (const k of lineKeys) blastedSet.add(k);
    }
    blastedKeys = [...blastedSet];
  }

  // 合并所有要消除的格子（去重）
  let allRemoveKeys = new Set([...matchedDisplayKeys, ...blastedKeys]);

  // 计分：matchedDisplayKeys 中实际有坐标标签的格子 + 引爆范围内有坐标标签的格子
  // 先统计 matchedDisplayKeys
  let totalRemoved = matchedDisplayKeys.filter(k => board[k]).length;
  // 再统计引爆范围内有坐标标签的格子（排除 matchedDisplayKeys 中的）
  for (const bk of blastedKeys) {
    if (!matchedDisplayKeys.includes(bk) && board[bk]) {
      totalRemoved++;
    }
  }
  score += totalRemoved;
  GameShell.updateScore(score);

  // 播放声音：消除 → capture，引爆 → check
  if (blastedKeys.length > 0) {
    playSound('check');
  } else {
    playSound('capture');
  }

  // 统一播放动画
  // 先从 board 中删除匹配的格子
  for (const removeKey of matchedDisplayKeys) {
    const label = board[removeKey];
    if (labelIndex[label]) {
      labelIndex[label].delete(removeKey);
      if (labelIndex[label].size === 0) delete labelIndex[label];
    }
    delete board[removeKey];
    occupiedDisplayKeys.delete(removeKey);
  }
  // 再从 board 中删除引爆的格子
  for (const removeKey of allRemoveKeys) {
    if (!matchedDisplayKeys.includes(removeKey)) {
      const label = board[removeKey];
      if (label && labelIndex[label]) {
        labelIndex[label].delete(removeKey);
        if (labelIndex[label].size === 0) delete labelIndex[label];
      }
      delete board[removeKey];
      occupiedDisplayKeys.delete(removeKey);
    }
  }
  // 一次性触发所有动画
  requestAnimationFrame(() => {
    // 先给所有消除范围格子闪绿（包括点击格子）
    for (const removeKey of allRemoveKeys) {
      const removeSq = $(`.square[data-key="${removeKey}"]`, boardEl);
      if (removeSq) {
        removeSq.style.backgroundColor = 'rgba(0,153,68,0.6)';
        removeSq.classList.remove('occupied');
        const labelEl = removeSq.querySelector('.coord-label');
        if (labelEl) labelEl.classList.add('popping');
      }
    }
    // 点击格子也闪绿
    sq.style.backgroundColor = 'rgba(0,153,68,0.6)';

    // 动画结束后增量清理格子（不重建整个棋盘）
    setTimeout(() => {
      for (const removeKey of allRemoveKeys) {
        const removeSq = $(`.square[data-key="${removeKey}"]`, boardEl);
        if (removeSq) {
          removeSq.style.backgroundColor = '';
          removeSq.classList.remove('occupied');
          const labelEl = removeSq.querySelector('.coord-label');
          if (labelEl) labelEl.remove();
        }
      }
      // 点击格子恢复原色
      sq.style.backgroundColor = '';
      // 检查是否白格被占满
      if (checkBoardFull()) {
        playSound('timeout');
        endGame();
      }
    }, ANIMATION_DURATION);
  });
}

/* ---------- 引爆某格所在的所有直线（横、竖、两条斜线） ---------- */
function blastAllLinesKeys(k) {
  const f = fi(k[0]);
  const r = ri(parseInt(k[1], 10));
  const dirs = [[1,0], [0,1], [1,1], [1,-1]];
  const blastedKeys = new Set();

  for (const [stepF, stepR] of dirs) {
    let cf = f + stepF, cr = r + stepR;
    while (cf >= 0 && cf < BOARD_SIZE && cr >= 0 && cr < BOARD_SIZE) {
      blastedKeys.add(key(FILES[cf], RANKS[cr]));
      cf += stepF;
      cr += stepR;
    }
    cf = f - stepF;
    cr = r - stepR;
    while (cf >= 0 && cf < BOARD_SIZE && cr >= 0 && cr < BOARD_SIZE) {
      blastedKeys.add(key(FILES[cf], RANKS[cr]));
      cf -= stepF;
      cr -= stepR;
    }
  }

  return [...blastedKeys];
}

/* ---------- 直线引爆检查 ---------- */
function checkLineBlastKeys(displayKey, clickKey) {
  const dF = fi(displayKey[0]);
  const dR = ri(parseInt(displayKey[1], 10));
  const cF = fi(clickKey[0]);
  const cR = ri(parseInt(clickKey[1], 10));

  const df = cF - dF;
  const dr = cR - dR;

  let blastedKeys = [];

  if (df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr)) {
    let stepF, stepR;
    if (df === 0 && dr === 0) return blastedKeys;
    if (df === 0) { stepF = 0; stepR = dr > 0 ? 1 : -1; }
    else if (dr === 0) { stepF = df > 0 ? 1 : -1; stepR = 0; }
    else { stepF = df > 0 ? 1 : -1; stepR = dr > 0 ? 1 : -1; }

    let startF = dF, startR = dR;
    while (true) {
      const prevF = startF - stepF;
      const prevR = startR - stepR;
      if (prevF < 0 || prevF >= BOARD_SIZE || prevR < 0 || prevR >= BOARD_SIZE) break;
      startF = prevF;
      startR = prevR;
    }

    let cf = startF, cr = startR;
    while (cf >= 0 && cf < BOARD_SIZE && cr >= 0 && cr < BOARD_SIZE) {
      blastedKeys.push(key(FILES[cf], RANKS[cr]));
      cf += stepF;
      cr += stepR;
    }
  }

  return blastedKeys;
}

/* ---------- 生成新坐标 ---------- */
function spawnCoordinate() {
  if (isGameOver) return;

  // 找出所有未被占用的白格子（作为显示位置）
  const available = whiteSquares.filter(k => !occupiedDisplayKeys.has(k));

  if (available.length === 0) {
    playSound('timeout');
    endGame();
    return;
  }

  // 随机选一个显示位置
  const chosen = available[Math.floor(Math.random() * available.length)];

  // 随机生成一个白格子坐标作为标签
  const randomLabel = whiteSquares[Math.floor(Math.random() * whiteSquares.length)];

  board[chosen] = randomLabel;
  occupiedDisplayKeys.add(chosen);
  if (!labelIndex[randomLabel]) labelIndex[randomLabel] = new Set();
  labelIndex[randomLabel].add(chosen);
  spawnCount++;  // 已出现坐标数量+1
  playSound('move_self');

  // 更新棋盘显示
  const sq = $(`.square[data-key="${chosen}"]`, boardEl);
  if (sq) {
    sq.classList.add('occupied');
    const oldLabel = sq.querySelector('.coord-label');
    if (oldLabel) oldLabel.remove();
    const label = document.createElement('span');
    label.className = 'coord-label';
    label.textContent = randomLabel;
    sq.appendChild(label);
  }

  // 检查是否白格被占满
  if (checkBoardFull()) {
    playSound('timeout');
    endGame();
  }
}

/* ---------- 检查白格是否被占满 ---------- */
function checkBoardFull() {
  return occupiedDisplayKeys.size === whiteSquares.length;
}

/* ---------- 游戏结束 ---------- */
function endGame() {
  isGameOver = true;
  clearSpawnTimer();
  setTimeout(() => {
    GameShell.gameOver(score);
  }, GAME_OVER_DELAY);
}

/* ---------- 启动 ---------- */
GameShell.init({
  title: '眼疾手快',
  storageKey: 'eyeAndHandHighScore',
  rulesText: '根据棋盘上白格显示的坐标点击棋格消灭坐标，消灭一个坐标得1分，误点或白格被占满游戏结束\n\n特殊规则：当消灭的坐标所在棋格与点击的棋格在同一条直线（横，竖，斜）上时，这条直线将被引爆，所有在这条直线上的坐标都会被消灭',
  onInit: initGame,
  onRestart: initGame,
});

})();
