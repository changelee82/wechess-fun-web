/* ===================== 皇后捉小兵 ===================== */

(() => {
'use strict';

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
let queenPos = null;               // 缓存白后位置，避免每次遍历 board

/* ---------- DOM ---------- */
const boardEl = $('#board');

/* ---------- 事件管理 ---------- */
let squareEventController = null;

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

/* ---------- 事件绑定（使用 AbortController，重启时清理重建） ---------- */
function attachSquareEvents() {
  if (squareEventController) squareEventController.abort();
  squareEventController = new AbortController();
  const { signal } = squareEventController;
  boardEl.addEventListener('mousedown', onBoardMouseDown, { signal });
  boardEl.addEventListener('touchstart', onBoardTouchStart, { passive: false, signal });
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

  // 将被吃棋子标记为幽灵（不删除再创建，避免闪帧）
  if (captured && toSq) {
    const targetPiece = $(`.piece`, toSq);
    if (targetPiece) targetPiece.classList.add('captured-ghost');
  }

  if (pieceEl && fromSq && toSq) {
    // 先算偏移，设 transform 后再移动 DOM，避免闪帧
    const r1 = fromSq.getBoundingClientRect();
    const r2 = toSq.getBoundingClientRect();
    const dx = r1.left - r2.left;
    const dy = r1.top - r2.top;
    pieceEl.style.transition = 'none';
    pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
    toSq.appendChild(pieceEl);
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

/* ---------- 增量更新DOM（避免全量重建导致吃子闪烁） ---------- */
function updatePieceAfterAnimation(from, to) {
  // 移除被吃棋子的幽灵
  $$('.captured-ghost', boardEl).forEach(el => el.remove());
  // 清理目标格子中棋子的内联样式并更新data-key
  const toSq = $(`.square[data-key="${to}"]`, boardEl);
  if (toSq) {
    const pieceEl = $(`.piece`, toSq);
    if (pieceEl) {
      pieceEl.style.transition = '';
      pieceEl.style.transform = '';
      pieceEl.dataset.key = to;
    }
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
  updatePieceAfterAnimation(from, to);
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

    // 不先 renderBoard，直接在当前 DOM 上做动画
    const fromSq = $(`.square[data-key="${eater}"]`, boardEl);
    const toSq = $(`.square[data-key="${to}"]`, boardEl);
    const pieceEl = fromSq ? $(`.piece`, fromSq) : null;

    // 先更新数据
    delete board[eater];
    board[to] = pawn;

    // 将白后标记为幽灵（不删除再创建，避免闪帧）
    if (toSq) {
      const targetPiece = $(`.piece`, toSq);
      if (targetPiece) targetPiece.classList.add('captured-ghost');
    }

    if (pieceEl && fromSq && toSq) {
      // 先算偏移，再移动DOM，避免闪帧
      const r1 = fromSq.getBoundingClientRect();
      const r2 = toSq.getBoundingClientRect();
      const dx = r1.left - r2.left;
      const dy = r1.top - r2.top;
      pieceEl.style.transition = 'none';
      pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
      toSq.appendChild(pieceEl);
      pieceEl.offsetHeight;
      pieceEl.style.transition = `transform ${ANIMATION_DURATION}ms ease`;
      pieceEl.style.transform = 'translate(0, 0)';

      setTimeout(() => {
        updatePieceAfterAnimation(eater, to);
        playSound('check');
        GameShell.gameOver(score);
      }, ANIMATION_DURATION);
    } else {
      renderBoard();
      playSound('check');
      GameShell.gameOver(score);
    }
    return;
  }

  const promotions = Object.entries(board).filter(([k, p]) => p.color === 'b' && p.type === 'P' && parseKey(k).r === 1);
  if (promotions.length > 0) {
    for (const [k, p] of promotions) p.type = 'Q';
    renderBoard();
    playSound('check');
    GameShell.gameOver(score);
    return;
  }

  // 使用临时棋盘计算所有兵的移动，确保同时移动语义正确
  const tempBoard = {};
  for (const k in board) tempBoard[k] = board[k];

  const moves = [];
  for (const k of blackPawns) {
    const { f, r } = parseKey(k);
    const forwardR = String(r - PAWN_FORWARD_STEP);
    const toKey = key(f, forwardR);
    if (inBoard(f, forwardR) && !tempBoard[toKey]) {
      moves.push({ from: k, to: toKey });
      // 更新临时棋盘，使后续兵的移动计算正确
      tempBoard[toKey] = tempBoard[k];
      delete tempBoard[k];
    }
  }

  if (moves.length === 0) {
    finishBlackTurn();
    return;
  }

  // 直接移动现有DOM元素做动画，避免renderBoard全量重建导致闪烁
  // 1. 记录每个兵的旧位置和DOM元素
  const animInfos = [];
  for (const { from, to } of moves) {
    const fromSq = $(`.square[data-key="${from}"]`, boardEl);
    const pieceEl = fromSq ? $(`.piece`, fromSq) : null;
    if (pieceEl && fromSq) {
      animInfos.push({
        from, to, pieceEl,
        fromRect: fromSq.getBoundingClientRect()
      });
    }
  }

  // 2. 更新棋盘数据
  for (const { from, to } of moves) {
    board[to] = board[from];
    delete board[from];
  }

  // 3. 将棋子元素移动到新格子，并应用反向偏移（Invert）
  for (const info of animInfos) {
    const { to, pieceEl } = info;
    const toSq = $(`.square[data-key="${to}"]`, boardEl);
    if (toSq) {
      toSq.appendChild(pieceEl);
      const r2 = toSq.getBoundingClientRect();
      const dx = info.fromRect.left - r2.left;
      const dy = info.fromRect.top - r2.top;
      pieceEl.style.transition = 'none';
      pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
      pieceEl.dataset.key = to;
    }
  }

  // 4. 强制重绘后启动动画（Play）
  boardEl.offsetHeight;
  for (const { pieceEl } of animInfos) {
    pieceEl.style.transition = `transform ${ANIMATION_DURATION}ms ease`;
    pieceEl.style.transform = 'translate(0, 0)';
  }

  setTimeout(() => {
    for (const { pieceEl } of animInfos) {
      pieceEl.style.transition = '';
      pieceEl.style.transform = '';
    }
    playSound('move_self');
    finishBlackTurn();
  }, ANIMATION_DURATION);
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

    const pawnKey = key(f, '8');
    board[pawnKey] = { type: 'P', color: 'b' };
    // 只添加新兵的 DOM，不全量重建
    const sq = $(`.square[data-key="${pawnKey}"]`, boardEl);
    if (sq) {
      const pieceEl = createPieceElement({ type: 'P', color: 'b' });
      sq.appendChild(pieceEl);
    }
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

/* ---------- 启动 ---------- */
GameShell.init({
  title: '皇后捉小兵',
  storageKey: 'queenCatchesPawnsHighScore',
  rulesText: '移动皇后捉小兵，捉一个小兵得1分，小兵到达底线升变或皇后被小兵反捉游戏结束',
  onInit: initGame,
  onRestart: initGame,
});

})();
