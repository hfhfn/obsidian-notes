
(function(){
  function bind(){
    document.querySelectorAll('.lc-wrap').forEach(function(wrap){
      if (wrap.dataset.bound) return;
      wrap.dataset.bound = '1';

      // 标签切换
      var tabs = Array.from(wrap.querySelectorAll('.lc-tab'));
      var panels = Array.from(wrap.querySelectorAll('.lc-panel'));
      tabs.forEach(function(tab){
        tab.addEventListener('click', function(){
          var idx = Number(tab.dataset.tab);
          tabs.forEach(function(t){ t.setAttribute('aria-selected', String(t === tab)); });
          panels.forEach(function(p, i){ p.hidden = (i !== idx); });
        });
      });

      // 每个面板内部分页
      panels.forEach(function(panel){
        var grids = Array.from(panel.querySelectorAll('.lc-grid'));
        if (grids.length <= 1) return;
        var prev = panel.querySelector('[data-prev]');
        var next = panel.querySelector('[data-next]');
        var info = panel.querySelector('[data-info]');
        var cur = 1;
        function show(n){
          cur = Math.max(1, Math.min(n, grids.length));
          grids.forEach(function(g, i){ g.style.display = (i === cur - 1) ? '' : 'none'; });
          if (info) info.textContent = '第 ' + cur + ' / ' + grids.length + ' 页';
          if (prev) prev.disabled = cur === 1;
          if (next) next.disabled = cur === grids.length;
        }
        if (prev) prev.addEventListener('click', function(){ show(cur - 1); });
        if (next) next.addEventListener('click', function(){ show(cur + 1); });
        show(1);
      });
    });
  }
  // ---- 站内标记 ----
  var LABELS = {
    book:  { wish: '想读', doing: '在读', done: '读过' },
    movie: { wish: '想看', doing: '在看', done: '看过' }
  };

  function paint(btn, status, progress){
    var kind = btn.getAttribute('data-kind');
    var lb = LABELS[kind] || LABELS.book;
    if (status) {
      btn.setAttribute('data-status', status);
      btn.textContent = (status === 'done' ? '✓ ' : '● ') + lb[status];
      if (progress > 0 && progress < 100) btn.textContent += ' ' + progress + '%';
    } else {
      btn.removeAttribute('data-status');
      btn.textContent = '+ 标记';
    }
  }

  function cycle(btn){
    var kind = btn.getAttribute('data-kind');
    var lb = LABELS[kind] || LABELS.book;
    var order = ['wish', 'doing', 'done'];
    var cur = btn.getAttribute('data-status');
    var idx = order.indexOf(cur);
    // 未标记 → wish → doing → done → 移除
    if (idx === -1) return { status: 'wish', progress: 0 };
    if (idx < order.length - 1) return { status: order[idx + 1], progress: 0 };
    return null;  // 已到 done，再点就是移除
  }

  async function save(btn, status, progress){
    var payload = {
      itemKey: btn.getAttribute('data-item'),
      kind: btn.getAttribute('data-kind'),
      title: btn.getAttribute('data-title'),
      cover: btn.getAttribute('data-cover') || '',
      url: btn.getAttribute('data-url') || '',
      status: status,
      progress: progress || 0
    };
    var r = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    // 401 也要把 body 读出来（含 login_required），否则无法区分
    // 「未登录」和「网络失败」，用户只看到按钮没反应。
    try { return await r.json(); } catch (e) { return { ok: false, error: 'http_' + r.status }; }
  }

  async function remove(btn){
    var key = btn.getAttribute('data-item');
    var r = await fetch('/api/collections?itemKey=' + encodeURIComponent(key), {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    return r.ok;
  }

  function bindMarks(){
    document.querySelectorAll('.lc-mark').forEach(function(btn){
      if (btn.dataset.mkBound) return;
      btn.dataset.mkBound = '1';
      btn.addEventListener('click', async function(ev){
        ev.preventDefault();
        ev.stopPropagation();

        var next = cycle(btn);
        btn.disabled = true;
        try {
          if (next === null) {
            var ok = await remove(btn);
            if (ok) {
              paint(btn, null, 0);
              syncToShelf(btn, null);
            } else alert('移除失败，请先登录');
          } else {
            var res = await save(btn, next.status, next.progress);
            if (res && res.ok) {
              paint(btn, next.status, next.progress);
              syncToShelf(btn, next.status);
            } else if (res && res.error === 'login_required') {
              // 未登录：明确告诉用户要去登录，而不是静默失败
              if (confirm('标记需要先登录，现在去登录页？')) {
                location.href = '/login';
              }
            } else {
              alert('标记失败：' + ((res && res.error) || '未知错误'));
            }
          }
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // 页面加载后拉一次用户已有标记，回填按钮状态
  async function loadMarks(){
    var btns = document.querySelectorAll('.lc-mark');
    if (!btns.length) return;
    var kind = btns[0].getAttribute('data-kind');
    try {
      var r = await fetch('/api/collections?kind=' + kind, { credentials: 'same-origin' });
      if (!r.ok) return;
      var d = await r.json();
      if (!d.authed) return;
      var map = {};
      (d.items || []).forEach(function(it){ map[it.item_key] = it; });
      btns.forEach(function(btn){
        var it = map[btn.getAttribute('data-item')];
        if (it) paint(btn, it.status, it.progress);
      });
    } catch (e) { /* 未登录静默 */ }
  }

  function initMarks(){
    bindMarks();
    loadMarks();
  }

  // ---- 标记联动顶部书架 ----
  // 页面顶部那排（在读/已读/想读/全部）就是「我的」书架，
  // 标记后把卡片插进对应分区，用户切过去就能看到，不用另开标签。
  var STATUS_TO_TAB = { wish: '想读', doing: '在读', done: '已读' };

  function bookGridFor(kind){
    // 页面上可能有多个 book-grid，取属于本库的那个
    var grids = Array.from(document.querySelectorAll('.book-grid'));
    return grids.find(function(g){ return g.getAttribute('data-for') === kind; }) || grids[0] || null;
  }

  // 标记变化后，把这张卡同步进顶部书架
  // 书架卡片的 HTML：结构和笔记卡片一致（封面 + 标题 + 作者/评分 + 信息行 + 进度），
  // 否则新标记的卡片只有标题和状态，和已有笔记卡长得完全不一样（用户截图反馈）。
  function shelfCardHtml(btn, tab){
    var kind = btn.getAttribute('data-kind');
    var title = btn.getAttribute('data-title') || '';
    var cover = btn.getAttribute('data-cover') || '';
    var url = btn.getAttribute('data-url') || '#';
    var itemKey = btn.getAttribute('data-item');

    var meta = {};
    try { meta = JSON.parse(btn.getAttribute('data-meta') || '{}'); } catch (e) {}

    var coverHtml = cover
      ? '<img class="book-cover" src="' + cover + '" alt="" loading="lazy">'
      : '<div class="book-cover book-cover-empty">无封面</div>';

    // 评分统一用 ⭐ 星星串（用户要求保留 ⭐ 显示，和笔记卡一致）
    function starStr(score){
      var s = parseFloat(score);
      if (!s || isNaN(s)) return '';
      var n = Math.round(s / 2);   // 豆瓣 10 分制 → 5 星
      return '⭐'.repeat(Math.max(1, Math.min(5, n)));
    }

    // 副标题：书 = 作者 · ⭐评分，影视 = ⭐评分 · 类型 · 地区
    var sub = '';
    if (kind === 'book') {
      var b = [];
      if (meta.author) b.push(meta.author);
      if (meta.score) b.push(starStr(meta.score) + ' ' + meta.score);
      sub = b.join(' · ');
    } else {
      var bits = [];
      if (meta.score) bits.push(starStr(meta.score) + ' ' + meta.score);
      if (meta.types && meta.types.length) bits.push(meta.types[0]);
      if (meta.regions && meta.regions.length) bits.push(meta.regions[0]);
      sub = bits.join(' · ');
    }

    // 信息行：顺序和笔记卡完全一致（同一套字段名），缺失的自动跳过。
    // 用户要求「统一显示一样的字段」，所以这里不能各写一套。
    var rows = [];
    function row(label, val){
      if (val) rows.push('<div class="info-row"><span class="label">' + label + ':</span><span>' + val + '</span></div>');
    }
    function joinArr(a){ return (a && a.length) ? a.join(' / ') : ''; }

    // 不显示「状态」行：状态由顶部标签页表达，卡片上重复是噪音。
    // 「评分」也不在这显示 —— 已用 ⭐ 放在副标题里，和笔记卡一致。
    row('年份', meta.year);
    if (kind === 'book') {
      row('作者', meta.author);
    } else {
      row('类型', joinArr(meta.types));
      row('地区', joinArr(meta.regions));
    }

    var infoHtml = rows.length ? '<div class="book-info">' + rows.join('') + '</div>' : '';

    return '<button class="shelf-remove" data-item="' + itemKey + '" title="从书架移除" aria-label="移除">×</button>' +
      '<a class="book-cover-link" href="' + url + '" target="_blank" rel="noopener">' + coverHtml + '</a>' +
      '<h3 class="book-title">' + title + '</h3>' +
      (sub ? '<div class="book-subtitle">' + sub + '</div>' : '') +
      infoHtml;
  }

  function syncToShelf(btn, status){
    var kind = btn.getAttribute('data-kind');
    var grid = bookGridFor(kind);
    if (!grid) return;

    var itemKey = btn.getAttribute('data-item');
    var tab = STATUS_TO_TAB[status] || '想读';

    // 先移除这个条目在书架里的旧卡（可能改过状态）
    grid.querySelectorAll('[data-shelf-item]').forEach(function(el){
      if (el.getAttribute('data-shelf-item') === itemKey) el.remove();
    });

    if (!status) return;  // 移除标记就不插

    var cell = document.createElement('div');
    cell.className = 'book-card';
    cell.setAttribute('data-status', tab);
    cell.setAttribute('data-shelf-item', itemKey);
    cell.setAttribute('data-item', itemKey);
    cell.innerHTML = shelfCardHtml(btn, tab);

    // 移除：点角落的 ×
    cell.querySelector('.shelf-remove').addEventListener('click', async function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      var rm = ev.currentTarget;
      rm.disabled = true;
      try {
        var r = await fetch('/api/collections?itemKey=' + encodeURIComponent(itemKey), {
          method: 'DELETE', credentials: 'same-origin'
        });
        if (r.ok) {
          cell.remove();
          document.querySelectorAll('.lc-mark[data-item="' + itemKey + '"]').forEach(function(b){
            paint(b, null, 0);
          });
        } else {
          alert('移除失败，请先登录');
          rm.disabled = false;
        }
      } catch (e) {
        alert('移除失败：' + e);
        rm.disabled = false;
      }
    });

    grid.appendChild(cell);

    // 通知顶部书架重新筛选/分页
    grid.dispatchEvent(new CustomEvent('shelf-changed', { bubbles: true }));
  }

  // 页面加载后，把用户已有的标记回填到按钮，并同步到书架
  async function hydrateMarks(){
    var btns = Array.from(document.querySelectorAll('.lc-mark'));
    if (!btns.length) return;

    var byKind = {};
    btns.forEach(function(b){
      var k = b.getAttribute('data-kind');
      (byKind[k] = byKind[k] || []).push(b);
    });

    for (var kind of Object.keys(byKind)) {
      try {
        var r = await fetch('/api/collections?kind=' + kind, { credentials: 'same-origin' });
        if (!r.ok) continue;
        var d = await r.json();
        if (!d.authed) continue;

        var map = {};
        (d.items || []).forEach(function(it){ map[it.item_key] = it; });

        byKind[kind].forEach(function(btn){
          var it = map[btn.getAttribute('data-item')];
          if (it) {
            paint(btn, it.status, it.progress);
            syncToShelf(btn, it.status);
          }
        });

        // 隐藏用户移除过的笔记卡（status=hidden）。
        // 这些卡来自笔记 frontmatter，不能删数据源，只能前端过滤。
        var hiddenKeys = {};
        (d.items || []).forEach(function(it){
          if (it.status === 'hidden') hiddenKeys[it.item_key] = 1;
        });
        Object.keys(hiddenKeys).forEach(function(key){
          document.querySelectorAll('.book-card[data-item="' + key + '"]').forEach(function(card){
            card.remove();
          });
        });
      } catch (e) { /* 未登录静默 */ }
    }
  }

  // 首次加载必须显式调用：'nav' 只在 Quartz 的 SPA 导航时触发，
  // 直接打开页面不会触发，之前漏了这行导致标记按钮完全没绑定。
  // 笔记卡上的移除按钮：始终显示。
  // 原有书籍来自笔记 frontmatter，不是用户标记加的，
  // 所以「移除」= 写一条 hidden 记录，前端把它过滤掉（跨设备生效）。
  function bindShelfRemoves(){
    document.querySelectorAll('.book-grid .shelf-remove').forEach(function(btn){
      if (btn.dataset.rmBound) return;
      btn.dataset.rmBound = '1';

      btn.addEventListener('click', async function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        var key = btn.getAttribute('data-item');
        var card = btn.closest('.book-card');
        btn.disabled = true;

        try {
          // 先尝试删除（用户自己标记的那条）
          await fetch('/api/collections?itemKey=' + encodeURIComponent(key), {
            method: 'DELETE', credentials: 'same-origin'
          });

          // 再写一条 hidden，让笔记卡本身也不显示
          var r = await fetch('/api/collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              itemKey: key,
              kind: btn.getAttribute('data-kind') || (card && card.classList.contains('book-card-wide') ? 'video' : 'book'),
              title: (card && card.querySelector('.book-title') || {}).textContent || '',
              status: 'hidden',
              progress: 0
            })
          });

          var d = null;
          try { d = await r.json(); } catch (e) {}

          if (d && d.ok) {
            if (card) card.remove();
            document.querySelectorAll('.lc-mark[data-item="' + key + '"]').forEach(function(b){
              paint(b, null, 0);
            });
          } else if (d && d.error === 'login_required') {
            alert('移除需要先登录');
            location.href = '/login';
          } else {
            alert('移除失败：' + ((d && d.error) || '未知错误'));
            btn.disabled = false;
          }
        } catch (e) {
          alert('移除失败：' + e);
          btn.disabled = false;
        }
      });
    });
  }

  // 视频卡的「👁 隐藏」：只在公开站隐藏，私有站不受影响。
  // 需要管理员权限（这个开关改的是公开站，不是个人书架）。
  function bindVideoHide(){
    document.querySelectorAll('.vid-hide').forEach(function(btn){
      if (btn.dataset.hideBound) return;
      btn.dataset.hideBound = '1';

      btn.addEventListener('click', async function(ev){
        ev.preventDefault();
        ev.stopPropagation();

        var slug = btn.getAttribute('data-slug');
        if (!slug) return;

        var nowHidden = btn.getAttribute('data-hidden') === '1';
        var next = !nowHidden;
        var msg = next
          ? '在公开站隐藏《' + (btn.closest('.book-card').querySelector('.book-title') || {}).textContent + '》？

私有站仍会显示。'
          : '恢复在公开站显示这条笔记？';
        if (!confirm(msg)) return;

        btn.disabled = true;
        try {
          var r = await fetch('/api/video-visibility', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ slug: slug, hidden: next })
          });
          var d = null;
          try { d = await r.json(); } catch (e) {}

          if (d && d.ok) {
            btn.setAttribute('data-hidden', next ? '1' : '0');
            btn.textContent = next ? '🚫' : '👁';
            btn.title = next ? '已在公开站隐藏（点击恢复）' : '在公开站隐藏这条';
            var card = btn.closest('.book-card');
            if (card) card.classList.toggle('is-hidden-public', next);
          } else if (d && d.code === 'forbidden') {
            alert('只有管理员能设置公开/隐藏');
          } else if (d && d.error === 'login_required') {
            alert('请先登录（需要管理员账号）');
            location.href = '/login';
          } else {
            alert('操作失败：' + ((d && d.error) || '未知错误'));
          }
        } catch (e) {
          alert('操作失败：' + e);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // 页面加载后回填隐藏状态
  async function hydrateVideoHide(){
    var btns = document.querySelectorAll('.vid-hide');
    if (!btns.length) return;
    try {
      var r = await fetch('/api/video-visibility', { credentials: 'same-origin' });
      if (!r.ok) return;
      var d = await r.json();
      var set = {};
      (d.hidden || []).forEach(function(s){ set[s] = 1; });
      btns.forEach(function(btn){
        var slug = btn.getAttribute('data-slug');
        if (set[slug]) {
          btn.setAttribute('data-hidden', '1');
          btn.textContent = '🚫';
          btn.title = '已在公开站隐藏（点击恢复）';
          var card = btn.closest('.book-card');
          if (card) card.classList.add('is-hidden-public');
        }
      });
    } catch (e) {}
  }

  function init(){
    bind();
    bindMarks();
    bindShelfRemoves();
    bindVideoHide();
    hydrateMarks();
    hydrateVideoHide();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('nav', init);
})();
