/* ==========================================================================
   NutriFlow — surplus.js
   Handles the Surplus page: loads safety rules, registers surplus,
   lists/filters surplus items, logs temperatures, discards items, and
   shows on-demand temperature history. Talks to the real Django REST API.
   Cross-checked against: surplus/models.py, serializers.py, views.py, urls.py
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {

  /* ------------------------------------------------------------------ */
  /* Endpoint constants — change here only if backend routes change     */
  /* ------------------------------------------------------------------ */
  var API_BASE = 'http://127.0.0.1:8000/api/surplus/';
  var SAFETY_RULES_URL = API_BASE + 'safety-rules/';
  var SURPLUS_URL = API_BASE + 'surplus-food/';
  var TEMP_LOGS_URL = API_BASE + 'temperature-logs/';
  var LOGIN_URL = '../accounts/login.html';

  var STATUS_BADGE_CLASS = {
    AVAILABLE: 'nf-badge-success',
    RESERVED: 'nf-badge-info',
    PICKED_UP: 'nf-badge-neutral',
    EXPIRED: 'nf-badge-danger',
    DISCARDED: 'nf-badge-warning'
  };

  var STATUS_LABEL = {
    AVAILABLE: 'Available',
    RESERVED: 'Reserved for pickup',
    PICKED_UP: 'Picked up',
    EXPIRED: 'Expired / unsafe',
    DISCARDED: 'Discarded'
  };

  /* ------------------------------------------------------------------ */
  /* Element references                                                 */
  /* ------------------------------------------------------------------ */
  var form = document.getElementById('nfSurplusForm');
  var foodNameInput = document.getElementById('surFoodName');
  var safetyRuleSelect = document.getElementById('surSafetyRule');
  var quantityInput = document.getElementById('surQuantity');
  var unitSelect = document.getElementById('surUnit');
  var preparedAtInput = document.getElementById('surPreparedAt');
  var storageLocationInput = document.getElementById('surStorageLocation');
  var currentTempInput = document.getElementById('surCurrentTemp');
  var isRefrigeratedCheckbox = document.getElementById('surIsRefrigerated');
  var isHotHeldCheckbox = document.getElementById('surIsHotHeld');

  var submitBtn = document.getElementById('nfSurplusSubmitBtn');
  var submitBtnText = document.getElementById('nfSurplusSubmitBtnText');
  var formStatus = document.getElementById('nfSurplusFormStatus');

  var searchInput = document.getElementById('surSearch');
  var statusFilterSelect = document.getElementById('surStatusFilter');
  var refrigeratedFilterSelect = document.getElementById('surRefrigeratedFilter');
  var hotHeldFilterSelect = document.getElementById('surHotHeldFilter');
  var orderingSelect = document.getElementById('surOrdering');
  var availableOnlyCheckbox = document.getElementById('surAvailableOnly');
  var refreshBtn = document.getElementById('nfRefreshSurplusBtn');

  var listStatus = document.getElementById('nfSurplusListStatus');
  var grid = document.getElementById('nfSurplusGrid');

  /* ------------------------------------------------------------------ */
  /* Auth guard — same pattern as preparation.js                        */
  /* ------------------------------------------------------------------ */
  var token = localStorage.getItem('access_token');
  if (!token) {
    window.location.href = LOGIN_URL;
    return;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */
  var safetyRulesById = {};
  var searchDebounceTimer = null;

  /* ------------------------------------------------------------------ */
  /* Init                                                               */
  /* ------------------------------------------------------------------ */
  loadSafetyRules();
  loadSurplus();

  form.addEventListener('submit', handleCreateSubmit);
  refreshBtn.addEventListener('click', loadSurplus);
  statusFilterSelect.addEventListener('change', loadSurplus);
  refrigeratedFilterSelect.addEventListener('change', loadSurplus);
  hotHeldFilterSelect.addEventListener('change', loadSurplus);
  orderingSelect.addEventListener('change', loadSurplus);
  availableOnlyCheckbox.addEventListener('change', loadSurplus);

  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(loadSurplus, 400);
  });

  // Recompute countdown labels every 30 seconds without refetching.
  setInterval(updateAllCountdowns, 30000);

  /* ------------------------------------------------------------------ */
  /* Auth helpers — same pattern as preparation.js                      */
  /* ------------------------------------------------------------------ */
  function authHeaders(extra) {
    var headers = { 'Authorization': 'Bearer ' + token };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          headers[key] = extra[key];
        }
      }
    }
    return headers;
  }

  function handleAuthError(response) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = LOGIN_URL;
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Load safety rules dropdown — GET /api/surplus/safety-rules/        */
  /* ------------------------------------------------------------------ */
  function loadSafetyRules() {
    fetch(SAFETY_RULES_URL, { headers: authHeaders() })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;
        var rows = Array.isArray(data) ? data : (data.results || []);

        safetyRuleSelect.innerHTML = '';
        safetyRulesById = {};

        if (rows.length === 0) {
          safetyRuleSelect.innerHTML = '<option value="" selected disabled>No safety rules available</option>';
          return;
        }

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.textContent = 'Select safety rule';
        safetyRuleSelect.appendChild(placeholder);

        rows.forEach(function (rule) {
          safetyRulesById[rule.id] = rule;

          var opt = document.createElement('option');
          opt.value = rule.id;
          opt.textContent = rule.name + ' (' + rule.risk_category + ')';
          safetyRuleSelect.appendChild(opt);
        });
      })
      .catch(function () {
        safetyRuleSelect.innerHTML = '<option value="" selected disabled>Failed to load safety rules</option>';
        showFormStatus('error', 'Could not load safety rules from the server.');
      });
  }

  /* ------------------------------------------------------------------ */
  /* Create surplus entry — POST /api/surplus/surplus-food/             */
  /* Writable fields per SurplusFoodSerializer read_only_fields list:   */
  /* meal, food_name, safety_rule, quantity, unit, prepared_at,         */
  /* storage_location, current_temperature_c, is_refrigerated,          */
  /* is_hot_held (status/safe_until/quantity_remaining/etc. are         */
  /* read-only and calculated server-side).                             */
  /* ------------------------------------------------------------------ */
  function handleCreateSubmit(event) {
    event.preventDefault();
    hideFormStatus();

    var foodName = foodNameInput.value.trim();
    var safetyRule = safetyRuleSelect.value;
    var quantity = quantityInput.value;
    var preparedAt = preparedAtInput.value;

    if (!foodName) {
      showFormStatus('error', 'Please enter the food name.');
      foodNameInput.focus();
      return;
    }

    if (!safetyRule) {
      showFormStatus('error', 'Please select a safety rule.');
      safetyRuleSelect.focus();
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      showFormStatus('error', 'Quantity must be greater than zero.');
      quantityInput.focus();
      return;
    }

    if (!preparedAt) {
      showFormStatus('error', 'Please set the prepared-at date and time.');
      preparedAtInput.focus();
      return;
    }

    var payload = {
      food_name: foodName,
      safety_rule: Number(safetyRule),
      quantity: Number(quantity),
      unit: unitSelect.value,
      prepared_at: new Date(preparedAt).toISOString(),
      storage_location: storageLocationInput.value.trim(),
      is_refrigerated: isRefrigeratedCheckbox.checked,
      is_hot_held: isHotHeldCheckbox.checked
    };

    if (currentTempInput.value !== '') {
      payload.current_temperature_c = Number(currentTempInput.value);
    }

    setSubmitting(true);

    fetch(SURPLUS_URL, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        return response.json().then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
      })
      .then(function (result) {
        setSubmitting(false);
        if (result === null) return;

        if (!result.ok) {
          showFormStatus('error', formatApiError(result.status, result.data));
          return;
        }

        showFormStatus('success', 'Surplus registered: ' + result.data.food_name + '.');
        form.reset();
        loadSurplus();
      })
      .catch(function () {
        setSubmitting(false);
        showFormStatus('error', 'Network error. Please check your connection and try again.');
      });
  }

  function formatApiError(status, data) {
    if (status === 400 && data && typeof data === 'object') {
      var parts = [];
      for (var field in data) {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
          var value = data[field];
          var text = Array.isArray(value) ? value.join(' ') : String(value);
          parts.push(field + ': ' + text);
        }
      }
      if (parts.length > 0) return parts.join(' | ');
    }
    return 'Request failed (status ' + status + ').';
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtnText.textContent = isSubmitting ? 'Registering...' : 'Register Surplus';
  }

  /* ------------------------------------------------------------------ */
  /* Load / filter surplus list — GET /api/surplus/surplus-food/        */
  /* Supported query params per SurplusFoodViewSet:                     */
  /* status, unit, is_refrigerated, is_hot_held (DjangoFilterBackend),  */
  /* search (SearchFilter on food_name/storage_location),               */
  /* ordering (OrderingFilter on safe_until/created_at/quantity_remaining), */
  /* available_only=true (custom get_queryset filter)                   */
  /* ------------------------------------------------------------------ */
  function loadSurplus() {
    listStatus.innerHTML = '<div class="nf-alert nf-alert-info">Loading surplus food...</div>';
    grid.innerHTML = '';

    var params = new URLSearchParams();

    if (searchInput.value.trim()) {
      params.set('search', searchInput.value.trim());
    }
    if (statusFilterSelect.value) {
      params.set('status', statusFilterSelect.value);
    }
    if (refrigeratedFilterSelect.value) {
      params.set('is_refrigerated', refrigeratedFilterSelect.value);
    }
    if (hotHeldFilterSelect.value) {
      params.set('is_hot_held', hotHeldFilterSelect.value);
    }
    if (orderingSelect.value) {
      params.set('ordering', orderingSelect.value);
    }
    if (availableOnlyCheckbox.checked) {
      params.set('available_only', 'true');
    }

    var url = SURPLUS_URL + (params.toString() ? '?' + params.toString() : '');

    fetch(url, { headers: authHeaders() })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;
        var rows = Array.isArray(data) ? data : (data.results || []);

        if (rows.length === 0) {
          listStatus.innerHTML = '<div class="nf-alert nf-alert-warning">No surplus food records found.</div>';
          return;
        }

        listStatus.innerHTML = '';
        renderGrid(rows);
      })
      .catch(function () {
        listStatus.innerHTML = '<div class="nf-alert nf-alert-error">Could not load surplus food. Please try again.</div>';
      });
  }

  /* ------------------------------------------------------------------ */
  /* Render surplus cards using SurplusFoodSerializer response fields   */
  /* ------------------------------------------------------------------ */
  function renderGrid(rows) {
    grid.innerHTML = '';

    rows.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'nf-card nf-surplus-card';
      card.dataset.safeUntil = item.safe_until;
      card.dataset.itemId = item.id;

      var header = document.createElement('div');
      header.className = 'nf-surplus-card-header';

      var title = document.createElement('h4');
      title.className = 'nf-surplus-card-title';
      title.textContent = item.food_name;

      var badge = document.createElement('span');
      badge.className = 'nf-badge ' + (STATUS_BADGE_CLASS[item.status] || 'nf-badge-neutral');
      badge.textContent = STATUS_LABEL[item.status] || item.status;

      header.appendChild(title);
      header.appendChild(badge);
      card.appendChild(header);

      var meta = document.createElement('div');
      meta.className = 'nf-surplus-meta';

      var rule = safetyRulesById[item.safety_rule];
      var ruleLine = '<strong>Safety rule:</strong> ' + (item.safety_rule_name || '—');
      if (rule) {
        ruleLine += ' &middot; ' + item.danger_zone_minutes_elapsed + ' / ' + rule.max_hold_minutes_danger_zone + ' min in danger zone';
      }

      meta.innerHTML =
        '<div><strong>Quantity:</strong> ' + formatNumber(item.quantity_remaining) + ' / ' + formatNumber(item.quantity) + ' ' + item.unit.toLowerCase() + ' remaining</div>' +
        '<div><strong>Location:</strong> ' + (item.storage_location || '—') + '</div>' +
        '<div>' + ruleLine + '</div>' +
        '<div><strong>Current temp:</strong> ' + (item.current_temperature_c !== null && item.current_temperature_c !== undefined ? item.current_temperature_c + ' °C' : '—') + '</div>' +
        '<div><strong>' + (item.is_refrigerated ? 'Refrigerated' : (item.is_hot_held ? 'Hot held' : 'Ambient')) + '</strong></div>';

      card.appendChild(meta);

      var countdown = document.createElement('div');
      countdown.className = 'nf-surplus-countdown';
      countdown.dataset.role = 'countdown';
      card.appendChild(countdown);

      var actions = document.createElement('div');
      actions.className = 'nf-surplus-card-actions';

      var canAct = item.status === 'AVAILABLE' || item.status === 'RESERVED';

      if (canAct) {
        var tempForm = document.createElement('form');
        tempForm.className = 'nf-surplus-temp-form';

        var tempInput = document.createElement('input');
        tempInput.type = 'number';
        tempInput.step = '0.1';
        tempInput.placeholder = '°C';
        tempInput.required = true;

        var tempBtn = document.createElement('button');
        tempBtn.type = 'submit';
        tempBtn.className = 'nf-btn nf-btn-outline nf-btn-sm';
        tempBtn.textContent = 'Log temp';

        tempForm.appendChild(tempInput);
        tempForm.appendChild(tempBtn);

        tempForm.addEventListener('submit', function (event) {
          event.preventDefault();
          handleLogTemperature(item.id, tempInput.value, tempBtn);
        });

        actions.appendChild(tempForm);

        var discardBtn = document.createElement('button');
        discardBtn.type = 'button';
        discardBtn.className = 'nf-btn nf-btn-danger nf-btn-sm';
        discardBtn.textContent = 'Discard';
        discardBtn.addEventListener('click', function () {
          handleDiscard(item.id);
        });
        actions.appendChild(discardBtn);
      }

      var historyBtn = document.createElement('button');
      historyBtn.type = 'button';
      historyBtn.className = 'nf-btn nf-btn-outline nf-btn-sm';
      historyBtn.textContent = 'View log history';

      var historyBox = document.createElement('div');
      historyBox.className = 'nf-surplus-history';

      historyBtn.addEventListener('click', function () {
        toggleHistory(item.id, historyBox);
      });

      actions.appendChild(historyBtn);
      card.appendChild(actions);
      card.appendChild(historyBox);

      grid.appendChild(card);
    });

    updateAllCountdowns();
  }

  /* ------------------------------------------------------------------ */
  /* Log temperature — POST /api/surplus/surplus-food/<id>/log_temperature/ */
  /* Body: { temperature_c }. Response: { log, is_safe, status }        */
  /* ------------------------------------------------------------------ */
  function handleLogTemperature(itemId, tempValue, buttonEl) {
    if (tempValue === '' || isNaN(Number(tempValue))) {
      listStatus.innerHTML = '<div class="nf-alert nf-alert-error">Please enter a valid temperature.</div>';
      return;
    }

    var originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Logging...';

    fetch(SURPLUS_URL + itemId + '/log_temperature/', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ temperature_c: Number(tempValue) })
    })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        return response.json().then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
      })
      .then(function (result) {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;

        if (result === null) return;

        if (!result.ok) {
          listStatus.innerHTML = '<div class="nf-alert nf-alert-error">' + formatApiError(result.status, result.data) + '</div>';
          return;
        }

        listStatus.innerHTML = '<div class="nf-alert nf-alert-success">Temperature logged. Status: ' + (STATUS_LABEL[result.data.status] || result.data.status) + '.</div>';
        loadSurplus();
      })
      .catch(function () {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
        listStatus.innerHTML = '<div class="nf-alert nf-alert-error">Could not log temperature. Please try again.</div>';
      });
  }

  /* ------------------------------------------------------------------ */
  /* Discard — POST /api/surplus/surplus-food/<id>/discard/             */
  /* Body: { reason } (optional, backend defaults to "Manually discarded.") */
  /* ------------------------------------------------------------------ */
  function handleDiscard(itemId) {
    var confirmed = window.confirm('Discard this surplus item? This cannot be undone.');
    if (!confirmed) return;

    var reason = window.prompt('Reason for discarding (optional):', '') || '';

    fetch(SURPLUS_URL + itemId + '/discard/', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason: reason })
    })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;
        listStatus.innerHTML = '<div class="nf-alert nf-alert-success">' + data.food_name + ' has been discarded.</div>';
        loadSurplus();
      })
      .catch(function () {
        listStatus.innerHTML = '<div class="nf-alert nf-alert-error">Could not discard the item. Please try again.</div>';
      });
  }

  /* ------------------------------------------------------------------ */
  /* Temperature history — GET /api/surplus/temperature-logs/?surplus_food=<id> */
  /* Fields per TemperatureLogSerializer: id, surplus_food, temperature_c, */
  /* recorded_at, recorded_by, recorded_by_name                          */
  /* ------------------------------------------------------------------ */
  function toggleHistory(itemId, historyBox) {
    var isOpen = historyBox.classList.contains('open');

    if (isOpen) {
      historyBox.classList.remove('open');
      historyBox.innerHTML = '';
      return;
    }

    historyBox.innerHTML = 'Loading history...';
    historyBox.classList.add('open');

    fetch(TEMP_LOGS_URL + '?surplus_food=' + itemId, { headers: authHeaders() })
      .then(function (response) {
        if (handleAuthError(response)) return null;
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data === null) return;
        var rows = Array.isArray(data) ? data : (data.results || []);

        if (rows.length === 0) {
          historyBox.innerHTML = 'No temperature readings logged yet.';
          return;
        }

        var list = document.createElement('ul');
        rows.forEach(function (log) {
          var li = document.createElement('li');
          var recordedBy = log.recorded_by_name ? (' by ' + log.recorded_by_name) : '';
          li.textContent = formatDateTime(log.recorded_at) + ' — ' + log.temperature_c + ' °C' + recordedBy;
          list.appendChild(li);
        });

        historyBox.innerHTML = '';
        historyBox.appendChild(list);
      })
      .catch(function () {
        historyBox.innerHTML = 'Could not load temperature history.';
      });
  }

  /* ------------------------------------------------------------------ */
  /* Countdown rendering — client-side only, derived from safe_until    */
  /* ------------------------------------------------------------------ */
  function updateAllCountdowns() {
    var cards = grid.querySelectorAll('.nf-surplus-card');
    cards.forEach(function (card) {
      var safeUntil = card.dataset.safeUntil;
      var countdownEl = card.querySelector('[data-role="countdown"]');
      if (!safeUntil || !countdownEl) return;

      var remainingMs = new Date(safeUntil).getTime() - Date.now();

      countdownEl.classList.remove('expiring-soon', 'expired');

      if (remainingMs <= 0) {
        countdownEl.textContent = 'Safe window has ended';
        countdownEl.classList.add('expired');
        return;
      }

      var totalMinutes = Math.floor(remainingMs / 60000);
      var hours = Math.floor(totalMinutes / 60);
      var minutes = totalMinutes % 60;

      countdownEl.textContent = hours > 0
        ? hours + 'h ' + minutes + 'm remaining'
        : minutes + 'm remaining';

      if (totalMinutes <= 30) {
        countdownEl.classList.add('expiring-soon');
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  function formatNumber(value) {
    var n = parseFloat(value);
    return isNaN(n) ? '—' : n.toFixed(2);
  }

  function formatDateTime(value) {
    var d = new Date(value);
    return d.toLocaleString();
  }

  function showFormStatus(type, message) {
    var alertClass = 'nf-alert-info';
    if (type === 'error') alertClass = 'nf-alert-error';
    else if (type === 'success') alertClass = 'nf-alert-success';
    formStatus.innerHTML = '<div class="nf-alert ' + alertClass + '">' + message + '</div>';
  }

  function hideFormStatus() {
    formStatus.innerHTML = '';
  }
});