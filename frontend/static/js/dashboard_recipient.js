/* ==========================================================================
   NutriFlow — dashboard_recipient.js
   NGO Recipient Partner Dashboard logic: Live available surplus feed, urgency treatment, pickup claim flow.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var currentRecipientId = null;

  initRecipientDashboard();

  function initRecipientDashboard() {
    NutriFlow.getCurrentUser().then(function (user) {
      loadAvailableSurplusFeed();
      resolveRecipientIdAndLoadHistory(user);
    });
    setupClaimForm();
  }

  function loadAvailableSurplusFeed() {
    NutriFlow.apiFetch('/api/surplus/surplus-food/available/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var items = data.results || data || [];
        renderAvailableFeed(items);
      })
      .catch(function (err) {
        console.warn('Error loading available surplus feed:', err);
      });
  }

  function renderAvailableFeed(items) {
    var container = document.getElementById('recipAvailableFeed');
    var countEl = document.getElementById('recipStatAvailable');
    var urgentEl = document.getElementById('recipStatUrgent');

    if (!container) return;

    if (countEl) countEl.innerHTML = items.length + '<span class="unit">items</span>';

    if (items.length === 0) {
      container.innerHTML = '<div class="col-12">' +
                              NutriFlow.createEmptyState('No Available Surplus Batches Right Now', 'Campus canteens will publish safe surplus food here after meal sessions.', 'bi-box-seam') +
                            '</div>';
      if (urgentEl) urgentEl.innerHTML = '0<span class="unit">batches</span>';
      return;
    }

    var now = new Date().getTime();
    var urgentCount = 0;
    var html = '';

    items.forEach(function (item) {
      var safeUntil = new Date(item.safe_until).getTime();
      var diffMs = safeUntil - now;
      var diffHours = diffMs / (1000 * 60 * 60);

      var isUrgent = diffHours > 0 && diffHours <= 2.0;
      if (isUrgent) urgentCount++;

      var hoursLeft = Math.floor(diffHours);
      var minsLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      var timeText = hoursLeft > 0 ? (hoursLeft + 'h ' + minsLeft + 'm remaining') : (minsLeft + ' mins remaining');

      if (diffMs <= 0) {
        timeText = 'EXPIRED';
      }

      var cardClass = isUrgent ? 'recip-urgent-card' : '';
      var badgeClass = isUrgent ? 'nf-badge-coral' : 'nf-badge-amber';
      var badgeText = isUrgent ? '<i class="bi bi-clock-history"></i> URGENT RESCUE' : '<i class="bi bi-shield-check"></i> TCS Safe';

      var imgSrc = NutriFlow.getFoodImage(item.food_name);

      html += '<div class="col-md-6 col-lg-4">' +
                '<div class="nf-card ' + cardClass + '" style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 20px;">' +
                  '<div>' +
                    '<div style="position: relative; height: 160px; border-radius: var(--nf-radius-md); overflow: hidden; margin-bottom: 16px;">' +
                      '<img src="' + imgSrc + '" alt="' + item.food_name + '" style="width: 100%; height: 100%; object-fit: cover;">' +
                      '<div style="position: absolute; top: 10px; right: 10px;">' +
                        '<span class="nf-badge ' + badgeClass + '">' + badgeText + '</span>' +
                      '</div>' +
                    '</div>' +
                    '<div style="font-size: 18px; font-weight: 800; color: var(--nf-ink-900); margin-bottom: 6px;">' + item.food_name + '</div>' +
                    '<div style="font-size: 13.5px; color: var(--nf-ink-600); margin-bottom: 12px;">' +
                      '<i class="bi bi-geo-alt-fill" style="color: var(--nf-brand-primary);"></i> ' + (item.storage_location || 'Hostel Canteen Kitchen') +
                    '</div>' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; background: var(--nf-canvas); padding: 10px 14px; border-radius: var(--nf-radius-md); margin-bottom: 16px;">' +
                      '<div>' +
                        '<div style="font-size: 11px; color: var(--nf-ink-600);">Quantity Available</div>' +
                        '<div style="font-family: var(--nf-font-display); font-size: 20px; font-weight: 800; color: var(--nf-brand-primary);">' + parseFloat(item.quantity_remaining).toFixed(1) + ' <span style="font-size: 13px;">' + item.unit + '</span></div>' +
                      '</div>' +
                      '<div style="text-align: right;">' +
                        '<div style="font-size: 11px; color: var(--nf-ink-600);">Safe Until</div>' +
                        '<div style="font-size: 13px; font-weight: 700; color: ' + (isUrgent ? 'var(--nf-danger)' : 'var(--nf-ink-900)') + ';">' + timeText + '</div>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                  '<button type="button" class="nf-btn ' + (isUrgent ? 'nf-btn-accent' : 'nf-btn-primary') + '" style="width: 100%; padding: 12px;" onclick="window.openClaimModal(\'' + item.id + '\', \'' + item.food_name.replace(/'/g, "\\'") + '\', \'' + parseFloat(item.quantity_remaining).toFixed(1) + '\', \'' + item.unit + '\', \'' + (item.storage_location || 'Main Kitchen').replace(/'/g, "\\'") + '\')">' +
                    '<i class="bi bi-box-arrow-down"></i> Claim Surplus Batch' +
                  '</button>' +
                '</div>' +
              '</div>';
    });

    if (urgentEl) urgentEl.innerHTML = urgentCount + '<span class="unit">batches</span>';
    container.innerHTML = html;
  }

  function resolveRecipientIdAndLoadHistory(user) {
    if (!user) return;

    NutriFlow.apiFetch('/api/recipients/recipients/')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var recipients = data.results || data || [];
        var myRecip = recipients.find(function (r) {
          return r.user === user.id || (r.organization_name && r.organization_name === user.organization_name);
        });

        if (myRecip) {
          currentRecipientId = myRecip.id;
          loadMyPickups(myRecip.id);
        } else {
          loadMyPickups(null);
        }
      })
      .catch(function (err) {
        console.warn('Error resolving recipient profile:', err);
        loadMyPickups(null);
      });
  }

  function loadMyPickups(recipientId) {
    var url = '/api/pickups/pickups/';
    if (recipientId) {
      url += '?recipient=' + recipientId;
    }

    NutriFlow.apiFetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var pickups = data.results || data || [];
        renderMyPickupsTable(pickups);
      })
      .catch(function (err) {
        console.warn('Error loading recipient pickups:', err);
      });
  }

  function renderMyPickupsTable(pickups) {
    var tbody = document.getElementById('recipMyPickupsTbody');
    var claimsCountEl = document.getElementById('recipStatMyClaims');
    var rescuedKgEl = document.getElementById('recipStatRescuedKg');

    if (claimsCountEl) claimsCountEl.innerHTML = pickups.length + '<span class="unit">total</span>';

    var totalKg = 0;
    pickups.forEach(function (p) {
      totalKg += parseFloat(p.quantity_collected || p.surplus_food_quantity || 0);
    });
    if (rescuedKgEl) rescuedKgEl.innerHTML = totalKg.toFixed(1) + '<span class="unit">kg</span>';

    if (!tbody) return;

    if (pickups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No surplus claims logged for your organization yet.</td></tr>';
      return;
    }

    var html = '';
    pickups.forEach(function (p) {
      var stBadge = '<span class="nf-badge nf-badge-amber">' + p.status + '</span>';
      if (p.status === 'COMPLETED') stBadge = '<span class="nf-badge nf-badge-amber" style="background:#22c55e; color:#fff;"><i class="bi bi-check-circle-fill"></i> COMPLETED</span>';
      else if (p.status === 'CONFIRMED' || p.status === 'CLAIMED') stBadge = '<span class="nf-badge nf-badge-amber"><i class="bi bi-clock-history"></i> SCHEDULED</span>';

      html += '<tr>' +
                '<td><code>' + p.id.substring(0, 8) + '...</code></td>' +
                '<td><strong>' + (p.surplus_food_name || 'Surplus Batch') + '</strong></td>' +
                '<td>' + new Date(p.scheduled_time).toLocaleString() + '</td>' +
                '<td>' + (p.quantity_collected || p.surplus_food_quantity || '10') + ' kg</td>' +
                '<td>' + (p.pickup_location || 'Campus Canteen') + '</td>' +
                '<td>' + stBadge + '</td>' +
              '</tr>';
    });

    tbody.innerHTML = html;
  }

  window.openClaimModal = function (surplusId, foodName, qty, unit, location) {
    document.getElementById('claimSurplusId').value = surplusId;
    var infoBox = document.getElementById('recipClaimModalInfo');
    if (infoBox) {
      infoBox.innerHTML = '<div style="font-weight: 800; font-size: 16px; color: var(--nf-brand-primary); margin-bottom: 4px;">' + foodName + '</div>' +
                          '<div style="font-size: 13.5px; color: var(--nf-ink-600);">' +
                            'Quantity: <strong>' + qty + ' ' + unit + '</strong> • Location: ' + location +
                          '</div>';
    }

    // Set default scheduled time to 1 hour from now
    var nextHour = new Date(new Date().getTime() + 60 * 60 * 1000);
    var isoStr = new Date(nextHour.getTime() - (nextHour.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    var timeInput = document.getElementById('claimScheduledTime');
    if (timeInput) timeInput.value = isoStr;

    NutriFlow.openModal('recipClaimModal');
  };

  function setupClaimForm() {
    var form = document.getElementById('recipClaimForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var surplusId = document.getElementById('claimSurplusId').value;
      var schedTime = document.getElementById('claimScheduledTime').value;
      var notes = document.getElementById('claimNotes').value;

      if (!surplusId || !schedTime) {
        NutriFlow.showAlert('warning', 'Please select scheduled pickup time.', 'nfMessages');
        return;
      }

      var btn = document.getElementById('recipConfirmClaimBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Claiming Batch...';

      var payload = {
        surplus_food: surplusId,
        scheduled_time: new Date(schedTime).toISOString(),
        notes: notes || ''
      };

      if (currentRecipientId) {
        payload.recipient = currentRecipientId;
      }

      NutriFlow.apiFetch('/api/pickups/pickups/', {
        method: 'POST',
        body: payload
      })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to claim surplus batch. Item may have already been claimed.');
        return res.json();
      })
      .then(function () {
        btn.disabled = false;
        btn.innerHTML = 'Confirm Claim & Schedule';
        NutriFlow.closeModal('recipClaimModal');
        NutriFlow.showAlert('success', 'Surplus batch claimed successfully! Pickup scheduled.', 'nfMessages');
        loadAvailableSurplusFeed();
        if (currentRecipientId) loadMyPickups(currentRecipientId);
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.innerHTML = 'Confirm Claim & Schedule';
        NutriFlow.showAlert('error', err.message, 'nfMessages');
      });
    });
  }
});
