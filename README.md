# F&L — Andata e ritiro

Progressive Web App per tenere il conto delle corse di **Luca** e
**Francesco**: si pianificano in anticipo sul calendario, si confermano con un
tocco e ogni quattro corse completate l'app ricorda che c'è un pagamento da
effettuare.

Ogni giornata può avere, per ciascuna persona, due corse distinte:

- **Andata** — la persona viene accompagnata
- **Ritiro** — la persona viene ripresa

Niente framework, niente build, niente server: solo HTML, CSS e JavaScript.
I dati restano nel `localStorage` del dispositivo.

---

## Cosa sa fare

**Home — il calendario**

- Mese intero con frecce avanti/indietro e pulsante **Oggi**.
- Il giorno di oggi ha la casella **più scura** delle altre, con un anello viola.
- Tocca un giorno e si apre una scheda in vetro: per ogni persona ci sono
  l'andata e il ritiro, ognuno con il suo interruttore e la sua spunta di
  conferma. In alto ci sono le scorciatoie *Andata e ritiro*, *Solo andata*,
  *Solo ritiro*, *Niente*.
- **Selezione multipla**: si marcano tanti giorni in una volta, scegliendo
  anche i giorni della settimana (per esempio l'andata di tutti i lunedì e
  mercoledì del mese), le persone e il tipo di corsa.
- Sotto al calendario un riquadro elenca le corse di oggi, una riga per
  ciascuna, con i pulsanti grandi per confermare al volo.

**I pallini sotto al numero del giorno** — uno per ogni persona coinvolta:

| Pallino | Significato |
|---|---|
| nessuno | giorno libero |
| grigio | corse in programma, il giorno non è ancora passato |
| verde | corse confermate |
| rosso | il giorno è passato e non è stata confermata nessuna corsa |
| mezzo verde, mezzo rosso o grigio | di quella persona è stata confermata solo una delle due corse |

Il rosso non è mai definitivo: si apre il giorno e si corregge quando si
vuole. Il calcolo parte sempre dalla data di oggi, quindi un giorno diventa
rosso da solo a partire dalla mezzanotte successiva, anche se quel giorno
l'app non è stata aperta.

**Riepilogo** — statistiche del mese (corse completate, mancate, ancora da
fare, percentuale di costanza), dettaglio per persona, dettaglio andata /
ritiro, promemoria del pagamento e legenda dei colori.

**Impostazioni** — nomi delle due persone, ogni quante corse avvisare, primo
giorno della settimana, notifiche, export/import in JSON e azzeramento dati.

**Il promemoria del pagamento** — ogni volta che le corse completate e non
ancora saldate arrivano a 4 (o al numero scelto), arriva una notifica e
compare un avviso dentro l'app. Registrato il pagamento, il conteggio riparte.
I testi sono volutamente neutri — si parla di *pagamento da effettuare*, non
di chi incassa — così le stesse schermate vanno bene sia a chi guida sia a
chi paga.

---

## Pubblicare su GitHub Pages

1. Crea un repository su GitHub e fai push di questa cartella.
2. Nel repository: **Settings → Pages → Build and deployment**, sorgente
   *Deploy from a branch*, ramo `main` e cartella `/ (root)`.
3. L'app sarà su `https://<utente>.github.io/<repository>/`.

Tutti i percorsi dell'app sono relativi, quindi funziona anche dentro una
sottocartella senza modifiche.

Sul telefono: apri quell'indirizzo e usa *Aggiungi alla schermata Home*
(su iPhone dal menu Condividi di Safari, su Android il browser lo propone da
solo). Da lì in poi parte a tutto schermo e funziona anche senza rete.

> **iPhone:** le notifiche di sistema arrivano solo se l'app è stata
> installata sulla schermata Home (iOS 16.4 o successivo). In ogni caso il
> promemoria del pagamento compare sempre dentro l'app.

### Provarla sul computer

```bash
python -m http.server 5540
```

Poi apri `http://localhost:5540`. Il service worker ha bisogno di
`http://localhost` o di `https://`: aprendo `index.html` con un doppio clic
l'app funziona lo stesso, ma senza modalità offline.

---

## Come è fatta

```
FL_STARTUP_PWA/
├── index.html            struttura delle tre pagine
├── manifest.json         nome, icone e colori per l'installazione
├── sw.js                 service worker: cache e uso offline
├── css/
│   └── style.css         tutto lo stile, vetro scuro
├── js/
│   ├── storage.js        lettura e scrittura su localStorage
│   ├── calendario.js     date, griglia del mese, stato dei giorni, statistiche
│   ├── notifiche.js      notifiche e promemoria del pagamento
│   ├── ui.js             disegna le pagine e gestisce i tocchi
│   └── app.js            avvio, service worker, cambio di giorno
├── icons/                logo e icone (generate)
└── tools/
    └── make_icons.py     ridisegna il logo e tutte le icone
```

### Le date

Le giornate sono salvate come stringhe `AAAA-MM-GG` costruite dai valori
locali di `Date` (`getFullYear`, `getMonth`, `getDate`). Non si usa mai
`toISOString()`, che ragiona in UTC e in Italia sposterebbe indietro la data
nelle ore dopo la mezzanotte. Il cambio di mese e di anno è affidato a
`new Date(anno, mese + 1, 1)`, che normalizza da solo dicembre → gennaio.

### I dati salvati

Tutto sta in una sola chiave di `localStorage`, `fl.dati.v1`:

```json
{
  "versione": 2,
  "persone": [{ "id": "p1", "nome": "Luca", "colore": "#5ec8ff" }],
  "giorni": {
    "2026-09-26": {
      "p1": {
        "andata": { "pianificato": true, "fatto": true, "fattoIl": "2026-09-26" },
        "ritiro": { "pianificato": true, "fatto": false, "fattoIl": null }
      }
    }
  },
  "pagamenti": { "soglia": 4, "saldate": 0, "storico": [], "ultimoAvviso": -1 },
  "impostazioni": { "inizioSettimana": 1, "notifiche": false }
}
```

Persone e tipi di corsa hanno id fissi (`p1`/`p2`, `andata`/`ritiro`) e nome
modificabile: rinominare una persona non fa perdere lo storico. È la stessa
struttura del file di export, quindi un backup si rilegge con *Importa da
JSON*. Gli archivi salvati con la versione 1 (una sola corsa per persona)
vengono letti lo stesso: quella corsa diventa l'andata.

### Rigenerare il logo

Il marchio è un taxi giallo con la fascia a scacchi e l'insegna **F&L** sul
tetto, disegnato da uno script:

```bash
python -m pip install pillow
python tools/make_icons.py
```

Riscrive tutti i file dentro `icons/`. Per cambiare il disegno si toccano le
coordinate nella funzione `taxi()`, espresse da 0 a 1 sul lato dell'icona.

### Aggiornare l'app dopo una modifica

Il service worker tiene i file in cache, quindi dopo aver modificato il codice
va cambiata la versione in cima a `sw.js`:

```js
var VERSIONE = 'fl-v3';
```

Al primo caricamento successivo la cache vecchia viene buttata e i file
vengono riscaricati.
