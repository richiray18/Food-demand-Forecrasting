/* ==========================================================================
   NutriFlow — forecast.js
   Handles the Forecast page form: builds the query, calls the real
   forecasting API, and renders the result without reloading the page.
   Endpoint: GET http://127.0.0.1:8000/api/forecasting/predict/
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var API_URL = 'http://127.0.0.1:8000/api/forecasting/predict/';

  var form = document.getElementById('nfForecastForm');
  var statusEl = document.getElementById('nfForecastStatus');
  var resultsEl = document.getElementById('nfForecastResults');

  var submitBtn = document.getElementById('nfForecastBtn');
  var submitBtnText = document.getElementById('nfForecastBtnText');

  var itemIdInput = document.getElementById('itemId');
  var sessionSelect = document.getElementById('sessionId');
  var dateInput = document.getElementById('forecastDate');
  var weatherSelect = document.getElementById('weatherNote');
  var isHolidayCheckbox = document.getElementById('isHoliday');
  var isExamPeriodCheckbox = document.getElementById('isExamPeriod');

  var resultBaseline = document.getElementById('nfResultBaseline');
  var resultRecommended = document.getElementById('nfResultRecommended');
  var resultDate = document.getElementById('nfResultDate');
  var resultSession = document.getElementById('nfResultSession');

  var SESSION_LABELS = {
    '1': 'Breakfast',
    '2': 'Lunch',
    '3': 'Snacks',
    '4': 'Dinner'
  };

  form.addEventListener('submit', function (event) {
    // Prevent full page reload — this is a single-page form interaction.
    event.preventDefault();

    hideStatus();
    resultsEl.style.display = 'none';

    // --- 1. Validate required fields ---------------------------------
    var itemId = itemIdInput.value.trim();
    var sessionId = sessionSelect.value;
    var dateValue = dateInput.value;

    if (!itemId || Number(itemId) <= 0) {
      showStatus('error', 'Please enter a valid Menu Item ID.');
      itemIdInput.focus();
      return;
    }

    if (!sessionId) {
      showStatus('error', 'Please select a session.');
      sessionSelect.focus();
      return;
    }

    if (!dateValue) {
      showStatus('error', 'Please select a date.');
      dateInput.focus();
      return;
    }

    // --- 2. Build the API request safely using URLSearchParams -------
    var params = new URLSearchParams();
    params.set('item_id', itemId);
    params.set('session_id', sessionId);
    params.set('date', dateValue);
    params.set('is_holiday', isHolidayCheckbox.checked ? 'true' : 'false');
    params.set('is_exam_period', isExamPeriodCheckbox.checked ? 'true' : 'false');

    if (weatherSelect.value) {
      params.set('weather_note', weatherSelect.value);
    }

    var requestUrl = API_URL + '?' + params.toString();

    // --- 3. Send the request -------------------------------------------
    setLoading(true);

    var headers = {};
    var token = localStorage.getItem('access_token');
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    fetch(requestUrl, {
      method: 'GET',
      headers: headers
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Request failed with status ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        setLoading(false);
        renderResult(data);
      })
      .catch(function (error) {
        setLoading(false);
        showStatus('error', 'Unable to generate forecast. Please try again. (' + error.message + ')');
      });
  });

  // --- 6/7. Render the forecast result, handling the null case --------
  function renderResult(data) {
    var sessionLabel = SESSION_LABELS[String(data.session_id)] || String(data.session_id);

    resultDate.textContent = data.date;
    resultSession.textContent = sessionLabel;

    resultBaseline.innerHTML = (data.baseline_kg !== null && data.baseline_kg !== undefined)
      ? Number(data.baseline_kg).toFixed(1) + '<span class="unit">kg</span>'
      : '—';

    if (data.recommended_quantity_prepared_kg === null || data.recommended_quantity_prepared_kg === undefined) {
      resultRecommended.innerHTML = '—';
      var note = data.note ? (' ' + data.note) : '';
      showStatus('warning', 'Not enough historical data is available for this item, session, and date combination.' + note);
    } else {
      resultRecommended.innerHTML = Number(data.recommended_quantity_prepared_kg).toFixed(1) + '<span class="unit">kg</span>';
      hideStatus();
    }

    resultsEl.style.display = 'grid';
  }

  // --- 4. Loading state -------------------------------------------------
  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtnText.textContent = isLoading ? 'Generating forecast...' : 'Generate Forecast';
    if (isLoading) {
      showStatus('info', 'Generating forecast...');
    }
  }

  // --- Status/error helpers ---------------------------------------------
  function showStatus(type, message) {
    var alertClass = 'nf-alert-info';
    if (type === 'error') {
      alertClass = 'nf-alert-error';
    } else if (type === 'warning') {
      alertClass = 'nf-alert-warning';
    }

    statusEl.innerHTML = '<div class="nf-alert ' + alertClass + '">' + message + '</div>';
  }

  function hideStatus() {
    statusEl.innerHTML = '';
  }
});