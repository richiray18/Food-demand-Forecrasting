/* ==========================================================================
   NutriFlow — preparation.js
   Manages kitchen meal preparation logging, AI recommendations, and surplus routing.
   Endpoints:
     POST /api/v1/meals/consumption-logs/
     GET /api/v1/meals/consumption-logs/
     POST /api/surplus/surplus-food/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('nfPrepForm');
  var dateInput = document.getElementById('prepDate');
  var sessionSelect = document.getElementById('prepSession');
  var itemSelect = document.getElementById('prepItem');
  var headcountInput = document.getElementById('prepHeadcount');
  var prepInput = document.getElementById('prepQuantityPrepared');
  var consInput = document.getElementById('prepQuantityConsumed');
  var holidaySwitch = document.getElementById('prepIsHoliday');
  var examSwitch = document.getElementById('prepIsExam');
  var submitBtn = document.getElementById('prepSubmitBtn');

  var liveSurplusEl = document.getElementById('prepLiveSurplus');
  var liveStatusBadge = document.getElementById('prepLiveStatusBadge');
  var liveNotice = document.getElementById('prepLiveNotice');

  var aiCallout = document.getElementById('nfPrepAiCallout');
  var aiHeadline = document.getElementById('nfPrepAiHeadline');
  var aiSubtext = document.getElementById('nfPrepAiSubtext');
  var applyAiBtn = document.getElementById('nfPrepApplyAiBtn');

  var tableBody = document.getElementById('prepTableBody');
  var listStatus = document.getElementById('prepListStatus');
  var refreshListBtn = document.getElementById('prepRefreshListBtn');

  // Modal elements
  var routeFoodName = document.getElementById('routeFoodName');
  var routeQuantity = document.getElementById('routeQuantity');
  var routeSafetyRule = document.getElementById('routeSafetyRule');
  var routeStorageLoc = document.getElementById('routeStorageLoc');
  var routeTemp = document.getElementById('routeTemp');
  var routeIsHotHeld = document.getElementById('routeIsHotHeld');
  var routeIsRefrigerated = document.getElementById('routeIsRefrigerated');
  var routeSubmitSurplusBtn = document.getElementById('routeSubmitSurplusBtn');

  var itemsCache = [];
  var sessionsCache = [];
  var safetyRulesCache = [];
  var activeCreatedLogId = null;

  // Set today's date by default
  var todayStr = getTodayDateString();
  dateInput.value = todayStr;

  // Initialize
  loadInitialData();

  // Event Listeners for Live Variance Calculation
  prepInput.addEventListener('input', updateLiveVariance);
  consInput.addEventListener('input', updateLiveVariance);

  // Trigger AI recommendation check when Item or Session changes
  sessionSelect.addEventListener('change', checkAiRecommendation);
  itemSelect.addEventListener('change', checkAiRecommendation);
  dateInput.addEventListener('change', checkAiRecommendation);

  // Refresh Table
  refreshListBtn.addEventListener('click', loadRecentLogs);

  // Form Submit
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    savePreparationLog();
  });

  // Modal Surplus Submit
  routeSubmitSurplusBtn.addEventListener('click', submitSurplusFood);

  function loadInitialData() {
    Promise.all([
      NutriFlow.apiFetch('/api/v1/meals/sessions/').then(function (r) { return r.json(); }),
      NutriFlow.apiFetch('/api/v1/meals/items/').then(function (r) { return r.json(); }),
      NutriFlow.apiFetch('/api/surplus/safety-rules/').then(function (r) { return r.json(); })
    ])
      .then(function (results) {
        sessionsCache = Array.isArray(results[0]) ? results[0] : (results[0].results || []);
        itemsCache = Array.isArray(results[1]) ? results[1] : (results[1].results || []);
        safetyRulesCache = Array.isArray(results[2]) ? results[2] : (results[2].results || []);

        populateSelect(sessionSelect, sessionsCache, function (s) { return s.name; });
        populateSelect(itemSelect, itemsCache, function (i) { return i.name; });
        populateSelect(routeSafetyRule, safetyRulesCache, function (r) { return r.name + ' (' + r.risk_category + ')'; });

        handleUrlParams();
        loadRecentLogs();
      })
      .catch(function (err) {
        NutriFlow.showAlert('error', 'Error loading meal data: ' + err.message);
      });
  }

  function handleUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var itemId = params.get('item_id');
    var sessionId = params.get('session_id');
    var dateVal = params.get('date');
    var recKg = params.get('recommended_kg');

    if (dateVal) dateInput.value = dateVal;
    if (sessionId) sessionSelect.value = sessionId;
    if (itemId) itemSelect.value = itemId;

    if (recKg && itemId && sessionId) {
      showAiRecommendation(parseFloat(recKg), 'Forecast transfer for ' + (dateVal || 'selected session'));
      prepInput.value = parseFloat(recKg).toFixed(1);
      updateLiveVariance();
    } else {
      checkAiRecommendation();
    }
  }

  function populateSelect(selectEl, list, labelFn) {
    list.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = labelFn(item);
      selectEl.appendChild(opt);
    });
  }

  function checkAiRecommendation() {
    var itemId = itemSelect.value;
    var sessionId = sessionSelect.value;
    var dateStr = dateInput.value;

    if (!itemId || !sessionId || !dateStr) {
      aiCallout.style.display = 'none';
      return;
    }

    var query = '?item_id=' + encodeURIComponent(itemId) +
      '&session_id=' + encodeURIComponent(sessionId) +
      '&date=' + encodeURIComponent(dateStr) +
      '&is_holiday=' + holidaySwitch.checked +
      '&is_exam_period=' + examSwitch.checked;

    NutriFlow.apiFetch('/api/forecasting/predict/' + query)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.recommended_quantity_prepared_kg !== null && res.recommended_quantity_prepared_kg !== undefined) {
          showAiRecommendation(res.recommended_quantity_prepared_kg, 'Baseline: ' + res.baseline_kg + 'kg with context adjustment');
        } else {
          aiCallout.style.display = 'none';
        }
      })
      .catch(function () {
        aiCallout.style.display = 'none';
      });
  }

  function showAiRecommendation(recKg, meta) {
    aiHeadline.textContent = 'Recommended: Prepare ' + parseFloat(recKg).toFixed(1) + ' kg';
    aiSubtext.textContent = meta;
    aiCallout.style.display = 'block';

    applyAiBtn.onclick = function () {
      prepInput.value = parseFloat(recKg).toFixed(1);
      updateLiveVariance();
      NutriFlow.showAlert('success', 'Applied ' + parseFloat(recKg).toFixed(1) + 'kg recommendation to batch.', 3000);
    };
  }

  function updateLiveVariance() {
    var prep = parseFloat(prepInput.value) || 0;
    var cons = parseFloat(consInput.value) || 0;
    var surplus = prep - cons;

    liveSurplusEl.textContent = (surplus >= 0 ? '+' : '') + surplus.toFixed(1) + ' kg';

    if (prep > 0 && cons > 0) {
      if (surplus > 5) {
        liveSurplusEl.style.color = 'var(--nf-warning)';
        liveStatusBadge.className = 'nf-badge nf-badge-warning';
        liveStatusBadge.innerHTML = '<i class="bi bi-box-seam"></i> Surplus Generated';
        liveNotice.textContent = surplus.toFixed(1) + 'kg excess food will be eligible for redistribution after logging.';
      } else if (surplus < 0) {
        liveSurplusEl.style.color = 'var(--nf-danger)';
        liveStatusBadge.className = 'nf-badge nf-badge-danger';
        liveStatusBadge.innerHTML = '<i class="bi bi-dash-circle"></i> Shortage Deficit';
        liveNotice.textContent = 'Consumption exceeded batch preparation by ' + Math.abs(surplus).toFixed(1) + 'kg.';
      } else {
        liveSurplusEl.style.color = 'var(--nf-success)';
        liveStatusBadge.className = 'nf-badge nf-badge-success';
        liveStatusBadge.innerHTML = '<i class="bi bi-check-circle"></i> Optimal Balance';
        liveNotice.textContent = 'Batch perfectly matches dining hall attendance demand.';
      }
    } else {
      liveSurplusEl.style.color = 'var(--nf-ink-900)';
      liveStatusBadge.className = 'nf-badge nf-badge-neutral';
      liveStatusBadge.textContent = 'In Progress';
      liveNotice.textContent = 'Enter prepared & consumed amounts to compute surplus balance.';
    }
  }

  function savePreparationLog() {
    var payload = {
      date: dateInput.value,
      session: parseInt(sessionSelect.value, 10),
      item: parseInt(itemSelect.value, 10),
      quantity_prepared_kg: parseFloat(prepInput.value),
      quantity_consumed_kg: parseFloat(consInput.value),
      headcount: parseInt(headcountInput.value, 10),
      is_holiday: holidaySwitch.checked,
      is_exam_period: examSwitch.checked
    };

    if (!payload.date || !payload.session || !payload.item || isNaN(payload.quantity_prepared_kg) || isNaN(payload.quantity_consumed_kg) || isNaN(payload.headcount)) {
      NutriFlow.showAlert('warning', 'Please fill in all required batch fields.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving Batch...';

    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/', {
      method: 'POST',
      body: payload
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (errData) {
            var msg = 'Failed to save batch.';
            if (errData.non_field_errors) msg = errData.non_field_errors.join(' ');
            else if (typeof errData === 'object') msg = Object.values(errData).flat().join(' ');
            throw new Error(msg);
          });
        }
        return res.json();
      })
      .then(function (createdLog) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save Consumption Log';

        NutriFlow.showAlert('success', 'Meal consumption log successfully recorded!');
        loadRecentLogs();

        var surplusKg = parseFloat(createdLog.surplus_kg) || 0;
        if (surplusKg > 2.0) {
          // Open Surplus Modal for quick handoff
          activeCreatedLogId = createdLog.id;
          var selectedItemObj = itemsCache.find(function (i) { return i.id === payload.item; });
          routeFoodName.value = selectedItemObj ? selectedItemObj.name : 'Prepared Surplus';
          routeQuantity.value = surplusKg.toFixed(1);
          if (safetyRulesCache.length > 0) routeSafetyRule.value = safetyRulesCache[0].id;
          NutriFlow.openModal('prepSurplusModal');
        } else {
          form.reset();
          dateInput.value = todayStr;
          updateLiveVariance();
        }
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save Consumption Log';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function submitSurplusFood() {
    var safetyRuleId = routeSafetyRule.value;
    var qty = parseFloat(routeQuantity.value);

    if (!safetyRuleId || isNaN(qty) || qty <= 0) {
      NutriFlow.showAlert('warning', 'Please specify a valid surplus quantity and safety rule.');
      return;
    }

    routeSubmitSurplusBtn.disabled = true;
    routeSubmitSurplusBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Registering Surplus...';

    var nowIso = new Date().toISOString();
    var payload = {
      meal: activeCreatedLogId,
      food_name: routeFoodName.value,
      safety_rule: parseInt(safetyRuleId, 10),
      quantity: qty,
      quantity_remaining: qty,
      unit: 'KG',
      prepared_at: nowIso,
      storage_location: routeStorageLoc.value || 'Kitchen Counter',
      current_temperature_c: parseFloat(routeTemp.value) || 60.0,
      is_hot_held: routeIsHotHeld.checked,
      is_refrigerated: routeIsRefrigerated.checked
    };

    NutriFlow.apiFetch('/api/surplus/surplus-food/', {
      method: 'POST',
      body: payload
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Surplus registration failed with status ' + res.status);
        return res.json();
      })
      .then(function () {
        routeSubmitSurplusBtn.disabled = false;
        routeSubmitSurplusBtn.innerHTML = '<i class="bi bi-shield-check"></i> Register to Surplus Food Inventory';
        NutriFlow.closeModal('prepSurplusModal');
        NutriFlow.showAlert('success', 'Surplus batch registered and actively monitored in Surplus Management!');
        form.reset();
        dateInput.value = todayStr;
        updateLiveVariance();
      })
      .catch(function (err) {
        routeSubmitSurplusBtn.disabled = false;
        routeSubmitSurplusBtn.innerHTML = '<i class="bi bi-shield-check"></i> Register to Surplus Food Inventory';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function loadRecentLogs() {
    listStatus.innerHTML = '<div style="padding: 14px 20px; color: var(--nf-ink-400); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading logged batches...</div>';

    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listStatus.innerHTML = '';
        var rows = Array.isArray(data) ? data : (data.results || []);

        if (rows.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--nf-ink-400); padding: 24px;">No preparation logs found.</td></tr>';
          return;
        }

        tableBody.innerHTML = '';
        rows.slice(0, 15).forEach(function (row) {
          var tr = document.createElement('tr');
          var prep = parseFloat(row.quantity_prepared_kg) || 0;
          var cons = parseFloat(row.quantity_consumed_kg) || 0;
          var surplus = parseFloat(row.surplus_kg) || (prep - cons);

          var surplusBadge = surplus > 0
            ? '<span class="nf-badge nf-badge-warning">+' + surplus.toFixed(1) + ' kg</span>'
            : (surplus < 0 ? '<span class="nf-badge nf-badge-danger">' + surplus.toFixed(1) + ' kg</span>' : '<span class="nf-badge nf-badge-success">0.0 kg</span>');

          var actionBtn = '';
          if (surplus > 1.0) {
            actionBtn = '<button class="nf-btn nf-btn-outline nf-btn-sm" onclick="window.location.href=\'/surplus/\'" style="font-size: 11.5px; padding: 3px 8px;"><i class="bi bi-box-seam"></i> Surplus</button>';
          }

          tr.innerHTML = '<td><strong>' + (row.date || '—') + '</strong><br><span style="font-size: 12px; color: var(--nf-ink-400);">' + (row.session_name || 'Slot') + '</span></td>' +
            '<td><strong>' + (row.item_name || 'Dish') + '</strong><br><span style="font-size: 11.5px; color: var(--nf-ink-400);">' + (row.headcount || 0) + ' headcount</span></td>' +
            '<td>' + prep.toFixed(1) + ' / ' + cons.toFixed(1) + ' kg</td>' +
            '<td>' + surplusBadge + '</td>' +
            '<td>' + actionBtn + '</td>';

          tableBody.appendChild(tr);
        });
      })
      .catch(function (err) {
        listStatus.innerHTML = '<div style="padding: 14px 20px; color: var(--nf-danger); font-size: 13.5px;">Error loading logs: ' + err.message + '</div>';
      });
  }

  function getTodayDateString() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }
});
