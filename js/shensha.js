(function(root){
  'use strict';

  function loadJsonSync(path) {
    if (typeof module !== 'undefined' && module.exports) {
      return JSON.parse(require('fs').readFileSync(path, 'utf8'));
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path, false);
    xhr.send(null);
    if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 0) {
      return JSON.parse(xhr.responseText);
    }
    throw new Error('Failed to load shensha config: ' + path);
  }

  var cache = null;
  function getConfig() {
    if (cache) return cache;
    var path = (typeof root !== 'undefined' && root.__paipanShenshaConfigUrl) ? root.__paipanShenshaConfigUrl : './lib/shensha_rules.json';
    cache = loadJsonSync(path);
    return cache;
  }

  function normalizeGender(gender) {
    if (gender === undefined || gender === null || gender === '') return null;
    if (typeof gender === 'boolean') return gender ? 1 : 0;
    if (typeof gender === 'number') return gender ? 1 : 0;
    var text = String(gender).toLowerCase().trim();
    if (['0', 'm', 'male', 'man', '男'].indexOf(text) >= 0) return 0;
    if (['1', 'f', 'female', 'woman', '女'].indexOf(text) >= 0) return 1;
    return null;
  }

  function resolveOptions(config, options) {
    options = options || {};
    var ruleset = options.ruleset || config.default_ruleset;
    if (!config.ruleset_presets[ruleset]) ruleset = config.default_ruleset;
    var preset = config.ruleset_presets[ruleset] || {label: ruleset, options: {}};
    var resolved = {};
    var key;
    for (key in preset.options) resolved[key] = preset.options[key];
    ['include_year_target_for_day_stem', 'fuxing_mode', 'taiji_mode', 'yuanchen_mode', 'tianluo_diwang_mode'].forEach(function(name){
      if (Object.prototype.hasOwnProperty.call(options, name)) resolved[name] = options[name];
    });
    resolved.ruleset = ruleset;
    resolved.ruleset_label = preset.label || ruleset;
    resolved.gender = normalizeGender(options.gender !== undefined ? options.gender : options.xb);
    return resolved;
  }

  function valueName(runtime, type, value) {
    if (type === 'tg') return runtime.ctg[value] || String(value);
    if (type === 'dz') return runtime.cdz[value] || String(value);
    if (type === 'dgz' || type === 'pillar') return runtime.gz[value] || String(value);
    return String(value);
  }

  function emptyResult(config, resolved) {
    var lines = [];
    var pillarStatus = [];
    for (var i = 0; i < 4; i++) {
      lines.push(config.line_pillar_names[i] + '：无');
      pillarStatus.push({pillar:i, pillar_name:config.pillar_names[i], calculated:true, hit_count:0, hit_names:[], evidence_count:0, source_calculated:true, source_hit_count:0, source_hit_names:[], source_evidence_count:0, source_rule_count:0, source_rule_ids:[]});
    }
    return {
      ruleset: resolved.ruleset,
      ruleset_label: resolved.ruleset_label,
      options: resolved,
      warnings: [],
      items: [],
      by_target_pillar: [[],[],[],[]],
      by_source_pillar: [[],[],[],[]],
      pillar_status: pillarStatus,
      by_pillar: [[],[],[],[]],
      lines: lines
    };
  }

  function addHit(itemMap, runtime, rule, resolved, sourcePillar, sourceType, sourceValue, targetPillar, targetType, targetValue, extra) {
    extra = extra || {};
    var name = rule.name;
    if (!itemMap[name]) itemMap[name] = {name:name, rule_ids:[rule.id], hits:{}};
    if (itemMap[name].rule_ids.indexOf(rule.id) < 0) itemMap[name].rule_ids.push(rule.id);
    var key = [rule.id, sourcePillar, sourceType, sourceValue, targetPillar, targetType, targetValue].join('-');
    if (itemMap[name].hits[key]) return;
    var sourceValueName = valueName(runtime, sourceType, sourceValue);
    var targetValueName = valueName(runtime, targetType, targetValue);
    var hit = {
      name: name,
      source: {pillar:sourcePillar, pillar_name:runtime.pillarNames[sourcePillar], type:sourceType, value:sourceValue, value_name:sourceValueName},
      target: {pillar:targetPillar, pillar_name:runtime.pillarNames[targetPillar], type:targetType, value:targetValue, value_name:targetValueName},
      source_pillar: sourcePillar,
      source_pillar_name: runtime.pillarNames[sourcePillar],
      source_type: sourceType,
      source_value: sourceValue,
      source_value_name: sourceValueName,
      trigger_pillar: sourcePillar,
      trigger_pillar_name: runtime.pillarNames[sourcePillar],
      trigger_type: sourceType,
      trigger_value: sourceValue,
      trigger_value_name: sourceValueName,
      target_pillar: targetPillar,
      target_pillar_name: runtime.pillarNames[targetPillar],
      target_type: targetType,
      target_value: targetValue,
      target_value_name: targetValueName,
      rule_id: rule.id,
      rule_version: rule.version || '',
      rule_note: rule.notes || '',
      ruleset: resolved.ruleset,
      ruleset_label: resolved.ruleset_label
    };
    if (targetType === 'tg') {
      hit.target_tg = targetValue;
      hit.target_tg_name = targetValueName;
    } else if (targetType === 'dz') {
      hit.target_zhi = targetValue;
      hit.target_zhi_name = targetValueName;
    } else if (targetType === 'pillar') {
      hit.target_gz = targetValue;
      hit.target_gz_name = targetValueName;
    }
    for (var k in extra) hit[k] = extra[k];
    itemMap[name].hits[key] = hit;
  }

  function targetPillars(rule, resolved) {
    if (rule.rule_type.indexOf('day_gan_') === 0) {
      return resolved.include_year_target_for_day_stem ? rule.target_pillars : rule.legacy_target_pillars;
    }
    if (rule.rule_type === 'yuanchen') {
      return resolved.yuanchen_mode === 'day_branch_plus_seven_hour_only' ? rule.legacy_target_pillars : rule.target_pillars;
    }
    return rule.target_pillars || [0,1,2,3];
  }

  function sourcePillars(rule, resolved) {
    if (rule.rule_type === 'yuanchen' && resolved.yuanchen_mode === 'day_branch_plus_seven_hour_only') return [2];
    return rule.allowed_source_pillars || [];
  }

  function addMatches(itemMap, runtime, rule, resolved, tg, dz, sourcePillar, sourceType, sourceValue, type, value, pillars, extra) {
    pillars = pillars || targetPillars(rule, resolved);
    for (var i = 0; i < pillars.length; i++) {
      var pillar = pillars[i];
      var matched = false;
      if (type === 'tg' && tg[pillar] === value) matched = true;
      if (type === 'dz' && dz[pillar] === value) matched = true;
      if (type === 'pillar' && pillar === 2 && value === runtime.GZ(tg[2], dz[2])) matched = true;
      if (matched) addHit(itemMap, runtime, rule, resolved, sourcePillar, sourceType, sourceValue, pillar, type, value, extra);
    }
  }

  function buildByTarget(items) {
    var grouped = [{},{},{},{}];
    items.forEach(function(item){
      (item.hits || []).forEach(function(hit){
        var bucket = grouped[hit.target_pillar][item.name];
        if (!bucket) bucket = grouped[hit.target_pillar][item.name] = {name:item.name, hit_count:0, hits:[], triggers:[]};
        bucket.hit_count += 1;
        bucket.hits.push(hit);
        bucket.triggers.push({
          source_pillar: hit.source_pillar,
          source_pillar_name: hit.source_pillar_name,
          source_type: hit.source_type,
          source_value: hit.source_value,
          source_value_name: hit.source_value_name,
          trigger_pillar: hit.trigger_pillar,
          trigger_pillar_name: hit.trigger_pillar_name,
          trigger_type: hit.trigger_type,
          trigger_value: hit.trigger_value,
          trigger_value_name: hit.trigger_value_name,
          rule_id: hit.rule_id,
          rule_note: hit.rule_note
        });
      });
    });
    return grouped.map(function(pillar){
      return Object.keys(pillar).map(function(name){ return pillar[name]; });
    });
  }

  function buildBySource(items) {
    var grouped = [{},{},{},{}];
    items.forEach(function(item){
      (item.hits || []).forEach(function(hit){
        var bucket = grouped[hit.source_pillar][item.name];
        if (!bucket) bucket = grouped[hit.source_pillar][item.name] = {name:item.name, hit_count:0, hits:[], targets:[]};
        bucket.hit_count += 1;
        bucket.hits.push(hit);
        bucket.targets.push({
          target_pillar: hit.target_pillar,
          target_pillar_name: hit.target_pillar_name,
          target_type: hit.target_type,
          target_value: hit.target_value,
          target_value_name: hit.target_value_name,
          rule_id: hit.rule_id,
          rule_note: hit.rule_note
        });
      });
    });
    return grouped.map(function(pillar){
      return Object.keys(pillar).map(function(name){ return pillar[name]; });
    });
  }

  function buildLines(byTarget, config) {
    var lines = [];
    for (var i = 0; i < 4; i++) {
      var seen = {};
      var names = [];
      byTarget[i].forEach(function(item){
        if (!item.name || seen[item.name]) return;
        seen[item.name] = 1;
        names.push(item.name);
      });
      lines.push(config.line_pillar_names[i] + '：' + (names.length ? names.join(' ') : '无'));
    }
    return lines;
  }

  function buildPillarStatus(byTarget, bySource, sourceRuleIds, config) {
    var status = [];
    for (var i = 0; i < 4; i++) {
      var names = [];
      var evidenceCount = 0;
      byTarget[i].forEach(function(item){ names.push(item.name); evidenceCount += (item.hits || []).length; });
      var sourceNames = [];
      var sourceEvidenceCount = 0;
      bySource[i].forEach(function(item){ sourceNames.push(item.name); sourceEvidenceCount += (item.hits || []).length; });
      status.push({pillar:i, pillar_name:config.pillar_names[i], calculated:true, hit_count:names.length, hit_names:names, evidence_count:evidenceCount, source_calculated:true, source_hit_count:sourceNames.length, source_hit_names:sourceNames, source_evidence_count:sourceEvidenceCount, source_rule_count:sourceRuleIds[i].length, source_rule_ids:sourceRuleIds[i]});
    }
    return status;
  }

  function compute(input, paipanRuntime, options) {
    var config = getConfig();
    var resolved = resolveOptions(config, options || input || {});
    if (!input || !input.tg || !input.dz || input.tg.length < 4 || input.dz.length < 4) {
      return emptyResult(config, resolved);
    }
    var runtime = {
      ctg: paipanRuntime.ctg,
      cdz: paipanRuntime.cdz,
      gz: paipanRuntime.gz,
      GZ: paipanRuntime.GZ.bind(paipanRuntime),
      pillarNames: config.pillar_names
    };
    var tg = input.tg.slice(0, 4);
    var dz = input.dz.slice(0, 4);
    var dayGan = tg[2], yearGan = tg[0], monthZhi = dz[1], yearZhi = dz[0], dayZhi = dz[2], dayGz = runtime.GZ(tg[2], dz[2]);
    var itemMap = {};
    var warnings = [];
    var sourceRuleIds = [[], [], [], []];
    config.rules.forEach(function(rule){
      var i, target, variant, group, pair, leftPillars, rightPillars;
      sourcePillars(rule, resolved).forEach(function(sourcePillar){
        if (sourceRuleIds[sourcePillar].indexOf(rule.id) < 0) sourceRuleIds[sourcePillar].push(rule.id);
      });
      switch (rule.rule_type) {
        case 'day_gan_lookup':
          rule.lookup[dayGan].forEach(function(v){ addMatches(itemMap, runtime, rule, resolved, tg, dz, 2, 'tg', dayGan, 'dz', v); });
          break;
        case 'day_gan_lookup_variant':
          variant = rule.lookup_variants[resolved.taiji_mode] ? resolved.taiji_mode : 'common';
          rule.lookup_variants[variant][dayGan].forEach(function(v){ addMatches(itemMap, runtime, rule, resolved, tg, dz, 2, 'tg', dayGan, 'dz', v, null, {lookup_variant:variant}); });
          break;
        case 'year_gan_lookup_variant':
          variant = rule.lookup_variants[resolved.fuxing_mode] ? resolved.fuxing_mode : 'common_dual_target';
          rule.lookup_variants[variant][yearGan].forEach(function(v){ addMatches(itemMap, runtime, rule, resolved, tg, dz, 0, 'tg', yearGan, 'dz', v, null, {lookup_variant:variant}); });
          break;
        case 'month_zhi_lookup_mixed':
          target = rule.lookup[monthZhi];
          addMatches(itemMap, runtime, rule, resolved, tg, dz, 1, 'dz', monthZhi, target.type, target.value);
          break;
        case 'month_zhi_lookup':
          rule.lookup[monthZhi].forEach(function(v){ addMatches(itemMap, runtime, rule, resolved, tg, dz, 1, 'dz', monthZhi, rule.target_value_type, v); });
          break;
        case 'month_zhi_formula_previous_branch':
          addMatches(itemMap, runtime, rule, resolved, tg, dz, 1, 'dz', monthZhi, 'dz', (monthZhi + 11) % 12, null, {formula:'previous_branch'});
          break;
        case 'year_zhi_formula_offset':
          addMatches(itemMap, runtime, rule, resolved, tg, dz, 0, 'dz', yearZhi, 'dz', rule.offset_formula.indexOf('9-') === 0 ? (9 - yearZhi + 12) % 12 : (3 - yearZhi + 12) % 12, null, {formula:rule.offset_formula});
          break;
        case 'year_zhi_lookup':
          rule.lookup[yearZhi].forEach(function(v){ addMatches(itemMap, runtime, rule, resolved, tg, dz, 0, 'dz', yearZhi, 'dz', v); });
          break;
        case 'tri_group_lookup':
          rule.allowed_source_pillars.forEach(function(sourcePillar){
            group = rule.groups[dz[sourcePillar]];
            addMatches(itemMap, runtime, rule, resolved, tg, dz, sourcePillar, 'dz', dz[sourcePillar], 'dz', rule.lookup[group], null, {group_index:group});
          });
          break;
        case 'yuanchen':
          if (resolved.yuanchen_mode === 'day_branch_plus_seven_hour_only') {
            addMatches(itemMap, runtime, rule, resolved, tg, dz, 2, 'dz', dayZhi, 'dz', (dayZhi + 7) % 12, rule.legacy_target_pillars, {mode:resolved.yuanchen_mode});
            break;
          }
          if (resolved.gender === null) {
            warnings.push('元辰默认口径依赖性别；未提供 gender/xb，已跳过该规则。');
            break;
          }
          var yearYang = yearGan % 2 === 0;
          var samePolarity = (resolved.gender === 0 && yearYang) || (resolved.gender === 1 && !yearYang);
          addMatches(itemMap, runtime, rule, resolved, tg, dz, 0, 'dz', yearZhi, 'dz', (yearZhi + (samePolarity ? 5 : 7)) % 12, rule.target_pillars, {
            mode: resolved.yuanchen_mode,
            gender: resolved.gender,
            direction: samePolarity ? 'same_polarity_previous_of_opposition' : 'cross_polarity_next_of_opposition',
            source_stem_yinyang: yearYang ? '阳' : '阴'
          });
          break;
        case 'xunkong':
          var xunIndex = Math.floor(dayGz / 10);
          rule.lookup[xunIndex].forEach(function(v){ addMatches(itemMap, runtime, rule, resolved, tg, dz, 2, 'dgz', dayGz, 'dz', v, null, {xun_index:xunIndex}); });
          if (!itemMap['空亡']) itemMap['空亡'] = {name:'空亡', rule_ids:[rule.id], hits:{}};
          itemMap['空亡'].empty_targets = rule.lookup[xunIndex];
          itemMap['空亡'].day_gz = dayGz;
          break;
        case 'day_gz_membership':
          if (rule.members.indexOf(dayGz) >= 0) {
            addHit(itemMap, runtime, rule, resolved, 2, 'dgz', dayGz, 2, 'pillar', dayGz, {target_tg:tg[2], target_tg_name:runtime.ctg[tg[2]], target_zhi:dz[2], target_zhi_name:runtime.cdz[dz[2]]});
          }
          break;
        case 'paired_branch_presence':
          pair = rule.pair;
          if (resolved.tianluo_diwang_mode === 'simple_branch_presence') {
            for (i = 0; i < 4; i++) {
              if (pair.indexOf(dz[i]) >= 0) addHit(itemMap, runtime, rule, resolved, i, 'dz', dz[i], i, 'dz', dz[i], {mode:resolved.tianluo_diwang_mode});
            }
            break;
          }
          leftPillars = [];
          rightPillars = [];
          for (i = 0; i < 4; i++) {
            if (dz[i] === pair[0]) leftPillars.push(i);
            if (dz[i] === pair[1]) rightPillars.push(i);
          }
          if (!leftPillars.length || !rightPillars.length) break;
          leftPillars.forEach(function(left){
            rightPillars.forEach(function(right){
              addHit(itemMap, runtime, rule, resolved, right, 'dz', pair[1], left, 'dz', pair[0], {mode:resolved.tianluo_diwang_mode, pair_match: runtime.cdz[pair[0]] + runtime.cdz[pair[1]]});
              addHit(itemMap, runtime, rule, resolved, left, 'dz', pair[0], right, 'dz', pair[1], {mode:resolved.tianluo_diwang_mode, pair_match: runtime.cdz[pair[0]] + runtime.cdz[pair[1]]});
            });
          });
          break;
      }
    });
    var items = [];
    config.display_order.forEach(function(name){
      if (!itemMap[name]) return;
      itemMap[name].hits = Object.keys(itemMap[name].hits).map(function(k){ return itemMap[name].hits[k]; });
      items.push(itemMap[name]);
    });
    var byTarget = buildByTarget(items);
    var bySource = buildBySource(items);
    return {
      ruleset: resolved.ruleset,
      ruleset_label: resolved.ruleset_label,
      options: resolved,
      warnings: warnings,
      items: items,
      by_target_pillar: byTarget,
      by_source_pillar: bySource,
      pillar_status: buildPillarStatus(byTarget, bySource, sourceRuleIds, config),
      by_pillar: byTarget,
      lines: buildLines(byTarget, config)
    };
  }

  var api = {
    getConfig: getConfig,
    compute: compute,
    computeFromFatemaps: function(fm, paipanRuntime, options){
      options = options || {};
      if (options.gender === undefined && fm && fm.xb_index !== undefined) options.gender = fm.xb_index;
      return compute({tg:(fm || {}).tg || [], dz:(fm || {}).dz || []}, paipanRuntime, options);
    },
    formatLines: function(byTarget){ return buildLines(byTarget, getConfig()); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.PaipanShensha = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
