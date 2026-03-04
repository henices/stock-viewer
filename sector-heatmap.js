;(function($, undefined) {
	'use strict';

	// ======================================================
	// 板块热力图 - 使用腾讯证券行业排行接口
	// API: proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank
	// 返回申万一级行业(31个)的实时涨跌数据
	// ======================================================

	var API_URL = 'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank';

	// 行业名称缩写映射 (用于热力图格子显示)
	var SHORT_NAMES = {
		'农林牧渔': '农牧', '基础化工': '化工', '钢铁': '钢铁',
		'有色金属': '有色', '电子': '电子', '家用电器': '家电',
		'食品饮料': '食饮', '纺织服饰': '纺织', '轻工制造': '轻工',
		'医药生物': '医药', '公用事业': '公用', '交通运输': '交运',
		'房地产': '地产', '商贸零售': '商贸', '社会服务': '社服',
		'综合': '综合', '建筑材料': '建材', '建筑装饰': '建装',
		'电力设备': '电设', '国防军工': '军工', '计算机': '计算机',
		'传媒': '传媒', '通信': '通信', '银行': '银行',
		'非银金融': '非银', '汽车': '汽车', '机械设备': '机械',
		'煤炭': '煤炭', '石油石化': '石化', '环保': '环保',
		'美容护理': '美护'
	};

	var sectorTimer = null;
	var isActive    = false;
	var canvas, ctx;
	var DPR = window.devicePixelRatio || 1;
	var cellRects   = [];
	var sectorData  = [];    // API返回的行业列表
	var hoveredIdx  = -1;
	var weightMode  = 'volume'; // 'equal' | 'volume'

	/* ========== 颜色映射 ========== */
	function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

	function rateToColors(rate) {
		if (isNaN(rate)) return { bg: '#c5c0b8', text: '#8c8880' };
		var abs = Math.abs(rate);
		var t   = Math.min(abs / 4, 1);
		if (rate > 0) {
			var r = lerp(235, 160, t);
			var g = lerp(160, 22, t);
			var b = lerp(155, 28, t);
			return { bg: 'rgb('+r+','+g+','+b+')', text: t > 0.25 ? '#fff' : '#8b2020' };
		} else if (rate < 0) {
			var r = lerp(160, 10, t);
			var g = lerp(225, 130, t);
			var b = lerp(160, 10, t);
			return { bg: 'rgb('+r+','+g+','+b+')', text: t > 0.25 ? '#fff' : '#1a5a1a' };
		}
		return { bg: '#c5c0b8', text: '#8c8880' };
	}

	/* ========== Squarified Treemap ========== */
	function worstRatio(row, sideLen) {
		if (!row.length || sideLen <= 0) return Infinity;
		var s = 0;
		for (var i = 0; i < row.length; i++) s += row[i];
		var worst = 0;
		for (var i = 0; i < row.length; i++) {
			var r1 = (sideLen * sideLen * row[i]) / (s * s);
			var r2 = (s * s) / (sideLen * sideLen * row[i]);
			if (Math.max(r1, r2) > worst) worst = Math.max(r1, r2);
		}
		return worst;
	}

	function squarify(items, rect) {
		var results = [];
		_sq(items.slice(), rect, results);
		return results;
	}

	function _sq(items, rect, results) {
		if (!items.length || rect.w <= 0 || rect.h <= 0) return;
		if (items.length === 1) {
			results.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, item: items[0] });
			return;
		}
		var totalVal = 0;
		for (var i = 0; i < items.length; i++) totalVal += items[i].value;
		if (totalVal <= 0) return;
		var totalArea = rect.w * rect.h;
		var areas = [];
		for (var i = 0; i < items.length; i++) areas.push(items[i].value / totalVal * totalArea);
		var vertical = rect.w >= rect.h;
		var sideLen  = vertical ? rect.h : rect.w;
		var row = [], rowArea = [], bestWorst = Infinity, splitAt = 0;
		for (var i = 0; i < areas.length; i++) {
			var testRow = rowArea.concat(areas[i]);
			var w = worstRatio(testRow, sideLen);
			if (w <= bestWorst) {
				bestWorst = w;
				row.push(items[i]);
				rowArea.push(areas[i]);
				splitAt = i + 1;
			} else break;
		}
		var rowSum = 0;
		for (var i = 0; i < rowArea.length; i++) rowSum += rowArea[i];
		if (vertical) {
			var stripW = rowSum / rect.h, y = rect.y;
			for (var i = 0; i < row.length; i++) {
				var cellH = rowArea[i] / stripW;
				results.push({ x: rect.x, y: y, w: stripW, h: cellH, item: row[i] });
				y += cellH;
			}
			_sq(items.slice(splitAt), { x: rect.x + stripW, y: rect.y, w: rect.w - stripW, h: rect.h }, results);
		} else {
			var stripH = rowSum / rect.w, x = rect.x;
			for (var i = 0; i < row.length; i++) {
				var cellW = rowArea[i] / stripH;
				results.push({ x: x, y: rect.y, w: cellW, h: stripH, item: row[i] });
				x += cellW;
			}
			_sq(items.slice(splitAt), { x: rect.x, y: rect.y + stripH, w: rect.w, h: rect.h - stripH }, results);
		}
	}

	/* ========== Canvas ========== */
	function initCanvas() {
		canvas = document.getElementById('heatmap-canvas');
		if (!canvas) return;
		ctx = canvas.getContext('2d');
		resizeCanvas();
	}

	function resizeCanvas() {
		var container = document.getElementById('heatmap-container');
		if (!container || !canvas) return;
		var w = container.clientWidth || 596, h = 380;
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';
		canvas.width = w * DPR;
		canvas.height = h * DPR;
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
	}

	function render() {
		if (!ctx) return;
		var w = canvas.width / DPR, h = canvas.height / DPR, pad = 1;
		ctx.clearRect(0, 0, w, h);

		if (!sectorData.length) return;

		var items = [];
		for (var i = 0; i < sectorData.length; i++) {
			var sec = sectorData[i];
			var rate     = parseFloat(sec.zdf) || 0;
			var turnover = parseFloat(sec.turnover) || 1;
			var ltsz     = parseFloat(sec.ltsz) || 1;

			var weight = 1;
			if (weightMode === 'volume') {
				weight = turnover;       // 成交额加权
			} else if (weightMode === 'mktcap') {
				weight = ltsz;           // 流通市值加权
			}

			items.push({
				idx:      i,
				code:     sec.code,
				name:     sec.name,
				short:    SHORT_NAMES[sec.name] || sec.name.substring(0, 2),
				rate:     rate,
				zxj:      sec.zxj,
				zd:       sec.zd,
				turnover: turnover,
				ltsz:     sec.ltsz,
				zsz:      sec.zsz,
				lzg:      sec.lzg,
				zljlr:    sec.zljlr,
				zgb:      sec.zgb,
				value:    weight
			});
		}

		items.sort(function(a, b) { return b.value - a.value; });

		var rects = squarify(items, { x: 0, y: 0, w: w, h: h });
		cellRects = [];

		for (var i = 0; i < rects.length; i++) {
			var r = rects[i], d = r.item;
			var colors = rateToColors(d.rate);
			var rx = r.x + pad, ry = r.y + pad, rw = r.w - pad * 2, rh = r.h - pad * 2;
			if (rw <= 0 || rh <= 0) continue;
			cellRects.push({ x: rx, y: ry, w: rw, h: rh, data: d });
			var isHover = (d.idx === hoveredIdx);

			ctx.fillStyle = colors.bg;
			if (isHover) ctx.globalAlpha = 0.85;
			roundRect(ctx, rx, ry, rw, rh, 3);
			ctx.fill();
			ctx.globalAlpha = 1;

			if (isHover) {
				ctx.strokeStyle = '#2c2a26'; ctx.lineWidth = 1.5;
				roundRect(ctx, rx, ry, rw, rh, 3); ctx.stroke();
			}

			ctx.fillStyle = colors.text;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			var cx = rx + rw / 2, cy = ry + rh / 2;
			var rateStr = d.rate > 0 ? '+' + d.rate.toFixed(2) + '%' :
			              d.rate < 0 ? d.rate.toFixed(2) + '%' : '0.00%';

			if (rw > 55 && rh > 44) {
				ctx.font = 'bold 13px -apple-system, "Noto Sans SC", sans-serif';
				ctx.fillText(d.short, cx, cy - 10);
				ctx.font = '11px -apple-system, "Noto Sans SC", sans-serif';
				ctx.fillText(rateStr, cx, cy + 8);
			} else if (rw > 38 && rh > 30) {
				ctx.font = 'bold 11px -apple-system, "Noto Sans SC", sans-serif';
				ctx.fillText(d.short, cx, cy - 7);
				ctx.font = '10px -apple-system, sans-serif';
				ctx.fillText(rateStr, cx, cy + 7);
			} else if (rw > 28 && rh > 18) {
				ctx.font = 'bold 10px -apple-system, "Noto Sans SC", sans-serif';
				ctx.fillText(d.short, cx, cy);
			}
		}
	}

	function roundRect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	}

	/* ========== Tooltip ========== */
	function showTooltip(cell, mouseX, mouseY) {
		var $tip = $('#heatmap-tooltip');
		var d = cell.data;
		var rateStr = d.rate > 0 ? '+' + d.rate.toFixed(2) + '%' :
		              d.rate < 0 ? d.rate.toFixed(2) + '%' : '0.00%';
		var cls = d.rate > 0 ? 'tip-increase' : d.rate < 0 ? 'tip-reduce' : 'tip-flat';

		// 主力净流入格式化
		var zljlr = parseFloat(d.zljlr) || 0;
		var zljlrStr = (zljlr >= 0 ? '+' : '') + (zljlr / 10000).toFixed(2) + '亿';
		var zljlrCls = zljlr >= 0 ? 'tip-increase' : 'tip-reduce';

		// 领涨股
		var lzgStr = '';
		if (d.lzg && d.lzg.name) {
			var lzgCls = parseFloat(d.lzg.zdf) >= 0 ? 'tip-increase' : 'tip-reduce';
			lzgStr = '<div class="hm-tip-row"><span>领涨:</span><span class="' + lzgCls + '">' +
				d.lzg.name + ' ' + (parseFloat(d.lzg.zdf) > 0 ? '+' : '') + d.lzg.zdf + '%</span></div>';
		}

		$tip.html(
			'<div class="hm-tip-name">' + d.name + '</div>' +
			'<div class="hm-tip-row"><span>指数:</span><span class="' + cls + '">' + d.zxj + '</span></div>' +
			'<div class="hm-tip-row"><span>涨跌:</span><span class="' + cls + '">' +
				(parseFloat(d.zd) > 0 ? '+' : '') + parseFloat(d.zd).toFixed(2) + '</span></div>' +
			'<div class="hm-tip-row"><span>涨幅:</span><span class="' + cls + '">' + rateStr + '</span></div>' +
			'<div class="hm-tip-row"><span>主力:</span><span class="' + zljlrCls + '">' + zljlrStr + '</span></div>' +
			lzgStr
		);

		var container = document.getElementById('heatmap-container');
		var cW = container.clientWidth;
		var cH = container.clientHeight;

		// 先显示到屏幕外以便测量真实尺寸
		$tip.css({ left: -9999, top: -9999 }).show();
		var tipW = $tip.outerWidth();
		var tipH = $tip.outerHeight();

		// 优先显示在鼠标右侧, 放不下则左侧
		var left = mouseX + 12;
		if (left + tipW > cW) left = mouseX - tipW - 8;
		if (left < 0) left = 4;

		// 优先垂直居中于鼠标, 放不下则向上调整
		var top = mouseY - tipH / 2;
		if (top + tipH > cH) top = cH - tipH - 4;
		if (top < 0) top = 4;

		$tip.css({ left: left, top: top });
	}

	function hideTooltip() { $('#heatmap-tooltip').hide(); }

	/* ========== 交互 ========== */
	function hitTest(mx, my) {
		for (var i = 0; i < cellRects.length; i++) {
			var r = cellRects[i];
			if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return i;
		}
		return -1;
	}

	function setupInteraction() {
		if (!canvas) return;

		$(canvas).on('mousemove', function(e) {
			var rect = canvas.getBoundingClientRect();
			var mx = e.clientX - rect.left, my = e.clientY - rect.top;
			var idx = hitTest(mx, my);
			if (idx !== -1) {
				canvas.style.cursor = 'pointer';
				var cell = cellRects[idx];
				if (cell.data.idx !== hoveredIdx) { hoveredIdx = cell.data.idx; render(); }
				showTooltip(cell, mx, my);
			} else {
				canvas.style.cursor = 'default';
				if (hoveredIdx !== -1) { hoveredIdx = -1; render(); }
				hideTooltip();
			}
		});

		$(canvas).on('mouseleave', function() { hoveredIdx = -1; render(); hideTooltip(); });

		$(canvas).on('click', function(e) {
			var rect = canvas.getBoundingClientRect();
			var mx = e.clientX - rect.left, my = e.clientY - rect.top;
			var idx = hitTest(mx, my);
			if (idx !== -1) {
				var code = cellRects[idx].data.code;
				var name = cellRects[idx].data.name;
				window.open('https://stockapp.finance.qq.com/mstats/#mod=list&id=' + code +
					'&typename=' + encodeURIComponent(name) + '&sign=web', '_blank');
			}
		});

		$('#heatmap-weight-toggle').on('click', function() {
			if (weightMode === 'equal') {
				weightMode = 'volume';
				$(this).text('成交额加权');
			} else if (weightMode === 'volume') {
				weightMode = 'mktcap';
				$(this).text('市值加权');
			} else {
				weightMode = 'equal';
				$(this).text('等权');
			}
			render();
		});
	}

	/* ========== 数据请求 ========== */
	function fetchSectorData(callback) {
		var ts = +new Date();
		var url1 = API_URL + '?board_type=hy&sort_type=price&direct=down&offset=0&count=31&_t=' + ts;
		var url2 = API_URL + '?board_type=hy&sort_type=price&direct=down&offset=20&count=20&_t=' + ts;

		// 先请求第一页（count=31，尝试一次拿全）
		doFetch(url1, function(list1, total) {
			if (list1.length >= total) {
				// 一次拿全了
				console.log('[Heatmap] fetched ' + list1.length + '/' + total + ' sectors (single page)');
				callback(list1);
			} else {
				// API 限制了返回数量，需要第二页补充
				console.log('[Heatmap] page1 got ' + list1.length + '/' + total + ', fetching page2...');
				doFetch(url2, function(list2) {
					// 去重合并
					var codeSet = {};
					var merged = [];
					list1.concat(list2).forEach(function(item) {
						if (!codeSet[item.code]) {
							codeSet[item.code] = true;
							merged.push(item);
						}
					});
					console.log('[Heatmap] merged ' + merged.length + '/' + total + ' sectors');
					callback(merged);
				});
			}
		});
	}

	function doFetch(url, callback) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					try {
						var json = JSON.parse(xhr.responseText);
						if (json.code === 0 && json.data && json.data.rank_list) {
							callback(json.data.rank_list, json.data.total || 0);
						} else {
							console.warn('[Heatmap] API error:', json.code, json.msg);
							callback([], 0);
						}
					} catch (e) {
						console.error('[Heatmap] JSON parse error:', e);
						callback([], 0);
					}
				} else {
					console.error('[Heatmap] HTTP error:', xhr.status);
					callback([], 0);
				}
			}
		};
		xhr.onerror = function() {
			console.error('[Heatmap] network error - check manifest.json host_permissions');
			callback([], 0);
		};
		xhr.send(null);
	}

	/* ========== 刷新 ========== */
	function refresh() {
		fetchSectorData(function(list) {
			if (list.length) {
				sectorData = list;
			}
			$('#heatmap-loading').hide();
			render();
			updateTime();
		});
	}

	function updateTime() {
		var now = new Date();
		function pad(n) { return n < 10 ? '0' + n : '' + n; }
		$('#heatmap-update-time').text('更新时间: ' +
			now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' +
			pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()));
	}

	function startAutoRefresh() {
		if (sectorTimer) return;
		refresh();
		sectorTimer = setInterval(function() { if (isActive) refresh(); }, 8000);
	}

	function stopAutoRefresh() {
		if (sectorTimer) { clearInterval(sectorTimer); sectorTimer = null; }
	}

	/* ========== Public API ========== */
	window.SectorHeatmap = {
		init: function() { initCanvas(); setupInteraction(); render(); },
		activate: function() { isActive = true; resizeCanvas(); startAutoRefresh(); },
		deactivate: function() { isActive = false; stopAutoRefresh(); }
	};

})(jQuery);
