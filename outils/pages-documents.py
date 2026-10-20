#!/usr/bin/env python3
"""DocuPrêt — fabrique une vraie page par document, à partir des deux pages modèles.

  facture.html  → facture.html, devis.html, recu.html, avoir.html
  lettre-demission.html → lettre-demission.html, attestation-hebergement.html, …
  (lettre.html n'est plus qu'une redirection : ne pas la modifier)

Chaque page a son propre titre, sa description pour Google, son grand titre et un court texte
de présentation : Google peut ainsi référencer chaque document séparément.
Le fonctionnement reste le même ; les anciennes adresses (facture.html?type=devis…) marchent toujours.

À relancer après chaque modification de facture.html ou de lettre-demission.html :
    python3 outils/pages-documents.py
"""
import os, re, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guides_documents import GUIDES
ICI = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.dirname(ICI)
URL = 'https://docupret.fr/'

FACTURES = {  # type: (fichier, titre, description, grand titre, titre du texte, texte)
 'facture': ('facture.html', 'Créer une facture gratuite en PDF – DocuPrêt',
   "Créez une facture professionnelle gratuite en ligne : mentions obligatoires, TVA ou franchise auto-entrepreneur, logo, numérotation. Téléchargez le PDF ou envoyez-la par e-mail.",
   'Créer une facture', 'Une facture gratuite, conforme et prête à envoyer',
   "Remplissez votre facture directement sur la page : vos coordonnées, celles de votre client et vos prestations. Les totaux, la TVA (ou la mention « TVA non applicable » des auto-entrepreneurs) et les mentions obligatoires sont calculés pour vous. Téléchargez ensuite le PDF ou envoyez-le par e-mail, gratuitement et sans inscription."),
 'devis': ('devis.html', 'Créer un devis gratuit en PDF – DocuPrêt',
   "Faites un devis professionnel gratuit en ligne : prestations, TVA, date de validité, case « Bon pour accord ». PDF prêt à envoyer, transformable en facture en un clic avec un compte.",
   'Créer un devis', 'Un devis clair, prêt à faire signer',
   "Présentez votre prix avant la prestation : détail des travaux, quantités, prix unitaires, TVA et date de validité. La case « Bon pour accord » est ajoutée pour la signature du client. Avec un compte gratuit, le devis accepté se transforme en facture en un clic."),
 'recu': ('recu.html', 'Créer un reçu de paiement gratuit en PDF – DocuPrêt',
   "Rédigez un reçu de paiement gratuit : montant reçu, date, moyen de paiement, détail des éléments payés. Tampon « Payé » inclus, PDF à imprimer ou à envoyer.",
   'Créer un reçu', 'Un reçu de paiement en quelques secondes',
   "Le reçu prouve qu'un client vous a bien payé : il indique la somme reçue, la date, le moyen de paiement et ce qui a été réglé. DocuPrêt rédige la phrase « déclare avoir reçu la somme de… » et ajoute le tampon « Payé ». Téléchargez-le en PDF ou envoyez-le par e-mail."),
 'avoir': ('avoir.html', 'Créer un avoir (facture d’avoir) gratuit en PDF – DocuPrêt',
   "Créez un avoir gratuit pour corriger ou annuler une facture : référence de la facture d'origine, motif, mode de remboursement. PDF conforme, prêt à envoyer.",
   'Créer un avoir', 'Corriger une facture avec un avoir',
   "Une facture déjà émise ne se modifie pas : on fait un avoir. Indiquez le numéro de la facture d'origine, le motif (remise, retour, erreur de facturation…) et la façon dont vous remboursez votre client. Le montant et la mention sont calculés automatiquement."),
}
LETTRES = {
 'demission': ('lettre-demission.html', 'Lettre de démission gratuite : 10 modèles à remplir – DocuPrêt',
   "Lettre de démission gratuite : 10 modèles (CDI, préavis, dispense, abandon de poste…) à remplir en ligne, puis à télécharger en PDF ou imprimer. Sans inscription.",
   'Lettre de démission', 'Votre lettre de démission, simple et correcte',
   "Choisissez le modèle qui correspond à votre situation, remplissez vos informations et celles de votre employeur : la lettre se rédige toute seule, avec les bonnes formules et la date de fin de préavis. Il ne reste qu'à la télécharger, l'imprimer et la signer."),
 'motivation': ('lettre-motivation.html', 'Lettre de motivation gratuite : 10 modèles à remplir – DocuPrêt',
   "Lettre de motivation gratuite : 10 modèles (candidature spontanée, alternance, premier emploi, reconversion…) à personnaliser en ligne et télécharger en PDF.",
   'Lettre de motivation', 'Une lettre de motivation qui donne envie',
   "Partez d'un modèle adapté à votre candidature (spontanée, réponse à une annonce, stage, alternance, reconversion) puis personnalisez-le : poste visé, entreprise, vos atouts. La mise en page est faite pour vous, prête à être envoyée en PDF."),
 'conges': ('demande-conges.html', 'Demande de congés : modèles de lettre gratuits – DocuPrêt',
   "Demande de congés payés, sans solde, parental ou pour événement familial : modèles de lettre gratuits à remplir en ligne, à imprimer ou envoyer en PDF.",
   'Demande de congés', 'Demander vos congés par écrit',
   "Congés payés, congé sans solde, congé parental ou pour un mariage : choisissez le modèle, indiquez les dates et votre responsable. La demande est rédigée proprement, pour garder une trace écrite de votre demande et de la réponse de votre employeur."),
 'rupture': ('rupture-conventionnelle.html', 'Rupture conventionnelle : modèles de lettre gratuits – DocuPrêt',
   "Modèles de lettre gratuits pour demander ou proposer une rupture conventionnelle, ou demander un entretien préalable. À remplir en ligne et télécharger en PDF.",
   'Rupture conventionnelle', 'Proposer une rupture conventionnelle',
   "La rupture conventionnelle se prépare souvent par un premier courrier : demande d'entretien, proposition ou réponse. Choisissez le modèle, complétez vos informations et téléchargez une lettre claire et courtoise, prête à remettre à votre employeur."),
 'preavis': ('preavis-locataire.html', 'Lettre de préavis locataire : 10 modèles gratuits – DocuPrêt',
   "Lettre de préavis de départ du locataire : préavis d'un mois ou de trois mois, zone tendue, mutation, perte d'emploi… 10 modèles gratuits à remplir et télécharger.",
   'Préavis du locataire', 'Quitter votre logement dans les règles',
   "Pour quitter un logement loué, le locataire envoie un préavis à son propriétaire. Selon votre situation (zone tendue, mutation, perte d'emploi, logement meublé…), le préavis peut être réduit à un mois : choisissez le bon modèle, il indique la date de fin de bail."),
 'hebergement': ('attestation-hebergement.html', "Attestation d'hébergement gratuite : 6 modèles à remplir – DocuPrêt",
   "Attestation d'hébergement gratuite pour la CAF, une préfecture, un dossier administratif ou bancaire : 6 modèles à remplir en ligne, à imprimer et signer.",
   "Attestation d'hébergement", "Attester que vous hébergez quelqu'un",
   "L'attestation d'hébergement permet à la personne que vous logez de justifier son adresse (CAF, carte d'identité, banque, inscription…). Indiquez qui héberge qui, à quelle adresse et depuis quand : le document est prêt à signer, avec la liste des pièces à joindre."),
 'honneur': ('attestation-sur-l-honneur.html', "Attestation sur l'honneur gratuite : 6 modèles – DocuPrêt",
   "Attestation sur l'honneur gratuite : modèles pour certifier une situation, un domicile, une absence de revenus, de condamnation… À remplir en ligne et télécharger en PDF.",
   "Attestation sur l'honneur", 'Une attestation sur l’honneur en quelques minutes',
   "L'attestation sur l'honneur sert à certifier par écrit une situation : domicile, ressources, célibat, absence de dettes… Choisissez le modèle, complétez vos informations et ce que vous attestez : la formule officielle et la mention des sanctions en cas de fausse déclaration sont incluses."),
 'resiliation': ('lettre-resiliation.html', 'Lettre de résiliation gratuite : 8 modèles – DocuPrêt',
   "Lettre de résiliation gratuite : box internet, forfait mobile, assurance, mutuelle, salle de sport, abonnement… 8 modèles à remplir en ligne et envoyer.",
   'Lettre de résiliation', 'Résilier un abonnement ou un contrat',
   "Box internet, forfait mobile, assurance, mutuelle, salle de sport ou abonnement : choisissez le modèle, indiquez votre numéro de contrat et la date souhaitée. La lettre cite les bonnes règles (loi Chatel, loi Hamon…) quand elles s'appliquent."),
 'reclamation': ('lettre-reclamation.html', 'Lettre de réclamation et mise en demeure : 6 modèles – DocuPrêt',
   "Lettre de réclamation ou de mise en demeure gratuite : remboursement, produit défectueux, livraison non reçue, travaux mal faits… 6 modèles à remplir et télécharger.",
   'Réclamation et mise en demeure', 'Faire valoir vos droits par écrit',
   "Produit défectueux, colis jamais livré, remboursement qui n'arrive pas, travaux mal faits : commencez par une réclamation, puis passez à la mise en demeure si rien ne bouge. Les modèles rappellent vos droits et fixent un délai de réponse."),
 'procuration': ('procuration.html', 'Procuration gratuite : 4 modèles à remplir – DocuPrêt',
   "Procuration gratuite : pouvoir pour retirer un colis, un recommandé, faire une démarche administrative ou bancaire. 4 modèles à remplir en ligne et à signer.",
   'Procuration', 'Donner pouvoir à une personne de confiance',
   "Une procuration autorise une autre personne à agir à votre place : retirer un colis ou un courrier recommandé, faire une démarche, signer un document. Précisez qui donne pouvoir, à qui, et pour quoi : il ne reste qu'à signer et joindre les copies des pièces d'identité."),
 'vente': ('contrat-vente-vehicule.html', 'Contrat de vente de véhicule entre particuliers gratuit – DocuPrêt',
   "Contrat de vente de voiture ou de moto entre particuliers gratuit : identité des parties, véhicule, prix, kilométrage, état. À remplir en ligne et signer en deux exemplaires.",
   'Contrat de vente de véhicule', 'Vendre votre véhicule en toute sérénité',
   "Entre particuliers, un contrat de vente écrit protège le vendeur comme l'acheteur : identité des deux parties, description du véhicule (immatriculation, kilométrage, état), prix et date de la vente. Complétez-le, imprimez-le en deux exemplaires et signez-le ensemble."),
 'pret': ('pret-vehicule.html', 'Autorisation de prêt de véhicule gratuite – DocuPrêt',
   "Autorisation de prêt de véhicule gratuite : pour prêter votre voiture à un proche, avec les dates, le véhicule et les conditions. À remplir en ligne et signer.",
   'Autorisation de prêt de véhicule', 'Prêter votre voiture avec une autorisation écrite',
   "Quand vous prêtez votre voiture, une autorisation écrite évite bien des soucis en cas de contrôle ou d'accident. Indiquez le véhicule, la personne autorisée à le conduire et la période du prêt : le document est prêt à signer par vous deux."),
 'sinistre': ('declaration-sinistre.html', "Déclaration de sinistre à l'assurance : 6 modèles de lettre – DocuPrêt",
   "Lettre de déclaration de sinistre à votre assurance : accident, dégât des eaux, vol, bris de glace, catastrophe naturelle… 6 modèles gratuits à remplir et envoyer.",
   'Déclaration de sinistre auto', 'Déclarer un sinistre à votre assurance',
   "Après un accident, un dégât des eaux, un vol ou un bris de glace, prévenez votre assurance par écrit dans les délais. Choisissez le modèle, indiquez votre numéro de contrat, la date et les circonstances : la lettre est prête à envoyer, avec la liste des pièces à joindre."),
 'quittance': ('quittance-loyer.html', 'Quittance de loyer gratuite à imprimer – DocuPrêt',
   "Quittance de loyer gratuite : loyer, charges, période, adresse du logement. Modèles à remplir en ligne par le propriétaire, à imprimer ou envoyer en PDF au locataire.",
   'Quittance de loyer', 'La quittance de loyer pour votre locataire',
   "Le propriétaire remet une quittance au locataire qui a payé son loyer : elle détaille le loyer, les charges et la période concernée. Remplissez-la une fois, puis changez seulement le mois : elle est prête à imprimer ou à envoyer en PDF."),
}
# Les lettres partent de lettre-demission.html (lettre.html n'est plus qu'une redirection vers les vraies pages)
FAMILLES = [('facture.html', FACTURES, 'facture', 'facture'), ('lettre-demission.html', LETTRES, 'lettre', 'demission')]

def bloc(type_, fichier, carte, prefixe_stats):
    u = {t: v[0] for t, v in carte.items()}
    return ('<!--PAGE-TYPE-->\n'
            f'<link rel="canonical" href="{URL}{fichier}">\n'
            f'<script>window.DOCU_TYPE_PAGE={json.dumps(type_)};window.DOCU_PAGE_STATS={json.dumps(prefixe_stats + "_" + type_)};'
            f'window.DOCU_URL_TYPE={json.dumps(u)};'
            "(function(){try{var q=new URLSearchParams(location.search).get('type');if(q&&window.DOCU_URL_TYPE[q])document.querySelector('link[rel=canonical]').href='" + URL + "'+window.DOCU_URL_TYPE[q];}catch(e){}})();</script>\n"
            '<!--/PAGE-TYPE-->')

def remplacer_attr(s, motif, valeur):
    v = valeur.replace('&', '&amp;').replace('"', '&quot;')
    return re.sub(motif, lambda m: m.group(1) + v + m.group(2), s, count=1)

def faq_statique(modele_txt):
    """Questions fréquentes des lettres : déjà écrites dans la page (et non plus seulement ajoutées par le script)."""
    try:
        import subprocess
        i = modele_txt.index('const FAQ = {'); j = modele_txt.index('\n  };', i) + 4
        code = modele_txt[i:j] + '\nprocess.stdout.write(JSON.stringify(FAQ));'
        return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)
    except Exception:
        return {}

def fabriquer(modele_txt, type_, infos, carte, prefixe):
    fichier, titre, desc, h1, h2, texte = infos
    s = modele_txt
    s = re.sub(r'<!--PAGE-TYPE-->.*?<!--/PAGE-TYPE-->', lambda m: bloc(type_, fichier, carte, prefixe), s, count=1, flags=re.S)
    s = re.sub(r'<title>.*?</title>', '<title>' + titre.replace('&', '&amp;') + '</title>', s, count=1)
    s = remplacer_attr(s, r'(<meta name="description" content=")[^"]*(">)', desc)
    s = remplacer_attr(s, r'(<meta property="og:title" content=")[^"]*(">)', titre)
    s = remplacer_attr(s, r'(<meta property="og:description" content=")[^"]*(">)', desc)
    s = re.sub(r'<meta property="og:url" content="[^"]*">\n?', '', s)
    s = s.replace('<meta property="og:type" content="website">', f'<meta property="og:type" content="website">\n<meta property="og:url" content="{URL}{fichier}">', 1)
    s = re.sub(r'(<h1 id="titre">)[^<]*(</h1>)', lambda m: m.group(1) + h1 + m.group(2), s, count=1)
    presentation = f'<!--PRESENTATION--><section class="presentation-doc"><h2>{h2}</h2><p>{texte}</p></section><!--/PRESENTATION-->'
    s = re.sub(r'<!--PRESENTATION-->.*?<!--/PRESENTATION-->', lambda m: presentation, s, count=1, flags=re.S)
    faq = faq_statique(modele_txt).get(type_)
    if faq:
        s = re.sub(r'<section class="faq" id="faq">.*?</section>', lambda m: '<section class="faq" id="faq"><h2>Questions fréquentes</h2>' + ''.join(f'<details><summary>{q}</summary><p>{r}</p></details>' for q, r in faq) + '</section>', s, count=1, flags=re.S)
    # Guide détaillé sous le document (texte utile pour les visiteurs et pour Google)
    g = GUIDES.get(type_ if prefixe == 'facture' else prefixe + '_' + type_, '')
    s = re.sub(r'<!--GUIDE-->.*?<!--/GUIDE-->', lambda m: '<!--GUIDE-->' + (f'<section class="guide-doc">{g}</section>' if g else '') + '<!--/GUIDE-->', s, count=1, flags=re.S)
    return s

def main():
    for modele, carte, prefixe, type_modele in FAMILLES:
        chemin = os.path.join(SITE, modele)
        base = open(chemin, encoding='utf-8').read()
        assert '<!--PAGE-TYPE-->' in base and '<!--PRESENTATION-->' in base and '<!--GUIDE-->' in base, modele + ' : repères manquants'
        for type_, infos in carte.items():
            page = fabriquer(base, type_, infos, carte, prefixe)
            open(os.path.join(SITE, infos[0]), 'w', encoding='utf-8').write(page)
            print('  ', infos[0])
        # la page modèle elle-même (si elle n'est pas déjà une des pages ci-dessus)
        if modele not in [v[0] for v in carte.values()]:
            open(chemin, 'w', encoding='utf-8').write(fabriquer(base, type_modele, carte[type_modele], carte, prefixe).replace(
                f'<link rel="canonical" href="{URL}{carte[type_modele][0]}">', f'<link rel="canonical" href="{URL}{carte[type_modele][0]}">', 1))
            print('  ', modele, '(modèle)')

if __name__ == '__main__':
    main()
