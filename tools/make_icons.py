# -*- coding: utf-8 -*-
"""Genera il logo e tutte le icone della PWA "F&L".

Il marchio e' un taxi classico visto di lato: carrozzeria gialla, fascia a
scacchi sulle fiancate e insegna sul tetto con la scritta F&L.

Uso:  python tools/make_icons.py
Serve solo Pillow:  python -m pip install pillow

Il disegno viene fatto a risoluzione quadrupla e poi rimpicciolito: e' il
modo piu' semplice per avere i bordi morbidi, visto che Pillow disegna le
forme senza antialiasing.
"""

import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

QUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(QUI)
ICONS = os.path.join(ROOT, "icons")

LATO = 1024        # misura finale del master
SUPER = 4          # fattore di sovracampionamento per l'antialiasing
S = LATO * SUPER

# Colori del marchio
GIALLO = (255, 201, 74)
NOTTE = (13, 19, 48)
VETRO = (27, 42, 99)
BIANCO = (247, 248, 255)
CERCHIONE = (223, 229, 247)
FARO = (255, 246, 216)
STOP = (255, 123, 123)

FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"


def font(dimensione):
    try:
        return ImageFont.truetype(FONT_BOLD, int(dimensione))
    except OSError:
        return ImageFont.load_default()


def px(*valori):
    """Da coordinate 0..1 a pixel della tela grande."""
    return [v * S for v in valori]


# --------------------------------------------------------------------------
# Sfondo
# --------------------------------------------------------------------------
def sfondo(lato):
    """Sfumatura viola/notte con due aloni diffusi, come nell'app."""
    alto = (34, 20, 92)
    basso = (7, 11, 26)
    bg = Image.new("RGB", (lato, lato))
    d = ImageDraw.Draw(bg)
    for y in range(lato):
        t = y / (lato - 1)
        d.line([(0, y), (lato, y)],
               fill=tuple(round(alto[i] + (basso[i] - alto[i]) * t) for i in range(3)))

    def alone(colore, box, forza):
        maschera = Image.new("L", (lato, lato), 0)
        ImageDraw.Draw(maschera).ellipse(box, fill=forza)
        maschera = maschera.filter(ImageFilter.GaussianBlur(lato * 0.14))
        return Image.composite(Image.new("RGB", (lato, lato), colore), bg, maschera)

    bg = alone((109, 40, 217), [-lato * .30, -lato * .35, lato * .70, lato * .45], 150)
    bg = alone((14, 116, 144), [lato * .45, lato * .55, lato * 1.35, lato * 1.35], 110)
    return bg


# --------------------------------------------------------------------------
# Il taxi
# --------------------------------------------------------------------------
def taxi():
    """Disegna il taxi su una tela trasparente e la restituisce a misura LATO."""
    tela = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(tela)

    # Ombra morbida sotto le ruote
    ombra = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ombra).ellipse(px(.16, .735, .84, .800), fill=(0, 0, 0, 130))
    tela.alpha_composite(ombra.filter(ImageFilter.GaussianBlur(S * 0.018)))

    # Insegna sul tetto
    insegna = px(.400, .281, .605, .366)
    d.rounded_rectangle(insegna, radius=S * .025, fill=GIALLO,
                        outline=NOTTE, width=int(S * .008))

    # Scritta F&L dentro l'insegna, rimpicciolita finche' ci sta comoda
    larghezza_utile = (insegna[2] - insegna[0]) * .74
    dim = S * .062
    f = font(dim)
    while d.textbbox((0, 0), "F&L", font=f)[2] > larghezza_utile and dim > S * .02:
        dim *= .94
        f = font(dim)
    d.text(((insegna[0] + insegna[2]) / 2, (insegna[1] + insegna[3]) / 2 + S * .002),
           "F&L", font=f, fill=NOTTE, anchor="mm")

    # Abitacolo
    d.polygon(px(.325, .478) + px(.392, .362) + px(.612, .362) + px(.700, .478),
              fill=GIALLO)

    # Finestrini (con il montante giallo in mezzo)
    d.polygon(px(.356, .466) + px(.408, .377) + px(.503, .377) + px(.503, .466),
              fill=VETRO)
    d.polygon(px(.537, .377) + px(.606, .377) + px(.663, .466) + px(.537, .466),
              fill=VETRO)

    # Carrozzeria
    corpo = px(.112, .470, .888, .650)
    raggio = S * .055
    d.rounded_rectangle(corpo, radius=raggio, fill=GIALLO)

    # Fascia a scacchi, ritagliata sulla sagoma della carrozzeria
    scacchi = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ds = ImageDraw.Draw(scacchi)
    lato_q = (corpo[2] - corpo[0]) / 16
    for riga in range(2):
        for col in range(16):
            colore = NOTTE if (riga + col) % 2 == 0 else BIANCO
            x = corpo[0] + col * lato_q
            y = S * .512 + riga * lato_q
            ds.rectangle([x, y, x + lato_q, y + lato_q], fill=colore)
    maschera = Image.new("L", (S, S), 0)
    ImageDraw.Draw(maschera).rounded_rectangle(corpo, radius=raggio, fill=255)
    scacchi.putalpha(ImageChops.multiply(scacchi.split()[3], maschera))
    tela.alpha_composite(scacchi)

    # Luci
    d.ellipse(px(.832, .600, .884, .644), fill=FARO)
    d.ellipse(px(.116, .602, .160, .642), fill=STOP)

    # Ruote
    for cx in (.298, .702):
        d.ellipse(px(cx - .093, .660 - .093, cx + .093, .660 + .093), fill=NOTTE)
        d.ellipse(px(cx - .038, .660 - .038, cx + .038, .660 + .038), fill=CERCHIONE)
        d.ellipse(px(cx - .013, .660 - .013, cx + .013, .660 + .013), fill=NOTTE)

    return tela.resize((LATO, LATO), Image.LANCZOS)


# --------------------------------------------------------------------------
# Composizioni
# --------------------------------------------------------------------------
def master():
    """Icona piena: sfondo + taxi a tutta larghezza."""
    base = sfondo(LATO).convert("RGBA")
    base.alpha_composite(taxi())
    return base.convert("RGB")


def maskable():
    """Versione per Android: il taxi sta dentro l'area sicura centrale."""
    base = sfondo(LATO).convert("RGBA")
    dentro = round(LATO * 0.66)
    piccolo = taxi().resize((dentro, dentro), Image.LANCZOS)
    base.alpha_composite(piccolo, ((LATO - dentro) // 2, (LATO - dentro) // 2))
    return base.convert("RGB")


def arrotonda(img, raggio_pct=0.225):
    """Angoli molto stondati, come il resto dell'app."""
    maschera = Image.new("L", img.size, 0)
    ImageDraw.Draw(maschera).rounded_rectangle(
        [0, 0, img.size[0] - 1, img.size[1] - 1],
        radius=img.size[0] * raggio_pct, fill=255)
    fuori = img.convert("RGBA")
    fuori.putalpha(maschera)
    return fuori


def main():
    os.makedirs(ICONS, exist_ok=True)
    pieno = master()

    # Icone "any": angoli stondati e sfondo trasparente attorno
    for nome, dim in [("icon-512.png", 512), ("icon-192.png", 192), ("favicon.png", 64)]:
        arrotonda(pieno.resize((dim, dim), Image.LANCZOS)).save(
            os.path.join(ICONS, nome), optimize=True)
        print("  ", nome)

    # iOS ritaglia da solo e non vuole trasparenze: icona piena
    pieno.resize((180, 180), Image.LANCZOS).save(
        os.path.join(ICONS, "apple-touch-icon.png"), optimize=True)
    print("   apple-touch-icon.png")

    maskable().resize((512, 512), Image.LANCZOS).save(
        os.path.join(ICONS, "icon-maskable-512.png"), optimize=True)
    print("   icon-maskable-512.png")

    pieno.save(os.path.join(ICONS, "logo-1024.png"), optimize=True)
    print("   logo-1024.png")


if __name__ == "__main__":
    main()
