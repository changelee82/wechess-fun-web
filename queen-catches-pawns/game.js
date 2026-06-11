/* ===================== 皇后捉小兵 ===================== */

/* ---------- 从 GameShell 解构公共 API ---------- */
const { $, $$, FILES, RANKS, BOARD_SIZE, key, parseKey, fi, ri, inBoard, playSound, pieceSvgUrl, createPieceElement, renderBoard: renderChessBoard } = GameShell;

/* ---------- 常量 ---------- */
const ANIMATION_DURATION = 300;        // 动画时长(ms)
const BLACK_TURN_DELAY = 500;          // 黑方回合延迟(ms)
const SHAKE_DURATION = 400;            // 摇晃动画时长(ms)
const PROTECTION_AVOID_CHANCE = 0.75;  // 75%概率避免保护位置
const PROTECTION_ACCEPT_CHANCE = 0.25; // 25%概率接受保护位置
const MAX_GENERATION_ATTEMPTS = 10;    // 最大生成尝试次数
const PAWN_FORWARD_STEP = 1;           // 兵前进步数
const QUEEN_START_FILE = 'd';
const QUEEN_START_RANK = '1';
const PAWN_START_FILE = 'e';
const PAWN_START_RANK = '8';

/* ---------- 游戏状态 ---------- */
let board = {};
let score = 0;
let turn = 'w';
let animating = false;
let areSquareEventsBound = false;  // 防止重复绑定事件
let queenPos = null;               // 缓存白后位置，避免每次遍历 board

/* ---------- DOM ---------- */
const boardEl = $('#board');

/* ---------- 初始化 ---------- */
function initGame() {
  board = {};
  board[key(QUEEN_START_FILE, QUEEN_START_RANK)] = { type: 'Q', color: 'w' };
  board[key(PAWN_START_FILE, PAWN_START_RANK)] = { type: 'P', color: 'b' };
  score = 0;
  turn = 'w';
  animating = false;
  queenPos = key(QUEEN_START_FILE, QUEEN_START_RANK);
  GameShell.updateScore(score);
  renderBoard();
}

/* ---------- 渲染棋盘 ---------- */
function renderBoard() {
  renderChessBoard(boardEl, board);
  attachSquareEvents();
}

/* ---------- 事件绑定（使用事件委托，只绑定一次） ---------- */
function attachSquareEvents() {
  if (areSquareEventsBound) return;
  areSquareEventsBound = true;

  boardEl.addEventListener('mousedown', onBoardMouseDown);
  boardEl.addEventListener('touchstart', onBoardTouchStart, { passive: false });
}

function onBoardMouseDown(e) {
  if (e.button !== 0) return;
  const sq = e.target.closest('.square');
  if (!sq) return;
  handlePress(sq, e.clientX, e.clientY);
}

function onBoardTouchStart(e) {
  if (e.touches.length !== 1) return;
  const sq = e.target.closest('.square');
  if (!sq) return;
  handlePress(sq, e.touches[0].clientX, e.touches[0].clientY);
}

/* ---------- 点击处理 ---------- */
function handlePress(sq, clientX, clientY) {
  if (turn !== 'w' || animating) return;
  const k = sq.dataset.key;
  const pc = board[k];

  if (!queenPos) return;
  if (k === queenPos) return;

  const legalMoves = getQueenMoves(queenPos);
  if (legalMoves.includes(k)) {
    executeWhiteMove(queenPos, k);
  } else {
    playSound('illegal');
    shakePiece(queenPos);
  }
}

/* ---------- 棋子摇晃提示 ---------- */
function shakePiece(k) {
  const pieceEl = $(`.piece[data-key="${k}"]`, boardEl);
  if (!pieceEl) return;
  pieceEl.style.animation = `shake ${SHAKE_DURATION}ms ease-in-out`;
  setTimeout(() => { pieceEl.style.animation = ''; }, SHAKE_DURATION);
}

/* ---------- 白后合法移动 ---------- */
function getQueenMoves(k) {
  const { f, r } = parseKey(k);
  const dirs = [[1,0], [-1,0], [0,1], [0,-1], [1,1], [1,-1], [-1,1], [-1,-1]];
  const moves = [];
  for (const [df, dr] of dirs) {
    let cf = fi(f) + df;
    let cr = ri(r) + dr;
    while (cf >= 0 && cf < BOARD_SIZE && cr >= 0 && cr < BOARD_SIZE) {
      const nk = key(FILES[cf], RANKS[cr]);
      if (!board[nk]) {
        moves.push(nk);
      } else {
        if (board[nk].color === 'b') moves.push(nk);
        break;
      }
      cf += df;
      cr += dr;
    }
  }
  return moves;
}

/* ---------- 执行白后移动（带动画） ---------- */
function executeWhiteMove(from, to) {
  animating = true;
  turn = 'anim';

  const captured = board[to] ? { ...board[to] } : null;
  const queen = { ...board[from] };

  // 在当前DOM上执行动画（不先renderBoard）
  const fromSq = $(`.square[data-key="${from}"]`, boardEl);
  const toSq = $(`.square[data-key="${to}"]`, boardEl);
  const pieceEl = fromSq ? $(`.piece`, fromSq) : null;

  // 创建被吃棋子的幽灵元素
  if (captured && toSq) {
    const ghostEl = createPieceElement(captured);
    ghostEl.classList.add('captured-ghost');
    toSq.appendChild(ghostEl);
  }

  if (pieceEl && fromSq && toSq) {
    // 移除目标格子中原来的棋子（被吃掉的棋子）
    const targetPiece = $(`.piece:not(.captured-ghost)`, toSq);
    if (targetPiece) targetPiece.remove();

    // 将棋子DOM移到目标格子，然后从原位置动画滑入
    toSq.appendChild(pieceEl);
    const r1 = fromSq.getBoundingClientRect();
    const r2 = toSq.getBoundingClientRect();
    const dx = r1.left - r2.left;
    const dy = r1.top - r2.top;

    pieceEl.style.transition = 'none';
    pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
    pieceEl.offsetHeight; // 强制重绘
    pieceEl.style.transition = `transform ${ANIMATION_DURATION}ms ease`;
    pieceEl.style.transform = 'translate(0, 0)';

    setTimeout(() => {
      pieceEl.style.transition = '';
      pieceEl.style.transform = '';
      finishWhiteMove(from, to, captured, queen);
    }, ANIMATION_DURATION);
  } else {
    finishWhiteMove(from, to, captured, queen);
  }
}

function finishWhiteMove(from, to, captured, queen) {
  // 更新棋盘数据
  delete board[from];
  board[to] = queen;
  queenPos = to;

  if (captured) {
    score += 1;
    playSound('capture');
  } else {
    playSound('move_self');
  }

  GameShell.updateScore(score);
  renderBoard();
  turn = 'b';
  setTimeout(blackTurn, BLACK_TURN_DELAY);
}

/* ---------- 黑方回合 ---------- */
function blackTurn() {
  if (turn !== 'b') return;
  animating = true;

  const blackPawns = Object.entries(board)
    .filter(([_, p]) => p.color === 'b' && p.type === 'P')
    .map(([k, _]) => k)
    .sort((a, b) => {
      const pa = parseKey(a), pb = parseKey(b);
      if (pa.r !== pb.r) return pa.r - pb.r;
      return fi(pa.f) - fi(pb.f);
    });

  if (!queenPos) {
    GameShell.gameOver(score);
    return;
  }

  let eater = null;
  for (const k of blackPawns) {
    if (canPawnCaptureQueen(k, queenPos)) {
      eater = k;
      break;
    }
  }

  if (eater) {
    const to = queenPos;
    const pawn = { ...board[eater] };
    const queen = { ...board[to] };
    delete board[eater];
    board[to] = pawn;

    renderBoard();

    const toSq = $(`.square[data-key="${to}"]`, boardEl);
    if (toSq) {
      const queenEl = createPieceElement(queen);
      queenEl.classList.add('captured-ghost');
      toSq.appendChild(queenEl);
    }

    animateMoveFromTo(eater, to, () => {
      delete board[to];
      board[to] = pawn;
      renderBoard();
      playSound('check');
      GameShell.gameOver(score);
    });
    return;
  }

  const promotions = Object.entries(board).filter(([k, p]) => p.color === 'b' && p.type === 'P' && k[1] === '1');
  if (promotions.length > 0) {
    for (const [k, p] of promotions) p.type = 'Q';
    renderBoard();
    playSound('check');
    GameShell.gameOver(score);
    return;
  }

  const moves = [];
  for (const k of blackPawns) {
    const { f, r } = parseKey(k);
    const forwardR = String(r - PAWN_FORWARD_STEP);
    if (inBoard(f, forwardR) && !board[key(f, forwardR)]) {
      moves.push({ from: k, to: key(f, forwardR) });
      const pawn = { ...board[k] };
      delete board[k];
      board[key(f, forwardR)] = pawn;
    }
  }

  if (moves.length === 0) {
    finishBlackTurn();
    return;
  }

  renderBoard();

  let completed = 0;
  for (const { from, to } of moves) {
    animateMoveFromTo(from, to, () => {
      completed++;
      if (completed >= moves.length) {
        playSound('move_self');
        finishBlackTurn();
      }
    });
  }
}

function finishBlackTurn() {
  const emptyInRank8 = FILES.filter(f => !board[key(f, '8')]);
  if (emptyInRank8.length > 0) {
    let f = emptyInRank8[Math.floor(Math.random() * emptyInRank8.length)];

    // 检查该位置是否会保护斜前方第7行的兵（兵斜着吃子）
    // 比如生成在 d8，则保护 c7 和 e7 的黑兵
    const fileIdx = FILES.indexOf(f);
    const leftCol = fileIdx > 0 ? FILES[fileIdx - 1] : null;
    const rightCol = fileIdx < BOARD_SIZE - 1 ? FILES[fileIdx + 1] : null;
    const protectsRank7 = (leftCol && board[key(leftCol, '7')]?.color === 'b' && board[key(leftCol, '7')]?.type === 'P') ||
                         (rightCol && board[key(rightCol, '7')]?.color === 'b' && board[key(rightCol, '7')]?.type === 'P');
    if (protectsRank7 && emptyInRank8.length > 1) {
      const rand = Math.random();
      if (rand < PROTECTION_AVOID_CHANCE) {
        // 重新生成，排除当前列
        const otherEmpty = emptyInRank8.filter(col => col !== f);
        let newF = otherEmpty[Math.floor(Math.random() * otherEmpty.length)];
        let attempts = 0;
        while (attempts < MAX_GENERATION_ATTEMPTS) {
          const nfi = FILES.indexOf(newF);
          const nl = nfi > 0 ? FILES[nfi - 1] : null;
          const nr = nfi < BOARD_SIZE - 1 ? FILES[nfi + 1] : null;
          const np = (nl && board[key(nl, '7')]?.color === 'b' && board[key(nl, '7')]?.type === 'P') ||
                     (nr && board[key(nr, '7')]?.color === 'b' && board[key(nr, '7')]?.type === 'P');
          if (!np) break; // 不保护第7行，接受
          const rand2 = Math.random();
          if (rand2 < PROTECTION_ACCEPT_CHANCE) break; // 25%概率接受
          const remaining = otherEmpty.filter(col => col !== newF);
          if (remaining.length === 0) break;
          newF = remaining[Math.floor(Math.random() * remaining.length)];
          attempts++;
        }
        f = newF;
      }
    }

    board[key(f, '8')] = { type: 'P', color: 'b' };
    renderBoard();
  }

  turn = 'w';
  animating = false;
}

/* ---------- 黑兵能否吃白后 ---------- */
function canPawnCaptureQueen(pawnKey, queenKey) {
  const { f, r } = parseKey(pawnKey);
  const q = parseKey(queenKey);
  return (ri(q.r) === ri(r) - 1) && (Math.abs(fi(q.f) - fi(f)) === 1);
}

/* ---------- 动画系统 ---------- */
function animateMoveFromTo(from, to, onDone) {
  const toSq = $(`.square[data-key="${to}"]`, boardEl);
  if (!toSq) { if (onDone) onDone(); return; }
  const pieceEl = $(`.piece`, toSq);
  if (!pieceEl) { if (onDone) onDone(); return; }

  const fromSq = $(`.square[data-key="${from}"]`, boardEl);
  if (!fromSq) { if (onDone) onDone(); return; }

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
    if (onDone) onDone();
  }, ANIMATION_DURATION);
}

/* ---------- 启动 ---------- */
GameShell.init({
  title: '皇后捉小兵',
  storageKey: 'queenCatchesPawnsHighScore',
  rulesText: '移动皇后捉小兵，捉一个小兵得1分，小兵到达底线升变或皇后被小兵反捉游戏结束',
  onInit: initGame,
  onRestart: initGame,
});
