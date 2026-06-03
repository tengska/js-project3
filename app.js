/**
 * ============================================
 * GRAVITY CALENDAR — app.js
 * Suomen Gravity MTB Tapahtumat 2026
 *
 * Projekti 3: JS-sovellus ulkoisia kirjastoja käyttäen
 * - jQuery: DOM-käsittely, tapahtumakuuntelijat, AJAX
 * - Bootstrap 5: UI-komponentit (modaalit, kortit, napit)
 * - Leaflet: Karttanäkymä
 * - Open-Meteo API: Sääennusteet
 *
 * Tekijä: Karla
 * ============================================
 */

// ============================================
// 1. SOVELLUKSEN TILA (muuttujat)
// ============================================

// Kaikki tapahtumat JSON-tiedostosta
var allEvents = [];
// Suodatetut tapahtumat näytettäväksi
var filteredEvents = [];
// Välimuisti sään API-vastauksille (vältetään turhat kutsut)
var weatherCache = {};
// Nykyinen näkymätila: 'cards', 'list' tai 'map'
var currentView = 'cards';
// Sisältösegmentti: 'races', 'events' tai 'all'
var currentSegment = 'all';
// Jono sään pikakuvauksille korteissa
var weatherQueue = [];
// Leaflet-karttaobjekti
var leafletMap = null;
// Karttamerkkien ryhmä
var mapMarkers = [];
// Estää suodatinpaneelin sulkeutumisen heti avauksen jälkeen mobiilissa
var filterExpandedByUser = false;
var filterGuardTimer = null;

// Bootstrap-modaali-instanssit (alustetaan kun DOM valmis)
var weatherBsModal = null;
var suggestBsModal = null;
var feedbackBsModal = null;
// Bootstrap Toast -instanssi ilmoituksille
var appToast = null;

// Monivalintakenttien oletustekstit
var multiSelectDefaults = {
  'filter-series':     'Kaikki sarjat',
  'filter-discipline': 'Kaikki lajit',
  'filter-month':      'Kaikki kuukaudet',
  'filter-status':     'Kaikki'
};


/**
 * Näyttää Bootstrap Toast -ilmoituksen sivun alareunassa.
 * Käyttää Bootstrapin Toast-komponenttia.
 */
function showToast(message) {
  $('#toast-body').text(message);
  if (appToast) appToast.show();
}


// ============================================
// 2. TAPAHTUMADATAN LATAUS (jQuery AJAX)
// ============================================

/**
 * Lataa tapahtumatiedot events.json-tiedostosta
 * käyttäen jQueryn $.getJSON-metodia (AJAX-kutsu).
 */
function loadEvents() {
  $.getJSON('events.json')
    .done(function(data) {
      // Päivitetään jokaisen tapahtuman tila (tuleva/mennyt)
      allEvents = $.map(data, function(event) {
        return updateEventStatus(event);
      });

      // Järjestetään alkupäivämäärän mukaan
      allEvents.sort(function(a, b) {
        return new Date(a.dateStart) - new Date(b.dateStart);
      });

      // Piilotetaan latausanimaatio jQueryllä
      $('#loading').addClass('d-none');

      // Suodatetaan ja renderöidään tapahtumat
      applyFilters();
    })
    .fail(function(jqXHR, textStatus, errorThrown) {
      // Näytetään virheviesti jos lataus epäonnistuu
      console.error('Tapahtumien lataus epäonnistui:', textStatus, errorThrown);
      $('#loading').html('<p class="text-danger">⚠️ Tapahtumien lataus epäonnistui. Yritä päivittää sivu.</p>');
    });
}


// ============================================
// 3. SÄÄ-API (jQuery AJAX — Open-Meteo)
// ============================================

/**
 * Hakee sääennusteen tietylle sijainnille Open-Meteo API:sta.
 * Open-Meteo on ilmainen eikä vaadi API-avainta.
 * Käyttää jQueryn $.ajax-metodia AJAX-kutsuun.
 */
function fetchWeather(lat, lon, dateStart, dateEnd) {
  // Tarkistetaan löytyykö data välimuistista
  var cacheKey = lat + ',' + lon + ',' + dateStart;
  if (weatherCache[cacheKey]) {
    // Palautetaan välimuistista jQuery Deferred -objektina
    return $.Deferred().resolve(weatherCache[cacheKey]).promise();
  }

  // Rakennetaan API-osoite parametreilla
  var url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + lat
    + '&longitude=' + lon
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weathercode,windspeed_10m_max'
    + '&timezone=Europe/Helsinki'
    + '&start_date=' + dateStart
    + '&end_date=' + dateEnd;

  // jQuery AJAX -kutsu sää-API:lle
  return $.ajax({
    url: url,
    dataType: 'json'
  }).done(function(data) {
    // Tallennetaan vastaus välimuistiin
    weatherCache[cacheKey] = data;
  });
}

/**
 * Hakee viime vuoden historiallisen sään samoille kalenteripäiville.
 * Käytetään tapahtumille jotka ovat yli 16 päivän päässä.
 */
function fetchHistoricalWeather(lat, lon, dateStart, dateEnd) {
  // Lasketaan viime vuoden päivämäärät
  var startYear = new Date(dateStart).getFullYear();
  var lastYearStart = dateStart.replace(startYear, startYear - 1);
  var lastYearEnd = dateEnd.replace(new Date(dateEnd).getFullYear(), startYear - 1);

  var cacheKey = 'hist-' + lat + ',' + lon + ',' + lastYearStart;
  if (weatherCache[cacheKey]) {
    return $.Deferred().resolve(weatherCache[cacheKey]).promise();
  }

  // Historiallisen sään API-osoite
  var url = 'https://archive-api.open-meteo.com/v1/archive'
    + '?latitude=' + lat
    + '&longitude=' + lon
    + '&start_date=' + lastYearStart
    + '&end_date=' + lastYearEnd
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max'
    + '&timezone=Europe/Helsinki';

  return $.ajax({
    url: url,
    dataType: 'json'
  }).done(function(data) {
    weatherCache[cacheKey] = data;
  });
}

/**
 * Muuntaa WMO-sääkoodin kuvaukseksi ja emojiksi.
 * WMO = World Meteorological Organization.
 */
function weatherCodeToInfo(code) {
  var weatherMap = {
    0:  { emoji: '☀️', text: 'Selkeä' },
    1:  { emoji: '🌤️', text: 'Melko selkeä' },
    2:  { emoji: '⛅', text: 'Puolipilvinen' },
    3:  { emoji: '☁️', text: 'Pilvinen' },
    45: { emoji: '🌫️', text: 'Sumua' },
    48: { emoji: '🌫️', text: 'Huurtavaa sumua' },
    51: { emoji: '🌧️', text: 'Heikkoa tihkua' },
    53: { emoji: '🌧️', text: 'Tihkua' },
    55: { emoji: '🌧️', text: 'Tiheää tihkua' },
    61: { emoji: '🌧️', text: 'Heikkoa sadetta' },
    63: { emoji: '🌧️', text: 'Sadetta' },
    65: { emoji: '🌧️', text: 'Voimakasta sadetta' },
    66: { emoji: '🌨️', text: 'Jäätävää sadetta' },
    67: { emoji: '🌨️', text: 'Voimakasta jäätävää sadetta' },
    71: { emoji: '❄️', text: 'Heikkoa lumisadetta' },
    73: { emoji: '❄️', text: 'Lumisadetta' },
    75: { emoji: '❄️', text: 'Voimakasta lumisadetta' },
    77: { emoji: '❄️', text: 'Lumijyväsiä' },
    80: { emoji: '🌦️', text: 'Heikkoja kuuroja' },
    81: { emoji: '🌦️', text: 'Kuuroja' },
    82: { emoji: '🌦️', text: 'Voimakkaita kuuroja' },
    85: { emoji: '🌨️', text: 'Lumikuuroja' },
    86: { emoji: '🌨️', text: 'Voimakkaita lumikuuroja' },
    95: { emoji: '⛈️', text: 'Ukkosta' },
    96: { emoji: '⛈️', text: 'Ukkosta ja rakeita' },
    99: { emoji: '⛈️', text: 'Voimakasta ukkosta' }
  };
  return weatherMap[code] || { emoji: '🌡️', text: 'Tuntematon' };
}


// ============================================
// 4. MONIVALINTA-APUFUNKTIOT (jQuery)
// ============================================

/**
 * Palauttaa taulukon valituista arvoista monivalintakomponentista.
 * Käyttää jQueryn valitsimia ja .map()-metodia.
 */
function getSelectedValues(containerId) {
  return $('#' + containerId + ' .multi-select-option.checked')
    .map(function() {
      return $(this).data('value');
    })
    .get(); // .get() muuntaa jQuery-objektin tavalliseksi taulukoksi
}

/**
 * Päivittää monivalinnan nappulatekstin valintojen mukaan.
 * Näyttää nimet 1-2 valinnalle, lukumäärän 3+:lle.
 */
function updateTriggerText(containerId) {
  var defaultText = multiSelectDefaults[containerId];
  var $container = $('#' + containerId);
  var $trigger = $container.find('.multi-select-trigger');
  var $selected = $container.find('.multi-select-option.checked');

  if ($selected.length === 0) {
    // Ei valintoja — näytetään oletusteksti
    $trigger.text(defaultText).removeClass('has-selection');
  } else if ($selected.length <= 2) {
    // 1-2 valintaa — näytetään lyhytnimet
    var names = $selected.map(function() {
      return $(this).data('short') || $(this).data('value');
    }).get();
    $trigger.text(names.join(', ')).addClass('has-selection');
  } else {
    // 3+ valintaa — näytetään lukumäärä
    $trigger.text($selected.length + ' valittu').addClass('has-selection');
  }
}


// ============================================
// 5. SUODATUSLOGIIKKA
// ============================================

/**
 * Suodattaa tapahtumat kaikkien aktiivisten suodattimien
 * perusteella ja renderöi tulokset uudelleen.
 */
function applyFilters() {
  // Mobiilissa: estetään filtteripaneelin automaattinen sulkeutuminen
  if ($(window).width() <= 600 && $('#filters-section').hasClass('expanded')) {
    filterExpandedByUser = true;
    clearTimeout(filterGuardTimer);
    filterGuardTimer = setTimeout(function() { filterExpandedByUser = false; }, 500);
  }

  // Haetaan kaikkien suodattimien arvot jQueryllä
  var series     = getSelectedValues('filter-series');
  var discipline = getSelectedValues('filter-discipline');
  var month      = getSelectedValues('filter-month');
  var status     = getSelectedValues('filter-status');
  var sortBy     = $('#filter-sort').val();
  var search     = $('#filter-search').val().toLowerCase().trim();

  // Suodatetaan tapahtumat ehdoilla
  filteredEvents = $.grep(allEvents, function(event) {
    // Segmentti: kisat vs tapahtumat vs kaikki
    if (currentSegment === 'races' && event.competition === false) return false;
    if (currentSegment === 'events' && event.competition !== false) return false;
    // Sarjasuodatin
    if (series.length > 0 && $.inArray(event.series, series) === -1) return false;
    // Lajisuodatin
    if (discipline.length > 0 && $.inArray(event.discipline, discipline) === -1) return false;
    // Kuukausisuodatin
    if (month.length > 0) {
      var eventMonth = String(new Date(event.dateStart).getMonth() + 1);
      if ($.inArray(eventMonth, month) === -1) return false;
    }
    // Tilasuodatin
    if (status.length > 0 && $.inArray(event.status, status) === -1) return false;
    // Tekstihaku
    if (search) {
      var searchTarget = (
        event.name + ' ' + event.location + ' ' +
        event.city + ' ' + event.organizer + ' ' + event.series
      ).toLowerCase();
      if (searchTarget.indexOf(search) === -1) return false;
    }
    return true;
  });

  // Järjestetään valitun vaihtoehdon mukaan
  if (sortBy === 'date-desc') {
    filteredEvents.sort(function(a, b) { return new Date(b.dateStart) - new Date(a.dateStart); });
  } else if (sortBy === 'series') {
    filteredEvents.sort(function(a, b) {
      return a.series.localeCompare(b.series) || new Date(a.dateStart) - new Date(b.dateStart);
    });
  } else {
    filteredEvents.sort(function(a, b) { return new Date(a.dateStart) - new Date(b.dateStart); });
  }

  // Lasketaan aktiivisten suodattimien määrä
  var activeCount = 0;
  if (currentSegment !== 'all') activeCount++;
  if (series.length > 0)     activeCount++;
  if (discipline.length > 0) activeCount++;
  if (month.length > 0)      activeCount++;
  if (status.length > 0)     activeCount++;
  if (sortBy !== 'date-asc') activeCount++;
  if (search !== '')         activeCount++;

  // Näytetään/piilotetaan tyhjennä-nappi jQueryllä
  if (activeCount > 0) {
    $('#btn-reset-filters').text('Tyhjennä (' + activeCount + ')').removeClass('d-none');
  } else {
    $('#btn-reset-filters').addClass('d-none');
  }

  // Päivitetään mobiili-toggle -teksti
  var segmentLabels = { races: 'Kisat', events: 'Tapahtumat', all: 'Kaikki' };
  var segmentSuffix = currentSegment !== 'all' ? ' · ' + segmentLabels[currentSegment] : '';
  var badgeHtml = activeCount > 0 ? ' <span class="filter-badge">(' + activeCount + ')</span>' : '';
  $('#filter-toggle span:first').html('Suodattimet' + badgeHtml + segmentSuffix);

  // Renderöidään suodatetut tapahtumat
  renderEvents(filteredEvents);
}

/**
 * Päivittää tapahtuman tilan (tuleva/mennyt) nykyisen päivämäärän mukaan.
 * Ei ylikirjoita manuaalisesti asetettua 'cancelled'-tilaa.
 */
function updateEventStatus(event) {
  // Kopioidaan tapahtumaobjekti jQueryn $.extend-metodilla
  var updated = $.extend({}, event);
  if (updated.status === 'cancelled') return updated;

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var endDate = new Date(updated.dateEnd);
  endDate.setHours(23, 59, 59, 999);

  // Asetetaan tila päivämäärän perusteella
  updated.status = endDate < today ? 'past' : 'upcoming';
  return updated;
}


// ============================================
// 6. RENDERÖINTI (jQuery DOM-käsittely)
// ============================================

/**
 * Renderöi tapahtumakortit tai -rivit ruudukkoon.
 * Käyttää jQueryä DOM-elementtien luontiin ja lisäämiseen.
 */
function renderEvents(events) {
  // Tyhjennetään ruudukko jQueryllä
  var $grid = $('#events-grid');
  $grid.empty();
  weatherQueue = [];

  // Karttanäkymä — erillinen renderöinti
  if (currentView === 'map') {
    $grid.addClass('d-none');
    $('#map-container').removeClass('d-none');
    $('#empty-state').addClass('d-none');
    $('#results-count').text(events.length + ' tapahtumaa');
    renderMap(events);
    return;
  }

  // Kortti- tai listanäkymä
  $('#map-container').addClass('d-none');
  $grid.removeClass('d-none');

  // Vaihdetaan CSS-luokka listanäkymälle
  if (currentView === 'list') {
    $grid.addClass('list-view');
  } else {
    $grid.removeClass('list-view');
  }

  // Päivitetään tulosmääräteksti
  $('#results-count').text(events.length + ' tapahtumaa');

  // Näytetään tyhjä tila jos ei tuloksia
  if (events.length === 0) {
    $('#empty-state').removeClass('d-none');
    return;
  }
  $('#empty-state').addClass('d-none');

  // Luodaan kortit/rivit jQueryn $.each-iteraatiolla
  var lastMonth = null;
  $.each(events, function(index, event) {
    // Kuukausierottaja — ryhmittelee tapahtumat kuukausittain
    var eventMonth = new Date(event.dateStart).getMonth();
    var eventYear = new Date(event.dateStart).getFullYear();
    var monthKey = eventYear + '-' + eventMonth;
    if (monthKey !== lastMonth) {
      lastMonth = monthKey;
      // Luodaan erottajaelementti jQueryllä — AOS fade-right animaatio
      $('<div>')
        .addClass('month-divider')
        .attr('data-aos', 'fade-right')
        .text(formatMonthYear(event.dateStart))
        .appendTo($grid);
    }

    // Luodaan tapahtuma-elementti näkymän mukaan
    var $el = currentView === 'list' ? createEventRow(event) : createEventCard(event);
    $el.appendTo($grid);
  });

  // Päivitetään AOS jotta uudet elementit animoidaan
  if (typeof AOS !== 'undefined') AOS.refresh();

  // Alustetaan Bootstrap Tooltips uusille dynaamisille elementeille
  // Mobiilissa (kosketusnäyttö) ei käytetä tooltippejä — hover ei toimi järkevästi
  if (!('ontouchstart' in window)) {
    $('#events-grid [title]').each(function() {
      new bootstrap.Tooltip(this, { trigger: 'hover', placement: 'top' });
    });
  }

  // Käynnistetään sään pikakuvausten lataus
  processWeatherQueue(0);
}

/**
 * Luo yksittäisen tapahtumakortin jQuery-elementtinä.
 * Käyttää Bootstrap-tyylejä kortin ulkoasuun.
 */
function createEventCard(event) {
  // Luodaan korttielementti jQueryn $() -syntaksilla
  // AOS-attribuutit lisäävät scroll-animaation (Animate On Scroll -kirjasto)
  var $card = $('<div>').addClass('event-card').attr('data-aos', 'fade-up');
  if (event.status === 'cancelled') $card.addClass('cancelled');
  if (event.status === 'past') $card.addClass('past');

  // Määritetään sarjan väriluokka
  var seriesClass = getSeriesClass(event.series);
  var dateDisplay = formatDateRange(event.dateStart, event.dateEnd);
  var countdown = getCountdown(event.dateStart, event.status);

  // Rakennetaan kortin HTML-sisältö
  var html = '';
  // Sarjatunnus (Bootstrap Badge -tyylinen)
  html += '<span class="badge card-series ' + seriesClass + '">' + event.seriesShort + '</span>';
  html += '<h3 class="card-name">' + event.name + '</h3>';
  html += '<p class="card-location">'
    + event.location
    + (event.city ? ' <span class="city">· ' + event.city + '</span>' : '')
    + '</p>';
  if (event.organizer) {
    html += '<p class="card-organizer">' + event.organizer + '</p>';
  }

  // Päivämäärärivi
  var dateMuted = event.status !== 'upcoming';
  html += '<p class="card-date' + (dateMuted ? ' date-muted' : '') + '"><i class="bi bi-calendar3"></i> ' + dateDisplay + '</p>';
  if (countdown) {
    html += '<p class="card-countdown">' + countdown + '</p>';
  }

  // Painikkeet — käytetään Bootstrapin btn-luokkia
  var hasWeather = event.status === 'upcoming' && isWithinForecastRange(event.dateStart);
  var hasClimate = event.status === 'upcoming' && !isWithinForecastRange(event.dateStart);

  html += '<div class="card-actions">';
  if (event.registrationUrl && event.status === 'upcoming') {
    html += '<a href="' + event.registrationUrl + '" target="_blank" rel="noopener" class="btn btn-outline-success btn-sm">Ilmoittaudu</a>';
  }
  if (event.resultsUrl && event.status === 'past' && event.competition !== false) {
    html += '<a href="' + event.resultsUrl + '" target="_blank" rel="noopener" class="btn btn-outline-warning btn-sm">Tulokset</a>';
  }
  if (event.websiteUrl) {
    html += '<a href="' + event.websiteUrl + '" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm">Lisätiedot</a>';
  }
  if (event.status === 'cancelled') {
    html += '<span class="btn btn-outline-danger btn-sm disabled">Peruttu</span>';
  }
  if (event.status === 'upcoming') {
    html += '<a href="https://www.google.com/maps?q=' + event.lat + ',' + event.lon + '" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm" title="Näytä kartalla"><i class="bi bi-geo-alt"></i></a>';
  }
  if (hasWeather) {
    html += '<button class="btn btn-outline-secondary btn-sm btn-weather" data-event-id="' + event.id + '"><i class="bi bi-cloud-sun"></i> Sää</button>';
  } else if (hasClimate) {
    html += '<button class="btn btn-outline-secondary btn-sm btn-climate" data-event-id="' + event.id + '" title="Viime vuoden sää samoille päiville"><i class="bi bi-thermometer-half"></i> Sää</button>';
  }
  html += '</div>';

  // Sään pikakuvaus-alue kortissa
  html += '<div class="card-weather-mini d-none" id="weather-mini-' + event.id + '"></div>';

  // Asetetaan HTML jQueryn .html()-metodilla
  $card.html(html);

  // Lisätään tapahtumakuuntelijat jQueryn .on()-metodilla
  $card.find('.btn-weather').on('click', function() { showWeatherModal(event); });
  $card.find('.btn-climate').on('click', function() { showClimateModal(event); });

  // Lisätään lähiajan tapahtumat sääjonoon
  if (event.status === 'upcoming' && isWithinDays(event.dateStart, 7)) {
    weatherQueue.push(event);
  }

  return $card;
}

/**
 * Luo tiiviin listarivirin tapahtumalle (listanäkymä).
 */
function createEventRow(event) {
  // AOS fade-up animaatio listariveille
  var $row = $('<div>').addClass('event-row').attr('data-aos', 'fade-up');
  if (event.status === 'cancelled') $row.addClass('cancelled');
  if (event.status === 'past') $row.addClass('past');

  var seriesClass = getSeriesClass(event.series);
  var dateDisplay = formatDateRange(event.dateStart, event.dateEnd);
  var html = '';

  // Päivämääräsarake
  var rowDateMuted = event.status !== 'upcoming';
  html += '<div class="row-date' + (rowDateMuted ? ' date-muted' : '') + '"><i class="bi bi-calendar3"></i> ' + dateDisplay + '</div>';
  // Sarjatunnus
  html += '<span class="row-series badge card-series ' + seriesClass + '">' + event.seriesShort + '</span>';
  // Tapahtumatiedot
  html += '<div class="row-info">';
  html += '<span class="row-name">' + event.name + '</span>';
  html += '<span class="row-location">' + event.location;
  if (event.city) html += ' · ' + event.city;
  html += '</span>';
  html += '</div>';

  // Toimintopainikkeet
  var hasWeather = event.status === 'upcoming' && isWithinForecastRange(event.dateStart);
  var hasClimate = event.status === 'upcoming' && !isWithinForecastRange(event.dateStart);

  if (event.status === 'past' || event.status === 'cancelled') {
    html += '<div class="row-actions row-actions-wide">';
    if (event.status === 'past' && event.resultsUrl && event.competition !== false) {
      html += '<a href="' + event.resultsUrl + '" target="_blank" rel="noopener" class="row-btn-register row-btn-results">Tulokset</a>';
    } else if (event.status === 'cancelled') {
      html += '<span class="row-cancelled-label">Peruttu</span>';
    } else if (event.websiteUrl) {
      html += '<a href="' + event.websiteUrl + '" target="_blank" rel="noopener" class="row-btn-register">Lisätiedot</a>';
    } else {
      html += '<span class="row-action-empty"></span>';
    }
    html += '</div>';
  } else {
    html += '<div class="row-actions">';
    if (event.registrationUrl) {
      html += '<a href="' + event.registrationUrl + '" target="_blank" rel="noopener" class="row-btn-register">Ilmoittaudu</a>';
    } else {
      html += '<span class="row-action-empty"></span>';
    }
    html += '<a href="https://www.google.com/maps?q=' + event.lat + ',' + event.lon + '" target="_blank" rel="noopener" class="btn-map" title="Näytä kartalla"><i class="bi bi-geo-alt"></i></a>';
    if (hasWeather) {
      html += '<button class="btn-weather" title="Näytä sääennuste"><i class="bi bi-cloud-sun"></i></button>';
    } else if (hasClimate) {
      html += '<button class="btn-climate" title="Viime vuoden sää"><i class="bi bi-thermometer-half"></i></button>';
    } else {
      html += '<span class="row-action-empty"></span>';
    }
    html += '</div>';
  }

  $row.html(html);

  // jQuery-kuuntelijat napeille
  $row.find('.btn-weather').on('click', function() { showWeatherModal(event); });
  $row.find('.btn-climate').on('click', function() { showClimateModal(event); });

  return $row;
}


// ============================================
// 7. SÄÄ-KÄYTTÖLIITTYMÄ (Bootstrap-modaalit)
// ============================================

/**
 * Näyttää sääennustemodaalin tapahtumalle.
 * Avaa Bootstrap-modaalin ja hakee sään AJAX-kutsulla.
 */
function showWeatherModal(event) {
  // Näytetään latausanimaatio modaalissa
  $('#weather-body').html(
    '<div class="text-center py-3">'
    + '<div class="spinner-border text-success" role="status"></div>'
    + '<p class="text-muted mt-2">Haetaan säätietoja...</p>'
    + '</div>'
  );
  // Avataan Bootstrap-modaali
  weatherBsModal.show();

  // Haetaan säädata jQuery AJAX -kutsulla
  fetchWeather(event.lat, event.lon, event.dateStart, event.dateEnd)
    .done(function(data) { renderWeatherModal(data, event); })
    .fail(function() {
      $('#weather-body').html('<p class="text-danger">⚠️ Säätietojen haku epäonnistui. Ennuste on saatavilla vain seuraavalle 16 päivälle.</p>');
    });
}

/**
 * Renderöi sääennustedatan modaalin sisältöön.
 */
function renderWeatherModal(data, event) {
  var html = '';
  html += '<div class="weather-modal-header mb-3">';
  html += '<h5><i class="bi bi-cloud-sun"></i> Sääennuste — ' + event.location + '</h5>';
  html += '<p class="text-muted small">' + event.name + '</p>';
  html += '</div>';

  // Käydään jokainen ennustepäivä läpi
  if (data.daily && data.daily.time) {
    $.each(data.daily.time, function(i, date) {
      var weatherInfo = weatherCodeToInfo(data.daily.weathercode[i]);
      var maxTemp = Math.round(data.daily.temperature_2m_max[i]);
      var minTemp = Math.round(data.daily.temperature_2m_min[i]);
      var precipProb = data.daily.precipitation_probability_max[i];
      var wind = Math.round(data.daily.windspeed_10m_max[i]);

      html += '<div class="weather-day">';
      html += '<span class="weather-day-date">' + formatShortDate(date) + '</span>';
      html += '<span class="weather-day-icon">' + weatherInfo.emoji + '</span>';
      html += '<span class="weather-day-temps"><span class="fw-bold">' + maxTemp + '°</span> / <span class="text-muted">' + minTemp + '°</span></span>';
      html += '<span class="weather-day-info">' + weatherInfo.text + ' · 💧 ' + precipProb + '% · 💨 ' + wind + ' km/h</span>';
      html += '</div>';
    });
  } else {
    html += '<p class="text-muted">Ennuste ei ole vielä saatavilla tälle ajankohdalle.</p>';
  }

  html += '<p class="weather-notice text-muted fst-italic mt-3" style="font-size:0.7rem">Ennuste: Open-Meteo. Luotettavuus heikkenee yli 7 päivän päähän.</p>';
  // Asetetaan HTML jQueryllä
  $('#weather-body').html(html);
}

/**
 * Näyttää viime vuoden historialliset säätiedot.
 */
function showClimateModal(event) {
  $('#weather-body').html(
    '<div class="text-center py-3">'
    + '<div class="spinner-border text-success" role="status"></div>'
    + '<p class="text-muted mt-2">Haetaan viime vuoden säätietoja...</p>'
    + '</div>'
  );
  weatherBsModal.show();

  var lastYear = new Date(event.dateStart).getFullYear() - 1;
  fetchHistoricalWeather(event.lat, event.lon, event.dateStart, event.dateEnd)
    .done(function(data) { renderClimateModal(data, event, lastYear); })
    .fail(function() {
      $('#weather-body').html('<p class="text-danger">⚠️ Historiallisten säätietojen haku epäonnistui.</p>');
    });
}

/**
 * Renderöi historialliset säätiedot modaaliin.
 */
function renderClimateModal(data, event, lastYear) {
  var currentYear = lastYear + 1;
  var html = '';
  html += '<div class="weather-modal-header mb-3">';
  html += '<h5><i class="bi bi-thermometer-half"></i> Sää viime vuonna — ' + event.location + '</h5>';
  html += '<p class="text-muted small">' + event.name + '</p>';
  html += '</div>';

  if (data.daily && data.daily.time && data.daily.time.length > 0) {
    $.each(data.daily.time, function(i, date) {
      var displayDate = date.replace(lastYear.toString(), currentYear.toString());
      var weatherInfo = weatherCodeToInfo(data.daily.weathercode[i]);
      var maxTemp = Math.round(data.daily.temperature_2m_max[i]);
      var minTemp = Math.round(data.daily.temperature_2m_min[i]);
      var precip = Math.round(data.daily.precipitation_sum[i] * 10) / 10;
      var wind = Math.round(data.daily.windspeed_10m_max[i]);

      html += '<div class="weather-day">';
      html += '<span class="weather-day-date">' + formatShortDate(displayDate) + '</span>';
      html += '<span class="weather-day-icon">' + weatherInfo.emoji + '</span>';
      html += '<span class="weather-day-temps"><span class="fw-bold">' + maxTemp + '°</span> / <span class="text-muted">' + minTemp + '°</span></span>';
      html += '<span class="weather-day-info">' + weatherInfo.text + ' · 💧 ' + precip + 'mm · 💨 ' + wind + ' km/h</span>';
      html += '</div>';
    });
  } else {
    html += '<p class="text-muted">Historiallisia tietoja ei saatavilla.</p>';
  }

  html += '<p class="weather-notice text-muted fst-italic mt-3" style="font-size:0.7rem">Sää ' + lastYear + ' samoille päiville — ei ennuste. Historiallinen tieto antaa viitteen tyypillisestä säästä.</p>';
  $('#weather-body').html(html);
}

/**
 * Lataa sään pikakuvauksen yksittäiselle kortille.
 */
function loadWeatherMini(event) {
  fetchWeather(event.lat, event.lon, event.dateStart, event.dateStart)
    .done(function(data) {
      if (data.daily && data.daily.time && data.daily.time.length > 0) {
        var $miniEl = $('#weather-mini-' + event.id);
        if ($miniEl.length === 0) return;
        var weatherInfo = weatherCodeToInfo(data.daily.weathercode[0]);
        var maxTemp = Math.round(data.daily.temperature_2m_max[0]);
        var precip = data.daily.precipitation_probability_max[0];
        // Asetetaan pikakuvauksen sisältö ja näytetään jQuery fadeIn -animaatiolla
        $miniEl.html(
          '<span class="weather-day-icon">' + weatherInfo.emoji + '</span>'
          + '<span class="weather-temp">' + maxTemp + '°C</span>'
          + '<span class="weather-desc">' + weatherInfo.text + ' · 💧 ' + precip + '%</span>'
        ).hide().removeClass('d-none').fadeIn(400);

      }
    });
}

/**
 * Käsittelee sääjonon portaittaisilla viiveillä.
 */
function processWeatherQueue(index) {
  if (index >= weatherQueue.length) return;
  loadWeatherMini(weatherQueue[index]);
  setTimeout(function() { processWeatherQueue(index + 1); }, 200);
}


// ============================================
// 8. APUFUNKTIOT
// ============================================

/**
 * Palauttaa sarjan CSS-luokan nimen.
 */
function getSeriesClass(series) {
  if (series === 'Suomi DH Cup') return 'series-dh';
  if (series === 'Finnish Enduro Cup') return 'series-enduro';
  if (series === 'Tapahtumat/Muut') return 'series-events';
  if (series === 'Muu') return 'series-muu';
  return 'series-rally';
}

/**
 * Muotoilee päivämäärävälin suomalaiseen muotoon (pp.kk.–pp.kk.vvvv).
 */
function formatDateRange(start, end) {
  var s = new Date(start);
  var e = new Date(end);
  var sDay = s.getDate();
  var eDay = e.getDate();
  var sMonth = s.getMonth() + 1;
  var eMonth = e.getMonth() + 1;
  var year = s.getFullYear();
  if (start === end) return sDay + '.' + sMonth + '.' + year;
  if (sMonth === eMonth) return sDay + '.–' + eDay + '.' + sMonth + '.' + year;
  return sDay + '.' + sMonth + '.–' + eDay + '.' + eMonth + '.' + year;
}

/**
 * Muotoilee lyhyen päivämäärän (viikonpäivä + pvm).
 */
function formatShortDate(dateStr) {
  var d = new Date(dateStr);
  var days = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];
  return days[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
}

/**
 * Laskee lähtölaskennan tapahtuman alkuun.
 */
function getCountdown(dateStart, status) {
  if (status === 'past' || status === 'cancelled') return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var start = new Date(dateStart);
  start.setHours(0, 0, 0, 0);
  var diffDays = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '🔴 Tänään!';
  if (diffDays === 1) return 'Huomenna!';
  if (diffDays < 0) return null;
  return diffDays + ' päivän päästä';
}

/**
 * Tarkistaa onko päivämäärä sääennusteen (16 pv) sisällä.
 */
function isWithinForecastRange(dateStr) {
  var today = new Date();
  var target = new Date(dateStr);
  var diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 16;
}

/**
 * Tarkistaa onko päivämäärä tietyn päivämäärän sisällä.
 */
function isWithinDays(dateStr, days) {
  var today = new Date();
  var target = new Date(dateStr);
  var diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
}

/**
 * Muotoilee kuukauden ja vuoden suomeksi.
 */
function formatMonthYear(dateStr) {
  var d = new Date(dateStr);
  var months = ['Tammikuu','Helmikuu','Maaliskuu','Huhtikuu','Toukokuu','Kesäkuu',
                'Heinäkuu','Elokuu','Syyskuu','Lokakuu','Marraskuu','Joulukuu'];
  return months[d.getMonth()] + ' ' + d.getFullYear();
}


// ============================================
// 9. SUODATTIMIEN TYHJENNYS
// ============================================

/**
 * Tyhjentää kaikki suodattimet ja palauttaa oletusnäkymän.
 */
function resetFilters() {
  // Poistetaan kaikki valinnat jQueryllä
  $('.multi-select-option.checked').removeClass('checked');
  // Palautetaan oletustekstit
  $.each(multiSelectDefaults, function(id) {
    updateTriggerText(id);
  });
  // Palautetaan järjestys ja haku
  $('#filter-sort').val('date-asc');
  $('#filter-search').val('');
  // Palautetaan segmentti
  setSegment('all');
  applyFilters();
}

/**
 * Vaihtaa sisältösegmentin (kisat/tapahtumat/kaikki).
 */
function setSegment(value) {
  currentSegment = value;
  // Synkronoidaan kaikki segmenttipainikkeet jQueryllä
  $('.segment-btn').each(function() {
    $(this).toggleClass('active', $(this).data('segment') === value);
  });
  // Päivitetään suodatinpaneelin luokat
  var $section = $('#filters-section');
  $section.removeClass('segment-events segment-races');
  if (value === 'events') {
    $section.addClass('segment-events');
    // Tyhjennetään sarja- ja lajisuodattimet tapahtumille
    $('#filter-series .multi-select-option.checked').removeClass('checked');
    updateTriggerText('filter-series');
    $('#filter-discipline .multi-select-option.checked').removeClass('checked');
    updateTriggerText('filter-discipline');
  } else if (value === 'races') {
    $section.addClass('segment-races');
  }
}


// ============================================
// 10. KARTTANÄKYMÄ (Leaflet)
// ============================================

/**
 * Palauttaa sarjan värikoodin karttamerkeille.
 */
function getSeriesColor(series) {
  if (series === 'Suomi DH Cup') return '#7ec850';
  if (series === 'Finnish Enduro Cup') return '#c8693a';
  if (series === 'Tapahtumat/Muut') return '#9b6fc0';
  return '#4d8fa8';
}

/**
 * Rakentaa popup-sisällön yksittäiselle tapahtumalle kartalla.
 */
function buildEventPopupBlock(event) {
  var seriesClass = getSeriesClass(event.series);
  var html = '<div class="map-popup-event">'
    + '<div class="map-popup-series badge card-series ' + seriesClass + '">' + event.seriesShort + '</div>'
    + '<div class="map-popup-name">' + event.name + '</div>'
    + '<div class="map-popup-date">' + formatDateRange(event.dateStart, event.dateEnd) + '</div>'
    + '<div class="map-popup-actions">';
  if (event.registrationUrl && event.status === 'upcoming') {
    html += '<a class="map-popup-link map-popup-register" href="' + event.registrationUrl + '" target="_blank" rel="noopener">Ilmoittaudu</a>';
  }
  if (event.websiteUrl) {
    html += '<a class="map-popup-link" href="' + event.websiteUrl + '" target="_blank" rel="noopener">Lisätiedot →</a>';
  }
  html += '</div></div>';
  return html;
}

/**
 * Renderöi karttanäkymän Leaflet-kirjastolla.
 * Ryhmittelee tapahtumat sijainnin mukaan.
 */
function renderMap(events) {
  // Alustetaan kartta ensimmäisellä kerralla
  if (!leafletMap) {
    leafletMap = L.map('events-map').setView([64.0, 26.0], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18
    }).addTo(leafletMap);
    mapMarkers = L.layerGroup().addTo(leafletMap);
  }

  // Pakotetaan kartan koon päivitys
  setTimeout(function() { leafletMap.invalidateSize(); }, 100);
  mapMarkers.clearLayers();

  // Ryhmitellään tapahtumat sijainnin mukaan
  var groups = {};
  $.each(events, function(i, event) {
    if (!event.lat || !event.lon) return;
    var key = event.lat + ',' + event.lon;
    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
  });

  // Luodaan merkit kartalle
  var bounds = [];
  $.each(groups, function(key, group) {
    var first = group[0];

    // Järjestetään: tulevat ensin, kerätään sarjojen värit
    var sorted = group.slice().sort(function(a, b) {
      var aUp = a.status === 'upcoming' ? 0 : 1;
      var bUp = b.status === 'upcoming' ? 0 : 1;
      if (aUp !== bUp) return aUp - bUp;
      return new Date(a.dateStart) - new Date(b.dateStart);
    });
    var seen = {};
    var uniqueColors = [];
    $.each(sorted, function(i, e) {
      if (!seen[e.series]) {
        seen[e.series] = true;
        uniqueColors.push(getSeriesColor(e.series));
      }
    });

    // Luodaan merkki sijainnille
    var marker;
    if (uniqueColors.length === 1) {
      marker = L.circleMarker([first.lat, first.lon], {
        radius: group.length > 1 ? 11 : 9,
        fillColor: uniqueColors[0],
        color: '#0d0f0e',
        weight: 2,
        opacity: 1,
        fillOpacity: first.status === 'past' ? 0.35 : 0.85
      });
    } else {
      // Monivärinen merkki useille sarjoille
      var reversed = uniqueColors.slice().reverse();
      var total = reversed.length;
      var dotsHtml = '';
      $.each(reversed, function(i, c) {
        var z = i + 1;
        dotsHtml += '<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:' + c + ';border:2px solid #0d0f0e;margin:0 -5px;position:relative;z-index:' + z + '"></span>';
      });
      var dotWidth = 16 + (total - 1) * 6;
      var icon = L.divIcon({
        html: '<div style="display:flex;align-items:center">' + dotsHtml + '</div>',
        className: 'map-multi-marker',
        iconSize: [dotWidth, 18],
        iconAnchor: [dotWidth / 2, 9]
      });
      marker = L.marker([first.lat, first.lon], { icon: icon });
    }

    // Rakennetaan popup-sisältö
    var location = first.location + (first.city ? ' · ' + first.city : '');
    var popupHtml = '<div style="font-family:Outfit,sans-serif;min-width:200px;max-width:280px">'
      + '<div class="map-popup-location" style="margin-bottom:0.5rem;font-weight:600">' + location + '</div>';
    $.each(group, function(i, event) {
      if (i > 0) popupHtml += '<hr style="border:none;border-top:1px solid #ddd;margin:0.4rem 0">';
      popupHtml += buildEventPopupBlock(event);
    });
    popupHtml += '</div>';
    marker.bindPopup(popupHtml, { maxHeight: 300 });

    mapMarkers.addLayer(marker);
    bounds.push([first.lat, first.lon]);
  });

  // Sovitetaan kartan näkymä merkkien mukaan
  if (bounds.length > 0) {
    leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
  }
}


// ============================================
// 11. TAPAHTUMAKUUNTELIJAT (jQuery .on())
// ============================================

/**
 * Kaikki tapahtumakuuntelijat sidotaan jQueryn $(document).ready()
 * -funktiossa, joka suoritetaan kun DOM on valmis.
 */
$(document).ready(function() {

  // Alustetaan Bootstrap-modaalit
  weatherBsModal  = new bootstrap.Modal($('#weather-modal')[0]);
  suggestBsModal  = new bootstrap.Modal($('#suggest-modal')[0]);
  feedbackBsModal = new bootstrap.Modal($('#feedback-modal')[0]);

  // Piilotetaan kaikki tooltipit kun modaali avautuu (estää mobiili-tooltip-jäämisen)
  $('.modal').on('show.bs.modal', function() {
    $('.tooltip').remove();
  });

  // Alustetaan Bootstrap Toast -ilmoitus
  appToast = new bootstrap.Toast($('#app-toast')[0]);

  // Alustetaan Bootstrap Tooltips kaikille [title]-elementeille
  // Mobiilissa (kosketusnäyttö) ei käytetä tooltippejä — hover ei toimi järkevästi
  if (!('ontouchstart' in window)) {
    $('[title]').each(function() {
      new bootstrap.Tooltip(this, { trigger: 'hover', placement: 'top' });
    });
  }

  // Alustetaan AOS (Animate On Scroll) -kirjasto
  AOS.init({
    duration: 600,       // animaation kesto (ms)
    easing: 'ease-out',  // animaation tyyppi
    once: true,          // animoidaan vain kerran
    offset: 60           // etäisyys näkymän reunasta ennen animaatiota
  });

  // --- Hover-hehkuefekti korteille (jQuery mousemove) ---
  // Seuraa hiiren sijaintia ja luo valohehkun kortin pinnalle
  $(document).on('mousemove', '.event-card', function(e) {
    var $card = $(this);
    var rect = $card[0].getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    // Asetetaan CSS-muuttujat hiiren sijainnille
    $card.css({
      '--glow-x': x + 'px',
      '--glow-y': y + 'px'
    });
  });
  $(document).on('mouseleave', '.event-card', function() {
    // Poistetaan hehku kun hiiri poistuu kortilta
    $(this).css({ '--glow-x': '-100px', '--glow-y': '-100px' });
  });

  // --- Segmenttipainikkeet (kisat/tapahtumat/kaikki) ---
  $(document).on('click', '.segment-btn', function() {
    setSegment($(this).data('segment'));
    applyFilters();
  });

  // --- Monivalintavalikot: avaus/sulkeminen ---
  $.each(multiSelectDefaults, function(id) {
    var $container = $('#' + id);

    // Trigger-napin klikkaus avaa/sulkee valikon
    $container.find('.multi-select-trigger').on('click', function(e) {
      e.stopPropagation();
      var isOpen = $container.hasClass('open');
      // Suljetaan kaikki muut valikot
      $('.multi-select.open').removeClass('open');
      if (!isOpen) $container.addClass('open');
    });

    // Vaihtoehdon klikkaus — valinta/poisto
    $container.find('.multi-select-option').on('click', function(e) {
      e.stopPropagation(); // pidetään valikko auki
      $(this).toggleClass('checked');
      updateTriggerText(id);
      applyFilters();
    });
  });

  // Suljetaan valikot klikatessa muualle (jQuery-dokumenttikuuntelija)
  $(document).on('click', function() {
    $('.multi-select.open').removeClass('open');
  });

  // --- Järjestysvalinta ---
  $('#filter-sort').on('change', applyFilters);

  // --- Hakukenttä viiveellä (debounce) ---
  var searchTimeout = null;
  $('#filter-search').on('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(applyFilters, 300);
  });

  // --- Tyhjennä-nappi ---
  $('#btn-reset-filters').on('click', function() {
    resetFilters();
    showToast('Suodattimet tyhjennetty');
  });

  // --- Tyhjän tilan resetointilinkki ---
  $('#empty-reset-link').on('click', function(e) {
    e.preventDefault();
    resetFilters();
  });

  // --- Logo = koti (tyhjennä suodattimet, oletusnäkymä, scroll ylös) ---
  $('#logo-link').on('click', function(e) {
    e.preventDefault();
    resetFilters();
    if (currentView !== 'cards') {
      currentView = 'cards';
      $('#view-cards').addClass('active');
      $('#view-list, #view-map').removeClass('active');
      renderEvents(filteredEvents);
    }
    // Varmistetaan että suodatinpalkki näkyy (jQuery slideUp voi piilottaa sen)
    var $inner = $('.filters-inner');
    $inner.removeAttr('style');
    $('#filters-section').removeClass('expanded');
    $('#filter-toggle-icon').html('<i class="bi bi-chevron-down"></i>');
    // Animoitu scroll ylös jQueryllä
    $('html, body').animate({ scrollTop: 0 }, 400);
  });

  // --- Näkymätoggle: Kortit ---
  $('#view-cards').on('click', function() {
    if (currentView === 'cards') return;
    currentView = 'cards';
    $(this).addClass('active');
    $('#view-list, #view-map').removeClass('active');
    renderEvents(filteredEvents);
  });

  // --- Näkymätoggle: Lista ---
  $('#view-list').on('click', function() {
    if (currentView === 'list') return;
    currentView = 'list';
    $(this).addClass('active');
    $('#view-cards, #view-map').removeClass('active');
    renderEvents(filteredEvents);
  });

  // --- Näkymätoggle: Kartta ---
  $('#view-map').on('click', function() {
    if (currentView === 'map') return;
    currentView = 'map';
    $(this).addClass('active');
    $('#view-cards, #view-list').removeClass('active');
    renderEvents(filteredEvents);
  });

  // --- Mobiili: suodattimien toggle (jQuery slideToggle -animaatio) ---
  $('#filter-toggle').on('click', function() {
    var $section = $('#filters-section');
    var $inner = $section.find('.filters-inner');
    var willExpand = !$section.hasClass('expanded');

    if (willExpand) {
      // Avataan suodattimet sulavalla slideDown-animaatiolla
      $section.addClass('expanded');
      $inner.hide().slideDown(300);
      filterExpandedByUser = true;
      clearTimeout(filterGuardTimer);
      filterGuardTimer = setTimeout(function() { filterExpandedByUser = false; }, 500);
    } else {
      // Suljetaan slideUp-animaatiolla
      $inner.slideUp(250, function() {
        $section.removeClass('expanded');
      });
      filterExpandedByUser = false;
      clearTimeout(filterGuardTimer);
    }
    // Vaihdetaan ikonin suunta jQueryllä
    $('#filter-toggle-icon').html(willExpand ? '<i class="bi bi-chevron-up"></i>' : '<i class="bi bi-chevron-down"></i>');
  });

  // --- Mobiili: suodattimien automaattinen sulkeutuminen scrollatessa ---
  $(window).on('scroll', function() {
    if ($(window).width() > 600) return;
    if (filterExpandedByUser) return;
    if ($(window).scrollTop() > 120 && $('#filters-section').hasClass('expanded')) {
      // Suljetaan jQuery slideUp -animaatiolla
      $('#filters-section').find('.filters-inner').slideUp(250, function() {
        $('#filters-section').removeClass('expanded');
      });
      $('#filter-toggle-icon').html('<i class="bi bi-chevron-down"></i>');
    }
  });

  // --- Ikkunan koon muutos: poistetaan jQuery inline-tyylit suodattimilta ---
  // Estää tilanteen jossa mobiilissa slideUp asettaa display:none
  // ja se jää voimaan desktopiin siirryttäessä
  $(window).on('resize', function() {
    if ($(window).width() > 600) {
      $('.filters-inner').removeAttr('style');
    }
  });

  // --- Ehdota tapahtumaa -nappi (avaa Bootstrap-modaalin) ---
  $('#btn-suggest-event').on('click', function() {
    // Nollataan lomake jQueryllä
    $('#suggest-form')[0].reset();
    $('#suggest-form').removeClass('d-none');
    $('#suggest-success').addClass('d-none');
    suggestBsModal.show();
  });

  // --- Palaute-nappi ---
  $('#btn-feedback').on('click', function() {
    $('#feedback-form')[0].reset();
    $('#feedback-form').removeClass('d-none');
    $('#feedback-success').addClass('d-none');
    feedbackBsModal.show();
  });

  // --- Ehdotuslomakkeen lähetys (jQuery AJAX) ---
  $('#suggest-form').on('submit', function(e) {
    e.preventDefault();
    var $form = $(this);
    // Lähetetään lomaketiedot jQuery AJAX -kutsulla
    $.ajax({
      url: '/',
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      data: $form.serialize()
    }).done(function() {
      // Näytetään onnistumisviesti
      $form.addClass('d-none');
      $('#suggest-success').removeClass('d-none');
    }).fail(function() {
      alert('Lähetys epäonnistui. Yritä uudelleen.');
    });
  });

  // --- Palautelomakkeen lähetys (jQuery AJAX) ---
  $('#feedback-form').on('submit', function(e) {
    e.preventDefault();
    var $form = $(this);
    $.ajax({
      url: '/',
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      data: $form.serialize()
    }).done(function() {
      $form.addClass('d-none');
      $('#feedback-success').removeClass('d-none');
    }).fail(function() {
      alert('Lähetys epäonnistui. Yritä uudelleen.');
    });
  });

  // --- Ehdotuslomake: asetetaan loppupäivä automaattisesti alkupäivän mukaan ---
  $('#suggest-date-start').on('change', function() {
    var val = $(this).val();
    var $endInput = $('#suggest-date-end');
    if (val && val.length === 10 && parseInt(val.split('-')[0], 10) >= 2000 && !$endInput.val()) {
      $endInput.val(val);
    }
  });

  // --- Takaisin ylös -nappi (jQuery .fadeIn/.fadeOut + .animate scroll) ---
  var $backToTop = $('#btn-back-to-top');
  // Piilotetaan aluksi jQueryllä (ei d-none, jotta fadeIn/fadeOut toimii)
  $backToTop.removeClass('d-none').hide();
  $(window).on('scroll', function() {
    // Näytetään nappi kun scrollataan yli 400px alas
    if ($(window).scrollTop() > 400) {
      $backToTop.fadeIn(300);
    } else {
      $backToTop.fadeOut(300);
    }
  });
  $backToTop.on('click', function() {
    // Animoitu smooth scroll ylös jQueryn .animate()-metodilla
    $('html, body').animate({ scrollTop: 0 }, 500);
  });

  // --- Esivalitaan "Tulevat"-tila oletuksena ---
  $('#filter-status .multi-select-option[data-value="upcoming"]').addClass('checked');
  updateTriggerText('filter-status');

  // --- Ladataan tapahtumat AJAX-kutsulla ---
  loadEvents();
});
