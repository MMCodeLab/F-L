/* ==========================================================================
   F&L — PDF delle corse.
   Crea un PDF vero senza librerie esterne, cosi' funziona anche offline:
   pagine A4, tabella con tutte le corse CONFERMATE del periodo e un
   riepilogo per persona.

   Il testo usa i font standard del PDF (Helvetica), quindi niente emoji;
   le lettere accentate italiane vanno bene.
   ========================================================================== */
(function (global) {
  'use strict';

  var FL = global.FL || (global.FL = {});

  // Nome mostrato in fondo a ogni pagina: cambialo qui se cambi nome all'app.
  var NOME_APP = 'F&L';

  var LARG = 595, ALT = 842, MARGINE = 40;
  var NOTTE = [0.05, 0.07, 0.19];
  var GIALLO = [1, 0.79, 0.29];
  var GRIGIO = [0.4, 0.43, 0.52];
  var ZEBRA = [0.95, 0.96, 0.99];
  var BIANCO = [1, 1, 1];

  /* Da testo JavaScript a stringa con un carattere per byte (WinAnsi),
     con le parentesi e la barra protette come vuole il formato PDF. */
  var WIN = { '\u2014': 0x97, '\u2013': 0x96, '\u2019': 0x92, '\u2018': 0x91,
              '\u201C': 0x93, '\u201D': 0x94, '\u20AC': 0x80, '\u2026': 0x85,
              '\u2022': 0x95 };

  function codifica(testo) {
    var t = String(testo);
    var out = '';
    for (var i = 0; i < t.length; i++) {
      var n = t.charCodeAt(i);
      if (WIN[t.charAt(i)]) n = WIN[t.charAt(i)];
      else if (n > 255) n = 63;            // "?" per cio' che il font non ha
      else if (n < 32) n = 32;
      var ch = String.fromCharCode(n);
      if (ch === '\\' || ch === '(' || ch === ')') ch = '\\' + ch;
      out += ch;
    }
    return out;
  }

  /* Accorcia il testo con i puntini se non ci sta nella colonna
     (stima: un carattere medio e' largo circa mezzo corpo). */
  function adatta(testo, larghezza, dim) {
    var max = Math.floor(larghezza / (dim * 0.53));
    var t = String(testo);
    return t.length > max ? t.slice(0, Math.max(1, max - 1)) + '\u2026' : t;
  }

  /* ------------------------------ Date --------------------------------- */

  function giornoBreve(k) {
    var d = FL.cal.daChiave(k);
    return FL.cal.GIORNI_MEDI[d.getDay()] + ' ' + FL.cal.etichettaCorta(k);
  }

  /* "Dal 16 al 22 novembre 2026", "Dal 30 novembre al 6 dicembre 2026" */
  function periodoLeggibile(da, a) {
    var d1 = FL.cal.daChiave(da), d2 = FL.cal.daChiave(a);
    var m1 = FL.cal.MESI[d1.getMonth()].toLowerCase();
    var m2 = FL.cal.MESI[d2.getMonth()].toLowerCase();
    if (d1.getFullYear() !== d2.getFullYear()) {
      return 'Dal ' + d1.getDate() + ' ' + m1 + ' ' + d1.getFullYear() +
             ' al ' + d2.getDate() + ' ' + m2 + ' ' + d2.getFullYear();
    }
    if (d1.getMonth() !== d2.getMonth()) {
      return 'Dal ' + d1.getDate() + ' ' + m1 + ' al ' + d2.getDate() + ' ' + m2 + ' ' + d2.getFullYear();
    }
    return 'Dal ' + d1.getDate() + ' al ' + d2.getDate() + ' ' + m2 + ' ' + d2.getFullYear();
  }

  function dataOggiLeggibile() {
    var d = new Date();
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /* ------------------------------ Il PDF ------------------------------- */

  /* info = { da, a, righe: [ { chiave, persona, tipo, dove, fatto } ] }
     Le righe non confermate non entrano in tabella: vengono solo contate
     in una nota. Ritorna un Blob application/pdf. */
  function creaCorse(info) {
    var tipi = FL.dati.tipi();
    var persone = FL.dati.persone();
    var fatte = info.righe.filter(function (r) { return r.fatto; });
    var nonConfermate = info.righe.length - fatte.length;

    var pagine = [];
    var cont = null;     // contenuto della pagina corrente
    var y = 0;

    function colore(c) { return c.join(' ') + ' rg '; }
    function rettangolo(x, yy, w, h, c) {
      cont.push(colore(c) + x + ' ' + yy + ' ' + w + ' ' + h + ' re f');
    }
    function testo(x, yy, s, dim, grassetto, c) {
      cont.push(colore(c) + 'BT /F' + (grassetto ? 2 : 1) + ' ' + dim + ' Tf ' +
                x + ' ' + yy + ' Td (' + codifica(s) + ') Tj ET');
    }
    function nuovaPagina() {
      cont = [];
      pagine.push(cont);
      y = ALT - MARGINE;
    }

    // Colonne della tabella
    var COL = [
      { nome: 'Giorno', x: MARGINE + 8, w: 92 },
      { nome: 'Persona', x: MARGINE + 108, w: 100 },
      { nome: 'Cosa', x: MARGINE + 216, w: 140 },
      { nome: 'Dove', x: MARGINE + 364, w: 143 }
    ];
    var LARG_TAB = LARG - 2 * MARGINE;

    function intestazioneTabella() {
      rettangolo(MARGINE, y - 22, LARG_TAB, 22, GIALLO);
      COL.forEach(function (c) { testo(c.x, y - 15, c.nome, 10, true, NOTTE); });
      y -= 22;
    }

    // ---- Prima pagina: fascia del titolo ----
    nuovaPagina();
    rettangolo(0, ALT - 100, LARG, 100, NOTTE);
    testo(MARGINE, ALT - 52, 'Corse completate', 24, true, BIANCO);
    testo(MARGINE, ALT - 76, periodoLeggibile(info.da, info.a), 12, false, GIALLO);
    y = ALT - 100 - 28;

    // ---- Riepilogo per persona ----
    testo(MARGINE, y, 'Riepilogo', 13, true, NOTTE);
    y -= 20;
    persone.forEach(function (p) {
      var pezzi = [];
      var totale = 0;
      tipi.forEach(function (t) {
        var n = fatte.filter(function (r) {
          return r.persona.id === p.id && r.tipo.id === t.id;
        }).length;
        totale += n;
        pezzi.push(t.nome + ': ' + n);
      });
      testo(MARGINE, y, p.nome, 11, true, NOTTE);
      testo(MARGINE + 110, y, pezzi.join('   \u2022   ') + '   \u2022   Totale: ' + totale,
            11, false, NOTTE);
      y -= 17;
    });
    testo(MARGINE, y - 2, 'Totale corse completate: ' + fatte.length, 11, true, NOTTE);
    y -= 20;
    if (nonConfermate) {
      testo(MARGINE, y, nonConfermate === 1
        ? '1 corsa in programma nel periodo non risulta confermata (non \u00E8 in tabella).'
        : nonConfermate + ' corse in programma nel periodo non risultano confermate (non sono in tabella).',
        9, false, GRIGIO);
      y -= 16;
    }
    y -= 14;

    // ---- Tabella ----
    intestazioneTabella();
    fatte.forEach(function (r, i) {
      if (y - 20 < MARGINE + 30) {
        nuovaPagina();
        intestazioneTabella();
      }
      if (i % 2 === 1) rettangolo(MARGINE, y - 20, LARG_TAB, 20, ZEBRA);
      testo(COL[0].x, y - 14, adatta(giornoBreve(r.chiave), COL[0].w, 10), 10, false, NOTTE);
      testo(COL[1].x, y - 14, adatta(r.persona.nome, COL[1].w, 10), 10, true, NOTTE);
      testo(COL[2].x, y - 14, adatta(r.tipo.nome, COL[2].w, 10), 10, false, NOTTE);
      testo(COL[3].x, y - 14, adatta(r.dove, COL[3].w, 10), 10, false, NOTTE);
      y -= 20;
    });

    // ---- Piede di pagina, ora che si sa quante sono ----
    pagine.forEach(function (contenuto, i) {
      cont = contenuto;
      testo(MARGINE, 24, NOME_APP + ' \u2022 creato il ' + dataOggiLeggibile(), 8, false, GRIGIO);
      var etichetta = 'Pagina ' + (i + 1) + ' di ' + pagine.length;
      testo(LARG - MARGINE - etichetta.length * 4.2, 24, etichetta, 8, false, GRIGIO);
    });

    return assembla(pagine);
  }

  /* Mette insieme gli oggetti del PDF e la tabella dei riferimenti.
     Ogni carattere vale un byte, quindi lunghezze e posizioni si
     calcolano direttamente sulla lunghezza delle stringhe. */
  function assembla(pagine) {
    var oggetti = [];            // oggetti[n] = corpo dell'oggetto n (1, 2, ...)
    var kids = [];

    oggetti[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    oggetti[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    oggetti[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    pagine.forEach(function (contenuto, i) {
      var nPagina = 5 + i * 2;
      var nFlusso = nPagina + 1;
      var flusso = contenuto.join('\n');
      kids.push(nPagina + ' 0 R');
      oggetti[nPagina] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + LARG + ' ' + ALT + '] ' +
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + nFlusso + ' 0 R >>';
      oggetti[nFlusso] = '<< /Length ' + flusso.length + ' >>\nstream\n' + flusso + '\nendstream';
    });
    oggetti[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pagine.length + ' >>';

    var out = '%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n';
    var posizioni = [];
    for (var n = 1; n < oggetti.length; n++) {
      posizioni[n] = out.length;
      out += n + ' 0 obj\n' + oggetti[n] + '\nendobj\n';
    }
    var inizioXref = out.length;
    out += 'xref\n0 ' + oggetti.length + '\n0000000000 65535 f \n';
    for (var m = 1; m < oggetti.length; m++) {
      out += ('0000000000' + posizioni[m]).slice(-10) + ' 00000 n \n';
    }
    out += 'trailer\n<< /Size ' + oggetti.length + ' /Root 1 0 R >>\nstartxref\n' +
           inizioXref + '\n%%EOF';

    var byte = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) byte[i] = out.charCodeAt(i) & 255;
    return new Blob([byte], { type: 'application/pdf' });
  }

  FL.pdf = {
    creaCorse: creaCorse,
    periodoLeggibile: periodoLeggibile
  };
})(window);