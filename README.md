# Gravity Calendar — Suomen Gravity MTB Tapahtumat 2026

Selainpohjainen sovellus, joka kokoaa Suomen gravity-maastopyöräilytapahtumat yhteen paikkaan. Näyttää tapahtumat kolmesta eri sarjasta ja hakee reaaliaikaisen sääennusteen tapahtumapaikoille.

**Projekti 3:** JS-sovellus ulkoisia kirjastoja käyttäen.

## Demo

[Katso videodemo](https://youtu.be/PLACEHOLDER)

## Sovelluksen linkki

- GitHub: [tengska/js-project3](https://github.com/tengska/js-project3)
- Netlify: [karlanjsprojekti3.netlify.app](https://karlanjsprojekti3.netlify.app)

## Ominaisuudet

- **Tapahtumakalenteri** — Suomi DH Cup, Finnish Enduro Cup ja MTB Rally 2026 tapahtumat
- **Suodattimet** — filtteröi sarjan, lajin, kuukauden ja tilan mukaan
- **Lajittelu** — järjestä tapahtumat päivämäärän tai sarjan mukaan
- **Tekstihaku** — etsi tapahtumia nimen, paikan tai järjestäjän perusteella
- **Kortti-, lista- ja karttanäkymä** — kolme eri tapaa tarkastella tapahtumia
- **Kuukausierottimet** — tapahtumat ryhmitellään kuukauden mukaan
- **Sääennuste** — hakee Open-Meteo API:sta reaaliaikaisen sääennusteen (max 16 vrk)
- **Historiallinen sää** — viime vuoden sää samoille päiville, kun ennuste ei ole saatavilla
- **Karttanäkymä** — tapahtumat Suomen kartalla Leaflet-kirjastolla
- **Ehdota tapahtumaa / Palaute** — lomakkeet Netlify Forms -palvelulla
- **AOS scroll-animaatiot** — kortit ja kuukausierottimet animoituvat näkyviin scrollatessa
- **jQuery-animaatiot** — sään pikakuvaus fadeIn, suodattimien slideDown/slideUp mobiilissa, smooth scroll
- **Hover-hehkuefekti** — korttien pinta hehkuu hiiren sijainnin mukaan (jQuery mousemove)
- **Toast-ilmoitukset** — Bootstrap Toast -komponentilla (esim. "Suodattimet tyhjennetty")
- **Tooltips** — Bootstrap Tooltips hover-infot painikkeille
- **Takaisin ylös -nappi** — jQuery fadeIn/fadeOut + animate scroll
- **Responsiivinen** — toimii mobiililla ja työpöydällä

## Käytetyt ulkoiset kirjastot

| Kirjasto | Käyttötarkoitus |
|----------|----------------|
| **jQuery 3.7.1** | DOM-käsittely (`$()`), tapahtumakuuntelijat (`.on()`), AJAX-kutsut (`$.getJSON`, `$.ajax`), animaatiot (`.fadeIn()`, `.slideDown()`, `.slideUp()`, `.animate()`), taulukkokäsittely (`$.each`, `$.grep`, `$.map`) |
| **Bootstrap 5.3.3** | UI-komponentit: modaalit, painikkeet (`btn`), lomakkeet (`form-control`, `form-select`), badge-elementit, spinner, Toast-ilmoitukset, Tooltips, grid-järjestelmä (`row`, `col`), apuluokat (`d-none`, `d-flex`, `text-muted`) |
| **Bootstrap Icons 1.11.3** | Ikonit suodattimissa, napeissa ja navigoinnissa |
| **AOS 2.3.4** | Animate On Scroll — scroll-animaatiot korteille ja kuukausierottimille (fade-up, fade-right) |
| **Leaflet 1.9.4** | Interaktiivinen karttanäkymä OpenStreetMap-pohjalla |
| **Google Fonts** | Outfit + Space Mono -fonttiperheet |

## Miten jQuery korvaa natiivin JavaScriptin

| Natiivi JavaScript | jQuery-versio | Esimerkki koodissa |
|---|---|---|
| `document.getElementById('x')` | `$('#x')` | `$('#loading').addClass('d-none')` |
| `document.querySelectorAll('.x')` | `$('.x')` | `$('.multi-select-option.checked')` |
| `element.addEventListener('click', fn)` | `.on('click', fn)` | `$('#view-cards').on('click', function() {...})` |
| `fetch(url).then(...)` | `$.getJSON(url).done(...)` | `$.getJSON('events.json').done(function(data) {...})` |
| `fetch(url)` (API) | `$.ajax({url, dataType})` | `$.ajax({url: weatherUrl, dataType: 'json'})` |
| `element.classList.add/remove/toggle` | `.addClass()/.removeClass()/.toggleClass()` | `$card.addClass('cancelled')` |
| `element.innerHTML = '...'` | `.html('...')` | `$('#weather-body').html(html)` |
| `element.textContent = '...'` | `.text('...')` | `$('#results-count').text(...)` |
| `document.createElement('div')` | `$('<div>')` | `$('<div>').addClass('event-card')` |
| `parent.appendChild(child)` | `.appendTo(parent)` | `$el.appendTo($grid)` |
| `Array.from(x).filter(...)` | `$.grep(...)` | `$.grep(allEvents, function(e) {...})` |
| `array.forEach(...)` | `$.each(...)` | `$.each(events, function(i, event) {...})` |
| `Object.assign({}, obj)` | `$.extend({}, obj)` | `$.extend({}, event)` |
| `FormData + URLSearchParams` | `.serialize()` | `$form.serialize()` |
| `element.style.display = 'none'` | `.fadeOut()/.slideUp()` | `$backToTop.fadeOut(300)` |
| `element.style.display = ''` | `.fadeIn()/.slideDown()` | `$miniEl.hide().fadeIn(400)` |
| `window.scrollTo({behavior:'smooth'})` | `.animate({scrollTop})` | `$('html, body').animate({scrollTop: 0}, 500)` |
| `element.addEventListener('mousemove')` | `.on('mousemove')` | `$(document).on('mousemove', '.event-card', fn)` |

## Miten Bootstrap korvaa oman CSS:n

- **Modaalit:** `modal fade`, `modal-dialog`, `modal-content` (korvaa vanhat custom `.modal-overlay` -elementit)
- **Painikkeet:** `btn btn-outline-success`, `btn btn-outline-secondary` jne.
- **Lomakkeet:** `form-control`, `form-select`, `form-label`
- **Latausanimaatio:** `spinner-border text-success` (korvaa vanhan custom spinnerin)
- **Apuluokat:** `d-none` (piilotus), `d-flex`, `text-center`, `text-muted`, `mb-3`, `py-4` jne.
- **Grid:** `row`, `col-6` lomakkeen asettelussa
- **Ikonit:** Bootstrap Icons (`bi bi-calendar3`, `bi bi-cloud-sun`, `bi bi-geo-alt` jne.)
- **Toast:** `toast`, `toast-body` ilmoituskomponentti
- **Tooltips:** `bootstrap.Tooltip` hover-infot painikkeille

## API-kutsut (AJAX)

1. **events.json** — staattinen tapahtumatiedosto (`$.getJSON`)
2. **Open-Meteo Forecast API** — `https://api.open-meteo.com/v1/forecast` (`$.ajax`)
3. **Open-Meteo Archive API** — `https://archive-api.open-meteo.com/v1/archive` (`$.ajax`)

## Tietolähteet

| Sarja | Lähde |
|-------|-------|
| Suomi DH Cup | [pyoraily.fi](https://pyoraily.fi/tapahtumat-ja-kilpailut/suomi-dh-cup/) |
| Finnish Enduro Cup | [eba.mtb-enduro.fi](https://eba.mtb-enduro.fi/kilpailut/) |
| MTB Rally | [mtbrally.com](https://www.mtbrally.com/fi/calendar) |
| Säädata | [Open-Meteo](https://open-meteo.com/) |
| Karttadata | [OpenStreetMap](https://www.openstreetmap.org/) |

## Projektin rakenne

```
/
  index.html      # Pääsivu (Bootstrap-komponentit, jQuery CDN)
  style.css       # Tyylit (Bootstrap-ylikirjoitukset + oma teema)
  app.js          # Sovelluslogiikka (jQuery AJAX, DOM, kuuntelijat)
  events.json     # Tapahtumatiedot (JSON)
  README.md       # Projektiraportti
```

## Itsearviointi

| Kriteeri | Pisteet | Toteutus |
|----------|---------|----------|
| Koodi on kommentoitu | 1 | Suomenkieliset JSDoc-kommentit jokaiselle funktiolle ja loogiselle osiolle |
| jQuery: kuuntelijat, AJAX, DOM | 3 | Kaikki DOM-käsittely, event handlerit ja API-kutsut toteutettu jQueryllä |
| UI-kirjasto (Bootstrap) | 1 | Bootstrap 5: modaalit, napit, lomakkeet, grid, spinner, ikonit |
| Koodi GitHubissa | 1 | Julkaistu GitHubissa: [github.com/tengska/js-project3](https://github.com/tengska/js-project3) |
| Sovellus Netlifyssä | 1 | Julkaistu Netlifyssä: [karlanjsprojekti3.netlify.app](https://karlanjsprojekti3.netlify.app) |
| Videodemo | 1 | [Katso video](https://youtu.be/PLACEHOLDER) |
| Projektiraportti ja README | 2 | Tämä tiedosto |
| **Yhteensä** | **10** | |

## Tekijä

Karla Tengström (käytin Claude tekoälyä apurina)

## Projektiin käytetty aika

~1 päivä (sisältäen jQuery/Bootstrap-konversion, mutta poislukien alkuperäisen projektin kehityksen)

## Tulevaisuuden parannusehdotukset

- **GitHub Action** — automaattinen events.json-päivitys lähdesivustoilta
- **Kansainväliset kisat** — UCI DH World Cup, EWS jne.
- **Kalenterinäkymä** — kuukausinäkymä tapahtumille
- **Ilmoitukset** — push-ilmoitukset lähestyvistä tapahtumista
