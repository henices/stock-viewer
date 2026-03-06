;(function($, undefined) {
	'use strict';

	// ======================================================
	// 板块热力图 - 申万一级/二级行业
	// API: proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank
	// 一级: board_type=hy  (31个行业)
	// 二级: board_type=hy2 (124个行业)
	// ======================================================

	var API_URL = 'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank';


	// 行业名称缩写映射
	// 策略: 去掉Ⅱ后缀 → ≤4字原样保留 → 5字以上查此表缩写
	// 渲染时小格子会自动 substring(0,2) 截取两字
	var SHORT_NAMES = {
		// ====== 一级行业 (31) - 缩写为2字 ======
		'农林牧渔': '农牧', '基础化工': '化工', '有色金属': '有色',
		'家用电器': '家电', '食品饮料': '食饮', '纺织服饰': '纺织',
		'轻工制造': '轻工', '医药生物': '医药', '公用事业': '公用',
		'交通运输': '交运', '商贸零售': '商贸', '社会服务': '社服',
		'建筑材料': '建材', '建筑装饰': '建装', '电力设备': '电设',
		'国防军工': '军工', '非银金融': '非银', '机械设备': '机械',
		'石油石化': '石化', '美容护理': '美护',

		// ====== 二级 - 仅5字以上需要缩写 ======
		// 农林牧渔
		'农产品加工': '农产加工',
		// 化工
		'其他化学制品': '其他化制', '非金属材料': '非金属材',
		// 有色金属
		'金属新材料': '金属新材',
		// 电子
		'光学光电子': '光电子',
		// 食品饮料
		'调味发酵品': '调味发酵',
		// 商贸零售
		'商业物业经营': '物业经营', '互联网电商': '互联电商',
		// 社会服务
		'旅游及景区': '旅游景区',
		// 房地产
		'房地产开发': '房产开发', '房地产服务': '房产服务',
		// 电力设备
		'其他电源设备': '电源设备', '自动化设备': '自动化',
		// 计算机
		'计算机设备': '计算机',
		// 银行
		'国有大型银行': '国有大行', '股份制银行': '股份银行',
		// 汽车
		'汽车零部件': '汽零部件', '摩托车及其他': '摩托车',
		// 石油石化
		'炼化及贸易': '炼化贸易'
	};

	/* ========== 名称缩写 ========== */
	function getShortName(name) {
		// 去掉末尾 Ⅱ/II 后缀
		var clean = name.replace(/Ⅱ$/, '').replace(/II$/, '');
		// 优先查表
		if (SHORT_NAMES[clean]) return SHORT_NAMES[clean];
		if (SHORT_NAMES[name]) return SHORT_NAMES[name];
		// ≤4字直接保留
		if (clean.length <= 4) return clean;
		// 5字以上: 取前4字
		return clean.substring(0, 4);
	}

	var sectorTimer = null;
	var isActive    = false;
	var canvas, ctx;
	var DPR = window.devicePixelRatio || 1;
	var cellRects   = [];
	var sectorData  = [];
	var hoveredIdx  = -1;
	var weightMode  = 'volume';   // 'equal' | 'volume' | 'mktcap'
	var levelMode   = 'hy';       // 'hy' (一级) | 'hy2' (二级)

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

	// 一级/二级的 popup 尺寸配置
	var LAYOUT = {
		hy:  { bodyW: 620, mapH: 380 },
		hy2: { bodyW: 780, mapH: 460 }
	};

	function applyLayout() {
		var cfg = LAYOUT[levelMode] || LAYOUT.hy;
		document.body.style.width = cfg.bodyW + 'px';
		$('#heatmap-container').css('height', cfg.mapH + 'px');
	}

	function resizeCanvas() {
		var container = document.getElementById('heatmap-container');
		if (!container || !canvas) return;
		var cfg = LAYOUT[levelMode] || LAYOUT.hy;
		var h = cfg.mapH;
		var expectedW = cfg.bodyW - 12;  // pane padding: 6px × 2
		// 用容器实际宽度, reflow 前可能还是旧值则用配置值
		var w = container.clientWidth;
		if (!w || Math.abs(w - expectedW) > 30) w = expectedW;
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';
		canvas.width = w * DPR;
		canvas.height = h * DPR;
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
	}

	// applyLayout 后延迟重刷 canvas 尺寸，确保 reflow 完成
	function layoutAndResize() {
		applyLayout();
		resizeCanvas();
		setTimeout(function() { resizeCanvas(); render(); }, 300);
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
			if (weightMode === 'volume') weight = turnover;
			else if (weightMode === 'mktcap') weight = ltsz;

			// 开平方根压缩权重差异, 避免大行业占满、小行业挤角落
			if (weight > 1) weight = Math.sqrt(weight);

			items.push({
				idx:      i,
				code:     sec.code,
				name:     sec.name,
				short:    getShortName(sec.name),
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

		var isLevel2 = (levelMode === 'hy2');

		for (var i = 0; i < rects.length; i++) {
			var r = rects[i], d = r.item;
			var colors = rateToColors(d.rate);
			var rx = r.x + pad, ry = r.y + pad, rw = r.w - pad * 2, rh = r.h - pad * 2;
			if (rw <= 0 || rh <= 0) continue;
			cellRects.push({ x: rx, y: ry, w: rw, h: rh, data: d });
			var isHover = (d.idx === hoveredIdx);

			ctx.fillStyle = colors.bg;
			if (isHover) ctx.globalAlpha = 0.85;
			roundRect(ctx, rx, ry, rw, rh, isLevel2 ? 2 : 3);
			ctx.fill();
			ctx.globalAlpha = 1;

			if (isHover) {
				ctx.strokeStyle = '#2c2a26'; ctx.lineWidth = 1.5;
				roundRect(ctx, rx, ry, rw, rh, isLevel2 ? 2 : 3); ctx.stroke();
			}

			ctx.fillStyle = colors.text;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			var cx = rx + rw / 2, cy = ry + rh / 2;
			var rateStr = d.rate > 0 ? '+' + d.rate.toFixed(2) + '%' :
			              d.rate < 0 ? d.rate.toFixed(2) + '%' : '0.00%';
			var shortRate = d.rate > 0 ? '+' + d.rate.toFixed(1) + '%' :
			                d.rate < 0 ? d.rate.toFixed(1) + '%' : '0.0%';
			var FONT = '-apple-system, "Noto Sans SC", sans-serif';

			// 根据格子大小自适应: 名称 + 涨幅, 名称放不下则换行
			if (rw > 58 && rh > 44) {
				drawLabel(13, rw - 6, 11, rateStr, 10);
			} else if (rw > 44 && rh > 34) {
				drawLabel(11, rw - 4, 10, shortRate, 8);
			} else if (rw > 32 && rh > 26) {
				// 小格子: 2字 + 涨幅
				ctx.font = 'bold 10px ' + FONT;
				ctx.fillText(d.short.substring(0, 2), cx, cy - 5);
				ctx.font = '9px ' + FONT;
				ctx.fillText(shortRate, cx, cy + 6);
			} else if (rw > 20 && rh > 16) {
				ctx.font = 'bold 9px ' + FONT;
				ctx.fillText(d.short.substring(0, 2), cx, cy);
			}

			// 绘制名称(支持换行) + 涨幅
			function drawLabel(nameFontSize, maxW, rateFontSize, rateText, gap) {
				var nameFont = 'bold ' + nameFontSize + 'px ' + FONT;
				var rateFont = rateFontSize + 'px ' + FONT;
				ctx.font = nameFont;
				var tw = ctx.measureText(d.short).width;

				if (tw <= maxW) {
					// 单行放得下
					ctx.font = nameFont;
					ctx.fillText(d.short, cx, cy - gap);
					ctx.font = rateFont;
					ctx.fillText(rateText, cx, cy + gap);
				} else if (d.short.length >= 4 && rh > 40) {
					// 放不下且名称≥4字: 拆成两行
					var half = Math.ceil(d.short.length / 2);
					var line1 = d.short.substring(0, half);
					var line2 = d.short.substring(half);
					var lineH = nameFontSize + 1;
					ctx.font = nameFont;
					ctx.fillText(line1, cx, cy - lineH - 1);
					ctx.fillText(line2, cx, cy - 1);
					ctx.font = rateFont;
					ctx.fillText(rateText, cx, cy + lineH);
				} else {
					// 截短到放得下
					var label = d.short;
					for (var n = d.short.length - 1; n >= 2; n--) {
						label = d.short.substring(0, n);
						if (ctx.measureText(label).width <= maxW) break;
					}
					ctx.font = nameFont;
					ctx.fillText(label, cx, cy - gap);
					ctx.font = rateFont;
					ctx.fillText(rateText, cx, cy + gap);
				}
			}
			// 更小的格子纯色块
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

		var zljlr = parseFloat(d.zljlr) || 0;
		var zljlrStr = (zljlr >= 0 ? '+' : '') + (zljlr / 10000).toFixed(2) + '亿';
		var zljlrCls = zljlr >= 0 ? 'tip-increase' : 'tip-reduce';

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
		$tip.css({ left: -9999, top: -9999 }).show();
		var tipW = $tip.outerWidth();
		var tipH = $tip.outerHeight();
		var left = mouseX + 12;
		if (left + tipW > cW) left = mouseX - tipW - 8;
		if (left < 0) left = 4;
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

		$('#heatmap-level-toggle').on('click', function() {
			// 切换一级/二级
			if (levelMode === 'hy') {
				levelMode = 'hy2';
				$(this).text('切换一级');
				$('#heatmap-level-label').text('申万二级(124)');
			} else {
				levelMode = 'hy';
				$(this).text('切换二级');
				$('#heatmap-level-label').text('申万一级(31)');
			}
			// 调整 popup 尺寸
			layoutAndResize();
			// 清空旧数据，立即刷新
			sectorData = [];
			$('#heatmap-loading').show();
			stopAutoRefresh();
			startAutoRefresh();
		});
	}

	/* ========== 数据请求 ========== */

	/**
	 * 分页拉取全部行业数据
	 * 一级(31个): 通常1-2页
	 * 二级(124个): 需要7页(每页20)
	 */
	function fetchSectorData(callback) {
		var pageSize = 50;   // 尝试一次拉50条，减少请求次数
		var ts = +new Date();

		// 第一页
		var url1 = API_URL + '?board_type=' + levelMode +
			'&sort_type=price&direct=down&offset=0&count=' + pageSize + '&_t=' + ts;

		doFetch(url1, function(list1, total) {
			if (!total || list1.length >= total) {
				// 一次拿全了
				console.log('[Heatmap] ' + levelMode + ': fetched ' + list1.length + '/' + total);
				callback(list1);
				return;
			}

			// 需要更多页
			console.log('[Heatmap] ' + levelMode + ': page1 got ' + list1.length + '/' + total + ', fetching remaining...');
			var allData = list1.slice();
			var remaining = total - list1.length;
			var pages = Math.ceil(remaining / pageSize);
			var completed = 0;
			var pageResults = [];

			for (var p = 0; p < pages; p++) {
				(function(offset) {
					var url = API_URL + '?board_type=' + levelMode +
						'&sort_type=price&direct=down&offset=' + offset + '&count=' + pageSize + '&_t=' + ts;
					doFetch(url, function(list) {
						pageResults.push({ offset: offset, list: list });
						completed++;
						if (completed === pages) {
							// 所有页完成，按 offset 排序合并
							pageResults.sort(function(a, b) { return a.offset - b.offset; });
							for (var j = 0; j < pageResults.length; j++) {
								allData = allData.concat(pageResults[j].list);
							}
							// 去重
							var codeSet = {};
							var merged = [];
							for (var k = 0; k < allData.length; k++) {
								if (!codeSet[allData[k].code]) {
									codeSet[allData[k].code] = true;
									merged.push(allData[k]);
								}
							}
							console.log('[Heatmap] ' + levelMode + ': merged ' + merged.length + '/' + total);
							callback(merged);
						}
					});
				})(list1.length + p * pageSize);
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
			console.error('[Heatmap] network error');
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
		activate: function() {
			isActive = true;
			layoutAndResize();
			startAutoRefresh();
		},
		deactivate: function() {
			isActive = false;
			stopAutoRefresh();
			// 切回其他 tab 时恢复默认宽度
			document.body.style.width = '620px';
			$('#heatmap-container').css('height', '380px');
		}
	};

})(jQuery);
