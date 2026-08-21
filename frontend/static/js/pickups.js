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

  // Form Submissions
  confirmHandoverForm.addEventListener('submit', function (e) {
    e.preventDefault();
    submitHandoverConfirmation();
  });

  rejectPickupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    submitRejection();
  });

  function loadPickups() {
    listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-ink-400); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading pickup logistics records...</div>';

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

    statActive.textContent = activeCount.toString();
    statCompleted.textContent = completedCount.toString();
    statRejected.textContent = rejectedCount.toString();
    statWeight.innerHTML = totalRescuedKg.toFixed(1) + '<span class="unit">kg</span>';
  }

  function applyFilters() {
    var searchVal = (searchInput.value || '').toLowerCase().trim();

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
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--nf-ink-400); padding: 36px;">No pickup dispatches match the selected filter.</td></tr>';
      return;
    }

    tableBody.innerHTML = '';
    list.forEach(function (p) {
      var tr = document.createElement('tr');

      var shortId = (p.id || '').slice(0, 8);
      var codeDisplay = p.verification_code
        ? '<span class="nf-badge nf-badge-neutral" style="font-family: var(--nf-font-mono); font-weight: 700; font-size: 11.5px;">CODE: ' + p.verification_code + '</span>'
        : '';

      // Format Scheduled Time
      var timeStr = p.scheduled_time ? formatDateTime(p.scheduled_time) : 'Immediate';

      // Status Badge
      var statusBadge = '';
      if (p.status === 'COMPLETED') statusBadge = '<span class="nf-badge nf-badge-success"><i class="bi bi-check-circle-fill"></i> Completed</span>';
      else if (p.status === 'SCHEDULED') statusBadge = '<span class="nf-badge nf-badge-warning"><i class="bi bi-clock"></i> Scheduled</span>';
      else if (p.status === 'IN_TRANSIT') statusBadge = '<span class="nf-badge nf-badge-info"><i class="bi bi-truck"></i> In Transit</span>';
      else if (p.status === 'REJECTED_UNSAFE') statusBadge = '<span class="nf-badge nf-badge-danger"><i class="bi bi-shield-x"></i> Rejected Unsafe</span>';
      else statusBadge = '<span class="nf-badge nf-badge-neutral">' + p.status + '</span>';

      // Safety status
      var safetyHtml = '';
      if (p.safety_check_passed === true) {
        safetyHtml = '<span style="color: var(--nf-success); font-size: 13px; font-weight: 600;"><i class="bi bi-check2"></i> Passed (' + (p.temperature_at_pickup_c ? p.temperature_at_pickup_c + '°C' : 'Verified') + ')</span>';
      } else if (p.safety_check_passed === false) {
        safetyHtml = '<span style="color: var(--nf-danger); font-size: 12.5px;"><i class="bi bi-x-circle"></i> ' + (p.rejection_reason || 'Safety Failed') + '</span>';
      } else {
        safetyHtml = '<span style="color: var(--nf-ink-400); font-size: 12.5px;">Pending Gate Check</span>';
      }

      // Action Buttons
      var actionsHtml = '<div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">';
      var isPending = (p.status === 'SCHEDULED' || p.status === 'REQUESTED' || p.status === 'IN_TRANSIT');

      if (isPending) {
        actionsHtml += '<button class="nf-btn nf-btn-primary nf-btn-sm" onclick="window.NutriFlowPickups.openConfirmModal(\'' + p.id + '\', \'' + encodeURIComponent(p.food_name || 'Batch') + '\', \'' + encodeURIComponent(p.recipient_name || 'Recipient') + '\', \'' + (p.verification_code || '') + '\', \'' + (p.quantity_requested || 10) + '\')" style="font-size: 12px; padding: 4px 10px;">' +
          '<i class="bi bi-shield-check"></i> Handover' +
          '</button>';

        actionsHtml += '<button class="nf-btn nf-btn-outline nf-btn-sm" onclick="window.NutriFlowPickups.openRejectModal(\'' + p.id + '\')" style="font-size: 12px; padding: 4px 8px; color: var(--nf-danger); border-color: rgba(196,68,46,0.3);" title="Reject Unsafe Food">' +
          '<i class="bi bi-x-circle"></i>' +
          '</button>';
      } else if (p.status === 'COMPLETED') {
        actionsHtml += '<button class="nf-btn nf-btn-outline nf-btn-sm" onclick="window.location.href=\'/impact/\'" style="font-size: 11.5px; padding: 3px 8px;">' +
          '<i class="bi bi-heart-pulse"></i> View Impact' +
          '</button>';
      }
      actionsHtml += '</div>';

      tr.innerHTML = '<td><strong style="font-family: var(--nf-font-mono);">#' + shortId + '</strong><br>' + codeDisplay + '</td>' +
        '<td><strong style="color: var(--nf-green-900);">' + (p.recipient_name || 'Recipient Organization') + '</strong></td>' +
        '<td><strong>' + parseFloat(p.quantity_requested).toFixed(1) + ' kg</strong> of ' + (p.food_name || 'Surplus Dish') + '</td>' +
        '<td><span style="font-size: 13px;">' + timeStr + '</span></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + safetyHtml + '</td>' +
        '<td>' + actionsHtml + '</td>';

      tableBody.appendChild(tr);
    });
  }

  function submitHandoverConfirmation() {
    var pId = confPickupId.value;
    var tempVal = parseFloat(confTempReading.value);
    var qtyVal = parseFloat(confQuantityCollected.value);
    var codeVal = confVerifyCodeInput.value.trim().toUpperCase();

    if (isNaN(tempVal) || isNaN(qtyVal) || qtyVal <= 0 || !codeVal) {
      NutriFlow.showAlert('warning', 'Please provide temperature reading, collected quantity, and verification code.');
      return;
    }

    if (expectedVerificationCode && codeVal !== expectedVerificationCode) {
      NutriFlow.showAlert('error', 'Verification code mismatch! Ensure code matches the driver authorization code.');
      return;
    }

    confSubmitBtn.disabled = true;
    confSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verifying Handshake...';

    NutriFlow.apiFetch('/api/pickups/pickups/' + pId + '/confirm/', {
      method: 'POST',
      body: {
        temperature_c: tempVal,
        quantity_collected: qtyVal
      }
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.detail || (typeof err === 'object' ? Object.values(err).flat().join(' ') : 'Handover verification rejected on safety checks.'));
          });
        }
        return res.json();
      })
      .then(function () {
        confSubmitBtn.disabled = false;
        confSubmitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Validate & Confirm Handover';
        NutriFlow.closeModal('confirmHandoverModal');
        NutriFlow.showAlert('success', 'Handover successfully verified and finalized! Impact record automatically logged.');
        loadPickups();
      })
      .catch(function (err) {
        confSubmitBtn.disabled = false;
        confSubmitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Validate & Confirm Handover';
        NutriFlow.showAlert('error', err.message);
        loadPickups();
      });
  }

  function submitRejection() {
    var pId = rejPickupId.value;
    var reasonVal = rejReason.value;

    rejSubmitBtn.disabled = true;
    rejSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting Rejection...';

    NutriFlow.apiFetch('/api/pickups/pickups/' + pId + '/reject/', {
      method: 'POST',
      body: { reason: reasonVal }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Rejection request failed.');
        return res.json();
      })
      .then(function () {
        rejSubmitBtn.disabled = false;
        rejSubmitBtn.innerHTML = '<i class="bi bi-x-octagon"></i> Confirm Rejection';
        NutriFlow.closeModal('rejectPickupModal');
        NutriFlow.showAlert('info', 'Pickup marked as rejected on safety criteria. Handover intercepted.');
        loadPickups();
      })
      .catch(function (err) {
        rejSubmitBtn.disabled = false;
        rejSubmitBtn.innerHTML = '<i class="bi bi-x-octagon"></i> Confirm Rejection';
        NutriFlow.showAlert('error', err.message);
      });
  }

  function formatDateTime(isoStr) {
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // Global bindings
  window.NutriFlowPickups = {
    openConfirmModal: function (id, foodEnc, recEnc, code, qty) {
      confPickupId.value = id;
      confFoodTitle.textContent = decodeURIComponent(foodEnc);
      confRecipientTitle.textContent = decodeURIComponent(recEnc);
      confCodeDisplay.textContent = 'EXPECTED: ' + code;
      expectedVerificationCode = code;
      confQuantityCollected.value = qty;
      confTempReading.value = '62.0';
      confVerifyCodeInput.value = code; // prefill for easy demo, can be edited
      NutriFlow.openModal('confirmHandoverModal');
    },
    openRejectModal: function (id) {
      rejPickupId.value = id;
      NutriFlow.openModal('rejectPickupModal');
    }
  };
});
