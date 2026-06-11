/* ===================== 跳跳马 ===================== */

const { $, $$, FILES, RANKS, BOARD_SIZE, key, parseKey, fi, ri, playSound, pieceSvgUrl, createPieceElement, renderBoard: renderChessBoard, createTimer, formatTimer, updateTimerDisplay } = GameShell;

/* ---------- 常量 ---------- */
const ANIMATION_DURATION = 200;        // 动画时长(ms)
const HORSE_START_FILE = 'e';
const HORSE_START_RANK = '4';
const PAWN_START_FILE = 'c';
const PAWN_START_RANK = '5';
const INITIAL_TIME = 60;              // 初始倒计时(秒)
const CAPTURE_BONUS_TIME = 2;         // 吃子奖励时间(秒)

/* ---------- 马的偏移量 (L形) ---------- */
const KNIGHT_OFFSETS = [
  [1, 2], [1, -2], [-1, 2], [-1, -2],
  [2, 1], [2, -1], [-2, 1], [-2, -1]
];

/* ---------- 游戏状态 ---------- */
let board = {};           // 棋盘: key -> { type, color }
let score = 0;
let round = 1;            // 当前回合数
let animating = false;
let areSquareEventsBound = false;
let timeLeft = INITIAL_TIME;  // 倒计时剩余秒数
let timer = null;             // 公共计时器实例
let horsePos = null;          // 白马当前位置缓存

/* ---------- DOM ---------- */
const boardEl = $('#board');
const timerEl = $('#timer');

/* ---------- 初始化 ---------- */
function initGame() {
  board = {};
  score = 0;
  round = 1;
  animating = false;
  timeLeft = INITIAL_TIME;
  GameShell.updateScore(score);
  updateTimerDisplay(timerEl, timeLeft);
  if (timerEl) {
    timerEl.classList.remove('timer-gray');
    timerEl.classList.remove('timer-red');
  }

  // 初始放置: 白马在 e4, 黑兵在 c5
  board[key(HORSE_START_FILE, HORSE_START_RANK)] = { type: 'N', color: 'w' };
  board[key(PAWN_START_FILE, PAWN_START_RANK)] = { type: 'P', color: 'b' };
  horsePos = key(HORSE_START_FILE, HORSE_START_RANK);

  renderBoard();
  attachSquareEvents();
  clearHighlights(horsePos);

  // 使用公共计时器
  if (timer) timer.stop();
  timer = createTimer({
    initialTime: INITIAL_TIME,
    onTick(t) {
      timeLeft = t;
      updateTimerDisplay(timerEl, timeLeft);
    },
    onTimeout() {
      playSound('timeout');
      if (timerEl) timerEl.classList.add('timer-gray');
      GameShell.gameOver(score);
    }
  });
  timer.start();
}

/* ---------- 倒计时管理 ---------- */
function clearTimerInterval() {
  if (timer) timer.stop();
}

function addBonusTime() {
  timeLeft += CAPTURE_BONUS_TIME;
  if (timer) timer.addTime(CAPTURE_BONUS_TIME);
  updateTimerDisplay(timerEl, timeLeft);
}

/* ---------- 渲染棋盘 ---------- */
function renderBoard() {
  renderChessBoard(boardEl, board);
}

/* ---------- 事件绑定（事件委托） ---------- */
function attachSquareEvents() {
  if (areSquareEventsBound) return;
  areSquareEventsBound = true;

  boardEl.addEventListener('click', onBoardClick);
}

function onBoardClick(e) {
  if (animating) return;
  const sq = e.target.closest('.square');
  if (!sq) return;
  handleSquareClick(sq);
}

/* ---------- 点击格子 ---------- */
function handleSquareClick(sq) {
  const k = sq.dataset.key;

  if (!horsePos) return;

  // 点击白马本身，不做任何反应
  if (k === horsePos) return;

  // 检查是否是合法移动
  const legalMoves = getKnightMoves(horsePos);
  if (!legalMoves.includes(k)) {
    playSound('illegal');
    shakeHorse(horsePos);
    return;
  }

  // 执行移动（音效在动画结束后播放）
  const isCapture = !!board[k] && board[k].color === 'b';
  executeMove(horsePos, k, isCapture);
}

/* ---------- 获取马的合法移动 ---------- */
function getKnightMoves(k) {
  const { f, r } = parseKey(k);
  const moves = [];
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const nf = fi(f) + df;
    const nr = ri(r) + dr;
    if (nf >= 0 && nf < BOARD_SIZE && nr >= 0 && nr < BOARD_SIZE) {
      const nk = key(FILES[nf], RANKS[nr]);
      // 马可以跳到空格或黑兵位置
      if (!board[nk] || board[nk].color === 'b') {
        moves.push(nk);
      }
    }
  }
  return moves;
}

/* ---------- 马摇晃动画 ---------- */
function shakeHorse(horseKey) {
  const horseSq = $(`.square[data-key="${horseKey}"]`, boardEl);
  const pieceEl = horseSq ? $(`.piece`, horseSq) : null;
  if (!pieceEl) return;

  pieceEl.style.animation = 'shake 0.4s ease';
  setTimeout(() => {
    pieceEl.style.animation = '';
  }, 400);
}

/* ---------- 清除高亮 ---------- */
function clearHighlights() {
  $$('.square').forEach(sq => {
    sq.classList.remove('selected', 'legal', 'capture-target');
  });
}

/* ---------- 执行移动 ---------- */
function executeMove(from, to, isCapture) {
  animating = true;

  // 先更新数据，但吃子时保留被吃棋子用于动画
  const capturedPiece = isCapture ? board[to] : null;
  const horse = { ...board[from] };

  if (isCapture) {
    score += 1;
    addBonusTime();
    GameShell.updateScore(score);
  }

  // 渲染：马在目标位置，但吃子时保留被吃棋子的DOM（幽灵）
  delete board[from];
  board[to] = horse;
  horsePos = to;
  renderBoard();

  // 吃子时，在目标格创建被吃棋子的幽灵元素
  if (isCapture && capturedPiece) {
    const toSq = $(`.square[data-key="${to}"]`, boardEl);
    if (toSq) {
      const ghostEl = createPieceElement(capturedPiece);
      ghostEl.classList.add('captured-ghost');
      toSq.appendChild(ghostEl);
    }
  }

  // 动画
  const toSq = $(`.square[data-key="${to}"]`, boardEl);
  const pieceEl = toSq ? $(`.piece:not(.captured-ghost)`, toSq) : null;
  const fromSq = $(`.square[data-key="${from}"]`, boardEl);

  if (pieceEl && fromSq && toSq) {
    const r1 = fromSq.getBoundingClientRect();
    const r2 = toSq.getBoundingClientRect();
    const dx = r1.left - r2.left;
    const dy = r1.top - r2.top;

    pieceEl.style.transition = 'none';
    pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
    pieceEl.offsetHeight;
    pieceEl.style.transition = `transform ${ANIMATION_DURATION}ms ease`;
    pieceEl.style.transform = 'translate(0, 0)';

    setTimeout(() => {
      pieceEl.style.transition = '';
      pieceEl.style.transform = '';
      finishMove(isCapture);
    }, ANIMATION_DURATION);
  } else {
    finishMove(isCapture);
  }
}

/* ---------- 移动结束处理 ---------- */
function finishMove(isCapture) {
  animating = false;

  // 吃子时，移除幽灵棋子（兵消失）
  if (isCapture) {
    $$('.captured-ghost').forEach(el => el.remove());
  }

  // 检查是否还有黑兵
  const blackPawns = Object.entries(board).filter(([_, p]) => p.color === 'b' && p.type === 'P');

  if (blackPawns.length === 0) {
    // 吃掉本轮最后一个兵
    if (isCapture) playSound('check');
    // 进入下一回合
    round += 1;
    spawnNewPawns();
  } else {
    // 显示当前合法移动
    clearHighlights();

    if (isCapture) {
      // 吃掉本轮非最后一个兵
      playSound('capture');
    } else {
      // 马走完但没吃到兵
      playSound('move_self');
    }

    // 检查是否还能吃到任何黑兵
    const legalMoves = getKnightMoves(horsePos);
    const canCaptureAny = legalMoves.some(mk => board[mk] && board[mk].color === 'b');

    if (!canCaptureAny) {
      // 无法再吃任何黑兵，但还有剩余 -> 游戏结束
      clearTimerInterval();
      if (timerEl) timerEl.classList.add('timer-gray');
      GameShell.gameOver(score);
    }
  }
}

/* ---------- 生成新黑兵 ---------- */
function spawnNewPawns() {
  const newPawns = [];
  let currentPos = horsePos;

  for (let i = 0; i < round; i++) {
    // 获取当前位置马能走到的所有位置
    const moves = getKnightMoves(currentPos);
    // 排除已放置的新兵位置
    const available = moves.filter(mk => !newPawns.includes(mk));

    if (available.length === 0) {
      // 没有可用位置，停止生成
      break;
    }

    // 随机选择一个位置
    const chosen = available[Math.floor(Math.random() * available.length)];
    newPawns.push(chosen);
    currentPos = chosen; // 下一个兵基于这个位置生成
  }

  // 放置新兵
  for (const pk of newPawns) {
    board[pk] = { type: 'P', color: 'b' };
  }

  renderBoard();
  clearHighlights();

  // 检查是否一步都吃不到（罕见情况）
  const legalMoves = getKnightMoves(horsePos);
  const canCaptureAny = legalMoves.some(mk => board[mk] && board[mk].color === 'b');
  if (!canCaptureAny && newPawns.length > 0) {
    playSound('check');
    clearTimerInterval();
    if (timerEl) timerEl.classList.add('timer-gray');
    GameShell.gameOver(score);
  }
}

/* ---------- 启动 ---------- */
GameShell.init({
  title: '跳跳马',
  storageKey: 'runRunHorseHighScore',
  rulesText: '一只快乐的跳跳马，跳着小兵快乐地前行，每跳一个小兵得1分，跳空或无子可跳游戏结束',
  onInit: initGame,
  onRestart: initGame,
});
