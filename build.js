/**
 * 构建脚本：直接复制源码到 dist/ 目录
 * 用法：node build.js
 */

const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DIST = path.join(__dirname, 'dist');

const COPY_DIRS = [
  'images',
  'common/Chessman',
  'common/sounds',
  'common',
  'eye-and-hand',
  'run-run-horse',
  'queen-catches-pawns',
  'keep-look',
];

async function main() {
  console.log('🧹 清理 dist/ ...');
  rmDir(DIST);
  console.log('📦 开始构建...\n');

  // 复制根目录文件
  for (const f of ['index.html', 'style.css']) {
    const src = path.join(SRC, f);
    if (fs.existsSync(src)) {
      const dest = path.join(DIST, f);
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    }
  }

  // 复制子目录
  for (const dir of COPY_DIRS) {
    copyDir(path.join(SRC, dir), path.join(DIST, dir));
  }

  console.log('✅ 构建完成！输出目录: dist/');
  console.log('   预览: cd dist && python3 -m http.server 8080');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

main().catch(err => {
  console.error('构建失败:', err);
  process.exit(1);
});
