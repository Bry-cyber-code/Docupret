#!/usr/bin/env python3
"""DocuPrêt — données structurées pour Google (schema.org) sur les pages outils.

Ajoute (ou met à jour) dans le <head> de chaque page outil un bloc
<!--SEO-LD--> … <!--/SEO-LD--> qui décrit à Google :
  - l'outil gratuit (WebApplication, prix 0 €) ;
  - le fil d'Ariane (Accueil › page), affiché à la place de l'adresse dans les résultats ;
  - les questions fréquentes déjà visibles sur la page (FAQPage).
Sur l'accueil : le site (WebSite) et l'éditeur (Organization).

Le script ne change rien de visible. Il est relancé automatiquement par
pages-documents.py ; on peut aussi le lancer seul :
    python3 outils/seo.py
"""
import os, re, json, html

ICI = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.dirname(ICI)
URL = 'https://docupret.fr/'

# Pages outils (les guides ont déjà leurs propres données structurées)
OUTILS = {
    'facture.html': 'BusinessApplication', 'devis.html': 'BusinessApplication',
    'bon-de-commande.html': 'BusinessApplication', 'recu.html': 'BusinessApplication',
    'avoir.html': 'BusinessApplication', 'tva.html': 'FinanceApplication',
    'simulateur.html': 'FinanceApplication', 'frais-kilometriques.html': 'FinanceApplication',
    'tampon.html': 'DesignApplication', 'logo.html': 'DesignApplication',
    'carte.html': 'DesignApplication', 'flyer.html': 'DesignApplication',
    'cv.html': 'BusinessApplication', 'cession.html': 'UtilitiesApplication',
    'constat.html': 'UtilitiesApplication',
    'lettre-demission.html': 'UtilitiesApplication', 'lettre-motivation.html': 'UtilitiesApplication',
    'demande-conges.html': 'UtilitiesApplication', 'rupture-conventionnelle.html': 'UtilitiesApplication',
    'preavis-locataire.html': 'UtilitiesApplication', 'attestation-hebergement.html': 'UtilitiesApplication',
    'quittance-loyer.html': 'UtilitiesApplication', 'attestation-sur-l-honneur.html': 'UtilitiesApplication',
    'lettre-resiliation.html': 'UtilitiesApplication', 'lettre-reclamation.html': 'UtilitiesApplication',
    'procuration.html': 'UtilitiesApplication', 'contrat-vente-vehicule.html': 'UtilitiesApplication',
    'pret-vehicule.html': 'UtilitiesApplication', 'declaration-sinistre.html': 'UtilitiesApplication',
}

def texte(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()

def entete(page):
    tete = page.split('</head>', 1)[0]
    t = re.search(r'<title>(.*?)</title>', tete, re.S)
    d = re.search(r'<meta name="description" content="([^"]*)"', tete)
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
    return (texte(t.group(1)) if t else ''), (texte(d.group(1)) if d else ''), (texte(h1.group(1)) if h1 else '')

def faq(page):
    """Questions fréquentes écrites en dur dans la page (pas celles fabriquées par le script JS)."""
    sans_js = re.sub(r'<script\b.*?</script>', '', page, flags=re.S)
    i = sans_js.find('Questions fréquentes</h2>')
    if i < 0: return []
    fin = sans_js.find('</section>', i)
    bloc = sans_js[i:fin if fin > 0 else None]
    paires = re.findall(r'<details[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>', bloc, re.S)
    return [(texte(q), texte(r)) for q, r in paires if texte(q) and texte(r)]

def bloc_outil(fichier, page, categorie):
    titre, desc, h1 = entete(page)
    nom = h1 or re.sub(r'\s*[–-]\s*DocuPrêt$', '', titre)
    adresse = URL + fichier
    graphe = [
        {'@type': 'WebApplication', '@id': adresse + '#outil', 'name': nom, 'url': adresse,
         'description': desc, 'applicationCategory': categorie, 'operatingSystem': 'Tous (navigateur web)',
         'inLanguage': 'fr-FR', 'isAccessibleForFree': True,
         'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'},
         'publisher': {'@id': URL + '#editeur'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': URL},
            {'@type': 'ListItem', 'position': 2, 'name': nom, 'item': adresse}]},
    ]
    q = faq(page)
    if q:
        graphe.append({'@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': a, 'acceptedAnswer': {'@type': 'Answer', 'text': b}} for a, b in q]})
    return {'@context': 'https://schema.org', '@graph': graphe}

def bloc_accueil():
    return {'@context': 'https://schema.org', '@graph': [
        {'@type': 'WebSite', '@id': URL + '#site', 'name': 'DocuPrêt', 'url': URL, 'inLanguage': 'fr-FR',
         'publisher': {'@id': URL + '#editeur'}},
        {'@type': 'Organization', '@id': URL + '#editeur', 'name': 'DocuPrêt', 'url': URL,
         'logo': URL + 'apple-touch-icon.png'},
    ]}

def poser(page, donnees):
    js = json.dumps(donnees, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    b = f'<!--SEO-LD--><script type="application/ld+json">{js}</script><!--/SEO-LD-->'
    if '<!--SEO-LD-->' in page:
        return re.sub(r'<!--SEO-LD-->.*?<!--/SEO-LD-->', lambda m: b, page, count=1, flags=re.S)
    return page.replace('</head>', b + '\n</head>', 1)

def main():
    for fichier, cat in OUTILS.items():
        chemin = os.path.join(SITE, fichier)
        if not os.path.exists(chemin): continue
        page = open(chemin, encoding='utf-8').read()
        neuf = poser(page, bloc_outil(fichier, page, cat))
        if neuf != page: open(chemin, 'w', encoding='utf-8').write(neuf)
        print('   seo', fichier, f'({len(faq(page))} questions)')
    chemin = os.path.join(SITE, 'index.html')
    page = open(chemin, encoding='utf-8').read()
    neuf = poser(page, bloc_accueil())
    if neuf != page: open(chemin, 'w', encoding='utf-8').write(neuf)

if __name__ == '__main__':
    main()
