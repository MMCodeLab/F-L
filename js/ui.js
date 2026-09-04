/* ==========================================================================
   F&L — Interfaccia: disegna le pagine e gestisce i tocchi.
   Qui dentro non si fanno conti sulle date (ci pensa calendario.js) e non
   si tocca localStorage (ci pensa storage.js): si legge, si disegna, si
   ascoltano i tap.

   Il vocabolario dell'app e' volutamente neutro: si parla di "corse",
   "andata" e "ritiro", non di chi le fa o di chi le paga, cosi' le stesse
   schermate vanno bene sia a chi accompagna sia a chi salda il conto.
   ========================================================================== */
(function (global) {
  'use strict';

  var FL = global.FL || (global.FL = {});
  var doc = global.document;

  /* ------------------------- Scorciatoie sul DOM ----------------------- */
  function $(sel) { return doc.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); }

  /* Mette in salvo il testo prima di infilarlo in innerHTML:
     i nomi delle persone li scrive l'utente. */
  function esc(testo) {
    return String(testo)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function iniziale(nome) {
    return (nome || '?').trim().charAt(0).toUpperCase();
  }

  /* Elenco leggibile: "Luca", "Luca e Francesco" */
  function elenco(nomi) {
    if (nomi.length <= 1) return nomi[0] || '';
    return nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1];
  }

  /* Concordanza singolare/plurale: 1 corsa, 3 corse. */
  function plur(n, uno, molti) {
    return n + ' ' + (n === 1 ? uno : molti);
  }

  /* Le due frecce che distinguono l'andata dal ritiro. */
  function iconaTipo(idTipo) {
    var d = idTipo === 'ritiro' ? 'M19 12H6M11 6l-6 6 6 6' : 'M5 12h13M13 6l6 6-6 6';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d +
           '" fill="none" stroke="currentColor" stroke-width="2.1" ' +
           'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* --------------------------- Stato della UI -------------------------- */
  var oggiDate = new Date();
  var stato = {
    anno: oggiDate.getFullYear(),
    mese: oggiDate.getMonth(),
    pagina: 'home',
    multi: false,                        // selezione multipla attiva?
    selezione: {},                       // { "2026-09-07": true, ... }
    personeMulti: ['p1', 'p2'],
    tipiMulti: ['andata', 'ritiro'],
    chiaveAperta: null,                  // giorno con la scheda aperta
    timerToast: null
  };

  function chiaviSelezionate() { return Object.keys(stato.selezione); }

  /* =====================================================================
     NAVIGAZIONE
     ===================================================================== */
  function vaiA(pagina, senzaMoto) {
    stato.pagina = pagina;
    $$('.pagina').forEach(function (sez) {
      sez.classList.toggle('attiva', sez.id === 'pagina-' + pagina);
    });
    $$('.voce-nav').forEach(function (voce) {
      var attiva = voce.dataset.pagina === pagina;
      voce.classList.toggle('attiva', attiva);
      voce.setAttribute('aria-selected', attiva ? 'true' : 'false');
    });
    posizionaIndicatore(senzaMoto);
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* Porta l'indicatore della navbar sotto la voce attiva.
     Si lavora in pixel e non in percentuale: così la pastiglia resta
     allineata anche se le voci hanno larghezze diverse o se cambia la
     larghezza dello schermo. Con "senzaMoto" si salta l'animazione, che
     all'avvio la farebbe partire da sinistra. */
  function posizionaIndicatore(senzaMoto) {
    var attiva = $('.voce-nav.attiva');
    var indicatore = $('#indicatore-nav');
    if (!attiva || !indicatore) return;

    if (senzaMoto) indicatore.style.transition = 'none';
    indicatore.style.width = attiva.offsetWidth + 'px';
    indicatore.style.height = attiva.offsetHeight + 'px';
    indicatore.style.transform = 'translateX(' + attiva.offsetLeft + 'px)';
    if (senzaMoto) {
      void indicatore.offsetWidth;      // forza il ricalcolo prima di riaccendere l'animazione
      indicatore.style.transition = '';
    }
  }

  function cambiaMese(delta) {
    // new Date(anno, mese + delta, 1) gestisce da solo il cambio d'anno.
    var d = new Date(stato.anno, stato.mese + delta, 1);
    stato.anno = d.getFullYear();
    stato.mese = d.getMonth();
    stato.selezione = {};     // la selezione vale solo per il mese mostrato
    renderTutto();
  }

  function vaiAOggi() {
    var d = new Date();
    stato.anno = d.getFullYear();
    stato.mese = d.getMonth();
    stato.selezione = {};
    renderTutto();
    vaiA('home');
  }

  /* =====================================================================
     CALENDARIO
     ===================================================================== */
  function renderCalendario() {
    var imp = FL.dati.impostazioni();
    var etichetta = FL.cal.etichettaMese(stato.anno, stato.mese);
    $('#mese-etichetta').textContent = etichetta;
    $('#mese-etichetta-2').textContent = etichetta;

    // Iniziali dei giorni della settimana
    $('#intestazione-settimana').innerHTML = FL.cal
      .intestazioneSettimana(imp.inizioSettimana)
      .map(function (g) { return '<span>' + g + '</span>'; })
      .join('');

    // Celle del mese
    var celle = FL.cal.griglia(stato.anno, stato.mese, imp.inizioSettimana);
    $('#griglia').innerHTML = celle.map(cellaHTML).join('');

    renderPannelloMulti();
    renderNotaMese();
  }

  function cellaHTML(cella) {
    if (cella.fuoriMese) {
      return '<div class="giorno fuori-mese"><span class="numero">' +
             cella.numero + '</span></div>';
    }

    var s = FL.cal.statoGiorno(cella.chiave);
    var classi = ['giorno', 'tap', 'stato-' + s.stato];
    if (s.oggi) classi.push('oggi');
    if (stato.selezione[cella.chiave]) classi.push('selezionato');

    // Un pallino per persona: se di quella persona e' stata completata solo
    // una delle due corse, il pallino resta meta' verde e meta' no.
    var pallini = s.conPiano.map(function (p) {
      return '<i class="pallino ' + p.stato + '"></i>';
    }).join('');

    return '<button type="button" class="' + classi.join(' ') + '" ' +
           'data-chiave="' + cella.chiave + '" aria-label="' + esc(etichettaAria(s)) + '">' +
           '<span class="numero">' + cella.numero + '</span>' +
           '<span class="pallini">' + pallini + '</span>' +
           '</button>';
  }

  function etichettaAria(s) {
    var base = FL.cal.etichettaLunga(s.chiave);
    if (s.stato === 'vuoto') return base + ', nessuna corsa';
    var testi = {
      completo: 'tutte completate',
      mancato: 'nessuna confermata',
      parziale: 'completate solo in parte',
      attesa: 'da fare'
    };
    return base + ', ' + plur(s.pianificate, 'corsa', 'corse') + ', ' + testi[s.stato];
  }

  /* Riga sotto la barra degli strumenti: il mese in due parole. */
  function renderNotaMese() {
    var st = FL.cal.statistiche(stato.anno, stato.mese);
    var pezzi = [];
    if (st.corseFatte) pezzi.push(plur(st.corseFatte, 'fatta', 'fatte'));
    if (st.corseMancate) pezzi.push(plur(st.corseMancate, 'mancata', 'mancate'));
    if (st.corseAttesa) pezzi.push(st.corseAttesa + ' da fare');
    $('#riepilogo-mese-mini').textContent = pezzi.length ? pezzi.join(' · ') : 'Mese libero';
  }

  /* =====================================================================
     SELEZIONE MULTIPLA
     ===================================================================== */
  function attivaMulti(attiva) {
    stato.multi = attiva;
    if (!attiva) stato.selezione = {};
    $('#btn-multi').setAttribute('aria-pressed', attiva ? 'true' : 'false');
    $('#pannello-multi').hidden = !attiva;
    renderCalendario();
  }

  function renderPannelloMulti() {
    if (!stato.multi) return;
    var imp = FL.dati.impostazioni();

    // Chip dei giorni della settimana: "tutti i lunedi'", "tutti i mercoledi'"...
    var chip = [];
    for (var i = 0; i < 7; i++) {
      var giornoSettimana = (imp.inizioSettimana + i) % 7;
      var chiavi = FL.cal.giorniDelMesePerSettimana(stato.anno, stato.mese, giornoSettimana);
      var tutti = chiavi.length > 0 && chiavi.every(function (k) { return stato.selezione[k]; });
      chip.push('<button type="button" class="chip tap' + (tutti ? ' attivo' : '') +
                '" data-settimana="' + giornoSettimana + '">' +
                FL.cal.GIORNI_MEDI[giornoSettimana] + '</button>');
    }
    $('#chip-settimana').innerHTML = chip.join('');

    // Chip delle persone
    $('#chip-persone-multi').innerHTML = FL.dati.persone().map(function (p) {
      var attiva = stato.personeMulti.indexOf(p.id) >= 0;
      return '<button type="button" class="chip tap' + (attiva ? ' attivo' : '') +
             '" data-persona-multi="' + p.id + '">' + esc(p.nome) + '</button>';
    }).join('');

    // Chip dei tipi di corsa
    $('#chip-tipi-multi').innerHTML = FL.dati.tipi().map(function (t) {
      var attiva = stato.tipiMulti.indexOf(t.id) >= 0;
      return '<button type="button" class="chip tap' + (attiva ? ' attivo' : '') +
             '" data-tipo-multi="' + t.id + '">' + iconaTipo(t.id) + t.nome + '</button>';
    }).join('');

    var n = chiaviSelezionate().length;
    var pronto = n > 0 && stato.personeMulti.length > 0 && stato.tipiMulti.length > 0;
    $('#multi-conteggio').textContent = n ? '(' + n + ')' : '';
    $('#multi-pianifica').disabled = !pronto;
    $('#multi-rimuovi').disabled = !pronto;
  }

  function toggleSettimana(giornoSettimana) {
    var chiavi = FL.cal.giorniDelMesePerSettimana(stato.anno, stato.mese, giornoSettimana);
    var tutti = chiavi.every(function (k) { return stato.selezione[k]; });
    chiavi.forEach(function (k) {
      if (tutti) delete stato.selezione[k];
      else stato.selezione[k] = true;
    });
    renderCalendario();
  }

  /* Aggiunge o toglie un id da una lista, senza mai svuotarla del tutto:
     serve per i chip delle persone e dei tipi di corsa. */
  function commutaLista(lista, id) {
    var pos = lista.indexOf(id);
    if (pos >= 0) lista.splice(pos, 1);
    else lista.push(id);
  }

  function applicaMulti(attiva) {
    var chiavi = chiaviSelezionate();
    if (!chiavi.length || !stato.personeMulti.length || !stato.tipiMulti.length) return;

    FL.dati.pianificaMolti(chiavi, stato.personeMulti, stato.tipiMulti, attiva);

    var nomi = stato.personeMulti.map(function (id) { return FL.dati.persona(id).nome; });
    var corse = stato.tipiMulti.map(function (id) { return FL.dati.tipo(id).nome.toLowerCase(); });
    toast((attiva ? 'Pianificati ' : 'Rimossi ') +
          plur(chiavi.length, 'giorno', 'giorni') + ' · ' +
          elenco(nomi) + ' · ' + elenco(corse));

    stato.selezione = {};
    renderTutto();
  }

  /* =====================================================================
     RIQUADRO DI OGGI
     ===================================================================== */
  function renderCardOggi() {
    var chiave = FL.cal.chiaveOggi();
    var s = FL.cal.statoGiorno(chiave);
    var html = '<div class="oggi-testa">' +
               '<span class="oggi-eyebrow">Oggi</span>' +
               '<span class="oggi-data">' + esc(FL.cal.etichettaLunga(chiave)) + '</span>' +
               '</div>';

    if (!s.pianificate) {
      html += '<p class="oggi-vuoto">Nessuna corsa in programma oggi.</p>' +
              '<button type="button" class="bottone largo tap" data-apri="' + chiave + '">' +
              'Pianifica oggi</button>';
    } else {
      var mancanti = s.corse.filter(function (c) { return !c.fatto; }).length;
      html += '<h3 class="oggi-titolo">' + (mancanti
        ? plur(mancanti, 'corsa da fare', 'corse da fare')
        : 'Tutto completato') + '</h3>';

      // Una riga per ogni corsa prevista: persona + tipo + tasto di conferma
      html += s.corse.map(function (c) {
        return '<div class="riga-conferma' + (c.fatto ? ' fatta' : '') + '">' +
               '<span class="avatar" style="--c:' + c.persona.colore + '">' +
               esc(iniziale(c.persona.nome)) + '</span>' +
               '<span class="nome">' + esc(c.persona.nome) +
               '<span class="tipo-etichetta">' + iconaTipo(c.tipo.id) + c.tipo.nome + '</span></span>' +
               '<button type="button" class="btn-conferma tap' + (c.fatto ? ' fatto' : '') +
               '" data-conferma="' + c.persona.id + '" data-tipo="' + c.tipo.id +
               '" data-chiave="' + chiave + '">' +
               (c.fatto ? '✓ Fatta' : 'Conferma') + '</button>' +
               '</div>';
      }).join('');
    }
    $('#card-oggi').innerHTML = html;
  }

  /* =====================================================================
     SCHEDA DEL GIORNO (pannello in vetro che sale dal basso)
     ===================================================================== */
  function apriScheda(chiave) {
    stato.chiaveAperta = chiave;
    renderScheda();
    $('#velo').hidden = false;
    $('#scheda').hidden = false;
    doc.body.style.overflow = 'hidden';
  }

  function chiudiScheda() {
    stato.chiaveAperta = null;
    $('#velo').hidden = true;
    $('#scheda').hidden = true;
    doc.body.style.overflow = '';
  }

  /* Riassunto di una persona in un giorno: "Andata e ritiro", "Solo andata"... */
  function riassuntoPersona(p) {
    var previste = FL.dati.tipi().filter(function (t) { return p.corse[t.id].pianificato; });
    if (!previste.length) return 'Nessuna corsa in questo giorno';
    if (previste.length === FL.dati.tipi().length) return 'Andata e ritiro';
    return 'Solo ' + previste[0].nome.toLowerCase();
  }

  function renderScheda() {
    var chiave = stato.chiaveAperta;
    if (!chiave) return;
    var s = FL.cal.statoGiorno(chiave);

    var occhiello = s.oggi ? 'Oggi' : (s.passato ? 'Giorno passato' : 'In programma');
    var classeOcchiello = s.oggi ? 'oggi' : (s.passato ? 'passato' : '');

    var html =
      '<div class="maniglia"></div>' +
      '<header class="scheda-testa">' +
        '<div>' +
          '<p class="scheda-eyebrow ' + classeOcchiello + '">' + occhiello + '</p>' +
          '<h2 id="scheda-titolo">' + esc(FL.cal.etichettaLunga(chiave)) + '</h2>' +
        '</div>' +
        '<button type="button" class="tondo tap" data-azione="chiudi" aria-label="Chiudi">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</header>';

    // Scorciatoie che valgono per tutte le persone insieme
    html += '<p class="etichetta-piccola">Scorciatoie</p><div class="chip-riga">' +
      '<button type="button" class="chip tap" data-azione="tutto">Andata e ritiro</button>' +
      '<button type="button" class="chip tap" data-azione="solo" data-tipo="andata">Solo andata</button>' +
      '<button type="button" class="chip tap" data-azione="solo" data-tipo="ritiro">Solo ritiro</button>' +
      '<button type="button" class="chip tap" data-azione="niente">Niente</button>' +
      '</div><div class="spazio"></div>';

    // Un blocco per persona, con dentro una riga per l'andata e una per il ritiro
    html += s.persone.map(function (p) {
      var classe = 'persona-blocco';
      if (p.stato === 'fatto') classe += ' completata';
      else if (p.stato === 'mancato') classe += ' mancata';
      else if (p.pianificate) classe += ' pianificata';

      var blocco =
        '<div class="' + classe + '">' +
          '<div class="persona-riga">' +
            '<span class="avatar" style="--c:' + p.colore + '">' + esc(iniziale(p.nome)) + '</span>' +
            '<span class="persona-info"><strong>' + esc(p.nome) + '</strong>' +
            '<span class="stato-testo">' + riassuntoPersona(p) + '</span></span>' +
          '</div>';

      blocco += FL.dati.tipi().map(function (t) {
        var c = p.corse[t.id];
        var classeRiga = 'corsa-riga';
        if (c.stato === 'fatto') classeRiga += ' completata';
        else if (c.stato === 'mancato') classeRiga += ' mancata';
        else if (c.pianificato) classeRiga += ' prevista';

        var testo = !c.pianificato ? 'Non prevista'
          : c.fatto ? 'Completata'
          : (s.passato ? 'Mai confermata' : 'Da fare');

        return '<div class="' + classeRiga + '">' +
          '<span class="corsa-icona">' + iconaTipo(t.id) + '</span>' +
          '<span class="corsa-info"><strong>' + t.nome + '</strong>' +
          '<span class="corsa-stato">' + testo + '</span></span>' +
          (c.pianificato
            ? '<button type="button" class="mini-check tap' + (c.fatto ? ' si' : '') +
              '" data-azione="fatto" data-persona="' + p.id + '" data-tipo="' + t.id + '" ' +
              'aria-pressed="' + (c.fatto ? 'true' : 'false') + '" ' +
              'aria-label="Segna come completata: ' + esc(p.nome) + ' ' + t.nome + '">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '</button>'
            : '') +
          '<button type="button" class="switch tap" data-azione="pianifica" ' +
          'data-persona="' + p.id + '" data-tipo="' + t.id + '" ' +
          'aria-pressed="' + (c.pianificato ? 'true' : 'false') + '" ' +
          'aria-label="In programma: ' + esc(p.nome) + ' ' + t.nome + '"></button>' +
          '</div>';
      }).join('');

      return blocco + '</div>';
    }).join('');

    html += '<footer class="scheda-piede">' +
              '<button type="button" class="bottone fantasma tap" data-azione="svuota">Svuota il giorno</button>' +
              '<button type="button" class="bottone primario tap" data-azione="chiudi">Fatto</button>' +
            '</footer>';

    $('#scheda').innerHTML = html;
  }

  /* Gestisce i tap dentro la scheda. */
  function azioneScheda(azione, idPersona, idTipo) {
    var chiave = stato.chiaveAperta;
    if (!chiave) return;

    if (azione === 'chiudi') { chiudiScheda(); return; }

    if (azione === 'pianifica') {
      var c = FL.dati.corsa(chiave, idPersona, idTipo);
      FL.dati.pianifica(chiave, idPersona, idTipo, !c.pianificato);

    } else if (azione === 'fatto') {
      var cf = FL.dati.corsa(chiave, idPersona, idTipo);
      FL.dati.conferma(chiave, idPersona, idTipo, !cf.fatto);
      if (!cf.fatto) FL.notifiche.controllaPagamento();

    } else if (azione === 'tutto') {
      FL.dati.persone().forEach(function (p) {
        FL.dati.tipi().forEach(function (t) { FL.dati.pianifica(chiave, p.id, t.id, true); });
      });

    } else if (azione === 'solo') {
      // Solo il tipo scelto, per tutte le persone: l'altro viene tolto.
      FL.dati.persone().forEach(function (p) {
        FL.dati.tipi().forEach(function (t) {
          FL.dati.pianifica(chiave, p.id, t.id, t.id === idTipo);
        });
      });

    } else if (azione === 'niente' || azione === 'svuota') {
      FL.dati.svuotaGiorno(chiave);
      if (azione === 'svuota') { renderTutto(); chiudiScheda(); toast('Giorno svuotato'); return; }
    }

    renderScheda();
    renderTutto();
  }

  /* =====================================================================
     RIEPILOGO
     ===================================================================== */
  function renderRiepilogo() {
    var st = FL.cal.statistiche(stato.anno, stato.mese);

    // Anello della costanza
    var raggio = 52;
    var giro = 2 * Math.PI * raggio;
    var pieno = giro * (st.costanza / 100);
    $('#anello-costanza').innerHTML =
      '<svg class="anello" viewBox="0 0 120 120" role="img" aria-label="Costanza ' + st.costanza + ' per cento">' +
        '<defs><linearGradient id="grad-anello" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#22d3ee"/>' +
        '</linearGradient></defs>' +
        '<circle cx="60" cy="60" r="' + raggio + '" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="12"/>' +
        '<circle cx="60" cy="60" r="' + raggio + '" fill="none" stroke="url(#grad-anello)" stroke-width="12" ' +
          'stroke-linecap="round" stroke-dasharray="' + pieno.toFixed(1) + ' ' + giro.toFixed(1) + '" ' +
          'transform="rotate(-90 60 60)"/>' +
        '<text x="60" y="60" text-anchor="middle" dominant-baseline="central" ' +
          'fill="#eef1ff" font-size="26" font-weight="700" font-family="inherit">' + st.costanza + '%</text>' +
      '</svg>' +
      '<div class="anello-testo"><strong>Costanza del mese</strong>' +
      '<span>' + (st.scadute
        ? st.corseFatte + ' su ' + plur(st.scadute, 'corsa già scaduta', 'corse già scadute')
        : 'Ancora nessuna corsa scaduta in questo mese') + '</span></div>';

    // Riquadri con i numeri
    $('#statistiche').innerHTML = [
      riquadro('verde', st.corseFatte, 'Corse completate'),
      riquadro('rosso', st.corseMancate, 'Corse mancate'),
      riquadro('grigia', st.corseAttesa, 'Ancora da fare'),
      riquadro('', st.giorniPianificati, 'Giorni con corse')
    ].join('');

    // Dettaglio per persona
    $('#stat-persone').innerHTML = FL.dati.persone().map(function (p) {
      var r = st.perPersona[p.id];
      var scadute = r.fatte + r.mancate;
      var perc = scadute ? Math.round((r.fatte / scadute) * 100) : 0;
      return '<div class="persona-stat">' +
        '<span class="avatar" style="--c:' + p.colore + '">' + esc(iniziale(p.nome)) + '</span>' +
        '<div class="dettagli"><strong>' + esc(p.nome) + '</strong>' +
        '<p>' + plur(r.fatte, 'fatta', 'fatte') + ' · ' +
        plur(r.mancate, 'mancata', 'mancate') + ' · ' + r.attesa + ' da fare</p>' +
        '<div class="barra"><i style="width:' + perc + '%; background:' + p.colore + '"></i></div>' +
        '</div></div>';
    }).join('');

    // Dettaglio andata / ritiro
    $('#stat-tipi').innerHTML = FL.dati.tipi().map(function (t) {
      var r = st.perTipo[t.id];
      return '<div class="tipo-stat">' +
        '<span class="tipo-icona">' + iconaTipo(t.id) + '</span>' +
        '<div class="dettagli"><strong>' + t.nome + '</strong>' +
        '<p>' + r.fatte + ' su ' + plur(r.pianificate, 'corsa in programma', 'corse in programma') + '</p>' +
        '</div></div>';
    }).join('');

    renderPagamenti();
  }

  function riquadro(classe, valore, etichetta) {
    return '<div class="stat ' + classe + '"><b>' + valore + '</b><span>' + etichetta + '</span></div>';
  }

  function renderPagamenti() {
    var sospese = FL.dati.corseInSospeso();
    var soglia = FL.dati.soglia();
    var pronta = sospese >= soglia;
    var mancanti = Math.max(0, soglia - sospese);
    var perc = Math.min(100, Math.round((sospese / soglia) * 100));
    var ultimo = FL.dati.ultimoPagamento();

    var html =
      '<div class="pagamenti-testa' + (pronta ? ' pronta' : '') + '">' +
        '<div class="pagamenti-numero">' + sospese + '</div>' +
        '<div><h3 class="titolo-sezione" style="margin-bottom:2px">Corse da saldare</h3>' +
        '<p class="mini-nota">' + (pronta
          ? 'Traguardo raggiunto: c\'è un pagamento da effettuare.'
          : 'Ancora ' + plur(mancanti, 'corsa', 'corse') + ' e scatta il promemoria.') +
        '</p></div>' +
      '</div>' +
      '<div class="barra-soglia"><i style="width:' + perc + '%"></i></div>' +
      '<button type="button" class="bottone ' + (pronta ? 'primario' : 'fantasma') +
        ' largo tap" id="btn-pagato"' + (sospese ? '' : ' disabled') + '>' +
        'Segna il pagamento come effettuato</button>';

    if (ultimo) {
      html += '<p class="nota">Ultimo pagamento: ' + esc(FL.cal.etichettaCorta(ultimo.data)) +
              ' · ' + plur(ultimo.corse, 'corsa', 'corse') + '</p>';
    } else {
      html += '<p class="nota">Il promemoria scatta ogni ' +
              plur(soglia, 'corsa completata', 'corse completate') +
              '. Si cambia dalle Impostazioni.</p>';
    }
    $('#card-pagamenti').innerHTML = html;
  }

  /* =====================================================================
     IMPOSTAZIONI
     ===================================================================== */
  function renderImpostazioni() {
    var persone = FL.dati.persone();
    var imp = FL.dati.impostazioni();

    // Non si riscrive un campo mentre l'utente ci sta digitando dentro.
    if (doc.activeElement !== $('#nome-p1')) $('#nome-p1').value = persone[0].nome;
    if (doc.activeElement !== $('#nome-p2')) $('#nome-p2').value = persone[1].nome;
    if (doc.activeElement !== $('#soglia-pagamento')) $('#soglia-pagamento').value = FL.dati.soglia();
    $('#inizio-settimana').value = String(imp.inizioSettimana);

    $('#sottotitolo').textContent = persone[0].nome + ' & ' + persone[1].nome;

    // Stato delle notifiche.
    // Il tasto resta sempre a schermo, tranne quando il browser non sa
    // proprio cosa siano le notifiche: cambia solo la scritta. Nasconderlo
    // quando il permesso era gia' stato negato lasciava la sezione senza
    // nessun comando e non si capiva piu' come rimediare.
    var permesso = FL.notifiche.permesso();
    var btn = $('#btn-notifiche');
    var nota = $('#stato-notifiche');
    var pastiglia = $('#pastiglia-notifiche');

    var stati = {
      granted: {
        pastiglia: 'Attive', classe: 'ok',
        bottone: 'Invia una notifica di prova',
        primario: false,
        nota: 'Il promemoria arriva ogni ' +
              plur(FL.dati.soglia(), 'corsa completata', 'corse completate') + '.'
      },
      denied: {
        pastiglia: 'Bloccate', classe: 'ko',
        bottone: 'Attiva le notifiche',
        primario: true,
        nota: 'Il browser le ha bloccate. Tocca il lucchetto accanto all\'indirizzo del sito e consenti le notifiche, poi riprova da qui. Intanto il promemoria compare comunque dentro l\'app.'
      },
      'default': {
        pastiglia: 'Da attivare', classe: '',
        bottone: 'Attiva le notifiche',
        primario: true,
        nota: 'Su iPhone le notifiche funzionano solo con l\'app installata sulla schermata Home.'
      },
      unsupported: {
        pastiglia: 'Non disponibili', classe: 'ko',
        bottone: '',
        primario: false,
        nota: 'Questo browser non supporta le notifiche: il promemoria compare comunque dentro l\'app.'
      }
    };

    var s = stati[permesso] || stati['default'];
    pastiglia.textContent = s.pastiglia;
    pastiglia.className = 'pastiglia ' + s.classe;
    btn.hidden = (permesso === 'unsupported');
    btn.textContent = s.bottone;
    btn.classList.toggle('primario', s.primario);
    btn.classList.toggle('fantasma', !s.primario);
    nota.textContent = s.nota;
  }

  /* =====================================================================
     MODALE DEL PAGAMENTO E TOAST
     ===================================================================== */
  function mostraModalePagamento(sospese) {
    $('#modale-testo').textContent =
      'Ci sono ' + plur(sospese, 'corsa completata', 'corse completate') +
      ' e non ancora saldate.';
    $('#modale-pagamento').hidden = false;
  }

  function chiudiModale() { $('#modale-pagamento').hidden = true; }

  function toast(messaggio) {
    var el = $('#toast');
    el.textContent = messaggio;
    el.hidden = false;
    global.clearTimeout(stato.timerToast);
    stato.timerToast = global.setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* =====================================================================
     DISEGNA TUTTO
     ===================================================================== */
  function renderTutto() {
    renderCalendario();
    renderCardOggi();
    renderRiepilogo();
    renderImpostazioni();
  }

  /* =====================================================================
     EVENTI
     ===================================================================== */
  function collegaEventi() {
    // Navbar
    $$('.voce-nav').forEach(function (voce) {
      voce.addEventListener('click', function () { vaiA(voce.dataset.pagina); });
    });

    // Mese e "Oggi"
    $('#mese-prec').addEventListener('click', function () { cambiaMese(-1); });
    $('#mese-succ').addEventListener('click', function () { cambiaMese(1); });
    $('#mese-prec-2').addEventListener('click', function () { cambiaMese(-1); });
    $('#mese-succ-2').addEventListener('click', function () { cambiaMese(1); });
    $('#btn-oggi').addEventListener('click', vaiAOggi);

    // Selezione multipla
    $('#btn-multi').addEventListener('click', function () { attivaMulti(!stato.multi); });
    $('#multi-annulla').addEventListener('click', function () { attivaMulti(false); });
    $('#multi-pianifica').addEventListener('click', function () { applicaMulti(true); });
    $('#multi-rimuovi').addEventListener('click', function () { applicaMulti(false); });

    $('#chip-settimana').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-settimana]');
      if (b) toggleSettimana(+b.dataset.settimana);
    });
    $('#chip-persone-multi').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-persona-multi]');
      if (!b) return;
      commutaLista(stato.personeMulti, b.dataset.personaMulti);
      renderPannelloMulti();
    });
    $('#chip-tipi-multi').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tipo-multi]');
      if (!b) return;
      commutaLista(stato.tipiMulti, b.dataset.tipoMulti);
      renderPannelloMulti();
    });

    // Tocco su un giorno del calendario
    $('#griglia').addEventListener('click', function (ev) {
      var cella = ev.target.closest('[data-chiave]');
      if (!cella) return;
      var chiave = cella.dataset.chiave;
      if (stato.multi) {
        if (stato.selezione[chiave]) delete stato.selezione[chiave];
        else stato.selezione[chiave] = true;
        renderCalendario();
      } else {
        apriScheda(chiave);
      }
    });

    // Riquadro di oggi: conferma al volo o apertura della scheda
    $('#card-oggi').addEventListener('click', function (ev) {
      var apri = ev.target.closest('[data-apri]');
      if (apri) { apriScheda(apri.dataset.apri); return; }
      var btn = ev.target.closest('[data-conferma]');
      if (!btn) return;
      var chiave = btn.dataset.chiave;
      var idPersona = btn.dataset.conferma;
      var idTipo = btn.dataset.tipo;
      var c = FL.dati.corsa(chiave, idPersona, idTipo);
      FL.dati.conferma(chiave, idPersona, idTipo, !c.fatto);
      if (!c.fatto) {
        toast(FL.dati.persona(idPersona).nome + ' · ' + FL.dati.tipo(idTipo).nome + ' completata');
        FL.notifiche.controllaPagamento();
      }
      renderTutto();
    });

    // Scheda del giorno
    $('#scheda').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-azione]');
      if (b) azioneScheda(b.dataset.azione, b.dataset.persona, b.dataset.tipo);
    });
    $('#velo').addEventListener('click', chiudiScheda);
    doc.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!$('#modale-pagamento').hidden) chiudiModale();
      else if (!$('#scheda').hidden) chiudiScheda();
    });

    // Pagamenti
    $('#card-pagamenti').addEventListener('click', function (ev) {
      if (!ev.target.closest('#btn-pagato')) return;
      registraPagamento();
    });
    $('#modale-pagato').addEventListener('click', function () {
      chiudiModale();
      registraPagamento();
    });
    $('#modale-dopo').addEventListener('click', chiudiModale);

    // Impostazioni: nomi
    ['p1', 'p2'].forEach(function (id) {
      var campo = $('#nome-' + id);
      campo.addEventListener('input', function () {
        FL.dati.rinomina(id, campo.value);
        $('#sottotitolo').textContent =
          FL.dati.persona('p1').nome + ' & ' + FL.dati.persona('p2').nome;
      });
      campo.addEventListener('blur', renderTutto);
    });

    // Impostazioni: soglia del pagamento
    $('#soglia-pagamento').addEventListener('change', function () {
      FL.dati.impostaSoglia(this.value);
      this.value = FL.dati.soglia();
      renderTutto();
    });

    // Impostazioni: primo giorno della settimana
    $('#inizio-settimana').addEventListener('change', function () {
      FL.dati.impostaInizioSettimana(this.value);
      renderCalendario();
    });

    // Impostazioni: notifiche
    $('#btn-notifiche').addEventListener('click', function () {
      // Se sono gia' attive il tasto serve a provarle.
      if (FL.notifiche.permesso() === 'granted') {
        FL.notifiche.mostra('F&L', 'Notifica di prova: i promemoria arrivano così.');
        toast('Notifica di prova inviata');
        return;
      }
      FL.notifiche.chiedi().then(function (esito) {
        renderImpostazioni();
        if (esito === 'granted') {
          FL.notifiche.mostra('F&L', 'Da ora i promemoria dei pagamenti arrivano qui.');
          toast('Notifiche attive');
        } else {
          // Con il permesso gia' negato il browser risponde subito di no,
          // senza nemmeno mostrare la richiesta: va spiegato come sbloccarle.
          toast('Le notifiche sono bloccate dalle impostazioni del browser');
        }
      });
    });

    // Impostazioni: export / import / azzera
    $('#btn-esporta').addEventListener('click', esportaFile);
    $('#btn-importa').addEventListener('click', function () { $('#file-importa').click(); });
    $('#file-importa').addEventListener('change', importaFile);
    $('#btn-azzera').addEventListener('click', function () {
      if (!global.confirm('Vuoi davvero cancellare tutti i dati di F&L? L\'operazione non si può annullare.')) return;
      FL.dati.azzera();
      stato.selezione = {};
      renderTutto();
      toast('Dati azzerati');
    });
  }

  function registraPagamento() {
    var saldate = FL.dati.registraPagamento();
    if (saldate) toast('Registrato il pagamento di ' + plur(saldate, 'corsa', 'corse'));
    renderTutto();
  }

  /* --------------------------- Export / import ------------------------- */
  function esportaFile() {
    var blob = new Blob([FL.dati.esporta()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = doc.createElement('a');
    a.href = url;
    a.download = 'fl-dati-' + FL.cal.chiaveOggi() + '.json';
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    global.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Backup esportato');
  }

  function importaFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var lettore = new FileReader();
    lettore.onload = function () {
      var esito = FL.dati.importa(String(lettore.result));
      if (esito.ok) {
        renderTutto();
        toast('Importati ' + plur(esito.giorni, 'giorno', 'giorni'));
      } else {
        toast(esito.errore);
      }
    };
    lettore.onerror = function () { toast('Non riesco a leggere il file'); };
    lettore.readAsText(file);
    ev.target.value = '';   // cosi' si puo' riscegliere lo stesso file
  }

  /* =====================================================================
     AVVIO
     ===================================================================== */
  function init() {
    collegaEventi();
    renderTutto();
    vaiA('home', true);

    // Se cambia la larghezza (rotazione, tastiera, finestra ridimensionata)
    // le voci si allargano e l'indicatore va rimesso al suo posto.
    global.addEventListener('resize', function () { posizionaIndicatore(true); });
    global.addEventListener('orientationchange', function () {
      global.setTimeout(function () { posizionaIndicatore(true); }, 200);
    });
    // Ultima passata a layout assestato: su iOS le misure appena dopo
    // DOMContentLoaded possono essere ancora quelle vecchie.
    global.addEventListener('load', function () { posizionaIndicatore(true); });
  }

  FL.ui = {
    init: init,
    renderTutto: renderTutto,
    vaiA: vaiA,
    vaiAOggi: vaiAOggi,
    toast: toast,
    mostraModalePagamento: mostraModalePagamento
  };
})(window);
