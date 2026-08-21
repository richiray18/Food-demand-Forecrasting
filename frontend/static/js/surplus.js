/* ==========================================================================
   NutriFlow — surplus.js
   Manages surplus food listings, HACCP time/temperature tracking, and disposal.
   Endpoints:
     GET/POST /api/surplus/surplus-food/
     GET /api/surplus/safety-rules/
     POST /api/surplus/surplus-food/{id}/log_temperature/
     POST /api/surplus/surplus-food/{id}/discard/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var tableBody = document.getElementById('surplusTableBody');
  var listStatus = document.getElementById('surplusListStatus');
  var searchInput = document.getElementById('surplusSearchInput');
  var statusFilterGroup = document.getElementById('surplusStatusFilters');

  var statAvailable = document.getElementById('surplusStatAvailable');
  var statCritical = document.getElementById('surplusStatCritical');
  var statClaimed = document.getElementById('surplusStatClaimed');

  // Modals & Forms
  var openAddModalBtn = document.getElementById('nfOpenAddSurplusModalBtn');
  var addSurplusForm = document.getElementById('addSurplusForm');
  var addSafetyRuleSelect = document.getElementById('addSafetyRule');

  var logTempForm = document.getElementById('logTempForm');
  var tempSurplusId = document.getElementById('tempSurplusId');
  var tempFoodTitle = document.getElementById('tempFoodTitle');
  var tempLocationTitle = document.getElementById('tempLocationTitle');
  var tempInputCelsius = document.getElementById('tempInputCelsius');

  var discardForm = document.getElementById('discardForm');
  var discardSurplusId = document.getElementById('discardSurplusId');
  var discardReason = document.getElementById('discardReason');

  var rawSurplusList = [];
  var safetyRulesList = [];
  var currentFilter = 'all';
  var timerInterval = null;

  // Initialize
  loadSafetyRules();
  loadSurplusData();

  // Event Listeners
  if (openAddModalBtn) {
    openAddModalBtn.addEventListener('click', function () {
      NutriFlow.openModal('addSurplusModal');
    });
  }

  statusFilterGroup.addEventListener('click', function (e) {
    if (e.target.tagName === 'BUTTON') {
      Array.from(statusFilterGroup.children).forEach(function (b) {
        b.className = 'nf-btn nf-btn-outline nf-btn-sm';
      });
      e.target.className = 'nf-btn nf-btn-primary nf-btn-sm';
      currentFilter = e.target.getAttribute('data-filter');
      applyFilters();
    }
  });

  searchInput.addEventListener('input', applyFilters);

  addSurplusForm.addEventListener('submit', function (e) {
    e.preventDefault();
    createSurplusBatch();
  });

  logTempForm.addEventListener('submit', function (e) {
    e.preventDefault();
    submitTemperatureLog();
  });

  discardForm.addEventListener('submit', function (e) {
    e.preventDefault();
    submitDiscardAction();
  });

  function loadSafetyRules() {
    NutriFlow.apiFetch('/api/surplus/safety-rules/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        safetyRulesList = Array.isArray(data) ? data : (data.results || []);
        addSafetyRuleSelect.innerHTML = '<option value="">Select food safety risk category...</option>';
        safetyRulesList.forEach(function (rule) {
          var opt = document.createElement('option');
          opt.value = rule.id;
          opt.textContent = rule.name + ' (' + rule.risk_category + ' Risk) — Max ' + Math.round(rule.max_hold_minutes_danger_zone / 60) + 'h Ambient';
          addSafetyRuleSelect.appendChild(opt);
        });
      })
      .catch(function (err) {
        console.error('Error loading safety rules:', err);
      });
  }

  function loadSurplusData() {
    listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-ink-400); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading active surplus inventory...</div>';

    NutriFlow.apiFetch('/api/surplus/surplus-food/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listStatus.innerHTML = '';
        rawSurplusList = Array.isArray(data) ? data : (data.results || []);
        updateSurplusKPIs();
        applyFilters();
        startCountdownTicker();
      })
      .catch(function (err) {
        listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-danger); font-size: 13.5px;">Error loading surplus data: ' + err.message + '</div>';
      });
  }

  function updateSurplusKPIs() {
    var availKg = 0;
    var criticalCount = 0;
    var claimedKg = 0;
    var now = new Date();

    rawSurplusList.forEach(function (item) {
      var remaining = parseFloat(item.quantity_remaining) || 0;
      var total = parseFloat(item.quantity) || 0;

      if (item.status === 'AVAILABLE') {
        availKg += remaining;
        if (item.safe_until) {
          var safeUntilDate = new Date(item.safe_until);
          var minsLeft = (safeUntilDate - now) / 60000;
          if (minsLeft > 0 && minsLeft <= 60) {
            criticalCount++;
          }
        }
      } else if (item.status === 'RESERVED' || item.status === 'PICKED_UP') {
        claimedKg += total;
      }
    });

    statAvailable.innerHTML = availKg.toFixed(1) + '<span class="unit">kg</span>';
    statCritical.textContent = criticalCount.toString();
    statClaimed.innerHTML = claimedKg.toFixed(1) + '<span class="unit">kg</span>';
  }

  function applyFilters() {
    var searchVal = (searchInput.value || '').toLowerCase().trim();

    var filtered = rawSurplusList.filter(function (item) {
      // Status Filter
      if (currentFilter !== 'all' && item.status !== currentFilter) {
        return false;
      }
      // Search Query
      if (searchVal) {
        var foodMatch = (item.food_name || '').toLowerCase().includes(searchVal);
        var locMatch = (item.storage_location || '').toLowerCase().includes(searchVal);
        if (!foodMatch && !locMatch) return false;
      }
      return true;
    });

    renderTable(filtered);
  }

  function renderTable(list) {
    if (list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--nf-ink-400); padding: 36px;">No surplus batches match the selected criteria.</td></tr>';
      return;
    }

    tableBody.innerHTML = '';
    var now = new Date();

    list.forEach(function (item) {
      var tr = document.createElement('tr');

      // Countdown & Urgency
      var countdownHtml = '<span class="nf-badge nf-badge-neutral">—</span>';
      if (item.safe_until) {
        var safeUntil = new Date(item.safe_until);
        var diffMs = safeUntil - now;
        var diffMins = Math.floor(diffMs / 60000);

        if (item.status === 'EXPIRED' || item.status === 'DISCARDED' || diffMs <= 0) {
          countdownHtml = '<span class="nf-countdown critical"><i class="bi bi-x-circle-fill"></i> Expired</span>';
        } else if (diffMins <= 30) {
          countdownHtml = '<span class="nf-countdown critical"><i class="bi bi-alarm-fill"></i> ' + diffMins + 'm left</span>';
        } else if (diffMins <= 90) {
          countdownHtml = '<span class="nf-countdown warning"><i class="bi bi-clock-history"></i> ' + diffMins + 'm left</span>';
        } else {
          var hours = Math.floor(diffMins / 60);
          var mins = diffMins % 60;
          countdownHtml = '<span class="nf-countdown safe"><i class="bi bi-shield-check"></i> ' + hours + 'h ' + mins + 'm safe</span>';
        }
      }

      // Storage & Temperature Badge
      var tempVal = item.current_temperature_c !== null ? (parseFloat(item.current_temperature_c).toFixed(1) + '°C') : 'Not probed';
      var modeBadge = item.is_hot_held ? '<span class="nf-badge nf-badge-warning">Hot-held</span>' :
        (item.is_refrigerated ? '<span class="nf-badge nf-badge-info">Refrigerated</span>' : '<span class="nf-badge nf-badge-neutral">Ambient</span>');

      // Status Badge
      var statusBadge = '';
      if (item.status === 'AVAILABLE') statusBadge = '<span class="nf-badge nf-badge-success"><i class="bi bi-check-circle"></i> Available</span>';
      else if (item.status === 'RESERVED') statusBadge = '<span class="nf-badge nf-badge-warning"><i class="bi bi-lock-fill"></i> Reserved</span>';
      else if (item.status === 'PICKED_UP') statusBadge = '<span class="nf-badge nf-badge-info"><i class="bi bi-truck"></i> Picked Up</span>';
      else if (item.status === 'EXPIRED') statusBadge = '<span class="nf-badge nf-badge-danger"><i class="bi bi-exclamation-triangle"></i> Expired</span>';
      else statusBadge = '<span class="nf-badge nf-badge-danger"><i class="bi bi-trash"></i> Discarded</span>';

      // Actions
      var isActionable = (item.status === 'AVAILABLE' && item.is_safe);
      var actionsHtml = '<div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">';

      if (isActionable) {
        actionsHtml += '<button class="nf-btn nf-btn-primary nf-btn-sm" onclick="window.location.href=\'/recipients/?surplus_id=' + item.id + '\'" style="font-size: 12px; padding: 4px 10px;" title="Find Best Recipient NGO">' +
          '<i class="bi bi-people-fill"></i> Match NGO' +
          '</button>';
      }

      actionsHtml += '<button class="nf-btn nf-btn-outline nf-btn-sm" onclick="window.NutriFlowSurplus.openTempModal(\'' + item.id + '\', \'' + encodeURIComponent(item.food_name) + '\', \'' + encodeURIComponent(item.storage_location || '') + '\')" style="font-size: 12px; padding: 4px 8px;" title="Log Temperature">' +
        '<i class="bi bi-thermometer-half"></i> Probe' +
        '</button>';

      if (item.status !== 'DISCARDED' && item.status !== 'PICKED_UP') {
        actionsHtml += '<button class="nf-btn nf-btn-outline nf-btn-sm" onclick="window.NutriFlowSurplus.openDiscardModal(\'' + item.id + '\')" style="font-size: 12px; padding: 4px 8px; color: var(--nf-danger); border-color: rgba(196,68,46,0.3);" title="Discard Food">' +
          '<i class="bi bi-trash3"></i>' +
          '</button>';
      }

      actionsHtml += '</div>';

      tr.innerHTML = '<td><strong style="color: var(--nf-green-900); font-size: 14.5px;">' + (item.food_name || 'Batch') + '</strong><br><span style="font-size: 12px; color: var(--nf-ink-400);">' + (item.storage_location || 'Main Pantry') + '</span></td>' +
        '<td><strong>' + parseFloat(item.quantity_remaining).toFixed(1) + ' ' + (item.unit || 'KG') + '</strong><br><span style="font-size: 11.5px; color: var(--nf-ink-400);">of ' + parseFloat(item.quantity).toFixed(1) + ' ' + item.unit + ' initial</span></td>' +
        '<td>' + modeBadge + ' <strong style="font-family: var(--nf-font-mono); font-size: 13px;">' + tempVal + '</strong></td>' +
        '<td><span style="font-size: 13px; font-weight: 500;">' + (item.safety_rule_name || 'TCS High Risk') + '</span></td>' +
        '<td>' + countdownHtml + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + actionsHtml + '</td>';

      tableBody.appendChild(tr);
    });
  }

  function startCountdownTicker() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      applyFilters();
    }, 60000); // refresh every minute
  }

  function createSurplusBatch() {
    var foodName = document.getElementById('addFoodName').value.trim();
    var quantity = parseFloat(document.getElementById('addQuantity').value);
    var unit = document.getElementById('addUnit').value;
    var safetyRuleId = document.getElementById('addSafetyRule').value;
    var storageLoc = document.getElementById('addStorageLoc').value.trim();
    var tempC = parseFloat(document.getElementById('addTemp').value);
    var isHotHeld = document.getElementById('addIsHotHeld').checked;
    var isRefrigerated = document.getElementById('addIsRefrigerated').checked;

    if (!foodName || isNaN(quantity) || quantity <= 0 || !safetyRuleId) {
      NutriFlow.showAlert('warning', 'Please provide item name, quantity, and safety classification.');
      return;
    }

    var submitBtn = document.getElementById('addSurplusSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving Batch...';

    var payload = {
      food_name: foodName,
      quantity: quantity,
      quantity_remaining: quantity,
      unit: unit,
      safety_rule: parseInt(safetyRuleId, 10),
      prepared_at: new Date().toISOString(),
      storage_location: storageLoc || 'Dining Hall Kitchen',
      current_temperature_c: isNaN(tempC) ? (isHotHeld ? 62.0 : (isRefrigerated ? 4.0 : 25.0)) : tempC,
      is_hot_held: isHotHeld,
      is_refrigerated: isRefrigerated
    };

    NutriFlow.apiFetch('/api/surplus/surplus-food/', {
      method: 'POST',
      body: payload
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Surplus creation failed (' + res.status + ')');
        return res.json();
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> Register Batch';
        NutriFlow.closeModal('addSurplusModal');
        addSurplusForm.reset();
        NutriFlow.showAlert('success', 'Surplus food batch successfully registered!');
        loadSurplusData();
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> Register Batch';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function submitTemperatureLog() {
    var surplusId = tempSurplusId.value;
    var tempC = parseFloat(tempInputCelsius.value);

    if (isNaN(tempC)) {
      NutriFlow.showAlert('warning', 'Please input a valid numeric temperature reading.');
      return;
    }

    var submitBtn = document.getElementById('logTempSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Logging...';

    NutriFlow.apiFetch('/api/surplus/surplus-food/' + surplusId + '/log_temperature/', {
      method: 'POST',
      body: { temperature_c: tempC }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to record temperature reading');
        return res.json();
      })
      .then(function (result) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-save"></i> Save Temperature Reading';
        NutriFlow.closeModal('logTempModal');

        var isSafe = result.is_safe;
        if (!isSafe) {
          NutriFlow.showAlert('error', 'HACCP Warning: Temperature placed food outside safe parameters. Status marked EXPIRED.');
        } else {
          NutriFlow.showAlert('success', 'Temperature logged (' + tempC.toFixed(1) + '°C). Batch remains within safe shelf-life window.');
        }
        loadSurplusData();
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-save"></i> Save Temperature Reading';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function submitDiscardAction() {
    var surplusId = discardSurplusId.value;
    var reason = discardReason.value;

    var submitBtn = document.getElementById('discardSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Discarding...';

    NutriFlow.apiFetch('/api/surplus/surplus-food/' + surplusId + '/discard/', {
      method: 'POST',
      body: { reason: reason }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Discard failed with status ' + res.status);
        return res.json();
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-trash3"></i> Confirm Disposal';
        NutriFlow.closeModal('discardModal');
        NutriFlow.showAlert('info', 'Batch marked as discarded and removed from active redistribution.');
        loadSurplusData();
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-trash3"></i> Confirm Disposal';
        NutriFlow.showAlert('error', err.message);
      });
  }

  // Global namespace for inline onclick handlers
  window.NutriFlowSurplus = {
    openTempModal: function (id, foodNameEnc, locEnc) {
      tempSurplusId.value = id;
      tempFoodTitle.textContent = decodeURIComponent(foodNameEnc);
      tempLocationTitle.textContent = decodeURIComponent(locEnc) || 'Main Kitchen Storage';
      tempInputCelsius.value = '';
      NutriFlow.openModal('logTempModal');
    },
    openDiscardModal: function (id) {
      discardSurplusId.value = id;
      NutriFlow.openModal('discardModal');
    }
  };
});
