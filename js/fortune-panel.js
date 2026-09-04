(function (window, $) {
  if (!$ || !window.p) return;

  var STORAGE_KEY = 'paipan_fortune_review_v1';
  var PILLAR_LABELS = ['年柱', '月柱', '日柱', '时柱'];

  var profiles = [
    {
      id: 'default-v1',
      name: '默认配置（标准时）',
      year_boundary: 'lichun',
      month_boundary: 'jieqi',
      day_boundary: 'existing_zwz_setting',
      time_basis: 'standard',
      dayun_method: 'rough'
    },
    {
      id: 'true-solar-v1',
      name: '默认配置（真太阳时）',
      year_boundary: 'lichun',
      month_boundary: 'jieqi',
      day_boundary: 'existing_zwz_setting',
      time_basis: 'true_solar',
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

  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function dateToParts(date) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds()
    };
  }

  function partsToText(parts) {
    if (!parts) return '-';
    return parts.year + '-' + pad2(parts.month) + '-' + pad2(parts.day) + ' ' + pad2(parts.hour) + ':' + pad2(parts.minute) + ':' + pad2(parts.second);
  }

  function partsFromArray(parts) {
    return {
      year: parseInt(parts[0], 10),
      month: parseInt(parts[1], 10),
      day: parseInt(parts[2], 10),
      hour: parseInt(parts[3], 10),
      minute: parseInt(parts[4], 10),
      second: parseInt(parts[5], 10)
    };
  }

  function posMod(value, mod) {
    return ((value % mod) + mod) % mod;
  }

  function getSelectedProfile(profileId) {
    for (var i = 0; i < profiles.length; i++) {
      if (profiles[i].id === profileId) return profiles[i];
    }
    return profiles[0];
  }

  function getCityCoordinate() {
    try {
      if (typeof inf === 'undefined' || typeof JW === 'undefined' || !inf || !inf.get) return null;
      var id = inf.get();
      if (!JW[id]) return null;
      return {
        longitude: JW[id][2],
        latitude: JW[id][3]
      };
    } catch (e) {
      return null;
    }
  }

  function buildPillar(tg, dz) {
    var gz = p.GZ(tg, dz);
    return {
      tg: tg,
      dz: dz,
      gz: gz,
      text: p.ctg[tg] + p.cdz[dz],
      tg_text: p.ctg[tg],
      dz_text: p.cdz[dz]
    };
  }

  function locateJieMonth(spcjd, jr) {
    var tm = 0;
    for (var j = 0; ; j++) {
      if (spcjd < jr[21 + 2 * j]) {
        tm = j - 1;
        break;
      }
    }
    var startJieIndex = posMod(21 + 2 * tm, 24);
    var nextJieIndex = posMod(21 + 2 * tm + 2, 24);
    return {
      month_index: posMod(tm, 12),
      start_jd: jr[21 + 2 * tm],
      next_jd: jr[21 + 2 * tm + 2],
      start_jie_index: startJieIndex,
      next_jie_index: nextJieIndex,
      current_jie: p.jq[startJieIndex],
      next_jie: p.jq[nextJieIndex]
    };
  }

  function getWuhuMonthStem(yearTg, monthIndex) {
    var start;
    if (yearTg === 0 || yearTg === 5) start = 2;
    else if (yearTg === 1 || yearTg === 6) start = 4;
    else if (yearTg === 2 || yearTg === 7) start = 6;
    else if (yearTg === 3 || yearTg === 8) start = 8;
    else start = 0;
    return posMod(start + monthIndex, 10);
  }

  function resolveEffectiveDateTime(parts, profile) {
    var baseJd = p.Jdays(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
    if (baseJd === false) return null;

    var rt = {
      input_datetime: parts,
      time_basis: 'standard',
      effective_jd: baseJd,
      standard_datetime: partsFromArray(p.Jtime(baseJd)),
      effective_datetime: partsFromArray(p.Jtime(baseJd)),
      longitude: null,
      latitude: null,
      pty: null,
      zty: null
    };

    if (profile.time_basis === 'true_solar') {
      var coord = getCityCoordinate();
      if (coord) {
        var ptyJd = baseJd - (p.J - parseFloat(coord.longitude)) * 4 / 60 / 24;
        var ztyJd = p.zty(baseJd, coord.longitude, coord.latitude);
        rt.time_basis = 'true_solar';
        rt.longitude = coord.longitude;
        rt.latitude = coord.latitude;
        rt.pty = partsFromArray(p.Jtime(ptyJd));
        rt.zty = partsFromArray(p.Jtime(ztyJd));
        rt.effective_jd = ztyJd;
        rt.effective_datetime = rt.zty;
      }
    }
    return rt;
  }

  function getFortunePillars(parts, profile) {
    var time = resolveEffectiveDateTime(parts, profile);
    if (!time) return null;
    var ed = time.effective_datetime;
    var gz = p.GetGZ(ed.year, ed.month, ed.day, ed.hour, ed.minute, ed.second);
    if (!gz) return null;

    var tg = gz[0];
    var dz = gz[1];
    var ob = gz[2];
    var effectiveJd = p.Jdays(ed.year, ed.month, ed.day, ed.hour, ed.minute, ed.second);
    var jm = locateJieMonth(effectiveJd, ob.jr);

    var yearStartJd = p.GetAdjustedJQ(ob.ty - 1, false)[21];
    var yearNextJd = p.GetAdjustedJQ(ob.ty, false)[21];

    var monthTgByWuhu = getWuhuMonthStem(tg[0], jm.month_index);
    var monthDzByJie = posMod(2 + jm.month_index, 12);

    return {
      input: {
        datetime: parts,
        longitude: time.longitude,
        latitude: time.latitude
      },
      time_basis: time.time_basis,
      effective_datetime: ed,
      effective_aux: {
        standard_datetime: time.standard_datetime,
        pty: time.pty,
        zty: time.zty
      },
      profile: {
        year_boundary: 'lichun',
        month_boundary: 'jieqi',
        day_boundary: p.zwz ? 'existing_zwz_setting' : 'zi_00'
      },
      target: {
        tg: tg,
        dz: dz,
        gz: [p.GZ(tg[0], dz[0]), p.GZ(tg[1], dz[1]), p.GZ(tg[2], dz[2]), p.GZ(tg[3], dz[3])]
      },
      year_panel: {
        pillar: buildPillar(tg[0], dz[0]),
        boundary: {
          type: 'lichun',
          effective_year: ob.ty,
          start: { name: '立春', datetime: partsFromArray(p.Jtime(yearStartJd)) },
          next: { name: '立春', datetime: partsFromArray(p.Jtime(yearNextJd)) }
        },
        evidences: [
          { id: 'year.pillar', layer: 'year', rule_id: 'calendar.lichun.year_pillar', title: '流年以立春换年', detail: '年柱由立春边界确定', polarity: 'neutral', participants: [{ scope: 'transit', layer: 'year', pillar: 'year' }] }
        ]
      },
      month_panel: {
        pillar: buildPillar(tg[1], dz[1]),
        boundary: {
          type: 'jieqi',
          month_index: jm.month_index,
          current_jie: jm.current_jie,
          next_jie: jm.next_jie,
          start: { name: jm.current_jie, datetime: partsFromArray(p.Jtime(jm.start_jd)) },
          next: { name: jm.next_jie, datetime: partsFromArray(p.Jtime(jm.next_jd)) }
        },
        wuhu_dun: {
          year_tg: tg[0],
          month_index_from_yin: jm.month_index,
          expected_month_tg: monthTgByWuhu,
          expected_month_dz: monthDzByJie,
          matches_getgz: monthTgByWuhu === tg[1] && monthDzByJie === dz[1]
        },
        evidences: [
          { id: 'month.pillar', layer: 'month', rule_id: 'calendar.jieqi.month_pillar', title: '流月以十二节换月', detail: '当前流月由节气月边界确定', polarity: 'neutral', participants: [{ scope: 'transit', layer: 'month', pillar: 'month' }] },
          { id: 'month.wuhu', layer: 'month', rule_id: 'calendar.wuhu_dun.month_stem', title: '流月干按五虎遁顺推', detail: '从流年干确定寅月干后顺推当月', polarity: 'neutral', participants: [{ scope: 'transit', layer: 'month', pillar: 'month' }] }
        ]
      },
      day_panel: {
        pillar: buildPillar(tg[2], dz[2]),
        boundary: {
          type: 'existing_zwz_setting',
          zwz: !!p.zwz,
          description: p.zwz ? '区分早晚子时(23:00-23:59按上一日柱)' : '不区分早晚子时(00:00换日)'
        },
        evidences: [
          { id: 'day.pillar', layer: 'day', rule_id: 'calendar.getgz.day_pillar', title: '流日复用 GetGZ 日柱', detail: '日柱按现有 GetGZ 与 zwz 开关计算', polarity: 'neutral', participants: [{ scope: 'transit', layer: 'day', pillar: 'day' }] }
        ]
      }
    };
  }

  function buildRelations(natalTg, natalDz, panelKey, targetTg, targetDz, targetIndex) {
    var gxs = GetGX(natalTg.concat([targetTg]), natalDz.concat([targetDz]));
    var result = [];
    for (var comp = 0; comp < gxs.length; comp++) {
      var list = gxs[comp] || [];
      for (var i = 0; i < list.length; i++) {
        var posMap = list[i][0] || {};
        var meta = list[i][1] || [];
        var keys = Object.keys(posMap).map(function (k) { return parseInt(k, 10); });
        if (keys.indexOf(targetIndex) === -1) continue;
        var natalPositions = keys.filter(function (k) { return k >= 0 && k <= 3; });
        if (natalPositions.length === 0) continue;
        result.push({
          rule_id: 'gx.' + (comp === 0 ? 'tg' : 'dz') + '.' + meta[1] + '.' + i,
          title: meta[4],
          component: comp === 0 ? 'tg' : 'dz',
          natal_pillars: natalPositions,
          target_pillar: panelKey.replace('_panel', '')
        });
      }
    }
    return result;
  }

  function appendRelationEvidences(panel, panelKey) {
    var rels = panel.relations || [];
    for (var i = 0; i < rels.length; i++) {
      panel.evidences.push({
        id: panelKey + '.relation.' + i,
        layer: panelKey.replace('_panel', ''),
        rule_id: rels[i].rule_id,
        title: rels[i].title,
        detail: '命中本命与' + panelKey.replace('_panel', '') + '柱的干支关系',
        polarity: 'neutral',
        participants: [{ scope: 'transit', layer: panelKey.replace('_panel', ''), pillar: panelKey.replace('_panel', '') }].concat(
          (rels[i].natal_pillars || []).map(function (pos) {
            return { scope: 'natal', layer: 'natal', pillar: pos };
          })
        )
      });
    }
  }

  function extractNatal(profile) {
    var xb = parseInt($('input[name="xb"]:checked').val() || '0', 10);
    var yy = parseInt($('#yy').val(), 10);
    var mm = parseInt($('#mm').val(), 10);
    var dd = parseInt($('#dd').val(), 10);
    var hh = parseInt($('#hh').val(), 10);
    var mt = parseInt($('#mt').val(), 10);
    var ss = parseInt($('#ss').val(), 10);
    if (!p.ValidDate(yy, mm, dd)) return null;

    var coord = getCityCoordinate();
    var fm;
    if (profile.time_basis === 'true_solar' && coord) {
      fm = p.fatemaps(xb, yy, mm, dd, hh, mt, ss, coord.longitude, coord.latitude);
    } else {
      fm = p.fatemaps(xb, yy, mm, dd, hh, mt, ss);
    }
    if (!fm || !fm.tg || !fm.dz) return null;

    return {
      tg: fm.tg,
      dz: fm.dz,
      gz: [p.GZ(fm.tg[0], fm.dz[0]), p.GZ(fm.tg[1], fm.dz[1]), p.GZ(fm.tg[2], fm.dz[2]), p.GZ(fm.tg[3], fm.dz[3])],
      pillar_text: [p.ctg[fm.tg[0]] + p.cdz[fm.dz[0]], p.ctg[fm.tg[1]] + p.cdz[fm.dz[1]], p.ctg[fm.tg[2]] + p.cdz[fm.dz[2]], p.ctg[fm.tg[3]] + p.cdz[fm.dz[3]]],
      shensha: {
        lines: fm.shensha || [],
        items: fm.shensha_detail || []
      }
    };
  }

  function analyzeFortune(payload) {
    var profile = getSelectedProfile(payload.profile_id || profiles[0].id);
    var date = parseInputDateTime(payload.datetime);
    if (!date) throw new Error('datetime 格式无效');

    var natal = extractNatal(profile);
    if (!natal) throw new Error('当前本命输入无效，请先设置本命时间');

    var fortune = getFortunePillars(dateToParts(date), profile);
    if (!fortune) throw new Error('目标时刻计算失败');

    var panelDefs = [
      { key: 'year_panel', tg: fortune.year_panel.pillar.tg, dz: fortune.year_panel.pillar.dz, targetIndex: 4 },
      { key: 'month_panel', tg: fortune.month_panel.pillar.tg, dz: fortune.month_panel.pillar.dz, targetIndex: 4 },
      { key: 'day_panel', tg: fortune.day_panel.pillar.tg, dz: fortune.day_panel.pillar.dz, targetIndex: 4 }
    ];

    for (var i = 0; i < panelDefs.length; i++) {
      var def = panelDefs[i];
      var panel = fortune[def.key];
      panel.relations = buildRelations(natal.tg, natal.dz, def.key, def.tg, def.dz, def.targetIndex);
      panel.shensha = {
        supported: false,
        source_scope: 'natal',
        target_scope: 'transit',
        items: [],
        reason: '当前规则引擎仅对单组四柱做本命神煞计算，未内置“本命触发、流转目标”跨组判定。'
      };
      panel.evidences.push({
        id: def.key + '.shensha.unsupported',
        layer: def.key.replace('_panel', ''),
        rule_id: 'shensha.transit.unsupported',
        title: '流转神煞检查未启用',
        detail: '仅输出本命神煞，流年/流月/流日目标检查暂未启用',
        polarity: 'neutral',
        participants: [{ scope: 'natal', layer: 'natal' }, { scope: 'transit', layer: def.key.replace('_panel', '') }]
      });
      appendRelationEvidences(panel, def.key);
    }

    return {
      input: fortune.input,
      time_basis: fortune.time_basis,
      effective_datetime: fortune.effective_datetime,
      effective_aux: fortune.effective_aux,
      profile: fortune.profile,
      natal: natal,
      natal_shensha: natal.shensha,
      year_panel: fortune.year_panel,
      month_panel: fortune.month_panel,
      day_panel: fortune.day_panel,
      summary: {
        score: null,
        level: '未启用',
        text: '评分暂未启用，当前展示为确定性历法和关系计算。'
      },
      meta: {
        calculated_at: new Date().toISOString(),
        input_datetime: normalizeInputDateTime(payload.datetime),
        effective_datetime: partsToText(fortune.effective_datetime),
        profile_id: profile.id,
        score_enabled: false,
        is_mock: false,
        algorithm_version: 'fortune_panels_v1'
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
      try {
        return Promise.resolve(analyzeFortune(payload));
      } catch (err) {
        return Promise.reject(err);
      }
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

  function renderPanel(panelName, panel) {
    if (!panel) return '';

    var boundaryHtml = '';
    if (panel.boundary && panel.boundary.type === 'lichun') {
      boundaryHtml = '立春边界：' + partsToText(panel.boundary.start.datetime) + ' ～ ' + partsToText(panel.boundary.next.datetime);
    } else if (panel.boundary && panel.boundary.type === 'jieqi') {
      boundaryHtml = '当前节：' + escapeHtml(panel.boundary.current_jie) + '（' + partsToText(panel.boundary.start.datetime) + '）→ 下节：' + escapeHtml(panel.boundary.next_jie) + '（' + partsToText(panel.boundary.next.datetime) + '）';
    } else if (panel.boundary) {
      boundaryHtml = '日界设置：' + escapeHtml(panel.boundary.description || '-');
    }

    var relationHtml = '';
    var relations = panel.relations || [];
    if (relations.length === 0) {
      relationHtml = '<li>无命中关系</li>';
    } else {
      for (var i = 0; i < relations.length; i++) {
        var rp = (relations[i].natal_pillars || []).map(function (idx) { return PILLAR_LABELS[idx]; }).join('、');
        relationHtml += '<li>' + escapeHtml(relations[i].title) + '（本命参与：' + escapeHtml(rp) + '）</li>';
      }
    }

    var evidenceHtml = '';
    var evidences = panel.evidences || [];
    if (evidences.length === 0) {
      evidenceHtml = '<li>无</li>';
    } else {
      for (var j = 0; j < evidences.length; j++) {
        evidenceHtml += '<li><strong>' + escapeHtml(evidences[j].title) + '</strong> [' + escapeHtml(evidences[j].rule_id) + '] - ' + escapeHtml(evidences[j].detail) + '</li>';
      }
    }

    var shenshaText = panel.shensha && panel.shensha.supported === false
      ? '未启用（' + escapeHtml(panel.shensha.reason || '') + '）'
      : '已启用';

    var extra = '';
    if (panelName === '流月盘' && panel.wuhu_dun) {
      extra = '<div>五虎遁核对：' + (panel.wuhu_dun.matches_getgz ? '一致' : '不一致') + '</div>';
    }

    return '' +
      '<div class="fortune-panel-block">' +
      '<div><strong>' + escapeHtml(panelName) + '</strong>：' + escapeHtml((panel.pillar || {}).text || '-') + '</div>' +
      '<div>' + boundaryHtml + '</div>' +
      extra +
      '<div>神煞（本命触发→流转目标）：' + shenshaText + '</div>' +
      '<div>关系：</div><ul class="fortune-evidence-list">' + relationHtml + '</ul>' +
      '<div>证据链：</div><ul class="fortune-evidence-list">' + evidenceHtml + '</ul>' +
      '</div>';
  }

  function renderSnapshot(containerSelector, snapshot) {
    var meta = snapshot.meta || {};
    var summary = snapshot.summary || {};

    var html = '' +
      '<div class="fortune-placeholder-badge">评分暂未启用，当前展示为确定性历法和关系计算</div>' +
      '<div class="fortune-summary">总览：' + escapeHtml(summary.level || '-') + ' - ' + escapeHtml(summary.text || '-') + '</div>' +
      '<div class="fortune-meta">计算时间：' + escapeHtml(meta.calculated_at || '-') +
      '<br />输入时间：' + escapeHtml(meta.input_datetime || '-') +
      '<br />实际计算时间：' + escapeHtml(meta.effective_datetime || '-') +
      '<br />时制：' + escapeHtml(snapshot.time_basis || '-') + '</div>' +
      '<div class="fortune-meta">本命四柱：' + escapeHtml((snapshot.natal && snapshot.natal.pillar_text ? snapshot.natal.pillar_text.join(' / ') : '-')) + '</div>' +
      renderPanel('流年盘', snapshot.year_panel) +
      renderPanel('流月盘', snapshot.month_panel) +
      renderPanel('流日盘', snapshot.day_panel);

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
