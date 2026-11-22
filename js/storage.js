/* ==========================================================================
   F&L — Archivio dati
   Tutto vive in localStorage: nessun account, nessun server.

   Ogni giornata puo' avere, per ciascuna persona, due corse distinte:
     - "andata"  : la persona viene accompagnata
     - "ritiro"  : la persona viene ripresa

   La struttura salvata e' questa:

   {
     versione: 2,
     persone: [ { id:"p1", nome:"Luca", colore:"#5ec8ff" }, ... ],
     giorni: {
       "2026-09-26": {
         p1: { andata: { pianificato:true, fatto:true, fattoIl:"2026-09-26" },
               ritiro: { pianificato:true, fatto:false, fattoIl:null } }
       }
     },
     pagamenti: { soglia:4, saldate:0, storico:[...], ultimoAvviso:-1 },
     impostazioni: { inizioSettimana:1, notifiche:false }
   }

   Nota sugli id: persone e tipi di corsa hanno id fissi e nome modificabile,
   cosi' rinominare qualcuno non fa perdere lo storico.
   ========================================================================== */
(function (global) {
  'use strict';

  var FL = global.FL || (global.FL = {});

  var CHIAVE_ARCHIVIO = 'fl.dati.v1';
  var VERSIONE_DATI = 2;

  var PERSONE_INIZIALI = [
    { id: 'p1', nome: 'Luca', colore: '#5ec8ff' },
    { id: 'p2', nome: 'Francesco', colore: '#ffc94a' }
  ];

  // I due tipi di corsa. L'ordine conta: e' quello in cui compaiono a schermo.
    var TIPI = [
    { id: 'andata', nome: 'Accompagnare', descrizione: 'la persona viene accompagnata' },
    { id: 'ritiro', nome: 'Andare a riprendere', descrizione: 'la persona viene ripresa' }
  ];

  // Dove si va: di serie la scuola. Il testo e' libero (es. "Scuola di musica").
  var DOVE_PREDEFINITO = 'Scuola';
  var DOVE_MAX = 30;

  // Copia dello stato tenuta in memoria: si legge da qui, si scrive su disco.
  var stato = null;

  /* ----------------------------- Utilita' ------------------------------ */

  function datiVuoti() {
    return {
      versione: VERSIONE_DATI,
      persone: PERSONE_INIZIALI.map(function (p) {
        return { id: p.id, nome: p.nome, colore: p.colore };
      }),
      giorni: {},
      pagamenti: { soglia: 4, saldate: 0, storico: [], ultimoAvviso: -1 },
      impostazioni: { inizioSettimana: 1, notifiche: false }
    };
  }

  function numero(valore, predefinito) {
    var n = parseInt(valore, 10);
    return isNaN(n) ? predefinito : n;
  }

    /* Ripulisce il luogo: se e' vuoto torna alla scuola. */
  function pulisciDove(valore) {
    var t = String(valore == null ? '' : valore).replace(/\s+/g, ' ').trim().slice(0, DOVE_MAX);
    return t || DOVE_PREDEFINITO;
  }

  function corsaVuota() {
    return { pianificato: false, fatto: false, fattoIl: null, dove: DOVE_PREDEFINITO };
  }
  /* Legge una corsa da dati grezzi, accettando anche il formato della
     versione 1, dove la persona aveva una sola corsa senza nome:
     { pianificato:true, fatto:false }  ->  diventa l'andata. */
  function leggiCorsa(grezzo) {
    if (!grezzo || typeof grezzo !== 'object') return corsaVuota();
    var pianificato = !!grezzo.pianificato;
    var fatto = !!grezzo.fatto;
    if (fatto) pianificato = true;          // confermata implica pianificata
    if (!pianificato) return corsaVuota();
        return { pianificato: true, fatto: fatto, fattoIl: grezzo.fattoIl || null,
             dove: pulisciDove(grezzo.dove) };
  }

  /* Rimette in riga dati arrivati da un import o da una versione vecchia. */
  function normalizza(grezzo) {
    var base = datiVuoti();
    if (!grezzo || typeof grezzo !== 'object') return base;

    // Persone: teniamo sempre e solo gli id previsti.
    if (Array.isArray(grezzo.persone)) {
      base.persone.forEach(function (p) {
        var trovata = grezzo.persone.filter(function (q) { return q && q.id === p.id; })[0];
        if (trovata && typeof trovata.nome === 'string' && trovata.nome.trim()) {
          p.nome = trovata.nome.trim().slice(0, 18);
        }
        if (trovata && typeof trovata.colore === 'string' && /^#[0-9a-f]{6}$/i.test(trovata.colore)) {
          p.colore = trovata.colore;
        }
      });
    }

    // Giorni: solo chiavi AAAA-MM-GG, persone note e corse note.
    if (grezzo.giorni && typeof grezzo.giorni === 'object') {
      Object.keys(grezzo.giorni).forEach(function (chiave) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(chiave)) return;
        var vecchio = grezzo.giorni[chiave];
        if (!vecchio || typeof vecchio !== 'object') return;

        var nuovo = {};
        base.persone.forEach(function (p) {
          var v = vecchio[p.id];
          if (!v || typeof v !== 'object') return;

          var corse = {};
          if (v.andata || v.ritiro) {
            // Formato versione 2
            TIPI.forEach(function (t) {
              var c = leggiCorsa(v[t.id]);
              if (c.pianificato) corse[t.id] = c;
            });
          } else {
            // Formato versione 1: l'unica corsa diventa l'andata
            var c1 = leggiCorsa(v);
            if (c1.pianificato) corse.andata = c1;
          }
          if (Object.keys(corse).length) nuovo[p.id] = corse;
        });
        if (Object.keys(nuovo).length) base.giorni[chiave] = nuovo;
      });
    }

    // Pagamenti
    if (grezzo.pagamenti && typeof grezzo.pagamenti === 'object') {
      base.pagamenti.soglia = Math.min(50, Math.max(1, numero(grezzo.pagamenti.soglia, 4)));
      base.pagamenti.saldate = Math.max(0, numero(grezzo.pagamenti.saldate, 0));
      base.pagamenti.ultimoAvviso = numero(grezzo.pagamenti.ultimoAvviso, -1);
      if (Array.isArray(grezzo.pagamenti.storico)) {
        base.pagamenti.storico = grezzo.pagamenti.storico.filter(function (v) {
          return v && typeof v.data === 'string' && typeof v.corse === 'number';
        }).slice(-50);
      }
    }

    // Impostazioni
    if (grezzo.impostazioni && typeof grezzo.impostazioni === 'object') {
      base.impostazioni.inizioSettimana = grezzo.impostazioni.inizioSettimana === 0 ? 0 : 1;
      base.impostazioni.notifiche = !!grezzo.impostazioni.notifiche;
    }

    // Non si possono avere piu' corse saldate di quelle davvero completate
    // (puo' capitare togliendo a mano una conferma gia' pagata).
    base.pagamenti.saldate = Math.min(base.pagamenti.saldate, contaFatte(base));
    return base;
  }

  function contaFatte(dati) {
    var totale = 0;
    Object.keys(dati.giorni).forEach(function (chiave) {
      var giorno = dati.giorni[chiave];
      Object.keys(giorno).forEach(function (idPersona) {
        var corse = giorno[idPersona];
        Object.keys(corse).forEach(function (idTipo) {
          if (corse[idTipo].fatto) totale++;
        });
      });
    });
    return totale;
  }

  /* --------------------------- Lettura/scrittura ----------------------- */

  function carica() {
    var grezzo = null;
    try {
      var testo = global.localStorage.getItem(CHIAVE_ARCHIVIO);
      if (testo) grezzo = JSON.parse(testo);
    } catch (e) {
      // Navigazione privata o archivio corrotto: si riparte da zero.
      grezzo = null;
    }
    stato = normalizza(grezzo);
    return stato;
  }

  function dati() {
    return stato || carica();
  }

  function salva() {
    try {
      global.localStorage.setItem(CHIAVE_ARCHIVIO, JSON.stringify(dati()));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------- Persone e tipi di corsa ------------------- */

  function persone() { return dati().persone; }

  function persona(id) {
    return persone().filter(function (p) { return p.id === id; })[0] || null;
  }

  function tipi() { return TIPI; }

  function tipo(id) {
    return TIPI.filter(function (t) { return t.id === id; })[0] || null;
  }

  function rinomina(id, nome) {
    var p = persona(id);
    if (!p) return;
    var pulito = String(nome || '').trim().slice(0, 18);
    p.nome = pulito || (id === 'p1' ? 'Luca' : 'Francesco');
    salva();
  }

  /* ------------------------------- Giorni ------------------------------ */

  /* Ritorna una corsa, senza mai dare null. */
  function corsa(chiave, idPersona, idTipo) {
    var giorno = dati().giorni[chiave];
    var corse = giorno && giorno[idPersona];
    var c = corse && corse[idTipo];
        return {
      pianificato: !!(c && c.pianificato),
      fatto: !!(c && c.fatto),
      fattoIl: (c && c.fattoIl) || null,
      dove: pulisciDove(c && c.dove)
    };
  }

  /* Scrive lo stato di una corsa.
     Quando una corsa non e' ne' pianificata ne' completata sparisce, e se
     restano vuote la persona e poi il giorno spariscono anche loro:
     l'archivio resta leggero e le statistiche non contano righe morte. */
  function imposta(chiave, idPersona, idTipo, pianificato, fatto) {
    var d = dati();
    var giorno = d.giorni[chiave] || (d.giorni[chiave] = {});
    var corse = giorno[idPersona] || (giorno[idPersona] = {});

    if (fatto) pianificato = true;          // completata implica pianificata
    if (!pianificato) {
      delete corse[idTipo];
    } else {
      corse[idTipo] = {
        pianificato: true,
        fatto: !!fatto,
                fattoIl: fatto ? (corse[idTipo] && corse[idTipo].fattoIl) || FL.cal.chiaveOggi() : null,
        dove: pulisciDove(corse[idTipo] && corse[idTipo].dove)
      };
    }
    if (!Object.keys(corse).length) delete giorno[idPersona];
    if (!Object.keys(giorno).length) delete d.giorni[chiave];

    // Se si annulla una conferma gia' conteggiata, il saldo va ricucito.
    d.pagamenti.saldate = Math.min(d.pagamenti.saldate, contaFatte(d));
    salva();
  }

  function pianifica(chiave, idPersona, idTipo, attivo) {
    var c = corsa(chiave, idPersona, idTipo);
    imposta(chiave, idPersona, idTipo, attivo, attivo ? c.fatto : false);
  }

  function conferma(chiave, idPersona, idTipo, fatto) {
    imposta(chiave, idPersona, idTipo, true, fatto);
  }

  /* Applica la stessa pianificazione a piu' giorni, per piu' persone e per
     piu' tipi di corsa: serve alla selezione multipla (per esempio
     "l'andata di tutti i lunedi' e mercoledi' del mese"). */
  function pianificaMolti(chiavi, idPersone, idTipi, attivo) {
    chiavi.forEach(function (chiave) {
      idPersone.forEach(function (idPersona) {
        idTipi.forEach(function (idTipo) {
          pianifica(chiave, idPersona, idTipo, attivo);
        });
      });
    });
  }

    /* Cambia il luogo di un tipo di corsa, per tutte le persone che quel
     giorno hanno quella corsa in programma. */
  function impostaDoveGiorno(chiave, idTipo, dove) {
    var giorno = dati().giorni[chiave];
    if (!giorno) return;
    var pulito = pulisciDove(dove);
    Object.keys(giorno).forEach(function (idPersona) {
      if (giorno[idPersona][idTipo]) giorno[idPersona][idTipo].dove = pulito;
    });
    salva();
  }

  /* Luoghi da proporre: la scuola, la scuola di musica e quelli gia' usati. */
  function luoghiUsati() {
    var visti = {};
    var lista = [];
    function aggiungi(nome) {
      var k = nome.toLowerCase();
      if (visti[k]) return;
      visti[k] = true;
      lista.push(nome);
    }
    aggiungi(DOVE_PREDEFINITO);
    aggiungi('Scuola di musica');
    var giorni = dati().giorni;
    Object.keys(giorni).sort().forEach(function (k) {
      Object.keys(giorni[k]).forEach(function (idPersona) {
        Object.keys(giorni[k][idPersona]).forEach(function (idTipo) {
          aggiungi(pulisciDove(giorni[k][idPersona][idTipo].dove));
        });
      });
    });
    return lista.slice(0, 8);
  }

  function svuotaGiorno(chiave) {
    var d = dati();
    delete d.giorni[chiave];
    d.pagamenti.saldate = Math.min(d.pagamenti.saldate, contaFatte(d));
    salva();
  }

  /* ----------------------------- Pagamenti ----------------------------- */

  function totaleFatte() { return contaFatte(dati()); }

  function corseInSospeso() {
    return Math.max(0, totaleFatte() - dati().pagamenti.saldate);
  }

  function soglia() {
    return Math.min(50, Math.max(1, dati().pagamenti.soglia || 4));
  }

  function impostaSoglia(valore) {
    dati().pagamenti.soglia = Math.min(50, Math.max(1, numero(valore, 4)));
    salva();
  }

  /* Segna come saldate tutte le corse in sospeso. */
  function registraPagamento() {
    var d = dati();
    var sospese = corseInSospeso();
    if (sospese <= 0) return 0;
    d.pagamenti.saldate = totaleFatte();
    d.pagamenti.ultimoAvviso = -1;
    d.pagamenti.storico.push({ data: FL.cal.chiaveOggi(), corse: sospese });
    if (d.pagamenti.storico.length > 50) d.pagamenti.storico.shift();
    salva();
    return sospese;
  }

  function ultimoPagamento() {
    var storico = dati().pagamenti.storico;
    return storico.length ? storico[storico.length - 1] : null;
  }

  /* ---------------------------- Impostazioni --------------------------- */

  function impostazioni() { return dati().impostazioni; }

  function impostaInizioSettimana(valore) {
    dati().impostazioni.inizioSettimana = numero(valore, 1) === 0 ? 0 : 1;
    salva();
  }

  /* ------------------------- Export / import / reset ------------------- */

  function esporta() {
    return JSON.stringify(dati(), null, 2);
  }

  function importa(testo) {
    var grezzo;
    try {
      grezzo = JSON.parse(testo);
    } catch (e) {
      return { ok: false, errore: 'Il file non contiene JSON valido.' };
    }
    if (!grezzo || typeof grezzo !== 'object' || !grezzo.giorni) {
      return { ok: false, errore: 'Il file non sembra un backup di F&L.' };
    }
    stato = normalizza(grezzo);
    salva();
    return { ok: true, giorni: Object.keys(stato.giorni).length };
  }

  function azzera() {
    stato = datiVuoti();
    salva();
  }

    /* ------------------------ Settimana e periodi ------------------------ */

  /* Primo e ultimo giorno della settimana che contiene la data k.
     inizioSettimana: 1 = lunedi', 0 = domenica. */
  function intervalloSettimana(k, inizioSettimana) {
    var d = daChiave(k);
    var scarto = (d.getDay() - inizioSettimana + 7) % 7;
    var inizio = new Date(d.getFullYear(), d.getMonth(), d.getDate() - scarto);
    var fine = new Date(inizio.getFullYear(), inizio.getMonth(), inizio.getDate() + 6);
    return { da: chiave(inizio), a: chiave(fine) };
  }

  /* Tutte le corse previste fra due date (estremi inclusi), in ordine:
     per giorno, poi accompagnare prima di riprendere, poi per persona. */
  function corsePerPeriodo(da, a) {
    var giorni = FL.dati.stato().giorni;
    var persone = FL.dati.persone();
    var tipi = FL.dati.tipi();
    var out = [];

    Object.keys(giorni).sort().forEach(function (k) {
      if (k < da || k > a) return;
      statoGiorno(k).corse.forEach(function (c) {
        out.push({
          chiave: k, persona: c.persona, tipo: c.tipo,
          dove: c.dove, fatto: c.fatto, stato: c.stato
        });
      });
    });

    function indice(lista, id) {
      for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return i;
      return 0;
    }
    out.sort(function (x, y) {
      if (x.chiave !== y.chiave) return x.chiave < y.chiave ? -1 : 1;
      var t = indice(tipi, x.tipo.id) - indice(tipi, y.tipo.id);
      if (t) return t;
      return indice(persone, x.persona.id) - indice(persone, y.persona.id);
    });
    return out;
  }

  /* ------------------------------- API --------------------------------- */

  FL.dati = {
    TIPI: TIPI,
    carica: carica,
    stato: dati,
    salva: salva,
    persone: persone,
    persona: persona,
    tipi: tipi,
    tipo: tipo,
    rinomina: rinomina,
    corsa: corsa,
    imposta: imposta,
    pianifica: pianifica,
    conferma: conferma,
    pianificaMolti: pianificaMolti,
    svuotaGiorno: svuotaGiorno,
    totaleFatte: totaleFatte,
    corseInSospeso: corseInSospeso,
    soglia: soglia,
    impostaSoglia: impostaSoglia,
    registraPagamento: registraPagamento,
    ultimoPagamento: ultimoPagamento,
    impostazioni: impostazioni,
    impostaInizioSettimana: impostaInizioSettimana,
    esporta: esporta,
    importa: importa,
    azzera: azzera
  };
})(window);
