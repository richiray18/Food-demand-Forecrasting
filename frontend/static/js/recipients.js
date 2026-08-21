/* ==========================================================================
   NutriFlow — recipients.js
   Manages recipient NGO directory, automated surplus matching, and pickup dispatch.
   Endpoints:
     GET /api/recipients/recipients/
     POST /api/recipients/recipients/match/
     GET /api/surplus/surplus-food/?status=AVAILABLE
     POST /api/pickups/pickups/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var tableBody = document.getElementById('rcpTableBody');
  var listStatus = document.getElementById('rcpListStatus');
  var searchInput = document.getElementById('rcpSearchInput');

  var statTotal = document.getElementById('rcpStatTotal');
  var statCapacity = document.getElementById('rcpStatCapacity');
  var statActive = document.getElementById('rcpStatActive');

  var matchSurplusSelect = document.getElementById('matchSurplusSelect');
  var btnRunMatch = document.getElementById('btnRunMatch');
  var matchResultsArea = document.getElementById('matchResultsArea');
  var matchCardsContainer = document.getElementById('matchCardsContainer');

  // Schedule Pickup Modal elements
  var schedulePickupForm = document.getElementById('schedulePickupForm');
  var schedRecipientId = document.getElementById('schedRecipientId');
  var schedOrgName = document.getElementById('schedOrgName');
  var schedSurplusSelect = document.getElementById('schedSurplusSelect');
  var schedQuantity = document.getElementById('schedQuantity');
  var schedTime = document.getElementById('schedTime');
  var schedNotes = document.getElementById('schedNotes');
  var schedSubmitBtn = document.getElementById('schedSubmitBtn');

  var rawRecipientsList = [];
  var availableSurplusList = [];

  // Initialize
  loadRecipients();
  loadSurplusOptions();

  // Search input filter
  searchInput.addEventListener('input', applySearchFilter);

  // Run Match button
  btnRunMatch.addEventListener('click', runMatchmaker);

  // Schedule pickup submit
  schedulePickupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    submitScheduledPickup();
  });

  function loadRecipients() {
    listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-ink-400); font-size: 13.5px;"><i class="bi bi-hourglass-split"></i> Loading partner organization directory...</div>';

    NutriFlow.apiFetch('/api/recipients/recipients/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listStatus.innerHTML = '';
        rawRecipientsList = Array.isArray(data) ? data : (data.results || []);
        updateRecipientKPIs();
        renderTable(rawRecipientsList);
      })
      .catch(function (err) {
        listStatus.innerHTML = '<div style="padding: 16px 20px; color: var(--nf-danger); font-size: 13.5px;">Error loading recipients: ' + err.message + '</div>';
      });
  }

  function loadSurplusOptions() {
    NutriFlow.apiFetch('/api/surplus/surplus-food/?status=AVAILABLE')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        availableSurplusList = Array.isArray(data) ? data : (data.results || []);

        matchSurplusSelect.innerHTML = '<option value="">Choose an active surplus batch to match...</option>';
        schedSurplusSelect.innerHTML = '<option value="">Select surplus batch...</option>';

        availableSurplusList.forEach(function (s) {
          var label = s.food_name + ' (' + parseFloat(s.quantity_remaining).toFixed(1) + ' ' + (s.unit || 'KG') + ' available)';
          
          var opt1 = document.createElement('option');
          opt1.value = s.id;
          opt1.textContent = label;
          matchSurplusSelect.appendChild(opt1);

          var opt2 = document.createElement('option');
          opt2.value = s.id;
          opt2.textContent = label;
          schedSurplusSelect.appendChild(opt2);
        });

        // Check if surplus_id passed in URL
        var params = new URLSearchParams(window.location.search);
        var surplusId = params.get('surplus_id');
        if (surplusId) {
          matchSurplusSelect.value = surplusId;
          runMatchmaker();
        }
      })
      .catch(function (err) {
        console.error('Error loading surplus options:', err);
      });
  }

  function updateRecipientKPIs() {
    var total = rawRecipientsList.length;
    var totalCap = 0;
    var activeCount = 0;

    rawRecipientsList.forEach(function (r) {
      if (r.is_active && r.is_verified) activeCount++;
      totalCap += parseFloat(r.capacity_quantity) || 0;
    });

    statTotal.textContent = total.toString();
    statCapacity.innerHTML = totalCap.toFixed(0) + '<span class="unit">kg/day</span>';
    statActive.textContent = activeCount.toString();
  }

  function applySearchFilter() {
    var val = (searchInput.value || '').toLowerCase().trim();
    if (!val) {
      renderTable(rawRecipientsList);
      return;
    }

    var filtered = rawRecipientsList.filter(function (r) {
      var org = (r.organization_name || '').toLowerCase();
      var contact = (r.contact_person || '').toLowerCase();
      var addr = (r.address || '').toLowerCase();
      return org.includes(val) || contact.includes(val) || addr.includes(val);
    });

    renderTable(filtered);
  }

  function renderTable(list) {
    if (list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--nf-ink-400); padding: 32px;">No recipient organizations found.</td></tr>';
      return;
    }

    tableBody.innerHTML = '';
    list.forEach(function (r) {
      var tr = document.createElement('tr');

      var verBadge = r.is_verified
        ? '<span class="nf-badge nf-badge-success"><i class="bi bi-patch-check-fill"></i> Verified</span>'
        : '<span class="nf-badge nf-badge-warning"><i class="bi bi-hourglass"></i> Pending Admin</span>';

      var statusBadge = (r.is_active && r.is_verified)
        ? '<span class="nf-badge nf-badge-success"><i class="bi bi-broadcast"></i> Available</span>'
        : '<span class="nf-badge nf-badge-neutral"><i class="bi bi-pause-circle"></i> Inactive / Full</span>';

      tr.innerHTML = '<td><strong style="color: var(--nf-green-900); font-size: 14.5px;">' + (r.organization_name || 'Community Organization') + '</strong></td>' +
        '<td><span style="font-size: 13px; color: var(--nf-ink-600);"><i class="bi bi-geo-alt"></i> ' + (r.address || 'Campus Vicinity') + '</span></td>' +
        '<td>' + (r.contact_person || 'Coordinator') + '<br><span style="font-size: 12px; color: var(--nf-ink-400);">' + (r.phone_number || '—') + '</span></td>' +
        '<td><strong style="font-family: var(--nf-font-mono);">' + parseFloat(r.capacity_quantity).toFixed(1) + ' ' + (r.capacity_unit || 'KG') + '</strong>/day</td>' +
        '<td>' + verBadge + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="text-align: right;">' +
        '<button class="nf-btn nf-btn-primary nf-btn-sm" onclick="window.NutriFlowRecipients.openScheduleModal(\'' + r.id + '\', \'' + encodeURIComponent(r.organization_name || 'Recipient') + '\', \'' + (r.capacity_quantity || 50) + '\')" style="font-size: 12px; padding: 4px 10px;">' +
        '<i class="bi bi-calendar-plus"></i> Schedule Pickup' +
        '</button>' +
        '</td>';

      tableBody.appendChild(tr);
    });
  }

  function runMatchmaker() {
    var surplusId = matchSurplusSelect.value;
    if (!surplusId) {
      NutriFlow.showAlert('warning', 'Please choose an active surplus food batch first.');
      return;
    }

    btnRunMatch.disabled = true;
    btnRunMatch.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Scoring Matches...';
    matchResultsArea.style.display = 'none';

    // Call match endpoint
    NutriFlow.apiFetch('/api/recipients/recipients/match/', {
      method: 'POST',
      body: { surplus_food: surplusId }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Matchmaker failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        btnRunMatch.disabled = false;
        btnRunMatch.innerHTML = '<i class="bi bi-stars"></i> Find Optimal NGO Match';

        var matches = data.matches || [];
        if (matches.length === 0) {
          NutriFlow.showAlert('info', 'No active, verified recipients found with sufficient remaining daily intake capacity.');
          return;
        }

        renderMatchCards(matches, surplusId);
      })
      .catch(function (err) {
        btnRunMatch.disabled = false;
        btnRunMatch.innerHTML = '<i class="bi bi-stars"></i> Find Optimal NGO Match';
        NutriFlow.showAlert('error', 'Matching engine notice: ' + err.message);
      });
  }

  function renderMatchCards(matches, surplusId) {
    matchCardsContainer.innerHTML = '';
    matchResultsArea.style.display = 'block';

    var selectedSurplus = availableSurplusList.find(function (s) { return s.id === surplusId; });
    var neededQty = selectedSurplus ? parseFloat(selectedSurplus.quantity_remaining) : 10;

    matches.forEach(function (m, idx) {
      var r = m.recipient;
      var scoreVal = Math.min(100, Math.round(m.score * 100));
      var isTop = (idx === 0);

      var cardCol = document.createElement('div');
      cardCol.className = isTop ? 'col-md-12' : 'col-md-6';

      var topBadge = isTop ? '<span class="nf-badge nf-badge-success" style="margin-bottom: 8px;"><i class="bi bi-trophy-fill"></i> Best Proximity & Capacity Match</span>' : '';

      cardCol.innerHTML = '<div class="nf-card" style="' + (isTop ? 'border: 2px solid var(--nf-green-600); background: linear-gradient(135deg, rgba(76,140,99,0.06), #fff);' : '') + '">' +
        topBadge +
        '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">' +
        '<div>' +
        '<h4 style="font-size: 16px; margin: 0; color: var(--nf-green-900);">' + (r.organization_name || 'Organization') + '</h4>' +
        '<div style="font-size: 12.5px; color: var(--nf-ink-600);"><i class="bi bi-geo-alt"></i> Available for Immediate Handover</div>' +
        '</div>' +
        '<div style="text-align: right;">' +
        '<div style="font-family: var(--nf-font-mono); font-size: 18px; font-weight: 700; color: var(--nf-green-700);">' + scoreVal + '% Fit</div>' +
        '<div style="font-size: 11px; color: var(--nf-ink-400);">Compatibility Score</div>' +
        '</div>' +
        '</div>' +
        '<div style="display: flex; gap: 12px; font-size: 13px; color: var(--nf-ink-700); margin-bottom: 14px;">' +
        '<div><i class="bi bi-box"></i> Intake Capacity: <strong>' + parseFloat(r.capacity_quantity).toFixed(1) + ' ' + (r.capacity_unit || 'KG') + '</strong></div>' +
        '<div><i class="bi bi-patch-check"></i> Verification: <strong>Verified</strong></div>' +
        '</div>' +
        '<div style="display: flex; justify-content: flex-end;">' +
        '<button class="nf-btn ' + (isTop ? 'nf-btn-primary' : 'nf-btn-outline') + ' nf-btn-sm" onclick="window.NutriFlowRecipients.openScheduleModalWithSurplus(\'' + r.id + '\', \'' + encodeURIComponent(r.organization_name || 'Recipient') + '\', \'' + surplusId + '\', \'' + neededQty + '\')">' +
        '<i class="bi bi-calendar2-check"></i> Dispatch Pickup to this NGO' +
        '</button>' +
        '</div>' +
        '</div>';

      matchCardsContainer.appendChild(cardCol);
    });
  }

  function submitScheduledPickup() {
    var recipientId = schedRecipientId.value;
    var surplusId = schedSurplusSelect.value;
    var qty = parseFloat(schedQuantity.value);
    var timeVal = schedTime.value;
    var notesVal = schedNotes.value;

    if (!recipientId || !surplusId || isNaN(qty) || qty <= 0 || !timeVal) {
      NutriFlow.showAlert('warning', 'Please provide recipient, surplus batch, quantity, and scheduled pickup time.');
      return;
    }

    schedSubmitBtn.disabled = true;
    schedSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Scheduling Logistics...';

    var payload = {
      recipient: recipientId,
      surplus_food: surplusId,
      quantity_requested: qty,
      scheduled_time: new Date(timeVal).toISOString(),
      notes: notesVal || 'Coordinated via NutriFlow Smart Match'
    };

    NutriFlow.apiFetch('/api/pickups/pickups/', {
      method: 'POST',
      body: payload
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.detail || (typeof err === 'object' ? Object.values(err).flat().join(' ') : 'Failed to schedule pickup.'));
          });
        }
        return res.json();
      })
      .then(function (created) {
        schedSubmitBtn.disabled = false;
        schedSubmitBtn.innerHTML = '<i class="bi bi-truck"></i> Confirm & Generate Verification Code';
        NutriFlow.closeModal('schedulePickupModal');

        NutriFlow.showAlert('success', 'Pickup #' + (created.id ? created.id.slice(0, 8) : '') + ' scheduled! Verification Code: ' + (created.verification_code || 'Generated') + '. Redirecting to Pickups logistics...', 4000);

        setTimeout(function () {
          window.location.href = '/pickups/';
        }, 1500);
      })
      .catch(function (err) {
        schedSubmitBtn.disabled = false;
        schedSubmitBtn.innerHTML = '<i class="bi bi-truck"></i> Confirm & Generate Verification Code';
        NutriFlow.showAlert('error', err.message);
      });
  }

  // Global namespace for onclick bindings
  window.NutriFlowRecipients = {
    openScheduleModal: function (id, nameEnc, maxCap) {
      schedRecipientId.value = id;
      schedOrgName.value = decodeURIComponent(nameEnc);
      schedQuantity.value = parseFloat(maxCap) > 20 ? '20.0' : maxCap;
      
      // Default time: 1 hour from now
      var soon = new Date();
      soon.setHours(soon.getHours() + 1);
      schedTime.value = soon.toISOString().slice(0, 16);

      NutriFlow.openModal('schedulePickupModal');
    },
    openScheduleModalWithSurplus: function (recId, nameEnc, surplusId, neededQty) {
      schedRecipientId.value = recId;
      schedOrgName.value = decodeURIComponent(nameEnc);
      schedSurplusSelect.value = surplusId;
      schedQuantity.value = neededQty;

      var soon = new Date();
      soon.setHours(soon.getHours() + 1);
      schedTime.value = soon.toISOString().slice(0, 16);

      NutriFlow.openModal('schedulePickupModal');
    }
  };
});
