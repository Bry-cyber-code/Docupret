# -*- coding: utf-8 -*-
"""Fabrique le mode sombre de chaque page (bloc <style id="mode-sombre">).

Les couleurs claires des fonds et bordures deviennent sombres, les textes foncés deviennent clairs,
à partir du CSS de la page (et de celui ajouté par compte-menu.js / compte.js).
Les documents (feuilles de facture, lettres, CV, vignettes) gardent leurs couleurs d'origine.

À relancer après chaque modification du CSS d'une page :  python3 outils/sombre.py
(outils/pages-documents.py le lance automatiquement à la fin).
"""
import glob, os, re, colorsys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Zones qui représentent un document papier : on n'y touche pas
EXEMPT = '#support,.va-echelle,#mini-doc,.vign,.vignette,.loupe-support,.vitrine-doc,#toile-fond,#papier,body:has(#toile-fond) .modele'
PAS_DANS = f':not(:is({EXEMPT}),:is({EXEMPT}) *)'
SCRIPT = ("<script>try{if(/[?&]clair\\b/.test(location.search))localStorage.setItem('docupret_theme','clair');"
          "if(localStorage.getItem('docupret_theme')==='sombre'&&window.self===window.top)document.documentElement.classList.add('sombre')}catch(e){}</script>\n")

NOMS = {'white': (255, 255, 255), 'black': (0, 0, 0)}
COULEUR = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b')
PROP_TEXTE = re.compile(r'^(color|-webkit-text-fill-color|caret-color|text-decoration-color)$')
PROP_COULEUR = re.compile(r'^(color|background|background-color|background-image|border|border-[a-z-]*|outline|outline-color|box-shadow|fill|stroke|-webkit-text-fill-color|caret-color|text-decoration-color|accent-color|--[\w-]+)$')


def lire_couleur(t):
    t = t.strip()
    if t.lower() in NOMS: return NOMS[t.lower()] + (None,)
    if t.startswith('#'):
        h = t[1:]
        if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
        if len(h) not in (6, 8): return None
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = h[6:8] if len(h) == 8 else None
        return (r, g, b, a)
    m = re.match(r'rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)', t)
    if m: return (int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4))
    return None


def ecrire(r, g, b, a, orig):
    if orig.startswith('rgb') and a is not None: return f'rgba({r},{g},{b},{a})'
    s = f'#{r:02x}{g:02x}{b:02x}'
    if a is not None and orig.startswith('#'): s += a
    return s


def convertir(val, texte):
    """Renvoie la valeur avec ses couleurs adaptées au sombre (ou None si rien ne change)."""
    change = False
    def rempl(m):
        nonlocal change
        c = lire_couleur(m.group(0))
        if not c: return m.group(0)
        r, g, b, a = c
        if a is not None and m.group(0).startswith('rgba') and float(str(a).rstrip('%') or 1) < 0.35 and (r + g + b) < 200:
            return m.group(0)                                   # ombres légères : inchangées
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if texte:
            if l < 0.45: l2 = 0.95 - l * 0.55                   # texte foncé → clair
            elif l < 0.62 and s < 0.3: l2 = 0.70                # gris moyen → gris clair (lisible sur fond sombre)
            else: return m.group(0)
        else:
            if l <= 0.72: return m.group(0)
            # Surfaces (blanc, fond de page) : très sombres, les cartes un peu plus claires que le fond
            # Teintes pâles et bordures : un peu plus claires que les cartes, pour rester visibles
            l2 = 0.13 - (1 - l) * 1.3 if l >= 0.97 else 0.17 + (0.97 - l) * 0.55
            if s < 0.05: h, s = 0.6, 0.18                       # gris neutres → léger bleu nuit, comme le site
            s = min(s, 0.4)
        r2, g2, b2 = (round(x * 255) for x in colorsys.hls_to_rgb(h, l2, s))
        change = True
        return ecrire(r2, g2, b2, a, m.group(0))
    out = COULEUR.sub(rempl, val)
    return out if change else None


def nettoyer(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def blocs(css):
    """Découpe le CSS en (prélude, contenu) en suivant les accolades."""
    i, n, res = 0, len(css), []
    while i < n:
        j = css.find('{', i)
        if j < 0: break
        prelude = css[i:j].strip()
        prof, k = 1, j + 1
        while k < n and prof:
            if css[k] == '{': prof += 1
            elif css[k] == '}': prof -= 1
            k += 1
        res.append((prelude.split(';')[-1].strip(), css[j + 1:k - 1]))
        i = k
    return res


def selecteur(s):
    s = s.strip()
    if not s: return None
    m = re.search(r'(::?(?:before|after|placeholder|-webkit-[\w-]+|selection|marker|first-letter|first-line))\s*$', s)
    pseudo = m.group(1) if m else ''
    base = s[:m.start()] if m else s
    if base.startswith(':root'): base = ':root.sombre' + base[5:]
    elif re.match(r'html\b', base): base = 'html.sombre' + base[4:]
    else: base = 'html.sombre ' + base
    return base + PAS_DANS + pseudo


def decls(contenu):
    for d in re.split(r';(?![^(]*\))', contenu):
        if ':' not in d: continue
        p, v = d.split(':', 1)
        yield p.strip(), v.strip()


def regles(css, reset):
    out = []
    for prelude, contenu in blocs(nettoyer(css)):
        if prelude.startswith('@'):
            if re.match(r'@(media|supports)', prelude):
                inner = regles(contenu, reset)
                if inner: out.append(prelude + '{' + ''.join(inner) + '}')
            continue
        nouv = []
        for p, v in decls(contenu):
            pl = p.lower()
            if not PROP_COULEUR.match(pl): continue
            if pl.startswith('--'):
                if prelude.strip() == ':root' and COULEUR.search(v): reset.append(f'{p}:{v}')
                texte = bool(re.search(r'texte|gris|ink|txt', pl))
            else:
                texte = bool(PROP_TEXTE.match(pl))
            if not texte and re.search(r'var\(--(texte|gris)', v):
                nouv.append(f'{p}:#243041' + (' !important' if 'important' in v else ''))
                continue
            c = convertir(v, texte)
            if c is not None: nouv.append(f'{p}:{c}')
        if not nouv: continue
        sels = [selecteur(x) for x in re.split(r',(?![^(]*\))', prelude)]
        sels = [x for x in sels if x]
        if sels: out.append(','.join(sels) + '{' + ';'.join(nouv) + '}')
    return out


def css_js():
    """CSS ajouté par les scripts communs (menu Mon compte, fenêtres du compte…)."""
    t = ''
    for f in ('compte-menu.js', 'compte.js'):
        p = os.path.join(RACINE, f)
        if os.path.exists(p):
            for m in re.finditer(r'const CSS = `(.*?)`', open(p, encoding='utf-8').read(), re.S): t += m.group(1)
    return t


def bloc_page(html, commun):
    styles = ''.join(m.group(1) for m in re.finditer(r'<style(?! id="mode-sombre")[^>]*>(.*?)</style>', html, re.S))
    reset = []
    r = regles(styles + commun, reset)
    base = ('html.sombre{color-scheme:dark}'
            f'html.sombre :is({EXEMPT}){{color-scheme:light;{";".join(dict.fromkeys(reset))}}}')
    return '<style id="mode-sombre">' + base + ''.join(r) + '</style>\n'


def main():
    commun = css_js()
    n = 0
    for f in sorted(glob.glob(os.path.join(RACINE, '*.html'))):
        s = open(f, encoding='utf-8').read()
        s = re.sub(r'<style id="mode-sombre">.*?</style>\n?', '', s, flags=re.S)
        s = re.sub(r"<script>try\{if\(/\[\?&\]clair.*?</script>\n?|<script>try\{if\(localStorage\.getItem\('docupret_theme'\).*?</script>\n?", '', s, flags=re.S)
        i = s.find('</head>')
        if i < 0: continue
        s = s[:i] + bloc_page(s, commun) + SCRIPT + s[i:]
        open(f, 'w', encoding='utf-8').write(s); n += 1
    print(n, 'pages avec mode sombre')


if __name__ == '__main__':
    main()
