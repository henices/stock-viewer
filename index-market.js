;(function($, undefined) {

	var INDEX_LIST = [
		{ key: 'sh000001', name: '上证指数', short: '上证' },
		{ key: 'sz399001', name: '深证成指', short: '深证' },
		{ key: 'sz399006', name: '创业板指', short: '创业' },
		{ key: 'sh000300', name: '沪深300', short: '沪深300' },
		{ key: 'sh000905', name: '中证500', short: '中证500' },
		{ key: 'sh000852', name: '中证1000', short: '中证1000' },
		{ key: 'hkHSI',    name: '恒生指数', short: '恒生' },
		{ key: 'hkHSTECH', name: '恒生科技指数', short: '恒科' },
		{ key: 'hkHSCEI',  name: '恒生国企指数', short: '国企' },
		{ key: 'us.DJI',   name: '道琼斯', short: '道琼斯' },
		{ key: 'us.IXIC',  name: '纳斯达克', short: '纳斯达克' },
		{ key: 'us.HXC',   name: '中国金龙', short: '金龙' }
	];

	var indexTimer = null;
	var isActive = false;

	// us.DJI 含点号，转义为下划线用于 HTML id
	function safeId(key) {
		return key.replace(/\./g, '_');
	}

	function renderSkeleton() {
		var $grid = $('#index-grid');
		var html = [];
		for (var i = 0; i < INDEX_LIST.length; i++) {
			var idx = INDEX_LIST[i];
			html.push(
				'<div class="index-card flat" id="idx-' + safeId(idx.key) + '" data-key="' + idx.key + '">' +
					'<div class="idx-name">' + idx.name + '<span class="idx-code">' + idx.key + '</span></div>' +
					'<div class="idx-loading">加载中...</div>' +
					'<div class="idx-price" style="display:none">--</div>' +
					'<div class="idx-detail" style="display:none">' +
						'<span class="idx-change">--</span>' +
						'<span class="idx-rate">--</span>' +
					'</div>' +
					'<div class="idx-extra" style="display:none">' +
						'<span class="idx-vol">成交额: --</span>&nbsp;&nbsp;' +
						'<span class="idx-amp">振幅: --</span>' +
					'</div>' +
				'</div>'
			);
		}
		$grid.html(html.join(''));
	}

	function fetchIndexData(callback) {
		var keys = [];
		for (var i = 0; i < INDEX_LIST.length; i++) {
			keys.push(INDEX_LIST[i].key);
		}

		var baseDataUrl = 'https://sqt.gtimg.cn/utf8/';
		var localDataUrl = localStorage.getItem('stock_dataUrl');
		if (localDataUrl && localDataUrl != 'undefined') {
			baseDataUrl = localDataUrl;
		}

		var url = baseDataUrl + 'q=' + keys.join(',') + '&_t=' + (+new Date());

		utils.ajax(url, function(res) {
			var arrRet = res.trim().split(";");
			var result = {};

			arrRet.forEach(function(item) {
				var arr = item.trim().split("=");
				if (arr.length > 1) {
					var rawKey = arr[0];
					var val = arr[1].replace(/"/g, '');
					var fields = val.split("~");

					if (fields.length < 33) return;

					var key = rawKey.replace('v_', '');
					var price = parseFloat(fields[3]);
					var prevClose = parseFloat(fields[4]);
					var change = (price - prevClose).toFixed(2);
					var changeRate = fields[32];
					var volume = fields[37];
					var high = parseFloat(fields[33]);
					var low = parseFloat(fields[34]);
					var amp = prevClose > 0 ? ((high - low) / prevClose * 100).toFixed(2) : '0.00';

					// 成交额格式化
					// 成交额/成交量格式化
					var volLabel = '成交额';
					var volNum, volStr = '';
					if (key.indexOf('us.') !== -1) {
						// 美股指数: fields[6]为成交量
						volLabel = '成交量';
						volNum = parseFloat(fields[6]);
						if (volNum === 0 || isNaN(volNum)) {
							volStr = '--';
						} else if (volNum >= 100000000) {
							volStr = (volNum / 100000000).toFixed(2) + '亿';
						} else {
							volStr = (volNum / 10000).toFixed(0) + '万';
						}
					} else {
						// A股/港股: fields[37]成交额(万)
						volNum = parseFloat(volume);
						if (volNum === 0 || isNaN(volNum)) {
							volStr = '--';
						} else {
							volStr = (volNum / 10000).toFixed(2) + '亿';
						}
					}

					var className = 'flat';
					if (parseFloat(changeRate) > 0) {
						className = 'increase';
						change = '+' + change;
						changeRate = '+' + changeRate;
					} else if (parseFloat(changeRate) < 0) {
						className = 'reduce';
					}

					result[key] = {
						name: fields[1],
						price: fields[3],
						change: change,
						changeRate: changeRate + '%',
						volLabel: volLabel,
						volume: volStr,
						amplitude: amp + '%',
						className: className,
						time: fields[30] || ''
					};
				}
			});

			callback(result);
		});
	}

	function updateCards(data) {
		for (var i = 0; i < INDEX_LIST.length; i++) {
			var idx = INDEX_LIST[i];
			var info = data[idx.key];
			var $card = $('#idx-' + safeId(idx.key));

			if (!info || !$card.length) continue;

			$card.find('.idx-loading').hide();
			$card.find('.idx-price').show().text(info.price);
			$card.find('.idx-detail').show();
			$card.find('.idx-change').text(info.change);
			$card.find('.idx-rate').text(info.changeRate);
			$card.find('.idx-extra').show();
			$card.find('.idx-vol').text(info.volLabel + ': ' + info.volume);
			$card.find('.idx-amp').text('振幅: ' + info.amplitude);

			$card.removeClass('increase reduce flat').addClass(info.className);
		}

		var now = new Date();
		var timeStr = now.getFullYear() + '-' +
			pad(now.getMonth() + 1) + '-' +
			pad(now.getDate()) + ' ' +
			pad(now.getHours()) + ':' +
			pad(now.getMinutes()) + ':' +
			pad(now.getSeconds());
		$('#index-update-time').text('更新时间: ' + timeStr);
	}

	function pad(n) {
		return n < 10 ? '0' + n : '' + n;
	}

	function refresh() {
		fetchIndexData(function(data) {
			updateCards(data);
		});
	}

	function startAutoRefresh() {
		if (indexTimer) return;
		refresh();
		indexTimer = setInterval(function() {
			if (isActive) {
				refresh();
			}
		}, 5000);
	}

	function stopAutoRefresh() {
		if (indexTimer) {
			clearInterval(indexTimer);
			indexTimer = null;
		}
	}

	$('#index-grid').on('click', '.index-card', function() {
		var key = $(this).attr('data-key');
		var url = 'https://gu.qq.com/' + key;
		window.open(url, '_blank');
	});

	window.IndexMarket = {
		init: function() {
			renderSkeleton();
		},
		activate: function() {
			isActive = true;
			startAutoRefresh();
		},
		deactivate: function() {
			isActive = false;
			stopAutoRefresh();
		}
	};

})(jQuery);
