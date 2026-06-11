/* ===================== 翻翻乐游戏逻辑 ===================== */

'use strict';

const { $, $$, FILES, RANKS, BOARD_SIZE, key, parseKey, fi, ri, playSound, pieceSvgUrl, createPieceElement, createTimer, formatTimer, updateTimerDisplay } = GameShell;

/* ---------- 常量 ---------- */
const INITIAL_TIME = 60;       // 初始时间 60秒
const TIME_ADD = 2;             // 每次配对成功加时 2秒

/* ---------- 状态 ---------- */
let score = 0;
let count = 1;                 // 当前轮次
let squares = new Array(64).fill(0); // 棋盘状态：0=空，非0=有棋子（编码=皮肤*13+棋子类型）
let selectedSquare = -1;       // 当前选中的格子（-1=未选中）
let isEnabled = true;          // 棋盘是否可交互
let isRunning = false;         // 游戏是否运行中
let timeLeft = INITIAL_TIME;   // 剩余时间（秒）
let timer = null;              // 公共计时器实例
let areSquareEventsBound = false; // 防重复事件绑定

/* ---------- DOM ---------- */
const boardEl = $('#board');
const scoreEl = $('#score');
const timerEl = $('#timer');

/* ---------- 工具函数 ---------- */
function randomInt(max) {
  return Math.floor(Math.random() * max);
}

/* ---------- 棋子图片URL ---------- */
// blind皮肤：1.svg(白王) 用于白方背面，7.svg(黑王) 用于黑方背面
// pieceType 1-6 为白方，7-12 为黑方
function blindPieceUrl(pieceType) {
  const num = (pieceType >= 7) ? 7 : 1;
  return `../common/Chessman/${BLIND_SKIN}/${num}.svg`;
}

// 根据皮肤和棋子类型获取图片URL
// pieceType 可以是字母（'K','Q'...）或数字（1-12）
function skinPieceUrl(skinIndex, pieceType) {
  const skin = PIECE_SKINS[skinIndex] || PIECE_SKINS[0];
  const num = (typeof pieceType === 'number') ? pieceType : (PIECE_NUM_MAP[pieceType] || 1);
  return `../common/Chessman/${skin}/${num}.svg`;
}

/* ---------- 棋盘渲染 ---------- */
function renderBoard() {
  boardEl.innerHTML = '';

  for (let i = 0; i < 64; i++) {
    const isLight = (Math.floor(i / 8) + i % 8) % 2 === 0;
    const sq = document.createElement('div');
    sq.className = `square ${isLight ? 'light' : 'dark'}`;
    sq.dataset.index = i;

    if (squares[i] !== 0) {
      const pieceEl = document.createElement('div');
      pieceEl.className = 'piece';

      const img = document.createElement('img');
      img.draggable = false;

      if (i === selectedSquare) {
        // 选中的格子：显示正面
        const skinIndex = Math.floor(squares[i] / 13);
        const pieceType = squares[i] % 13; // 1-12
        img.src = skinPieceUrl(skinIndex, pieceType);
        pieceEl.classList.add('face-up');
      } else {
        // 未选中的格子：根据轮次显示背面
        if (count <= 32) {
          // 盲棋背面：白方棋子(1-6)用白色盲棋，黑方棋子(7-12)用黑色盲棋
          const pieceType = squares[i] % 13;
          img.src = blindPieceUrl(pieceType);
        } else if (count <= 64) {
          // 交替黑白兵
          img.src = skinPieceUrl(0, (count % 2 === 1) ? 'P' : 'p');
        } else {
          // 随机黑白兵
          img.src = skinPieceUrl(0, (randomInt(2) === 1) ? 'P' : 'p');
        }
        pieceEl.classList.add('face-down');
      }

      pieceEl.appendChild(img);
      sq.appendChild(pieceEl);
    }

    boardEl.appendChild(sq);
  }
}

/* ---------- 轮次管理 ---------- */
function checkLevelFinish() {
  // 棋盘上还有棋子吗？
  if (squares.some(v => v !== 0)) {
    return false;
  }

  // 进入下一轮
  count += 1;

  // 预计算空位列表，避免随机重试
  const emptySlots = [];
  for (let i = 0; i < 64; i++) {
    if (squares[i] === 0) emptySlots.push(i);
  }

  // 生成 count 对棋子（每对2个）
  for (let i = 0; i < count && emptySlots.length >= 2; i++) {
    // 从空位列表中随机选一个
    const idx1 = Math.floor(Math.random() * emptySlots.length);
    const m = emptySlots[idx1];
    emptySlots.splice(idx1, 1); // 移除已选位置

    // 棋子编码 = 皮肤索引 * 13 + 棋子类型(1~12)
    const skinIndex = randomInt(Math.min(16, Math.floor((count - 1) / 4) + 1));
    const pieceType = 1 + randomInt(12); // 1~12
    const chess = skinIndex * 13 + pieceType;
    squares[m] = chess;

    // 再从剩余空位中随机选一个放配对
    const idx2 = Math.floor(Math.random() * emptySlots.length);
    const m2 = emptySlots[idx2];
    emptySlots.splice(idx2, 1);
    squares[m2] = chess;
  }

  return true;
}

/* ---------- 点击处理 ---------- */
function handleTap(e) {
  if (!isEnabled || !isRunning) return;

  const sq = e.target.closest('.square');
  if (!sq) return;

  const idx = parseInt(sq.dataset.index);
  if (idx === selectedSquare || squares[idx] === 0) return;

  // 翻开被点击的棋子
  const skinIndex = Math.floor(squares[idx] / 13);
  const pieceType = squares[idx] % 13; // 1-12

  let delay = 0;

  if (selectedSquare === -1) {
    // 第一次点击：选中
    selectedSquare = idx;
    playSound('check');
    renderBoard();
  } else if (squares[selectedSquare] !== squares[idx]) {
    // 两棋子不同：配对失败
    selectedSquare = -1;
    delay = 1000;
    playSound('illegal');

    // 翻开当前棋子并显示摇晃动画
    const pieceEl = sq.querySelector('.piece');
    if (pieceEl) {
      const img = pieceEl.querySelector('img');
      if (img) img.src = skinPieceUrl(skinIndex, pieceType);
      pieceEl.classList.remove('face-down');
      pieceEl.classList.add('face-up', 'shake');
    }

    isEnabled = false;
    setTimeout(() => {
      isEnabled = true;
      renderBoard();
    }, delay);
  } else {
    // 两棋子相同：配对成功
    squares[selectedSquare] = 0;
    squares[idx] = 0;
    selectedSquare = -1;
    score += 1;
    addTime();
    delay = 200;
    playSound('capture');

    GameShell.updateScore(score);

    isEnabled = false;
    setTimeout(() => {
      isEnabled = true;
      if (checkLevelFinish()) {
        // 新一轮
      }
      renderBoard();
    }, delay);
  }
}

/* ---------- 计时 ---------- */
function addTime() {
  timeLeft += TIME_ADD;
  if (timer) timer.addTime(TIME_ADD);
  updateTimerDisplay(timerEl, timeLeft);
}

function startClock() {
  if (timer) timer.stop();
  timer = createTimer({
    initialTime: INITIAL_TIME,
    onTick(t) {
      timeLeft = t;
      updateTimerDisplay(timerEl, timeLeft);
    },
    onTimeout() {
      gameOver();
    }
  });
  isRunning = true;
  if (timerEl) timerEl.classList.remove('timer-red', 'timer-gray');
  updateTimerDisplay(timerEl, timeLeft);
  timer.start();
}

function stopClock() {
  if (timer) timer.stop();
}

/* ---------- 游戏结束 ---------- */
function gameOver() {
  if (!isRunning) return;

  isEnabled = false;
  isRunning = false;
  stopClock();
  playSound('timeout');

  if (timerEl) {
    timerEl.classList.remove('timer-red');
    timerEl.classList.add('timer-gray');
  }

  setTimeout(() => {
    GameShell.gameOver(score);
  }, 500);
}

/* ---------- 初始化 ---------- */
function initGame() {
  score = 0;
  count = 1;
  squares = new Array(64).fill(0);
  selectedSquare = -1;
  isEnabled = true;

  GameShell.updateScore(score);

  checkLevelFinish();
  renderBoard();
  attachBoardEvents();
  startClock();
}

/* ---------- 事件绑定 ---------- */
function attachBoardEvents() {
  if (areSquareEventsBound) return;
  areSquareEventsBound = true;
  boardEl.addEventListener('click', handleTap);
}

/* ---------- 启动 ---------- */
GameShell.init({
  title: '翻翻乐',
  storageKey: 'keepLookHighScore',
  rulesText: '点击隐藏的棋子以揭示其真面，连续揭示两个相同样式的棋子，则消除这对棋子并获得1分。时间结束前，配对并消除更多的棋子以获得尽可能多的分数。游戏难度会随着获得分数的增加而提升！',
  onInit: initGame,
  onRestart: initGame,
});
