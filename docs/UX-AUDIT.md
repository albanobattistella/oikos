# Oikos UX/UI Audit

**Datum:** 2026-05-20  
**Analysierte Dateien:** `tokens.css`, `layout.css`, `router.js`, `dashboard.css`, `dashboard.js`, `tasks.css`  
**Methodik:** Statische Codeanalyse gegen UI/UX Pro Max-Richtlinien (Accessibility, Touch, Performance, Layout, Typography, Animation, Forms, Navigation)

---

## Legende

- 🔴 **KRITISCH** — WCAG-Verstoß oder deutlicher Funktionsbruch
- 🟠 **HOCH** — Spürbare UX-Verschlechterung, hoher Hebel
- 🟡 **MITTEL** — Qualitäts- und Konsistenzproblem
- 🟢 **NIEDRIG** — Polish, kaum wahrnehmbar aber sauber zu lösen

Status-Spalte beim Abarbeiten: `[ ]` offen → `[x]` erledigt

---

## 🔴 KRITISCH

### K1 — Metriktitel auf 10px: WCAG-Verstoß
- **Datei:** `public/styles/dashboard.css:130`
- **Problem:** `.dashboard-metric__title` nutzt `font-size: var(--text-2xs)` = 10px. WCAG 2.1 empfiehlt Minimum 12px für Textelemente; 10px ist auch auf Retina-Displays schwer lesbar.
- **Fix:** `--text-2xs` durch `--text-xs` (12px) ersetzen:
  ```css
  .dashboard-metric__title {
    font-size: var(--text-xs); /* war: var(--text-2xs) */
  }
  ```
- **Status:** [x]

---

### K2 — Kalender-Suchergebnisse ohne Deep-Link
- **Datei:** `public/router.js:1013`
- **Problem:** `makeSection('nav.calendar', events, () => '/calendar')` — alle Kalender-Treffer navigieren zu `/calendar`, ohne das spezifische Event zu öffnen. Der Nutzer findet den gesuchten Termin nicht.
- **Fix:** Event-ID übergeben analog zu Tasks:
  ```js
  makeSection('nav.calendar', events, (i) => `/calendar?open=${i.id}`);
  ```
  Dann im Kalender-Modul `?open=<id>` auswerten und das Event-Modal öffnen.
- **Status:** [x]

---

### K3 — Kein Passwort-Sichtbarkeits-Toggle auf dem Login-Formular
- **Datei:** `public/pages/login.js` (kein Toggle-Button vorhanden)
- **Problem:** Verstößt gegen Material Design (`password-toggle`) und Apple HIG. Nutzer können nicht prüfen, was sie eingeben — besonders auf Mobile frustrierend.
- **Fix:** Button mit Auge-Icon neben dem Passwortfeld einfügen:
  ```js
  // Nach dem input-Element:
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', t('login.showPassword'));
  toggle.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    // Icon wechseln: eye ↔ eye-off
  });
  ```
- **Status:** [x]

---

### K4 — More-Sheet überladen (8 Module + Suche)
- **Datei:** `public/router.js:604`, `const PRIMARY_NAV = 3`
- **Problem:** Das More-Sheet enthält Birthdays, Notes, Contacts, Budget, Documents, Housekeeping, Settings + Suchleiste. 8 Einträge im 3-Spalten-Grid sind schwer zu scannen; wichtige Module wie Notizen und Kontakte sind dauerhaft verborgen.
- **Fix-Option A (empfohlen):** `PRIMARY_NAV` auf 4 erhöhen (+ Notes oder Contacts in die Bottom-Bar aufnehmen). Dazu Bottom-Bar von 5 auf 5 Items halten: Dashboard | Kalender | Aufgaben | Notizen | Mehr.
- **Fix-Option B:** More-Sheet mit `grid-template-columns: repeat(4, 1fr)` in zwei Zeilen à 4 statt drei Zeilen à 3 anordnen — besser scanbar.
- **Hintergrund:** Material Design empfiehlt max. 5 primäre Nav-Items; alles dahinter verliert Entdeckbarkeit um ~60 %.
- **Status:** [x]

---

## 🟠 HOCH

### H1 — Desktop-Sidebar bei 1024–1279px Icons-Only
- **Datei:** `public/styles/layout.css:760–790` (Tooltip-Block)
- **Problem:** Zwischen 1024 und 1279px zeigt die Sidebar nur 56px breite Icons ohne Labels. Nutzer müssen hovern, um via CSS-`::after`-Tooltip den Namen zu lesen. Für tägliche Nutzung mühsam; Tooltips sind kein Ersatz für persistente Labels.
- **Fix:** Sidebar-Expansion auf 1024px vorziehen:
  ```css
  /* layout.css: --sidebar-width-expanded ab 1024px statt 1280px */
  @media (min-width: 1024px) {
    :root { --sidebar-width: var(--sidebar-width-expanded); }
    .nav-sidebar .nav-item__label { display: block; }
    .nav-sidebar__brand-text { display: flex; }
    /* nav-item padding anpassen: justify-content: flex-start; gap: var(--space-3) */
  }
  ```
  Oder: Labels als Mini-Captions (10px) dauerhaft unterhalb der Icons bei 56px-Breite anzeigen.
- **Status:** [x]

---

### H2 — Kitchen-Button: Zielzustand nicht vorhersehbar
- **Datei:** `public/router.js:534–547`
- **Problem:** Der "Küche"-Button navigiert zum *letzten besuchten* Kitchen-Route (Mahlzeiten, Rezepte oder Einkauf). Neue Nutzer verstehen nicht, wohin dieser Button führt — es gibt keinen visuellen Hinweis auf das Ziel.
- **Fix:** Long-Press oder ein kleines Kontextmenü mit den 3 Unterseiten:
  ```js
  kitchenBtn.addEventListener('contextmenu', showKitchenMenu); // Desktop
  // Mobile: pointerdown + 400ms Timer → Menü
  ```
  Alternativ: Label dynamisch aktualisieren auf die Zielroute (`t('nav.meals')` etc.) wenn der letzte Kitchen-State bekannt ist.
- **Status:** [ ]

---

### H3 — Dashboard-Hero: 4 Metric-Kacheln stacken auf Mobile auf 1 Spalte
- **Datei:** `public/styles/dashboard.css:61–65`
- **Problem:** Unter 768px wechselt `.dashboard-hero__rail` von 2 auf 1 Spalte. Resultat: 4 vollbreite Kacheln à ~96px = ~400px Scroll-Offset bevor der Nutzer Aufgaben oder Kalender-Widgets sieht.
- **Fix:**
  ```css
  /* dashboard.css — Breakpoint entfernen, 2 Spalten immer beibehalten */
  .dashboard-hero__rail {
    grid-template-columns: repeat(2, minmax(0, 1fr)); /* immer 2 Spalten */
  }
  /* @media (max-width: 767px) Block entfernen */
  ```
- **Status:** [x]

---

### H4 — FAB-Position entkoppelt sich von auto-hidden Bottom-Nav
- **Datei:** `public/styles/layout.css:548–550`, `public/router.js:820–839`
- **Problem:** Bottom-Nav versteckt sich beim Runterscrollen (`translateY(100%)`). FAB ist `position: fixed; bottom: calc(var(--nav-bottom-height) + 24px + ...)` — wenn die Nav weg ist, schwebt der FAB mitten im Screen.
- **Fix:** CSS-Klasse auf `.nav-bottom--hidden` reagieren:
  ```css
  .nav-bottom--hidden ~ * .page-fab,
  .nav-bottom--hidden + .page-fab { /* Falls im selben Stacking-Context */
    bottom: calc(var(--space-6) + var(--safe-area-inset-bottom));
    transition: bottom 0.2s var(--ease-out);
  }
  ```
  Oder in `initNavHideOnScroll()` per JS die FAB-Position mitanimieren.
- **Status:** [x]

---

### H5 — Toast `aria-live="assertive"` für alle Toast-Typen
- **Datei:** `public/router.js:641`
- **Problem:** `toastContainer.setAttribute('aria-live', 'assertive')` unterbricht Screenreader-Ausgabe sofort für *alle* Toasts — auch unproblematische Success-Meldungen ("Gespeichert"). Zu aggressiv.
- **Fix:** Zwei getrennte Container:
  ```js
  // polite: für success/default
  toastContainerPolite.setAttribute('aria-live', 'polite');
  // assertive: nur für danger/warning
  toastContainerAssertive.setAttribute('aria-live', 'assertive');
  ```
  In `showToast()` je nach `type` den richtigen Container wählen.
- **Status:** [x]

---

### H6 — Globale Suche: Shopping, Kontakte, Budget, Dokumente fehlen
- **Datei:** `public/router.js:978`
- **Problem:** `const { tasks = [], events = [], notes = [] } = data` — die globale Suche findet nur Aufgaben, Events und Notizen. Kontakte, Einkaufsartikel, Budget-Einträge und Dokumente sind nicht durchsuchbar.
- **Fix:** Server-seitig (`/api/v1/search`) weitere Inhaltstypen hinzufügen; client-seitig entsprechende Sektionen rendern:
  ```js
  const { tasks = [], events = [], notes = [], contacts = [], items = [] } = data;
  makeSection('nav.contacts', contacts, (i) => `/contacts?open=${i.id}`);
  makeSection('nav.shopping', items,    (i) => `/shopping?highlight=${i.id}`);
  ```
- **Status:** [x] (Contacts + Shopping implementiert; Budget/Dokumente als separate Phase möglich)

---

### H7 — Fehlender Skeleton-Screen beim initialen Dashboard-Load
- **Datei:** `public/pages/dashboard.js` (kein Skeleton-Prerender sichtbar)
- **Problem:** Dashboard-Hero und Widget-Grid laden Daten asynchron. Ohne Skeleton-Placeholder kann es zu sichtbaren Layout-Shifts (CLS) kommen, wenn 9 Widgets nacheinander eingeblendet werden.
- **Fix:** Vor API-Aufruf Skeleton-Markup in den Grid rendern:
  ```js
  // Vor dem API-Call in render():
  grid.insertAdjacentHTML('afterbegin', WIDGET_IDS.map(() =>
    `<div class="widget-wrapper widget-size--2x1">
       <div class="widget card skeleton" style="min-height:132px"></div>
     </div>`
  ).join(''));
  // Nach API-Daten: grid.replaceChildren() + echte Widgets
  ```
- **Status:** [x]

---

### H8 — More-Sheet-Suche: Zweistufiger Prozess (Sheet schließen → Overlay öffnen)
- **Datei:** `public/router.js:883–890`
- **Problem:** Tippen auf die Suchleiste im More-Sheet schließt erst das Sheet und öffnet dann das Search-Overlay — zwei Animationen hintereinander. Das fühlt sich träge an.
- **Fix:** Suchleiste direkt als `<input>` im More-Sheet implementieren, das beim Fokus das Sheet in ein Search-Interface verwandelt (ohne Schließen/Öffnen). Oder: Suchleiste in der Bottom-Nav als eigener 5. Button (Lupe-Icon) zugänglich machen.
- **Status:** [x]

---

## 🟡 MITTEL

### M1 — Mehrdeutige Modul-Akzentfarben-Überlagerung im Dashboard
- **Datei:** `public/styles/tokens.css:174–203`, `public/styles/dashboard.css`
- **Problem:** 15 verschiedene Modul-Akzentfarben erscheinen gleichzeitig auf dem Dashboard-Widget-Grid. Das erzeugt ein visuell unruhiges Bild.
- **Fix:** Im Dashboard alle Widget-Akzentlinien (`border-top: 2px solid var(--active-module-accent)`) in einer einzigen gedämpften Farbe oder dem Dashboard-Akzent (`--module-dashboard`) darstellen. Individuelle Farben nur auf der jeweiligen Modulseite vollständig einsetzen.
  ```css
  /* dashboard.css: widget border-top vereinheitlichen */
  .dashboard .widget-size--2x2 > .widget,
  .dashboard .widget-size--2x1 > .widget { /* etc. */
    border-top-color: color-mix(in srgb, var(--active-module-accent) 40%, var(--color-border));
  }
  ```
- **Status:** [x]

---

### M2 — Falsche ARIA-Rolle: `role="listitem"` auf `<a>`-Elementen
- **Datei:** `public/router.js:1056`
- **Problem:** `a.setAttribute('role', 'listitem')` auf Ankerelementen ist semantisch überflüssig und kann Screenreader verwirren. Der übergeordnete Container hat bereits `role="list"`.
- **Fix:** Zeile entfernen:
  ```js
  // a.setAttribute('role', 'listitem'); // entfernen
  ```
- **Status:** [x]

---

### M3 — Körpertext 15px auf Desktop
- **Datei:** `public/styles/tokens.css:303`
- **Problem:** `--text-base: 0.9375rem` (15px). Zwar über dem kritischen Minimum, aber 16px ist der etablierte Standard für Lesbarkeit auf Desktop. Der 1px-Unterschied ist systemweit spürbar bei langen Texten (Notizen, Beschreibungen).
- **Fix:**
  ```css
  --text-base: 1rem; /* 15px → 16px */
  ```
  Auf Folgewirkungen in `.input`, `.form-input` prüfen (die nutzen `--text-base` auf Desktop).
- **Status:** [x]

---

### M4 — RRULE-Wochentag-Buttons: 40px auf Mobile zu knapp
- **Datei:** `public/styles/layout.css:1929–1943`
- **Problem:** `.rrule-day` nutzt `--target-md: 40px` (40×40px). 7 aufeinanderfolgende Buttons in einer Reihe bei 40px ≈ 290px — auf einem 375px-Screen mit Padding bleibt ~3px Abstand. Apple HIG fordert 44×44pt.
- **Fix:**
  ```css
  @media (max-width: 1023px) {
    .rrule-day {
      width: var(--target-base); /* 44px */
      height: var(--target-base);
    }
    .rrule-day-grid {
      gap: var(--space-0h); /* 2px — weniger Lücke damit alle 7 passen */
      justify-content: space-between;
    }
  }
  ```
- **Status:** [x]

---

### M5 — Sticky-Toolbar-Transparenz: Hintergrundtext durchschimmernd
- **Datei:** `public/styles/layout.css:1760`
- **Problem:** `.sticky-header` nutzt `color-mix(in srgb, var(--color-bg) 90%, transparent)`. Beim schnellen Scrollen schimmert Text durch, der hinter der Toolbar vorbeiläuft, und kann die Toolbar-Inhalte unleserlich machen.
- **Fix:** Transparenz-Anteil erhöhen:
  ```css
  .sticky-header {
    background-color: color-mix(in srgb, var(--color-bg) 96%, transparent);
  }
  ```
- **Status:** [x] (bereits durch `009a62f` behoben — `backdrop-filter` entfernt, `.sticky-header` ist jetzt vollständig opak mit `background-color: var(--color-bg)`)

---

### M6 — Onboarding: Skip-Button erscheint schon auf Schritt 1
- **Datei:** `public/pages/dashboard.js:74–77`
- **Problem:** Skip-Button ist auf allen 3 Onboarding-Schritten sichtbar. Nutzer überspringen den Flow bevor sie die Navigation-Erklärung (Schritt 2) sehen — das führt zu Verwirrung.
- **Fix:**
  ```js
  // Skip nur ab Schritt > 0 anzeigen:
  if (current > 0) actions.appendChild(skipBtn);
  ```
  Auf dem letzten Schritt Skip durch nichts ersetzen (nur "Los geht's"-Button).
- **Status:** [x]

---

### M7 — Kein konsistentes Undo bei allen destruktiven Aktionen
- **Datei:** `public/router.js:1229` (Undo-Infrastruktur vorhanden, aber nicht überall genutzt)
- **Problem:** `showToast()` unterstützt `onUndo`-Callback, aber Dokumente, Kontakte und Budget-Einträge bieten beim Löschen keinen Undo-Toast an. Nur Tasks und Shopping sind nachgewiesen.
- **Fix:** In jedem Modul prüfen ob Löschen einen Undo-Toast aufruft. Kodexregel: *jede* Löschaktion nutzt `showToast(message, 'danger', 5000, undoCallback)`.
- **Status:** [ ]

---

## 🟢 NIEDRIG

### N1 — Begrüßungs-Gradient nicht live aktualisiert
- **Datei:** `public/pages/dashboard.js:217–221`
- **Problem:** Tageszeit-Gradient (Morgen: Orange, Abend: Violet) wird einmalig beim Seitenrendern gesetzt. Läuft das Dashboard den ganzen Tag, stimmt die Begrüßung nicht mehr.
- **Fix:** `visibilitychange`-Event nutzen:
  ```js
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateGreetingGradient();
  });
  ```
- **Status:** [ ]

---

### N2 — FAB-Animationszähler global, nicht pro Modul
- **Datei:** `public/router.js:674–675`, `const FAB_SEEN_MAX = 5`
- **Problem:** Nach 5 Seitenaufrufen (egal welcher Seite) wird die FAB-Eingangsanimation global deaktiviert. Neue Module, die der Nutzer zum ersten Mal besucht, zeigen dann keine Einführungsanimation mehr.
- **Fix:**
  ```js
  const FAB_SEEN_KEY = (module) => `oikos:fabSeen:${module}`;
  // Im FAB-Block: module-spezifischen Key verwenden
  ```
- **Status:** [ ]

---

### N3 — Offline-Banner überdeckt Seiteninhalt ohne Offset
- **Datei:** `public/styles/layout.css:2219–2235`
- **Problem:** `.offline-banner` ist `position: fixed; top: 0; height: ~40px`. Es gibt keinen entsprechenden `padding-top` auf `.app-content`, wenn das Banner sichtbar ist — Inhalte werden teilweise überdeckt.
- **Fix:**
  ```js
  // In initOfflineBanner():
  function update() {
    banner.hidden = navigator.onLine;
    document.documentElement.style.setProperty(
      '--offline-banner-height', navigator.onLine ? '0px' : '40px'
    );
  }
  ```
  ```css
  /* layout.css: */
  .app-content {
    padding-top: var(--offline-banner-height, 0px);
    transition: padding-top 0.2s ease;
  }
  ```
- **Status:** [ ]

---

### N4 — Responsive Grid `.grid--2` greift erst bei 768px
- **Datei:** `public/styles/layout.css:1609–1611`
- **Problem:** Zwischen 600–768px (iPad Mini Portrait, kleine Tablets) bleibt alles einspaltig, obwohl 2 Spalten bequem passen würden.
- **Fix:**
  ```css
  @media (min-width: 600px) {
    .grid--2 { grid-template-columns: repeat(2, 1fr); }
  }
  ```
- **Status:** [ ]

---

### N5 — Icon-Größen-System zu granular (8 Stufen)
- **Datei:** `public/styles/layout.css:2321–2328`
- **Problem:** 8 Icon-Größenstufen (10, 11, 12, 14, 16, 18, 22, 24px) sind unnötig feinkörnig. Die Unterschiede zwischen 10/11/12px sind kaum wahrnehmbar und erhöhen die Entscheidungskomplexität für Entwickler.
- **Fix:** Auf semantische Stufen reduzieren:
  ```css
  .icon-sm   { width: 12px; height: 12px; }
  .icon-md   { width: 16px; height: 16px; }
  .icon-lg   { width: 20px; height: 20px; }
  .icon-xl   { width: 24px; height: 24px; }
  ```
  Bestehende Verwendungen von `.icon-xs`, `.icon-11`, `.icon-md` (14px), `.icon-base` auf die nächste semantische Stufe migrieren.
- **Status:** [ ]

---

### N6 — Begrüßungstext bleibt unverändert bei langem Session
- **Datei:** `public/pages/dashboard.js:217`
- **Problem:** `greeting(displayName)` wird einmalig beim Rendern aufgerufen. Morgens geöffnet und nachmittags noch offen → "Guten Morgen" um 15 Uhr.
- **Fix:** Zusammen mit N1 behandeln (beide nutzen dasselbe `visibilitychange`-Pattern).
- **Status:** [ ]

---

## Bekannte Stärken (nicht anfassen)

Diese Aspekte sind gut umgesetzt und sollten nicht verändert werden:

- **Token-System** (`tokens.css`): Private/öffentliche Token-Architektur für Dark Mode ist vorbildlich.
- **Touch-Targets**: `--target-lg: 48px` (Mobile), `--target-base: 44px` (iOS-Minimum) korrekt umgesetzt.
- **Reduced Motion**: Alle Animationen haben `prefers-reduced-motion`-Fallbacks.
- **Reduced Transparency**: Glass-Effekte fallen auf opaque Fallbacks zurück.
- **Prefers Contrast**: High-Contrast-Modus korrekt behandelt.
- **Safe Area Insets**: `env(safe-area-inset-*)` durchgängig eingesetzt.
- **Skip-Link**: Vorhanden und korrekt implementiert.
- **Route Announcer**: Screenreader werden über Seitenwechsel informiert.
- **Focus Trap**: Modal und Search-Overlay sperren Focus korrekt.
- **Page Transitions**: Enter 200ms, Exit 120ms (60% — korrekte Proportion).
- **List Stagger**: Eingangs-Timing korrekt gedämpft (0–173ms, nicht linear).
- **iOS PWA Viewport-Fix**: maximum-scale Workaround für Tastatur-Zoom korrekt.
- **Keyboard Shortcuts**: Vollständig mit Chord-Sequenzen (g d, g t, …).

---

## Überarbeitungsstand

- **Phase 1 abgeschlossen (v0.52.12–v0.52.14):** K1, K3 ✅
- **Phase 2 abgeschlossen (v0.52.15):** H5, M2 ✅
- **Phase 3 abgeschlossen (v0.52.16):** K4, H8 ✅
- **Phase 4 abgeschlossen (v0.52.17):** H1 ✅
- **Phase 5 abgeschlossen (v0.52.18):** H3 ✅
- **Phase 6 abgeschlossen (v0.52.19):** H4 ✅
- **Phase 7 abgeschlossen (v0.52.20):** H7 ✅
- **Phase 8 abgeschlossen:** K2 + H6 ✅
- **Phase 9 abgeschlossen:** M1, M3, M4, M5, M6 ✅
- **Nächste Phase:** Phase 10 — H2, M7, N1–N6

---

## Abarbeitungsreihenfolge (empfohlen)

1. **K1, K3** — Schnell, isoliert, hoher WCAG-Wert ✅
2. **H5, M2** — Einzelne Zeilen, kein Risiko ✅
3. **K4 + H8** — Navigation-Refaktor (zusammen angehen)
4. **H1** — Sidebar-Breakpoint (CSS-only, testbar)
5. **H3** — Dashboard-Hero Mobile (CSS-only)
6. **H4** — FAB + Nav-Hide (JS + CSS)
7. **K2 + H6** — Such-Deep-Links (Server + Client)
8. **H7** — Dashboard-Skeleton (Template-Markup)
9. **M1–M7** — Nach Belieben
10. **H2** — Kitchen-Button-UX (komplex, zuletzt)
11. **N1–N6** — Abschluss-Polish
