// Fabrique dico-fr.txt (dictionnaire du correcteur d'orthographe de DocuPrêt) à partir du dictionnaire
// Hunspell français « dictionary-fr » (Grammalecte / Dicollecte, licence MPL 2.0).
//   npm i dictionary-fr nspell   puis   node outils/dico/creer-dico.mjs chemin/vers/node_modules
// Toutes les formes (pluriels, féminins, conjugaisons) sont développées, sans les formes élidées (l', d'…),
// triées, puis écrites « par préfixe commun » : chaque ligne = 1 caractère (nombre de lettres reprises
// du mot précédent, codé à partir de « 0 ») + la fin du mot. Le navigateur reconstruit la liste en quelques ms.
import fs from 'fs'
import path from 'path'
import {createRequire} from 'module'
const nm = path.resolve(process.argv[2] || 'node_modules'), nspell = createRequire(path.join(nm, 'x.js'))('nspell'), racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const sp = nspell(fs.readFileSync(path.join(nm, 'dictionary-fr/index.aff')), fs.readFileSync(path.join(nm, 'dictionary-fr/index.dic')))
const mots = new Set()
for (let w of Object.keys(sp.data)){
  w = w.normalize('NFC')
  if (!w || /['’]/.test(w) || /[ᵉʳˢΩ0-9]/.test(w)) continue
  mots.add(w)
}
// Mots du métier absents du dictionnaire
'siret siren tva ht ttc iban bic urssaf rcs ok okay sms wifi'.split(' ').forEach(w => mots.add(w))
const l = [...mots].sort(); let prev = '', out = []
for (const w of l){ let k = 0; while (k < w.length && k < prev.length && k < 40 && w[k] === prev[k]) k++; out.push(String.fromCharCode(48 + k) + w.slice(k)); prev = w }
fs.writeFileSync(path.join(racine, 'dico-fr.txt'), out.join('\n'))
console.log(l.length, 'mots →', path.join(racine, 'dico-fr.txt'))
