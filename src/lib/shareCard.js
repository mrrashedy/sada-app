function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(' ').reverse();
  let line = '', lines = [];
  while (words.length) {
    const word = words.pop();
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines = lines.slice(0, maxLines);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}

export async function generateShareCard(article) {
  const W = 720, H = 480;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0A0A0E');
  grad.addColorStop(0.5, '#1a1a2e');
  grad.addColorStop(1, '#0A0A0E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Accent line
  const accent = ctx.createLinearGradient(0, 0, W, 0);
  accent.addColorStop(0, '#E53935');
  accent.addColorStop(1, '#FF6F00');
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 4);

  // Source badge
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  const srcText = article.s?.n || '';
  ctx.font = '600 18px system-ui, sans-serif';
  const srcW = ctx.measureText(srcText).width + 32;
  const srcX = W - 40;
  ctx.beginPath();
  ctx.roundRect(srcX - srcW, 36, srcW, 36, 18);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(srcText, srcX - 16, 60);

  // Breaking badge
  if (article.brk) {
    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    ctx.roundRect(40, 38, 60, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('عاجل', 52, 58);
    ctx.textAlign = 'right';
  }

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px system-ui, sans-serif';
  const titleLines = wrapText(ctx, article.title || '', W - 40, 120, W - 80, 48, 5);

  // Tag
  if (article.tag && article.tag !== 'عاجل') {
    const tagY = 120 + titleLines * 48 + 16;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    const tagW = ctx.measureText(article.tag).width + 24;
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.beginPath();
    ctx.roundRect(W - 40 - tagW, tagY - 18, tagW, 28, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(article.tag, W - 52, tagY);
  }

  // Bottom bar
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, H - 60, W, 60);

  // Branding
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('صَدى', W - 40, H - 24);

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('sada-app.pages.dev', 40, H - 24);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export async function shareArticle(article) {
  try {
    const blob = await generateShareCard(article);
    const file = new File([blob], 'sada-news.png', { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: article.title,
        text: article.title,
        url: article.link,
        files: [file],
      });
      return;
    }

    if (navigator.share) {
      await navigator.share({ title: article.title, url: article.link });
      return;
    }

    // Fallback: copy link
    if (article.link) {
      await navigator.clipboard?.writeText(article.link);
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      if (article.link) navigator.clipboard?.writeText(article.link).catch(() => {});
    }
  }
}
