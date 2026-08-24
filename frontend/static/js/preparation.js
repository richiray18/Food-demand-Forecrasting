/* ==========================================================================
   NutriFlow — preparation.js
   Manages meal batch preparation entry, live surplus computation, and audit logs.
   Endpoints:
     GET /api/v1/meals/sessions/
     GET /api/v1/meals/items/
     GET/POST /api/v1/meals/consumption-logs/
     GET /api/forecasting/predict/
     GET /api/surplus/safety-rules/
     POST /api/surplus/surplus-food/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var prepForm = document.getElementById('nfPrepForm');
  var prepDate = document.getElementById('prepDate');
  var prepSession = document.getElementById('prepSession');
  var prepItem = document.getElementById('prepItem');
  var prepHeadcount = document.getElementById('prepHeadcount');
  var prepPrepared = document.getElementById('prepQuantityPrepared');
  var prepConsumed = document.getElementById('prepQuantityConsumed');
  var prepHoliday = document.getElementById('prepIsHoliday');
  var prepExam = document.getElementById('prepIsExam');

  var liveSurplusVal = document.getElementById('prepLiveSurplus');
  var liveStatusBadge = document.getElementById('prepLiveStatusBadge');
  var liveNotice = document.getElementById('prepLiveNotice');

  var aiCallout = document.getElementById('nfPrepAiCallout');
  var aiHeadline = document.getElementById('nfPrepAiHeadline');
  var aiSubtext = document.getElementById('nfPrepAiSubtext');
  var aiApplyBtn = document.getElementById('nfPrepApplyAiBtn');

  var tableBody = document.getElementById('prepTableBody');
  var listStatus = document.getElementById('prepListStatus');
  var refreshBtn = document.getElementById('prepRefreshListBtn');

  // Fast Route Surplus Modal Elements
  var routeModal = document.getElementById('prepSurplusModal');
  var routeFoodName = document.getElementById('routeFoodName');
  var routeQuantity = document.getElementById('routeQuantity');
  var routeStorageLoc = document.getElementById('routeStorageLoc');
  var routeSafetyRule = document.getElementById('routeSafetyRule');
  var routeTemp = document.getElementById('routeTemp');
  var routeIsHotHeld = document.getElementById('routeIsHotHeld');
  var routeIsRefrigerated = document.getElementById('routeIsRefrigerated');
  var routeSubmitBtn = document.getElementById('routeSubmitSurplusBtn');

  var aiTargetKg = null;
  var currentSelectedDishName = '';
  var rawPrepLogsList = [];

  // Set Default Date to Today
  if (prepDate) {
    var todayStr = new Date().toISOString().split('T')[0];
    prepDate.value = todayStr;
  }

  // Load Form Data & Initial Audit List
  loadSessionsAndItems();
  loadSafetyRules();
  loadPrepLogs();

  // Event Listeners
  [prepPrepared, prepConsumed].forEach(function (inp) {
    if (inp) inp.addEventListener('input', calculateLiveSurplus);
  });

  [prepSession, prepItem, prepHeadcount].forEach(function (elem) {
    if (elem) elem.addEventListener('change', fetchAiRecommendation);
  });

  if (prepForm) {
    prepForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submitPreparationLog();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadPrepLogs);
  }

  if (aiApplyBtn) {
    aiApplyBtn.addEventListener('click', function () {
      if (aiTargetKg !== null && prepPrepared) {
        prepPrepared.value = aiTargetKg;
        calculateLiveSurplus();
        NutriFlow.showAlert('success', 'Applied AI recommended target (' + aiTargetKg + ' kg) to batch quantity.');
      }
    });
  }

  if (routeSubmitBtn) {
    routeSubmitBtn.addEventListener('click', submitFastSurplusRoute);
  }

  function loadSessionsAndItems() {
    NutriFlow.apiFetch('/api/v1/meals/sessions/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sessions = Array.isArray(data) ? data : (data.results || []);
        prepSession.innerHTML = '<option value="">Choose session...</option>';
        sessions.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name;
          prepSession.appendChild(opt);
        });
      })
      .catch(function (err) {
        console.error('Error fetching sessions:', err);
      });

    NutriFlow.apiFetch('/api/v1/meals/items/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = Array.isArray(data) ? data : (data.results || []);
        prepItem.innerHTML = '<option value="">Choose dish...</option>';
        items.forEach(function (it) {
          var opt = document.createElement('option');
          opt.value = it.id;
          opt.textContent = it.name;
          prepItem.appendChild(opt);
        });
      })
      .catch(function (err) {
        console.error('Error fetching items:', err);
      });
  }

  function loadSafetyRules() {
    NutriFlow.apiFetch('/api/surplus/safety-rules/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var rules = Array.isArray(data) ? data : (data.results || []);
        routeSafetyRule.innerHTML = '<option value="">Select safety category...</option>';
        rules.forEach(function (rule) {
          var opt = document.createElement('option');
          opt.value = rule.id;
          opt.textContent = rule.name + ' (' + rule.risk_category + ' Risk)';
          routeSafetyRule.appendChild(opt);
        });
      })
      .catch(function (err) {
        console.error('Error loading safety rules:', err);
      });
  }

  function calculateLiveSurplus() {
    var p = parseFloat(prepPrepared.value) || 0;
    var c = parseFloat(prepConsumed.value) || 0;

    if (p <= 0 && c <= 0) {
      liveSurplusVal.textContent = '0.0 kg';
      liveStatusBadge.className = 'nf-badge nf-badge-neutral';
      liveStatusBadge.textContent = 'Awaiting Input';
      liveNotice.textContent = 'Enter prepared & consumed amounts to compute surplus balance.';
      return;
    }

    var diff = p - c;
    if (diff > 0) {
      liveSurplusVal.textContent = '+' + diff.toFixed(1) + ' kg';
      liveSurplusVal.style.color = 'var(--nf-peach-700)';
      liveStatusBadge.className = 'nf-badge nf-badge-peach';
      liveStatusBadge.textContent = 'Surplus Produced';
      liveNotice.textContent = 'Surplus produced! You can immediately route this batch to NGO rescue upon saving.';
    } else if (diff === 0) {
      liveSurplusVal.textContent = '0.0 kg';
      liveSurplusVal.style.color = 'var(--nf-sage-700)';
      liveStatusBadge.className = 'nf-badge nf-badge-sage';
      liveStatusBadge.textContent = 'Zero Waste';
      liveNotice.textContent = 'Exact 100% consumption match. Perfect batch sizing!';
    } else {
      liveSurplusVal.textContent = diff.toFixed(1) + ' kg';
      liveSurplusVal.style.color = 'var(--nf-danger)';
      liveStatusBadge.className = 'nf-badge nf-badge-danger';
      liveStatusBadge.textContent = 'Deficit / Shortage';
      liveNotice.textContent = 'Cooking deficit recorded. Consider increasing headcount baseline.';
    }
  }

  function fetchAiRecommendation() {
    var sVal = prepSession.value;
    var iVal = prepItem.value;
    var hc = parseInt(prepHeadcount.value, 10);

    if (!sVal || !iVal || isNaN(hc) || hc <= 0) return;

    var url = '/api/forecasting/predict/?session=' + encodeURIComponent(sVal) +
              '&item=' + encodeURIComponent(iVal) +
              '&headcount=' + hc +
              '&is_holiday=' + prepHoliday.checked +
              '&is_exam=' + prepExam.checked;

    NutriFlow.apiFetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var rec = parseFloat(data.recommended_kg || data.predicted_quantity_kg || (hc * 0.14)).toFixed(1);
        aiTargetKg = rec;
        aiCallout.style.display = 'block';

        var selectedItemText = prepItem.options[prepItem.selectedIndex].text;
        currentSelectedDishName = selectedItemText;
        aiHeadline.textContent = 'Recommended: Prepare ' + rec + ' kg of ' + selectedItemText;
        aiSubtext.textContent = 'Derived from historical meal demand & current factors.';
      })
      .catch(function (err) {
        console.error('Error fetching AI recommendation:', err);
      });
  }

  function submitPreparationLog() {
    var dateVal = prepDate.value;
    var sessionVal = prepSession.value;
    var itemVal = prepItem.value;
    var hcVal = parseInt(prepHeadcount.value, 10);
    var prepKg = parseFloat(prepPrepared.value);
    var consKg = parseFloat(prepConsumed.value);

    if (!dateVal || !sessionVal || !itemVal || isNaN(hcVal) || isNaN(prepKg) || isNaN(consKg)) {
      NutriFlow.showAlert('warning', 'Please fill out all required log fields.');
      return;
    }

    var submitBtn = document.getElementById('prepSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving Log...';

    var payload = {
      date: dateVal,
      session: parseInt(sessionVal, 10),
      meal_item: parseInt(itemVal, 10),
      headcount_served: hcVal,
      quantity_prepared_kg: prepKg,
      quantity_consumed_kg: consKg,
      is_holiday: prepHoliday.checked,
      is_exam: prepExam.checked
    };

    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/', {
      method: 'POST',
      body: payload
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to save preparation log (' + res.status + ')');
        return res.json();
      })
      .then(function (log) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save Consumption Log';

        NutriFlow.showAlert('success', 'Kitchen batch preparation log successfully saved!');
        prepForm.reset();
        prepDate.value = new Date().toISOString().split('T')[0];
        calculateLiveSurplus();
        loadPrepLogs();

        // Check if Surplus occurred -> prompt fast route modal
        var surplus = prepKg - consKg;
        if (surplus > 0) {
          promptFastSurplusRoute(log.meal_item_name || currentSelectedDishName || 'Surplus Dish', surplus);
        }
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save Consumption Log';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function promptFastSurplusRoute(dishName, surplusKg) {
    routeFoodName.value = dishName;
    routeQuantity.value = surplusKg.toFixed(1);
    NutriFlow.openModal('prepSurplusModal');
  }

  function submitFastSurplusRoute() {
    var foodName = routeFoodName.value;
    var qty = parseFloat(routeQuantity.value);
    var safetyRuleId = routeSafetyRule.value;
    var storageLoc = routeStorageLoc.value;
    var temp = parseFloat(routeTemp.value);

    if (!foodName || isNaN(qty) || qty <= 0 || !safetyRuleId) {
      NutriFlow.showAlert('warning', 'Please provide food safety category and valid quantity.');
      return;
    }

    routeSubmitBtn.disabled = true;
    routeSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Registering Surplus...';

    var payload = {
      food_name: foodName,
      quantity: qty,
      quantity_remaining: qty,
      unit: 'KG',
      safety_rule: parseInt(safetyRuleId, 10),
      prepared_at: new Date().toISOString(),
      storage_location: storageLoc || 'Dining Hall Kitchen Counter',
      current_temperature_c: isNaN(temp) ? 62.0 : temp,
      is_hot_held: routeIsHotHeld.checked,
      is_refrigerated: routeIsRefrigerated.checked
    };

    NutriFlow.apiFetch('/api/surplus/surplus-food/', {
      method: 'POST',
      body: payload
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to register surplus food batch');
        return res.json();
      })
      .then(function () {
        routeSubmitBtn.disabled = false;
        routeSubmitBtn.innerHTML = '<i class="bi bi-shield-check"></i> Register to Surplus Inventory';
        NutriFlow.closeModal('prepSurplusModal');
        NutriFlow.showAlert('success', 'Surplus batch registered to HACCP monitor! Redirecting to surplus tab...', 'nfMessages');
        setTimeout(function () {
          window.location.href = '/surplus/';
        }, 1500);
      })
      .catch(function (err) {
        routeSubmitBtn.disabled = false;
        routeSubmitBtn.innerHTML = '<i class="bi bi-shield-check"></i> Register to Surplus Inventory';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function loadPrepLogs() {
    listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-ink-600); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading audit log history...</div>';

    NutriFlow.apiFetch('/api/v1/meals/consumption-logs/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listStatus.innerHTML = '';
        rawPrepLogsList = Array.isArray(data) ? data : (data.results || []);

        if (rawPrepLogsList.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="5">' + NutriFlow.createEmptyState('No preparation logs recorded yet', 'Use the log form on the left to record today\'s meal batch details.', 'bi-pencil-square') + '</td></tr>';
          return;
        }

        renderAuditTable(rawPrepLogsList);
      })
      .catch(function (err) {
        listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-danger); font-size: 13.5px;">Error loading logs: ' + err.message + '</div>';
      });
  }

  function renderAuditTable(logs) {
    tableBody.innerHTML = '';

    logs.forEach(function (log) {
      var tr = document.createElement('tr');
      var prep = parseFloat(log.quantity_prepared_kg) || 0;
      var cons = parseFloat(log.quantity_consumed_kg) || 0;
      var diff = prep - cons;

      var dishName = log.meal_item_name || log.item_name || 'Dal Tadka & Rice';
      var imgUrl = NutriFlow.getFoodImage(dishName);

      var surplusBadge = '';
      if (diff > 0) {
        surplusBadge = '<span class="nf-badge nf-badge-peach"><i class="bi bi-box-seam"></i> +' + diff.toFixed(1) + ' kg Surplus</span>';
      } else if (diff === 0) {
        surplusBadge = '<span class="nf-badge nf-badge-sage"><i class="bi bi-check-circle"></i> Exact Match</span>';
      } else {
        surplusBadge = '<span class="nf-badge nf-badge-danger"><i class="bi bi-exclamation-triangle"></i> ' + diff.toFixed(1) + ' kg Shortage</span>';
      }

      var actionHtml = diff > 0
        ? '<button class="nf-btn nf-btn-outline nf-btn-sm" onclick="window.NutriFlowPrep.routeSurplus(\'' + encodeURIComponent(dishName) + '\', ' + diff + ')" style="font-size: 12px; padding: 4px 8px;"><i class="bi bi-box-arrow-up-right"></i> Route Surplus</button>'
        : '<span style="font-size: 12px; color: var(--nf-ink-600); font-style: italic;">No Surplus</span>';

      tr.innerHTML = '<td><strong style="color: var(--nf-ink-900);">' + (log.date || 'Today') + '</strong><br><span class="nf-badge nf-badge-neutral">' + (log.session_name || 'Session') + '</span></td>' +
        '<td><div class="nf-food-cell"><img src="' + imgUrl + '" class="nf-food-thumb" alt="Dish"><div><strong style="color: var(--nf-ink-900);">' + dishName + '</strong><div style="font-size: 11.5px; color: var(--nf-ink-600);">' + (log.headcount_served || 0) + ' headcount</div></div></div></td>' +
        '<td><strong style="color: var(--nf-pink-600); font-family: var(--nf-font-mono);">' + prep.toFixed(1) + ' kg</strong> prep<br><strong style="color: var(--nf-sage-600); font-family: var(--nf-font-mono);">' + cons.toFixed(1) + ' kg</strong> consumed</td>' +
        '<td>' + surplusBadge + '</td>' +
        '<td>' + actionHtml + '</td>';

      tableBody.appendChild(tr);
    });
  }

  window.NutriFlowPrep = {
    routeSurplus: function (dishEnc, qty) {
      promptFastSurplusRoute(decodeURIComponent(dishEnc), parseFloat(qty));
    }
  };
});
