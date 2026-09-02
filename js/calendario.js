/* ==========================================================================
   F&L — Calendario: date, griglia del mese, stato dei giorni, statistiche.

   Regola d'oro sui fusi orari: si lavora SEMPRE con date locali.
   Le chiavi dei giorni sono stringhe "AAAA-MM-GG" costruite a mano da
   getFullYear/getMonth/getDate. Non si usa mai toISOString(), che converte
   in UTC e in Italia sposterebbe il giorno indietro di un'ora (e quindi
   di una data intera fra mezzanotte e le 2 di notte).

   Siccome il formato "AAAA-MM-GG" ha i campi a lunghezza fissa, il confronto
   fra due chiavi come stringhe equivale al confronto cronologico:
   "2026-09-02" < "2026-09-12" e' vero sia come testo sia come data.
   ========================================================================== */
(function (global) {
  'use strict';

  var FL = global.FL || (global.FL = {});

  var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
              'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  // Indice = valore di Date.getDay(): 0 = domenica
  var GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  var GIORNI_MEDI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  var GIORNI_CORTI = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

  /* ------------------------- Conversioni di base ----------------------- */

  function due(n) { return (n < 10 ? '0' : '') + n; }

  /* Da oggetto Date a chiave "AAAA-MM-GG", in ora locale. */
  function chiave(data) {
    return data.getFullYear() + '-' + due(data.getMonth() + 1) + '-' + due(data.getDate());
  }

  /* Da chiave a Date locale a mezzanotte.
     new Date(2026, 8, 26) e' mezzanotte locale; new Date("2026-09-26") no,
     perche' quella forma viene letta come UTC. */
  function daChiave(k) {
    var p = k.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function chiaveOggi() {
    return chiave(new Date());
  }

  /* Un giorno e' "passato" solo da mezzanotte del giorno dopo:
     finche' e' oggi non e' mai considerato mancato. */
  function ePassato(k) { return k < chiaveOggi(); }
  function eOggi(k) { return k === chiaveOggi(); }
  function eFuturo(k) { return k > chiaveOggi(); }

  function giorniNelMese(anno, mese) {
    // Il giorno 0 del mese successivo e' l'ultimo di questo mese:
    // funziona anche a dicembre, perche' Date normalizza mese 12 -> gennaio dell'anno dopo.
    return new Date(anno, mese + 1, 0).getDate();
  }

  function nomeMese(mese) { return MESI[mese]; }

  function etichettaMese(anno, mese) { return MESI[mese] + ' ' + anno; }

  /* "sabato 26 settembre 2026" */
  function etichettaLunga(k) {
    var d = daChiave(k);
    return GIORNI[d.getDay()].toLowerCase() + ' ' + d.getDate() + ' ' +
           MESI[d.getMonth()].toLowerCase() + ' ' + d.getFullYear();
  }

  /* "26 set" per elenchi stretti */
  function etichettaCorta(k) {
    var d = daChiave(k);
    return d.getDate() + ' ' + MESI[d.getMonth()].toLowerCase().slice(0, 3);
  }

  /* --------------------------- Griglia del mese ------------------------ */

  /* Restituisce le celle del mese, riempite davanti e dietro fino a
     completare le settimane. inizioSettimana: 1 = lunedi', 0 = domenica. */
  function griglia(anno, mese, inizioSettimana) {
    var primo = new Date(anno, mese, 1);
    var scarto = (primo.getDay() - inizioSettimana + 7) % 7;   // celle vuote iniziali
    var totaleGiorni = giorniNelMese(anno, mese);
    var celle = Math.ceil((scarto + totaleGiorni) / 7) * 7;    // settimane intere
    var lista = [];

    for (var i = 0; i < celle; i++) {
      // Il giorno "1 - scarto + i" puo' essere negativo o oltre fine mese:
      // Date lo normalizza da solo, cambiando mese e anno quando serve.
      var d = new Date(anno, mese, 1 - scarto + i);
      lista.push({
        data: d,
        chiave: chiave(d),
        numero: d.getDate(),
        giornoSettimana: d.getDay(),
        fuoriMese: d.getMonth() !== mese
      });
    }
    return lista;
  }

  /* Intestazione con le iniziali dei giorni, ruotata secondo l'impostazione. */
  function intestazioneSettimana(inizioSettimana) {
    var out = [];
    for (var i = 0; i < 7; i++) out.push(GIORNI_CORTI[(inizioSettimana + i) % 7]);
    return out;
  }

  /* Tutte le date del mese che cadono in un certo giorno della settimana
     (per esempio tutti i lunedi' di settembre). */
  function giorniDelMesePerSettimana(anno, mese, giornoSettimana) {
    var out = [];
    var totale = giorniNelMese(anno, mese);
    for (var g = 1; g <= totale; g++) {
      var d = new Date(anno, mese, g);
      if (d.getDay() === giornoSettimana) out.push(chiave(d));
    }
    return out;
  }

  /* ---------------------------- Stato dei giorni ----------------------- */

  /* Stato di una singola corsa (andata o ritiro):
       'fatto'   -> confermata
       'mancato' -> pianificata, non confermata e il giorno e' passato
       'attesa'  -> pianificata, si deve ancora fare (oggi o in futuro) */
  function statoCorsa(corsa, passato) {
    if (!corsa.pianificato) return null;
    if (corsa.fatto) return 'fatto';
    return passato ? 'mancato' : 'attesa';
  }

  /* Stato complessivo di una persona in un giorno, mettendo insieme le sue
     corse. Quando ne ha due e ne ha completata una sola lo stato e' "mezzo":
     il pallino sara' meta' verde e meta' rosso (o grigio, se il giorno deve
     ancora arrivare). */
  function unisciStati(pianificate, fatte, passato) {
    if (!pianificate) return null;
    if (fatte === pianificate) return 'fatto';
    if (fatte === 0) return passato ? 'mancato' : 'attesa';
    return passato ? 'mezzo-mancato' : 'mezzo-attesa';
  }

  /* Fotografia completa di un giorno.
     Lo stato d'insieme e' ricalcolato ogni volta a partire dalla data di
     oggi: per questo un giorno diventa rosso da solo, senza che l'app sia
     stata aperta quel giorno. */
  function statoGiorno(k) {
    var passato = ePassato(k);
    var totalePianificate = 0;
    var totaleFatte = 0;
    var elenco = [];   // tutte le corse previste del giorno, in ordine

    var persone = FL.dati.persone().map(function (p) {
      var corse = {};
      var pianificate = 0;
      var fatte = 0;

      FL.dati.tipi().forEach(function (t) {
        var c = FL.dati.corsa(k, p.id, t.id);
        var st = statoCorsa(c, passato);
        corse[t.id] = {
          tipo: t,
          pianificato: c.pianificato,
          fatto: c.fatto,
          stato: st
        };
        if (!st) return;
        pianificate++;
        if (st === 'fatto') fatte++;
        elenco.push({
          persona: p, tipo: t, fatto: c.fatto, stato: st
        });
      });

      totalePianificate += pianificate;
      totaleFatte += fatte;

      return {
        id: p.id, nome: p.nome, colore: p.colore,
        corse: corse,
        pianificate: pianificate,
        fatte: fatte,
        stato: unisciStati(pianificate, fatte, passato)
      };
    });

    var conPiano = persone.filter(function (p) { return p.pianificate > 0; });

    var stato;
    if (totalePianificate === 0) stato = 'vuoto';
    else if (totaleFatte === totalePianificate) stato = 'completo';
    else if (totaleFatte === 0) stato = passato ? 'mancato' : 'attesa';
    else stato = 'parziale';

    return {
      chiave: k,
      passato: passato,
      oggi: eOggi(k),
      persone: persone,          // sempre tutte, anche senza corse
      conPiano: conPiano,        // solo quelle con almeno una corsa
      corse: elenco,             // le singole corse previste del giorno
      pianificate: totalePianificate,
      fatte: totaleFatte,
      stato: stato
    };
  }

  /* ----------------------------- Statistiche --------------------------- */

  /* Statistiche del mese indicato. Si contano le corse, cioe' le terne
     giorno + persona + tipo, e in parallelo i giorni. */
  function statistiche(anno, mese) {
    var prefisso = anno + '-' + due(mese + 1) + '-';
    var giorni = FL.dati.stato().giorni;

    var out = {
      corsePianificate: 0, corseFatte: 0, corseMancate: 0, corseAttesa: 0,
      giorniPianificati: 0, giorniCompleti: 0, giorniMancati: 0,
      giorniParziali: 0, giorniAttesa: 0,
      costanza: 0,
      perPersona: {},
      perTipo: {}
    };

    FL.dati.persone().forEach(function (p) {
      out.perPersona[p.id] = {
        id: p.id, nome: p.nome, colore: p.colore,
        pianificate: 0, fatte: 0, mancate: 0, attesa: 0
      };
    });
    FL.dati.tipi().forEach(function (t) {
      out.perTipo[t.id] = { id: t.id, nome: t.nome, pianificate: 0, fatte: 0 };
    });

    Object.keys(giorni).forEach(function (k) {
      if (k.indexOf(prefisso) !== 0) return;
      var s = statoGiorno(k);
      if (s.stato === 'vuoto') return;

      out.giorniPianificati++;
      if (s.stato === 'completo') out.giorniCompleti++;
      else if (s.stato === 'mancato') out.giorniMancati++;
      else if (s.stato === 'parziale') out.giorniParziali++;
      else out.giorniAttesa++;

      s.corse.forEach(function (c) {
        var riga = out.perPersona[c.persona.id];
        var perTipo = out.perTipo[c.tipo.id];
        out.corsePianificate++;
        riga.pianificate++;
        perTipo.pianificate++;
        if (c.stato === 'fatto') { out.corseFatte++; riga.fatte++; perTipo.fatte++; }
        else if (c.stato === 'mancato') { out.corseMancate++; riga.mancate++; }
        else { out.corseAttesa++; riga.attesa++; }
      });
    });

    // Costanza: quanto e' stato mantenuto degli impegni ormai scaduti.
    // Quelli ancora da fare non entrano nel conto, altrimenti a inizio mese
    // la percentuale sarebbe sempre bassissima.
    var scadute = out.corseFatte + out.corseMancate;
    out.costanza = scadute ? Math.round((out.corseFatte / scadute) * 100) : 0;
    out.scadute = scadute;
    out.mese = mese;
    out.anno = anno;
    return out;
  }

  /* -------------------------------- API -------------------------------- */

  FL.cal = {
    MESI: MESI,
    GIORNI: GIORNI,
    GIORNI_MEDI: GIORNI_MEDI,
    GIORNI_CORTI: GIORNI_CORTI,
    chiave: chiave,
    daChiave: daChiave,
    chiaveOggi: chiaveOggi,
    ePassato: ePassato,
    eOggi: eOggi,
    eFuturo: eFuturo,
    giorniNelMese: giorniNelMese,
    nomeMese: nomeMese,
    etichettaMese: etichettaMese,
    etichettaLunga: etichettaLunga,
    etichettaCorta: etichettaCorta,
    griglia: griglia,
    intestazioneSettimana: intestazioneSettimana,
    giorniDelMesePerSettimana: giorniDelMesePerSettimana,
    statoCorsa: statoCorsa,
    statoGiorno: statoGiorno,
    statistiche: statistiche
  };
})(window);
