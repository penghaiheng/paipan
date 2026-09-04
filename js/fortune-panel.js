(function (window, $) {
  if (!$) return;

  var STORAGE_KEY = 'paipan_fortune_review_v1';

  var profiles = [
    {
      id: 'default-v1',
      name: '默认配置',
      year_boundary: 'lichun',
      month_boundary: 'jieqi',
      day_boundary: 'zi_00',
      time_basis: 'standard',
      dayun_method: 'rough'
    }
  ];

  function pad2(value) {
    return value < 10 ? '0' + value : '' + value;
  }

  function toLocalInputValue(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) + 'T' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  function normalizeInputDateTime(value) {
    if (!value) return '';
    return value.length === 16 ? value + ':00' : value;
  }

  function parseInputDateTime(value) {
    var normalized = normalizeInputDateTime(value);
    var date = new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
  }

  function scoreToLevel(score) {
    if (score >= 85) return '优';
    if (score >= 70) return '良';
    if (score >= 55) return '中';
    return '谨慎';
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildMockSnapshot(payload) {
    var baseDate = parseInputDateTime(payload.datetime) || new Date();
    var seed = Math.abs(baseDate.getTime() / 60000) % 1000;
    var layerDefs = [
      { name: '本命', weight: 0.20 },
      { name: '大运', weight: 0.20 },
      { name: '流年', weight: 0.18 },
      { name: '流月', weight: 0.16 },
      { name: '流日', weight: 0.14 },
      { name: '流时', weight: 0.12 }
    ];

    var layers = [];
    var weighted = 0;
    for (var i = 0; i < layerDefs.length; i++) {
      var score = 50 + ((seed + i * 17) % 45);
      var layer = {
        name: layerDefs[i].name,
        weight: layerDefs[i].weight,
        score: score,
        evidence_count: 1
      };
      weighted += layer.weight * layer.score;
      layers.push(layer);
    }

    var totalScore = Math.round(weighted);
    var level = scoreToLevel(totalScore);
    var evidences = [];
    for (var j = 0; j < layers.length; j++) {
      evidences.push({
        id: payload.mode + '-' + j,
        layer: layers[j].name,
        title: layers[j].name + '占位证据',
        detail: '当前为占位结果，后续将接入真实算法证据链。',
        polarity: layers[j].score >= 70 ? 'positive' : 'neutral',
        weight: layers[j].weight
      });
    }

    return {
      summary: {
        score: totalScore,
        level: level,
        text: '当前结果为页面骨架占位输出，尚未接入真实运势算法。'
      },
      layers: layers,
      evidences: evidences,
      meta: {
        calculated_at: new Date().toISOString(),
        input_datetime: normalizeInputDateTime(payload.datetime),
        profile_id: payload.profile_id || profiles[0].id,
        is_mock: true
      }
    };
  }

  function readReviews() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveReviews(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  var api = {
    getProfiles: function () {
      return Promise.resolve({ profiles: profiles });
    },
    createSnapshot: function (payload) {
      if (!payload || !payload.datetime || !payload.mode) {
        return Promise.reject(new Error('datetime 和 mode 为必填')); 
      }
      return Promise.resolve(buildMockSnapshot(payload));
    },
    createReview: function (payload) {
      var items = readReviews();
      var record = {
        id: 'review-' + Date.now(),
        event_time: payload.event_time,
        event_label: payload.event_label || '',
        note: payload.note || '',
        snapshot: payload.snapshot,
        created_at: new Date().toISOString()
      };
      items.unshift(record);
      saveReviews(items);
      return Promise.resolve(record);
    },
    listReview: function () {
      return Promise.resolve({ items: readReviews() });
    }
  };

  window.PaipanFortuneApi = {
    getProfiles: function () {
      return api.getProfiles();
    },
    getProfilesEndpoint: function () {
      return 'GET /api/fortune/profiles';
    },
    snapshot: function (payload) {
      return api.createSnapshot(payload);
    },
    snapshotEndpoint: function () {
      return 'POST /api/fortune/snapshot';
    },
    saveReview: function (payload) {
      return api.createReview(payload);
    },
    saveReviewEndpoint: function () {
      return 'POST /api/fortune/review';
    },
    listReview: function () {
      return api.listReview();
    },
    listReviewEndpoint: function () {
      return 'GET /api/fortune/review';
    }
  };

  function renderSnapshot(containerSelector, snapshot) {
    var meta = snapshot.meta || {};
    var summary = snapshot.summary || {};
    var layers = snapshot.layers || [];
    var evidences = snapshot.evidences || [];

    var layerHtml = '';
    for (var i = 0; i < layers.length; i++) {
      layerHtml += '<li>' + escapeHtml(layers[i].name) + '：权重 ' + escapeHtml(layers[i].weight) + '，分数 ' + escapeHtml(layers[i].score) + '，证据数 ' + escapeHtml(layers[i].evidence_count) + '</li>';
    }

    var evidenceHtml = '';
    for (var j = 0; j < evidences.length; j++) {
      evidenceHtml += '<li><strong>' + escapeHtml(evidences[j].title) + '</strong>（' + escapeHtml(evidences[j].layer) + '）- ' + escapeHtml(evidences[j].detail) + '</li>';
    }

    var html = '' +
      '<div class="fortune-placeholder-badge">当前为占位结果 / 待接入算法</div>' +
      '<div class="fortune-summary">总览：' + escapeHtml(summary.score) + ' 分（' + escapeHtml(summary.level) + '） - ' + escapeHtml(summary.text) + '</div>' +
      '<div class="fortune-meta">计算时间：' + escapeHtml(meta.calculated_at || '-') + '<br />输入时间：' + escapeHtml(meta.input_datetime || '-') + '</div>' +
      '<ul class="fortune-layers">' + layerHtml + '</ul>' +
      '<ul class="fortune-evidence-list">' + evidenceHtml + '</ul>';

    $(containerSelector).html(html);
  }

  function renderReviewList(items) {
    var $list = $('#fortune-review-list');
    if (!items || items.length === 0) {
      $list.html('<li>暂无回看记录</li>');
      return;
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var row = items[i];
      html += '<li><button type="button" class="fortune-review-item" data-id="' + escapeHtml(row.id) + '">'
        + escapeHtml(row.event_time) + ' - ' + escapeHtml(row.event_label || '未命名事件') + '</button></li>';
    }
    $list.html(html);
  }

  function loadReviewList() {
    return window.PaipanFortuneApi.listReview().then(function (res) {
      renderReviewList(res.items || []);
      return res.items || [];
    });
  }

  function initProfiles() {
    return window.PaipanFortuneApi.getProfiles().then(function (res) {
      var options = '';
      var items = res.profiles || [];
      for (var i = 0; i < items.length; i++) {
        options += '<option value="' + escapeHtml(items[i].id) + '">' + escapeHtml(items[i].name) + '</option>';
      }
      $('#fortune-profile-select').html(options);
    });
  }

  function runSnapshot(mode, inputValue, targetSelector, context) {
    return window.PaipanFortuneApi.snapshot({
      datetime: normalizeInputDateTime(inputValue),
      mode: mode,
      profile_id: $('#fortune-profile-select').val() || profiles[0].id,
      context: context || null
    }).then(function (snapshot) {
      renderSnapshot(targetSelector, snapshot);
      return snapshot;
    });
  }

  $(function () {
    if (!$('#fortune-panel').length) return;

    var now = new Date();
    var nowInput = toLocalInputValue(now);
    $('#fortune-custom-datetime').val(nowInput);
    $('#fortune-review-time').val(nowInput);

    initProfiles().then(function () {
      return runSnapshot('today', nowInput, '#fortune-today-card', null);
    }).then(function () {
      return runSnapshot('custom', $('#fortune-custom-datetime').val(), '#fortune-custom-result', null);
    }).catch(function (err) {
      $('#fortune-today-card').html('初始化失败：' + err.message);
    });

    $('#fortune-custom-calc').on('click', function () {
      var value = $('#fortune-custom-datetime').val();
      if (!value) {
        $('#fortune-custom-result').html('请选择时间');
        return;
      }
      runSnapshot('custom', value, '#fortune-custom-result', null).catch(function (err) {
        $('#fortune-custom-result').html('计算失败：' + err.message);
      });
    });

    $('#fortune-review-save').on('click', function () {
      var eventTime = $('#fortune-review-time').val();
      var label = $('#fortune-review-label').val();
      var note = $('#fortune-review-note').val();
      if (!eventTime) {
        $('#fortune-review-result').html('请先输入事件时间');
        return;
      }

      runSnapshot('review', eventTime, '#fortune-review-result', { event_label: label, note: note }).then(function (snapshot) {
        return window.PaipanFortuneApi.saveReview({
          event_time: normalizeInputDateTime(eventTime),
          event_label: label,
          note: note,
          snapshot: snapshot
        });
      }).then(function () {
        $('#fortune-review-label').val('');
        $('#fortune-review-note').val('');
        return loadReviewList();
      }).catch(function (err) {
        $('#fortune-review-result').html('保存失败：' + err.message);
      });
    });

    $('#fortune-review-list').on('click', '.fortune-review-item', function () {
      var targetId = $(this).data('id');
      window.PaipanFortuneApi.listReview().then(function (res) {
        var items = res.items || [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].id === targetId && items[i].snapshot) {
            renderSnapshot('#fortune-review-result', items[i].snapshot);
            break;
          }
        }
      });
    });

    loadReviewList();
  });
})(window, window.jQuery);
