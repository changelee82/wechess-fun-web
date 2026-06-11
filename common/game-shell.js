/* ===================== 公共游戏外壳 JS ===================== */
/* 每个游戏页面引入此文件后，调用 GameShell.init(config) 即可 */

/* ---------- 皮肤定义 ---------- */
const PIECE_SKINS = [
  'fritz',    // 0
  'uscf',     // 1
  'king',     // 2
  'leip',     // 3
  'old',      // 4
  'luce',     // 5
  'harl',     // 6
  'medieval', // 7
  'magn',     // 8
  'cond',     // 9
  'maya',     // 10
  'moti',     // 11
  'utrecht',  // 12
  'line',     // 13
  'crystals', // 14
  'mill',     // 15
];
const BLIND_SKIN = 'blind'; // 盲棋/翻翻乐专用皮肤

/* ---------- 棋子类型到编号映射（fritz 编号） ---------- */
const PIECE_NUM_MAP = { K: 1, Q: 2, R: 3, B: 4, N: 5, P: 6, k: 7, q: 8, r: 9, b: 10, n: 11, p: 12 };

const GameShell = (() => {

  /* ---------- 工具 ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  /* ---------- 默认配置 ---------- */
  const defaults = {
    title: '',               // 游戏标题
    storageKey: '',         // localStorage 最高分 key
    rulesText: '',          // 规则文字
    onInit: null,           // 初始化回调
    onRestart: null,        // 重新开始回调
    onShare: null,          // 分享回调
  };

  let config = {};
  let highScore = 0;
  let eventController = null;  // AbortController 管理事件监听器

  /* ---------- DOM 引用 ---------- */
  let scoreEl, gameOverScoreEl, highScoreEl;
  let infoModal, gameOverModal;
  let restartBtn, gameOverRestartBtn, gameOverCloseBtn, shareBtn;
  let infoBtn, modalCloseBtn;

  /* ---------- localStorage 安全操作 ---------- */
  function safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('[GameShell] localStorage 读取失败:', e);
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('[GameShell] localStorage 写入失败:', e);
      return false;
    }
  }

  /* ---------- 初始化 ---------- */
  function init(cfg) {
    config = { ...defaults, ...cfg };

    // 缓存 DOM
    scoreEl = $('#score');
    gameOverScoreEl = $('#gameOverScore');
    highScoreEl = $('#highScore');
    infoModal = $('#infoModal');
    gameOverModal = $('#gameOverModal');
    restartBtn = $('#restartBtn');
    gameOverRestartBtn = $('#gameOverRestartBtn');
    gameOverCloseBtn = $('#gameOverCloseBtn');
    shareBtn = $('#shareBtn');
    infoBtn = $('#infoBtn');
    modalCloseBtn = $('#modalCloseBtn');

    // 设置规则文字
    const modalText = $('#modalText');
    if (modalText && config.rulesText) {
      modalText.textContent = config.rulesText;
    }

    // 最高分（带错误处理）
    const stored = safeGetItem(config.storageKey);
    highScore = stored ? parseInt(stored, 10) || 0 : 0;

    // 绑定公共事件（使用 AbortController，自动清理旧监听器）
    bindEvents();

    // 预加载音效
    preloadSounds();

    // 调用游戏初始化
    if (config.onInit) config.onInit();

    // 首次打开游戏时自动弹出规则提示
    const visitedKey = config.storageKey ? config.storageKey + '_visited' : '';
    if (visitedKey && infoModal && !safeGetItem(visitedKey)) {
      safeSetItem(visitedKey, '1');
      // 延迟弹出，确保页面渲染完成
      setTimeout(() => {
        infoModal.classList.add('show');
      }, 300);
    }

    // 响应式布局计算
    setupLayout();
  }

  /* ---------- 响应式布局 ---------- */
  let _resizeHandler = null;

  function setupLayout() {
    const pageArea = document.querySelector('.page-area');
    const boardArea = document.querySelector('.board-area');
    if (!pageArea || !boardArea) return;

    // 移除旧的 resize 监听器，防止累积
    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
    }

    function calcBoardSize() {
      const pageRect = pageArea.getBoundingClientRect();
      const pw = pageRect.width;
      const ph = pageRect.height;
      // 使用页面区实际宽高判断横竖屏
      const isLandscape = pw > ph;

      // 通过CSS类控制横竖屏布局，替代@media查询
      const container = document.querySelector('.game-container');
      if (container) {
        container.classList.toggle('landscape', isLandscape);
        container.classList.toggle('portrait', !isLandscape);
      }

      if (isLandscape) {
        // 横屏：棋盘边长 = min(页面高度, 页面宽度 - 信息区最小宽度108)
        const size = Math.min(ph, pw - 108);
        boardArea.style.width = size + 'px';
        boardArea.style.height = size + 'px';
      } else {
        // 竖屏：棋盘边长 = min(页面宽度, 页面高度 - 信息区最小高度48 - 按钮区最小高度48)
        const size = Math.min(pw, ph - 96);
        boardArea.style.width = size + 'px';
        boardArea.style.height = '';
      }
    }

    _resizeHandler = calcBoardSize;
    calcBoardSize();
    window.addEventListener('resize', _resizeHandler);
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    // 清理旧的事件监听器
    if (eventController) eventController.abort();
    eventController = new AbortController();
    const { signal } = eventController;

    // 重新开始
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        if (config.onRestart) config.onRestart();
      }, { signal });
    }

    // 规则对话框
    if (infoBtn) {
      infoBtn.addEventListener('click', () => {
        infoModal.classList.add('show');
      }, { signal });
    }
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => {
        infoModal.classList.remove('show');
      }, { signal });
    }
    if (infoModal) {
      infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) infoModal.classList.remove('show');
      }, { signal });
    }

    // 游戏结束对话框
    if (gameOverCloseBtn) {
      gameOverCloseBtn.addEventListener('click', () => {
        gameOverModal.classList.remove('show');
      }, { signal });
    }
    if (gameOverRestartBtn) {
      gameOverRestartBtn.addEventListener('click', () => {
        gameOverModal.classList.remove('show');
        if (config.onRestart) config.onRestart();
      }, { signal });
    }
    if (gameOverModal) {
      gameOverModal.addEventListener('click', (e) => {
        if (e.target === gameOverModal) gameOverModal.classList.remove('show');
      }, { signal });
    }

    // 分享按钮
    if (shareBtn && config.onShare) {
      shareBtn.addEventListener('click', config.onShare, { signal });
    }
  }

  /* ---------- 公共方法 ---------- */

  // 更新分数显示
  function updateScore(val) {
    if (scoreEl) scoreEl.textContent = val + '分';
  }

  // 游戏结束
  function gameOver(score) {
    if (score > highScore) {
      highScore = score;
      safeSetItem(config.storageKey, highScore);
    }
    if (gameOverScoreEl) gameOverScoreEl.textContent = score;
    if (highScoreEl) highScoreEl.textContent = highScore;
    if (gameOverModal) gameOverModal.classList.add('show');
  }

  // 关闭游戏结束对话框
  function closeGameOver() {
    if (gameOverModal) gameOverModal.classList.remove('show');
  }

  /* ---------- 棋盘公共工具 ---------- */
  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['1','2','3','4','5','6','7','8'];
  const BOARD_SIZE = 8;

  const key = (f, r) => `${f}${r}`;
  const parseKey = k => {
    if (!k || k.length !== 2) return { f: k?.[0] || '', r: NaN };
    return { f: k[0], r: parseInt(k[1], 10) };
  };
  const fi = f => FILES.indexOf(f);
  const ri = r => RANKS.indexOf(String(r));
  const inBoard = (f, r) => fi(f) >= 0 && fi(f) < BOARD_SIZE && ri(r) >= 0 && ri(r) < BOARD_SIZE;

  /* ---------- 公共音效系统 ---------- */
  const soundCache = {};
  function playSound(name, audioEnabled = true) {
    if (!audioEnabled) return;
    if (!soundCache[name]) {
      soundCache[name] = new Audio(`../common/sounds/${name}.mp3`);
      soundCache[name].volume = 0.5;
    }
    const audio = soundCache[name];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function preloadSounds() {
    ['capture', 'check', 'illegal', 'move_self', 'timeout'].forEach(name => {
      if (!soundCache[name]) {
        soundCache[name] = new Audio(`../common/sounds/${name}.mp3`);
        soundCache[name].volume = 0.5;
      }
    });
  }

  /* ---------- 公共棋子渲染 ---------- */
  function pieceSvgUrl(p, skin) {
    const k = (p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase());
    const num = PIECE_NUM_MAP[k] || PIECE_NUM_MAP[p.type] || 1;
    const s = skin || 'fritz';
    return `../common/Chessman/${s}/${num}.svg`;
  }

  function createPieceElement(pc, boardKey, skin) {
    const pieceEl = document.createElement('div');
    pieceEl.className = 'piece';
    if (boardKey) pieceEl.dataset.key = boardKey;
    const img = document.createElement('img');
    img.src = pieceSvgUrl(pc, skin);
    img.alt = `${pc.color}${pc.type}`;
    img.draggable = false;
    pieceEl.appendChild(img);
    return pieceEl;
  }

  /* ---------- 公共棋盘渲染 ---------- */
  function renderBoard(boardEl, board, options = {}) {
    boardEl.innerHTML = '';
    const { skin, renderSquare } = options;
    for (let r = BOARD_SIZE; r >= 1; r--) {
      for (let f of FILES) {
        const k = key(f, r);
        const sq = document.createElement('div');
        const isLight = (fi(f) + ri(r)) % 2 === 0;
        sq.className = `square ${isLight ? 'light' : 'dark'}`;
        sq.dataset.key = k;

        const pc = board[k];
        if (pc) {
          if (renderSquare) {
            renderSquare(sq, k, pc, isLight);
          } else {
            sq.appendChild(createPieceElement(pc, k, skin));
          }
        }

        boardEl.appendChild(sq);
      }
    }
  }

  /* ---------- 公共计时器工具 ---------- */
  function createTimer(options = {}) {
    const { onTick, onTimeout, initialTime = 60 } = options;
    let remainingMs = initialTime * 1000;
    let startStamp = null;
    let handle = null;
    let running = false;

    function getRemainingMs() {
      if (running && startStamp) {
        return Math.max(0, remainingMs - (Date.now() - startStamp));
      }
      return Math.max(0, remainingMs);
    }

    function tick() {
      if (!running) return;
      const remainSec = getRemainingMs() / 1000;
      if (onTick) onTick(remainSec);
      if (remainSec <= 0) {
        stop();
        if (onTimeout) onTimeout();
        return;
      }
      handle = setTimeout(tick, remainSec <= 10 ? 100 : 1000);
    }

    function start() {
      running = true;
      startStamp = Date.now();
      handle = setTimeout(tick, 1000);
    }

    function stop() {
      if (running && startStamp) {
        remainingMs = getRemainingMs();
      }
      running = false;
      startStamp = null;
      if (handle) {
        clearTimeout(handle);
        handle = null;
      }
    }

    function addTime(seconds) {
      remainingMs += seconds * 1000;
    }

    function getTime() {
      return getRemainingMs() / 1000;
    }

    function reset(newTime) {
      stop();
      remainingMs = (newTime !== undefined ? newTime : initialTime) * 1000;
    }

    return { start, stop, addTime, getTime, reset };
  }

  function formatTimer(t) {
    const time = Math.max(t, 0);
    if (time < 10) {
      return time.toFixed(1);
    }
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time) % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // 更新计时器 DOM 显示（含颜色状态切换）
  function updateTimerDisplay(timerEl, timeLeft) {
    if (!timerEl) return;
    const t = Math.max(timeLeft, 0);
    timerEl.textContent = formatTimer(t);
    if (t < 10) {
      timerEl.classList.add('timer-red');
      timerEl.classList.remove('timer-gray');
    } else {
      timerEl.classList.remove('timer-red');
    }
  }

  /* ---------- 销毁 ---------- */
  function destroy() {
    if (eventController) {
      eventController.abort();
      eventController = null;
    }
    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }
  }

  return {
    init,
    updateScore,
    gameOver,
    closeGameOver,
    destroy,
    $,
    $$,
    // 公共工具
    FILES, RANKS, BOARD_SIZE,
    key, parseKey, fi, ri, inBoard,
    // 公共音效
    playSound,
    // 公共渲染
    pieceSvgUrl, createPieceElement, renderBoard,
    // 公共计时器
    createTimer, formatTimer, updateTimerDisplay,
  };

})();
