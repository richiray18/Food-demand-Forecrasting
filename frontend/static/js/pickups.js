/* ==========================================================================
   NutriFlow — pickups.js
   Manages logistics dispatch list, handover verification, and safety rejections.
   Endpoints:
     GET /api/pickups/pickups/
     POST /api/pickups/pickups/{id}/confirm/
     POST /api/pickups/pickups/{id}/reject/
     POST /api/pickups/pickups/{id}/cancel/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var tableBody = document.getElementById('pkpTableBody');
  var listStatus = document.getElementById('pkpListStatus');
  var searchInput = document.getElementById('pkpSearchInput');
  var statusFilterGroup = document.getElementById('pkpStatusFilters');

  var statActive = document.getElementById('pkpStatActive');
  var statCompleted = document.getElementById('pkpStatCompleted');
  var statRejected = document.getElementById('pkpStatRejected');
  var statWeight = document.getElementById('pkpStatWeight');

  // Confirmation Modal
  var confirmHandoverForm = document.getElementById('confirmHandoverForm');
  var confPickupId = document.getElementById('confPickupId');
  var confFoodTitle = document.getElementById('confFoodTitle');
  var confRecipientTitle = document.getElementById('confRecipientTitle');
  var confCodeDisplay = document.getElementById('confCodeDisplay');
  var confTempReading = document.getElementById('confTempReading');
  var confQuantityCollected = document.getElementById('confQuantityCollected');
  var confVerifyCodeInput = document.getElementById('confVerifyCodeInput');
  var confSubmitBtn = document.getElementById('confSubmitBtn');

  // Reject Modal
  var rejectPickupForm = document.getElementById('rejectPickupForm');
  var rejPickupId = document.getElementById('rejPickupId');
  var rejReason = document.getElementById('rejReason');
  var rejSubmitBtn = document.getElementById('rejSubmitBtn');

  var rawPickupsList = [];
  var currentFilter = 'all';
  var expectedVerificationCode = '';

  // Initialize
  loadPickups();

  // Filter & Search listeners
  if (statusFilterGroup) {
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
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);

  if (confirmHandoverForm) {
    confirmHandoverForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submitHandoverConfirmation();
    });
  }

  if (rejectPickupForm) {
    rejectPickupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submitRejection();
    });
  }

  function loadPickups() {
    listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-ink-600); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading pickup logistics records...</div>';

    NutriFlow.apiFetch('/api/pickups/pickups/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listStatus.innerHTML = '';
        rawPickupsList = Array.isArray(data) ? data : (data.results || []);
        updateKPIs();
        applyFilters();
      })
      .catch(function (err) {
        listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-danger); font-size: 13.5px;">Error loading pickups: ' + err.message + '</div>';
      });
  }

  function updateKPIs() {
    var activeCount = 0;
    var completedCount = 0;
    var rejectedCount = 0;
    var totalRescuedKg = 0;

    rawPickupsList.forEach(function (p) {
      if (p.status === 'SCHEDULED' || p.status === 'REQUESTED' || p.status === 'IN_TRANSIT') {
        activeCount++;
      } else if (p.status === 'COMPLETED') {
        completedCount++;
        totalRescuedKg += parseFloat(p.quantity_collected || p.quantity_requested) || 0;
      } else if (p.status === 'REJECTED_UNSAFE') {
        rejectedCount++;
      }
    });

    if (statActive) statActive.textContent = activeCount.toString();
    if (statCompleted) statCompleted.textContent = completedCount.toString();
    if (statRejected) statRejected.textContent = rejectedCount.toString();
    if (statWeight) statWeight.innerHTML = totalRescuedKg.toFixed(1) + '<span class="unit">kg</span>';
  }

  function applyFilters() {
    var searchVal = (searchInput ? searchInput.value : '').toLowerCase().trim();

    var filtered = rawPickupsList.filter(function (p) {
      if (currentFilter !== 'all') {
        if (currentFilter === 'SCHEDULED') {
          if (p.status !== 'SCHEDULED' && p.status !== 'REQUESTED' && p.status !== 'IN_TRANSIT') return false;
        } else if (p.status !== currentFilter) {
          return false;
        }
      }

      if (searchVal) {
        var rName = (p.recipient_name || '').toLowerCase();
        var fName = (p.food_name || '').toLowerCase();
        var code = (p.verification_code || '').toLowerCase();
        if (!rName.includes(searchVal) && !fName.includes(searchVal) && !code.includes(searchVal)) return false;
      }
      return true;
    });

    renderTable(filtered);
  }

  function renderTable(list) {
    if (list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7">' + NutriFlow.createEmptyState('No pickup dispatches scheduled', 'Schedule surplus dispatches from the Recipients tab.', 'bi-truck') + '</td></tr>';
      return;
    }

    tableBody.innerHTML = '';
    list.forEach(function (p) {
      var tr = document.createElement('tr');

      var shortId = (p.id || '').slice(0, 8);
      var codeDisplay = p.verification_code
        ? '<span class="nf-badge nf-badge-neutral" style="font-family: var(--nf-font-mono); font-weight: 700; font-size: 11.5px;">CODE: ' + p.verification_code + '</span>'
        : '';
      var imgUrl = NutriFlow.getFoodImage(p.food_name);

      var timeStr = p.scheduled_time ? formatDateTime(p.scheduled_time) : 'Immediate';

      var statusBadge = '';
      if (p.status === 'SCHEDULED' || p.status === 'REQUESTED') statusBadge = '<span class="nf-badge nf-badge-peach"><i class="bi bi-clock-history"></i> Scheduled</span>';
      else if (p.status === 'IN_TRANSIT') statusBadge = '<span class="nf-badge nf-badge-pink"><i class="bi bi-truck"></i> Driver En Route</span>';
      else if (p.status === 'COMPLETED') statusBadge = '<span class="nf-badge nf-badge-sage"><i class="bi bi-check-circle-fill"></i> Completed</span>';
      else if (p.status === 'REJECTED_UNSAFE') statusBadge = '<span class="nf-badge nf-badge-danger"><i class="bi bi-shield-x"></i> Rejected (Unsafe)</span>';
      else statusBadge = '<span class="nf-badge nf-badge-neutral">Cancelled</span>';

      var safetyBadge = p.pickup_temperature_c !== null
        ? '<span style="font-family: var(--nf-font-mono); font-size: 12.5px; font-weight: 600;">' + parseFloat(p.pickup_temperature_c).toFixed(1) + '°C</span>'
        : '<span style="font-size: 12px; color: var(--nf-ink-600);">Pending Probe</span>';

      var isPending = (p.status === 'SCHEDULED' || p.status === 'REQUESTED' || p.status === 'IN_TRANSIT');
      var actionsHtml = '<div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">';

      if (isPending) {
        actionsHtml += '<button class="nf-btn nf-btn-primary nf-btn-sm" onclick="window.NutriFlowPickups.openConfirmModal(\'' + p.id + '\', \'' + encodeURIComponent(p.food_name || 'Food') + '\', \'' + encodeURIComponent(p.recipient_name || 'NGO') + '\', \'' + (p.verification_code || '') + '\', \'' + (p.quantity_requested || 0) + '\')" style="font-size: 12px; padding: 4px 10px;">' +
          '<i class="bi bi-shield-check"></i> Verify Handover' +
          '</button>';

        actionsHtml += '<button class="nf-btn nf-btn-outline nf-btn-sm" onclick="window.NutriFlowPickups.openRejectModal(\'' + p.id + '\')" style="font-size: 12px; padding: 4px 8px; color: var(--nf-danger); border-color: rgba(185,56,56,0.3);" title="Reject on Safety Grounds">' +
          '<i class="bi bi-x-octagon"></i>' +
          '</button>';
      } else {
        actionsHtml += '<span style="font-size: 12px; color: var(--nf-ink-600); font-style: italic;">Log Closed</span>';
      }

      actionsHtml += '</div>';

      tr.innerHTML = '<td><strong style="font-family: var(--nf-font-mono); font-size: 13px;">#' + shortId + '</strong><br>' + codeDisplay + '</td>' +
        '<td><strong style="color: var(--nf-ink-900);">' + (p.recipient_name || 'NGO Partner') + '</strong></td>' +
        '<td><div class="nf-food-cell"><img src="' + imgUrl + '" class="nf-food-thumb" alt="Dish"><div><strong style="color: var(--nf-ink-900);">' + (p.food_name || 'Surplus Dish') + '</strong><div style="font-size: 11.5px; color: var(--nf-ink-600);">' + parseFloat(p.quantity_requested || 0).toFixed(1) + ' kg</div></div></div></td>' +
        '<td><span style="font-size: 13px;">' + timeStr + '</span></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + safetyBadge + '</td>' +
        '<td>' + actionsHtml + '</td>';

      tableBody.appendChild(tr);
    });
  }

  function submitHandoverConfirmation() {
    var pickupId = confPickupId.value;
    var tempC = parseFloat(confTempReading.value);
    var qtyColl = parseFloat(confQuantityCollected.value);
    var enteredCode = (confVerifyCodeInput.value || '').trim().toUpperCase();

    if (isNaN(tempC) || isNaN(qtyColl) || qtyColl <= 0) {
      NutriFlow.showAlert('warning', 'Please enter valid temperature probe reading and collected quantity.');
      return;
    }

    if (expectedVerificationCode && enteredCode !== expectedVerificationCode.toUpperCase()) {
      NutriFlow.showAlert('error', 'Security Code Mismatch! Verification code does not match driver dispatch authorization.');
      return;
    }

    confSubmitBtn.disabled = true;
    confSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Authenticating...';

    var payload = {
      pickup_temperature_c: tempC,
      quantity_collected: qtyColl,
      verification_code: enteredCode
    };

    NutriFlow.apiFetch('/api/pickups/pickups/' + pickupId + '/confirm/', {
      method: 'POST',
      body: payload
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.detail || 'Handover verification failed');
          });
        }
        return res.json();
      })
      .then(function () {
        confSubmitBtn.disabled = false;
        confSubmitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Validate & Confirm Handover';
        NutriFlow.closeModal('confirmHandoverModal');
        NutriFlow.showAlert('success', 'Food handover verified! ESG impact metrics updated in Sustainability Ledger.');
        loadPickups();
      })
      .catch(function (err) {
        confSubmitBtn.disabled = false;
        confSubmitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Validate & Confirm Handover';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function submitRejection() {
    var pickupId = rejPickupId.value;
    var reason = rejReason.value;

    rejSubmitBtn.disabled = true;
    rejSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing Rejection...';

    NutriFlow.apiFetch('/api/pickups/pickups/' + pickupId + '/reject/', {
      method: 'POST',
      body: { rejection_reason: reason }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Rejection failed with status ' + res.status);
        return res.json();
      })
      .then(function () {
        rejSubmitBtn.disabled = false;
        rejSubmitBtn.innerHTML = '<i class="bi bi-x-octagon"></i> Confirm Rejection';
        NutriFlow.closeModal('rejectPickupModal');
        NutriFlow.showAlert('info', 'Pickup rejected on safety grounds. Food batch flagged for safety audit.');
        loadPickups();
      })
      .catch(function (err) {
        rejSubmitBtn.disabled = false;
        rejSubmitBtn.innerHTML = '<i class="bi bi-x-octagon"></i> Confirm Rejection';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '—';
    var d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  window.NutriFlowPickups = {
    openConfirmModal: function (id, foodEnc, rcpEnc, code, qtyReq) {
      confPickupId.value = id;
      confFoodTitle.textContent = decodeURIComponent(foodEnc);
      confRecipientTitle.textContent = decodeURIComponent(rcpEnc);
      expectedVerificationCode = code || '';
      confCodeDisplay.textContent = code ? ('CODE: ' + code) : 'CODE: —';
      confQuantityCollected.value = parseFloat(qtyReq) || '';
      confTempReading.value = '62.0';
      confVerifyCodeInput.value = code || '';
      NutriFlow.openModal('confirmHandoverModal');
    },
    openRejectModal: function (id) {
      rejPickupId.value = id;
      NutriFlow.openModal('rejectPickupModal');
    }
  };
});
