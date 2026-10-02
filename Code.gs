/**
 * Cours particuliers — Jawad & Leila (v3)
 * Modèle : un COURS = enfant + matière + prof + forfait mensuel + nb de séances/mois.
 * Onglets créés automatiquement : Enfants, Cours, Sessions, Versements, Ecole, Config, CalSync.
 *
 * Version optimisée : le classeur, chaque onglet et chaque lecture sont mis en mémoire
 * pendant UNE exécution (voir "Cache par exécution"), au lieu d'être relus des dizaines
 * de fois à chaque action.
 */
const SS_ID = '1l-Em-TfMp8jS5kFfntUfnyPYZghl7BHvcUCUvZ6oM8Y';
// Agenda PARTAGÉ "Famille" : tous les événements (cours + lycée) sont créés directement
// dessus, au lieu du calendrier personnel de celui qui exécute le script. Comme c'est un
// agenda partagé unique (pas des copies individuelles par invité), tout le monde le voit
// sans avoir à accepter d'invitation, et les rappels programmés s'appliquent par défaut
// pour tous les abonnés (sauf si l'un d'eux les a personnellement désactivés).
const FAMILLE_CAL_ID = 'family07166730596940913601@group.calendar.google.com';
const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const SHEETS = {
  Enfants:    ['ID', 'Nom', 'Photo', 'Email'],
  Cours:      ['ID', 'EnfantID', 'Matiere', 'Prof', 'PrixMois', 'SeancesMois', 'Jours', 'Heure'],
  Sessions:   ['ID', 'Date', 'CoursID', 'Statut', 'Note'],
  Versements: ['ID', 'Date', 'CoursID', 'Mois', 'Montant', 'Mode', 'Note'],
  Ecole:      ['ID', 'EnfantID', 'Jour', 'Horaire', 'Matiere'],
  Config:     ['Cle', 'Valeur'],
  CalSync:    ['Cle', 'EventId']
};
// Colonnes gardées en texte (évite la conversion automatique des dates)
const TEXT_COLS = {
  Enfants: [1, 2, 3, 4],
  Cours: [1, 2, 3, 4, 7, 8],
  Sessions: [1, 2, 3, 4, 5],
  Versements: [1, 2, 3, 4, 6, 7],
  Ecole: [1, 2, 3, 4, 5],
  Config: [1, 2],
  CalSync: [1, 2]
};

// ===================== ICÔNES PWA =====================
// Liens directs vers les icônes hébergées sur GitHub Pages (plus besoin de data URI).
const ICON_BASE = 'https://rayanem-dev.github.io/coursup/';
const ICON_192 = ICON_BASE + 'icon-192.png';
const ICON_512 = ICON_BASE + 'icon-512.png';
const ICON_192_MASK = ICON_BASE + 'icon-192-maskable.png';
const ICON_512_MASK = ICON_BASE + 'icon-512-maskable.png';
// =======================================================================================

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.sw === '1') {
    return ContentService.createTextOutput(
      // Service worker minimal — sert uniquement à rendre le site "installable"
      // (condition technique des navigateurs). Aucune mise en cache forcée :
      // chaque page continue d'être chargée normalement depuis le réseau,
      // donc les mises à jour du site restent visibles immédiatement.
      "self.addEventListener('install',function(ev){self.skipWaiting();});" +
      "self.addEventListener('activate',function(ev){ev.waitUntil(self.clients.claim());});" +
      "self.addEventListener('fetch',function(ev){ev.respondWith(fetch(ev.request));});"
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  if (p.manifest === '1') {
    const manifest = {
      name: 'Cours particuliers',
      short_name: 'Cours',
      description: 'Suivi des cours particuliers — Jawad & Leila',
      start_url: ScriptApp.getService().getUrl(),
      scope: ScriptApp.getService().getUrl(),
      display: 'standalone',
      background_color: '#f5f6fa',
      theme_color: '#3b5bdb',
      orientation: 'any',
      icons: [
        { src: ICON_192, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: ICON_192_MASK, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: ICON_512_MASK, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ].filter(ic => ic.src)
    };
    return ContentService.createTextOutput(JSON.stringify(manifest))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (p.api) return handleApi_(p.api, p.args ? JSON.parse(p.args) : []);
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Cours particuliers')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Point d'entrée POST, utilisé uniquement pour l'upload de photo (voir saveEnfantPhoto).
 * En GET, l'image en base64 devrait passer dans l'URL (?args=...), ce qui est trop
 * volumineux et limité en taille. En POST avec Content-Type "text/plain", le navigateur
 * n'envoie pas de requête préliminaire CORS (OPTIONS), que les Web Apps Apps Script ne
 * savent pas gérer — d'où ce choix plutôt qu'un vrai POST JSON classique.
 */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return handleApi_(body.api, body.args || []);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * API JSON pour un client externe (ex. la version hébergée sur GitHub Pages),
 * qui ne peut pas utiliser google.script.run. Appelée via GET :
 *   .../exec?api=NomDeLaFonction&args=%5B...JSON...%5D
 * En GET simple (pas de POST JSON) pour éviter le préflight CORS, que les
 * Web Apps Apps Script ne savent pas gérer.
 */
const API_FNS = {
  getData, saveEnfant, saveCours, saveSeance, deleteSeance,
  savePaiement, deletePaiement, reporterSeance, deleteCours,
  deleteEnfant, listDrive, getEcole, saveEcole, deleteEcole,
  importEcoleDepuisLycee, saveConfig, syncCalendrierManuel, resyncCalendrier,
  supprimerToutesAlertes, testAlerte, saveEnfantPhoto, supprimerDoublons
};

/** Réglages simples (emails parents + préférences de rappel), stockés hors feuille de calcul. */
function getConfig() {
  const p = PropertiesService.getScriptProperties();
  return {
    emailPere: p.getProperty('emailPere') || '',
    emailMere: p.getProperty('emailMere') || '',
    veille: p.getProperty('rappelVeille') === '1',
    matin: p.getProperty('rappelMatin') === '1',
    uneHeure: p.getProperty('rappel1h') === '1',
    // Lycée : deux réglages INDÉPENDANTS, tous les deux désactivés par défaut.
    // - ecoleAgenda : ajoute (ou non) les cours du lycée à l'agenda. Si désactivé (par défaut),
    //   RIEN n'est créé dans Google Agenda pour le lycée — aucun événement du tout.
    // - ecoleAlerte : si (et seulement si) ecoleAgenda est activé, ajoute en plus un rappel
    //   (veille / matin, comme pour les cours particuliers) sur ces événements. Sans effet si
    //   ecoleAgenda est désactivé.
    // Dans les deux cas, seul l'enfant concerné est invité : les parents ne sont jamais
    // invités sur les événements du lycée.
    ecoleAgenda: p.getProperty('ecoleAgenda') === '1',
    ecoleAlerte: p.getProperty('rappelEcole') === '1',
    // Rappel de fin de cours particulier ("récupération des enfants"), 30 min avant la
    // fin de la séance. Activé par défaut. Sans effet sur le lycée.
    rappelFin: p.getProperty('rappelFin') !== '0'
  };
}
function saveConfig(o) {
  const p = PropertiesService.getScriptProperties();
  if (o.emailPere !== undefined) p.setProperty('emailPere', String(o.emailPere || '').trim());
  if (o.emailMere !== undefined) p.setProperty('emailMere', String(o.emailMere || '').trim());
  if (o.veille !== undefined) p.setProperty('rappelVeille', o.veille ? '1' : '0');
  if (o.matin !== undefined) p.setProperty('rappelMatin', o.matin ? '1' : '0');
  if (o.uneHeure !== undefined) p.setProperty('rappel1h', o.uneHeure ? '1' : '0');
  if (o.ecoleAgenda !== undefined) p.setProperty('ecoleAgenda', o.ecoleAgenda ? '1' : '0');
  if (o.ecoleAlerte !== undefined) p.setProperty('rappelEcole', o.ecoleAlerte ? '1' : '0');
  if (o.rappelFin !== undefined) p.setProperty('rappelFin', o.rappelFin ? '1' : '0');
  return getData();
}

/** Ajoute ou modifie un créneau d'emploi du temps du lycée (modifiable à tout moment, contrairement à la feuille externe). */
function saveEcole(o) {
  if (o.ID) update_('Ecole', o.ID, o);
  else append_('Ecole', Object.assign({ ID: id_() }, o));
  return getData();
}
function deleteEcole(id) { delete_('Ecole', id); return getData(); }

/**
 * Importe les créneaux depuis la feuille officielle du lycée (lecture seule)
 * vers notre propre onglet "Ecole", pour l'enfant donné. Après import, tout redevient
 * librement modifiable dans l'appli (ça ne re-synchronise pas avec la feuille externe).
 * Ré-importable sans risque : les anciens créneaux de cet enfant sont d'abord effacés,
 * donc cliquer plusieurs fois ne crée jamais de doublons.
 */
function importEcoleDepuisLycee(enfantId) {
  deleteWhere_('Ecole', 'EnfantID', enfantId);
  const raw = getEcole();
  const dayMap = { Dimanche: 'Dim', Lundi: 'Lun', Mardi: 'Mar', Mercredi: 'Mer', Jeudi: 'Jeu', Vendredi: 'Ven', Samedi: 'Sam' };
  const p2 = n => (n < 10 ? '0' : '') + n;
  const rows = [];
  raw.forEach(cls => {
    cls.jours.forEach(j => {
      const m = String(j.jour).match(/\(([^)]+)\)/);
      const fr = (m ? m[1] : j.jour).trim();
      const abbr = dayMap[fr] || fr.slice(0, 3);
      j.creneaux.forEach(cr => {
        const t = String(cr.heure).match(/(\d{1,2})\s*[h:]\s*(\d{2})?\s*-\s*(\d{1,2})\s*[h:]\s*(\d{2})?/);
        if (!t) return;
        const debut = p2(+t[1]) + ':' + p2(+(t[2] || 0));
        const fin = p2(+t[3]) + ':' + p2(+(t[4] || 0));
        // Un seul champ texte "HH:MM-HH:MM" (comme Cours.Heure) : un "08:00" tout seul
        // dans sa propre colonne est vu comme une heure par Sheets et se transforme en
        // date-heure (bug déjà rencontré) ; la forme combinée reste du texte fiable.
        rows.push([id_(), enfantId, abbr, debut + '-' + fin, cr.matiere]);
      });
    });
  });
  // Écriture en UNE seule opération (au lieu d'un appendRow par créneau).
  if (rows.length) {
    const s = sh_('Ecole');
    s.getRange(s.getLastRow() + 1, 1, rows.length, SHEETS.Ecole.length).setValues(rows);
    inval_('Ecole');
  }
  return getData();
}

/** Feuille Google Sheets contenant l'emploi du temps du lycée (lecture seule, gratuit — pas de prix/paiement ici). */
const ECOLE_SS_ID = '1d20ktpN59JTpQZ1014cPrkzTeQJyGNbJb5i_AIsn-Lg';

/**
 * Lit et parse l'emploi du temps du lycée (une grille Jour × créneaux horaires,
 * comme généré par l'administration). Cherche automatiquement la ligne d'en-tête
 * (celle qui contient "Jour") pour rester robuste si d'autres onglets/classes sont
 * ajoutés dans le même classeur, un par enfant par exemple.
 */
function getEcole() {
  const ss = SpreadsheetApp.openById(ECOLE_SS_ID);
  const out = [];
  ss.getSheets().forEach(sheet => {
    const values = sheet.getDataRange().getDisplayValues();
    let headerRow = -1, headerCol = -1;
    for (let r = 0; r < values.length && headerRow < 0; r++) {
      for (let c = 0; c < values[r].length; c++) {
        if (String(values[r][c]).trim().toLowerCase() === 'jour') { headerRow = r; headerCol = c; break; }
      }
    }
    if (headerRow < 0) return; // cet onglet ne suit pas ce format, on l'ignore

    const slots = [];
    for (let c = headerCol + 1; c < values[headerRow].length; c++) {
      const v = String(values[headerRow][c] || '').trim();
      if (!v) break;
      slots.push(v);
    }

    const jours = [];
    for (let r = headerRow + 1; r < values.length; r++) {
      const jourName = String(values[r][headerCol] || '').trim();
      if (!jourName) break;
      const creneaux = slots.map((heure, i) => ({
        heure: heure,
        matiere: String(values[r][headerCol + 1 + i] || '').trim()
      })).filter(x => x.matiere && x.matiere !== '-');
      jours.push({ jour: jourName, creneaux: creneaux });
    }

    let titre = sheet.getName();
    for (let r = 0; r < headerRow; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const v = String(values[r][c] || '');
        if (v.indexOf('Classe') >= 0) titre = v.trim();
      }
    }

    out.push({ nom: sheet.getName(), titre: titre, jours: jours });
  });
  return out;
}

function handleApi_(fnName, args) {
  var out;
  try {
    const fn = API_FNS[fnName];
    if (!fn) throw new Error('Action API inconnue : ' + fnName);
    out = { ok: true, data: fn.apply(null, args || []) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

const PHOTO_FOLDER_NAME = 'Photos — Cours particuliers';
/**
 * À exécuter UNE SEULE FOIS manuellement depuis l'éditeur Apps Script (bouton ▶ Exécuter),
 * jamais depuis l'appli. Sert uniquement à déclencher l'écran d'autorisation Google pour
 * le nouvel accès à Drive (création de dossier/fichier, partage) utilisé par la photo
 * des enfants. Sans ça, le Web App renvoie "Vous n'êtes pas autorisé à appeler DriveApp...".
 */
function autoriserDrive() {
  const folder = DriveApp.getRootFolder();
  Logger.log('Accès Drive (lecture) OK : ' + folder.getName());
}

/**
 * Test plus complet que autoriserDrive() : reproduit EXACTEMENT ce que fait
 * saveEnfantPhoto (créer un dossier, créer un fichier dedans, le partager), pour
 * forcer la vraie demande d'autorisation d'ÉCRITURE Drive (autoriserDrive() ne
 * teste que la lecture, ce qui n'est pas suffisant). Le fichier de test est
 * supprimé (mis à la corbeille) à la fin. À exécuter manuellement depuis l'éditeur.
 */
function testUploadPhoto() {
  const folder = getPhotoFolder_();
  Logger.log('Dossier OK : ' + folder.getName() + ' (' + folder.getId() + ')');
  const blob = Utilities.newBlob('test', 'text/plain', 'test_upload.txt');
  const file = folder.createFile(blob);
  Logger.log('Fichier créé OK : ' + file.getId());
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Partage OK. URL : https://lh3.googleusercontent.com/d/' + file.getId());
  file.setTrashed(true);
  Logger.log('Nettoyage OK — tout fonctionne.');
}

function getPhotoFolder_() {
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

/**
 * Enregistre la photo d'un enfant. Contrairement à avant, l'image n'est PAS stockée
 * en base64 dans le tableur (ça alourdirait "getData" — donc CHAQUE chargement de
 * l'appli — d'autant plus qu'une photo). Elle est envoyée dans un dossier Drive dédié,
 * partagée en lecture via lien, et seule cette URL (quelques dizaines de caractères)
 * est gardée dans la colonne "Photo". Le navigateur charge ensuite l'image à part,
 * en parallèle et en "lazy loading", sans bloquer le reste de l'appli.
 * L'ancienne photo de cet enfant (s'il y en avait une) est supprimée du Drive.
 */
function saveEnfantPhoto(enfantId, dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Image invalide');
  const mimeType = m[1];
  const ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const bytes = Utilities.base64Decode(m[2]);
  const blob = Utilities.newBlob(bytes, mimeType, 'photo_' + enfantId + '.' + ext);

  const folder = getPhotoFolder_();
  // Supprime les anciennes photos de cet enfant (même si l'extension a changé)
  ['jpg', 'jpeg', 'png', 'webp', 'gif'].forEach(function (e2) {
    const it = folder.getFilesByName('photo_' + enfantId + '.' + e2);
    while (it.hasNext()) it.next().setTrashed(true);
  });

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://lh3.googleusercontent.com/d/' + file.getId();

  update_('Enfants', enfantId, { Photo: url });
  return getData();
}

function id_() { return Utilities.getUuid().slice(0, 8); }

/* ===================== Cache par exécution =====================
 * Les variables globales sont remises à zéro à chaque appel du Web App : ce cache ne
 * peut donc jamais servir des données périmées d'un appel à l'autre. Au sein d'un même
 * appel, il évite de rouvrir le classeur et de relire les mêmes onglets des dizaines de
 * fois (getData -> ensureCycles_ -> cycleStarts_ / planPeriod_ le faisaient par cours).
 * Toute écriture passe par append_/update_/delete_/deleteWhere_ (ou appelle inval_).
 */
let SS_ = null;
const SHEET_CACHE_ = {};
const READ_CACHE_ = {};
function ss_() { return SS_ || (SS_ = SpreadsheetApp.openById(SS_ID)); }
function inval_(name) { delete READ_CACHE_[name]; }

function sh_(name) {
  if (SHEET_CACHE_[name]) return SHEET_CACHE_[name];
  const ss = ss_();
  let s = ss.getSheetByName(name);
  const want = SHEETS[name];
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
    s.setFrozenRows(1);
    TEXT_COLS[name].forEach(c => s.getRange(1, c, s.getMaxRows(), 1).setNumberFormat('@'));
  } else {
    // Migration douce : ajoute les colonnes manquantes (ex. "Photo") à une feuille déjà existante.
    const have = s.getLastColumn() ? s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0] : [];
    want.forEach((h, i) => {
      if (have[i] !== h) {
        s.getRange(1, i + 1).setValue(h).setFontWeight('bold');
        if (TEXT_COLS[name].indexOf(i + 1) >= 0) s.getRange(1, i + 1, s.getMaxRows(), 1).setNumberFormat('@');
      }
    });
    // Si le schéma a rétréci (ex. Debut+Fin fusionnés en Horaire), supprime les colonnes
    // devenues inutiles : sinon leur en-tête reste dupliqué (deux colonnes "Matiere" par
    // exemple) et read_() écrase silencieusement la bonne valeur avec la colonne vide.
    if (s.getLastColumn() > want.length) {
      s.deleteColumns(want.length + 1, s.getLastColumn() - want.length);
    }
  }
  return (SHEET_CACHE_[name] = s);
}

function read_(name) {
  if (READ_CACHE_[name]) return READ_CACHE_[name];
  const v = sh_(name).getDataRange().getValues();
  const h = v.shift();
  const tz = Session.getScriptTimeZone();
  return (READ_CACHE_[name] = v.filter(r => r[0] !== '').map(r => {
    const o = {};
    h.forEach((k, i) => {
      let x = r[i];
      if (x instanceof Date) x = Utilities.formatDate(x, tz, 'yyyy-MM-dd');
      o[k] = x;
    });
    return o;
  }));
}

function append_(name, o) {
  sh_(name).appendRow(SHEETS[name].map(k => o[k] === undefined ? '' : o[k]));
  inval_(name);
}

function update_(name, id, o) {
  const s = sh_(name);
  const v = s.getDataRange().getValues();
  const h = v[0];
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(id)) {
      h.forEach((k, j) => {
        if (k !== 'ID' && o[k] !== undefined) s.getRange(i + 1, j + 1).setValue(o[k]);
      });
      inval_(name);
      return;
    }
  }
}

function delete_(name, id) {
  const s = sh_(name);
  const v = s.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(id)) { deleteRowSafe_(s, i + 1, v[0].length); inval_(name); return; }
  }
}

/**
 * Supprime la ligne `row`, sauf si c'est la toute dernière ligne non figée restante :
 * Google Sheets refuse alors la suppression ("impossible de supprimer toutes les lignes
 * non figées"), car il doit toujours rester au moins une ligne non figée. Dans ce cas on
 * se contente de vider son contenu — read_() ignore de toute façon les lignes dont la
 * 1ère colonne est vide, donc l'effet est le même pour le reste de l'appli.
 */
function deleteRowSafe_(s, row, nbCols) {
  try {
    s.deleteRow(row);
  } catch (e) {
    s.getRange(row, 1, 1, nbCols).clearContent();
  }
}

function fmt_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function addMonth_(s, n) {
  const p = s.split('-').map(Number);
  const last = new Date(p[0], p[1] - 1 + n + 1, 0).getDate();
  return fmt_(new Date(p[0], p[1] - 1 + n, Math.min(p[2], last)));
}

function pstart_(x) {
  const m = String(x.Mois || x.Date).slice(0, 10);
  return m.length === 7 ? m + '-01' : m;
}

/** Dates de début de chaque cycle connu pour un cours (déduites des paiements, sinon de la 1ère séance). */
function cycleStarts_(cId) {
  const pays = read_('Versements').filter(x => String(x.CoursID) === String(cId)).map(pstart_);
  let starts = Array.from(new Set(pays)).sort();
  if (!starts.length) {
    const sess = read_('Sessions')
      .filter(s => String(s.CoursID) === String(cId) && (s.Statut === 'Faite' || s.Statut === 'Prévue'))
      .map(s => String(s.Date).slice(0, 10)).sort();
    if (!sess.length) return [];
    starts = [sess[0]];
  }
  return starts;
}

/**
 * Étend automatiquement chaque cours jusqu'au cycle en cours : dès qu'un cycle se termine,
 * le suivant est planifié tout seul (séances "Prévue" générées selon les jours habituels).
 * Si un cours n'a pas de jours habituels définis, on ne peut rien planifier automatiquement :
 * l'interface le signale plutôt que de deviner.
 */
function ensureCycles_() {
  const t = fmt_(new Date());
  read_('Cours').forEach(c => {
    if (!String(c.Jours || '').trim()) return;
    const starts = cycleStarts_(c.ID);
    if (!starts.length) return;
    let cur = starts[starts.length - 1];
    while (addMonth_(cur, 1) <= t) cur = addMonth_(cur, 1);
    planPeriod_(c, cur);
  });
}

/**
 * Planifie les cycles sous verrou : sans ça, deux appareils qui ouvrent l'appli en même
 * temps (ex. papa et maman) pouvaient chacun créer les mêmes séances "Prévue" -> séances
 * en double -> événements et notifications en double. Si le verrou est déjà pris, on
 * saute simplement la planification (l'autre appel s'en charge) et on se contente de lire.
 */
function ensureCyclesVerrou_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    ['Cours', 'Sessions', 'Versements'].forEach(inval_); // relire à jour une fois le verrou obtenu
    ensureCycles_();
  } finally {
    lock.releaseLock();
  }
}

function getData() {
  const existed = !!ss_().getSheetByName('Enfants');
  let enfants = read_('Enfants');
  if (!existed && !enfants.length) {
    append_('Enfants', { ID: id_(), Nom: 'Jawad' });
    append_('Enfants', { ID: id_(), Nom: 'Leila' });
    enfants = read_('Enfants');
  }
  ensureCyclesVerrou_();
  return {
    enfants: enfants,
    cours: read_('Cours'),
    seances: read_('Sessions'),
    paiements: read_('Versements'),
    ecole: read_('Ecole'),
    config: getConfig()
  };
}

function saveEnfant(o) {
  if (o.ID) update_('Enfants', o.ID, o);
  else append_('Enfants', Object.assign({ ID: id_() }, o));
  return getData();
}

/**
 * Planifie les séances "Prévue" d'un cours sur un mois à partir de `start` (yyyy-MM-dd),
 * selon ses jours habituels, jusqu'à atteindre SeancesMois séances. Sans doublon.
 */
function planPeriod_(c, start) {
  const days = String(c.Jours || '').split(',').map(x => DAYS.indexOf(x.trim())).filter(i => i >= 0);
  if (!days.length || !start) return 0;
  start = String(start).slice(0, 10);
  const n = Number(c.SeancesMois) || 8;
  const end = addMonth_(start, 1);
  const all = read_('Sessions').filter(s => String(s.CoursID) === String(c.ID));
  const taken = new Set(all.map(s => String(s.Date).slice(0, 10)));
  let count = all.filter(s => {
    const d = String(s.Date).slice(0, 10);
    return d >= start && d < end && (s.Statut === 'Faite' || s.Statut === 'Prévue');
  }).length;
  const p = start.split('-').map(Number);
  const rows = [];
  for (let i = 0; i < 62 && count < n; i++) {
    const dt = new Date(p[0], p[1] - 1, p[2] + i);
    const ds = fmt_(dt);
    if (ds >= end) break;
    if (days.indexOf(dt.getDay()) < 0 || taken.has(ds)) continue;
    rows.push([id_(), ds, c.ID, 'Prévue', '']);
    count++;
  }
  if (rows.length) {
    const s = sh_('Sessions');
    s.getRange(s.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
    inval_('Sessions');
  }
  return rows.length;
}

/** Crée ou modifie un cours. À la création, génère les séances du 1er mois à partir de `debut`. */
function saveCours(o, debut) {
  if (o.ID) {
    update_('Cours', o.ID, o);
  } else {
    o.ID = id_();
    append_('Cours', o);
    SpreadsheetApp.flush();
    if (debut) planPeriod_(o, debut);
  }
  return getData();
}

/** Séance non faite : la marque "Reportée" et crée une nouvelle séance prévue à la nouvelle date. */
function reporterSeance(id, newDate) {
  const s = read_('Sessions').find(x => String(x.ID) === String(id));
  if (!s) throw new Error('Séance introuvable');
  update_('Sessions', id, { Statut: 'Reportée', Note: 'reportée au ' + newDate });
  append_('Sessions', {
    ID: id_(), Date: newDate, CoursID: s.CoursID, Statut: 'Prévue',
    Note: 'reportée du ' + String(s.Date).slice(0, 10)
  });
  return getData();
}

function saveSeance(o) {
  if (o.ID) update_('Sessions', o.ID, o);
  else append_('Sessions', Object.assign({ ID: id_() }, o));
  return getData();
}
function deleteSeance(id) { delete_('Sessions', id); return getData(); }

/** Enregistre un paiement. À la création, planifie les séances de la période payée (début = champ Mois). */
function savePaiement(o) {
  if (o.ID) {
    update_('Versements', o.ID, o);
  } else {
    append_('Versements', Object.assign({ ID: id_() }, o));
    SpreadsheetApp.flush();
    const c = read_('Cours').find(x => String(x.ID) === String(o.CoursID));
    if (c) planPeriod_(c, o.Mois || o.Date);
  }
  return getData();
}
function deletePaiement(id) { delete_('Versements', id); return getData(); }

/** Supprime toutes les lignes d'un onglet dont la colonne `col` vaut `val`. */
function deleteWhere_(name, col, val) {
  const s = sh_(name);
  const v = s.getDataRange().getValues();
  const j = v[0].indexOf(col);
  if (j < 0) return;
  for (let i = v.length - 1; i >= 1; i--) {
    if (String(v[i][j]) === String(val)) deleteRowSafe_(s, i + 1, v[0].length);
  }
  inval_(name);
}

/** Supprime un cours avec ses séances et ses paiements. */
function deleteCours(id) {
  deleteWhere_('Sessions', 'CoursID', id);
  deleteWhere_('Versements', 'CoursID', id);
  delete_('Cours', id);
  return getData();
}

/** Supprime un enfant avec tous ses cours, séances et paiements. */
function deleteEnfant(id) {
  read_('Cours').filter(c => String(c.EnfantID) === String(id)).forEach(c => {
    deleteWhere_('Sessions', 'CoursID', c.ID);
    deleteWhere_('Versements', 'CoursID', c.ID);
  });
  deleteWhere_('Cours', 'EnfantID', id);
  delete_('Enfants', id);
  return getData();
}

/** Dossier Drive racine de l'onglet "Sujets" (parcours de fichiers de cours). */
const SUJET_ROOT_ID = '1pGH1yb-KfAe83wlCUqxJh6Vj8c9RtkWu';

/**
 * Liste le contenu (sous-dossiers + fichiers) d'un dossier Drive.
 * Appelé depuis le client pour naviguer dans l'onglet "Sujets".
 */
function listDrive(folderId) {
  const folder = DriveApp.getFolderById(folderId || SUJET_ROOT_ID);
  const tz = Session.getScriptTimeZone();
  const out = { id: folder.getId(), name: folder.getName(), folders: [], files: [] };

  const fIt = folder.getFolders();
  while (fIt.hasNext()) {
    const f = fIt.next();
    out.folders.push({ id: f.getId(), name: f.getName() });
  }
  const fileIt = folder.getFiles();
  while (fileIt.hasNext()) {
    const file = fileIt.next();
    out.files.push({
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      url: file.getUrl(),
      size: file.getSize(),
      updated: Utilities.formatDate(file.getLastUpdated(), tz, 'yyyy-MM-dd')
    });
  }
  out.folders.sort((a, b) => a.name.localeCompare(b.name));
  out.files.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/* ===================== Rappels via Google Agenda =====================
 * Au lieu d'un email, on crée de vrais événements dans l'agenda Google PARTAGÉ
 * "Famille" (voir FAMILLE_CAL_ID), avec des rappels natifs (popup + alarme sur
 * le téléphone via l'appli Agenda). Comme c'est un agenda partagé unique, tout
 * abonné le voit directement, sans invitation individuelle à accepter.
 * Trois rappels possibles (indépendants, réglables dans Réglages) :
 *  - la veille (1 jour avant, popup Agenda)
 *  - le matin même (~7h00, popup Agenda)
 *  - 1h avant : uniquement pour les cours particuliers PAYANTS (pas le lycée,
 *    qui est gratuit)
 * Un tableau "CalSync" retient quel événement Agenda a déjà été créé pour
 * quelle séance/quel créneau, pour ne jamais dupliquer en resynchronisant.
 */

/** L'agenda partagé "Famille" où sont créés tous les événements. Le compte qui exécute
 *  le script doit y avoir un accès "Apporter des modifications et gérer le partage". */
function familleCal_() {
  const cal = CalendarApp.getCalendarById(FAMILLE_CAL_ID);
  if (!cal) throw new Error('Agenda "Famille" introuvable ou inaccessible (vérifie le partage et l\'ID : ' + FAMILLE_CAL_ID + ').');
  return cal;
}

/** Retrouve un événement par son ID, que ce soit sur l'agenda "Famille" actuel ou
 *  (pour les anciens événements) sur le calendrier personnel utilisé avant ce changement. */
function getEvenementParId_(id) {
  try { const ev = familleCal_().getEventById(id); if (ev) return ev; } catch (e) { /* ignore */ }
  try { const ev = CalendarApp.getDefaultCalendar().getEventById(id); if (ev) return ev; } catch (e) { /* ignore */ }
  return null;
}

/** Charge TOUTE la table "CalSync" une seule fois en mémoire (au lieu de la relire à
 *  chaque créneau vérifié, ce qui devenait très lent avec beaucoup d'entrées). */
function chargerCalSync_() {
  const map = {};
  read_('CalSync').forEach(r => { map[r.Cle] = r.EventId; });
  return map;
}
/** Enregistre un événement dans "CalSync" (feuille + map en mémoire tenue à jour). */
function calSyncSet_(calSync, key, eventId) {
  if (calSync[key] !== undefined) update_('CalSync', key, { EventId: eventId });
  else append_('CalSync', { Cle: key, EventId: eventId });
  calSync[key] = eventId;
}

/** Exécute `fn` sous verrou : empêche deux synchronisations simultanées (déclencheur
 *  quotidien + bouton, ou deux appareils) de créer chacune le même événement. */
function avecVerrou_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('Une autre synchronisation est déjà en cours : réessaie dans un instant.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Clé d'identification d'un événement (titre + heure de début) pour détecter ceux qui existent déjà. */
function cleEvt_(titre, start) { return titre + '|' + start.getTime(); }

/** Charge UNE fois les événements déjà présents sur l'agenda Famille pour la période à synchroniser :
 *  si le suivi "CalSync" a été perdu, on réutilise l'événement existant au lieu d'en créer un second. */
function chargerEvenementsExistants_(cal, horizonJours) {
  const map = {};
  const debut = new Date(Date.now() - 86400000);
  const fin = new Date(Date.now() + (horizonJours + 2) * 86400000);
  cal.getEvents(debut, fin).forEach(ev => {
    const k = cleEvt_(ev.getTitle(), ev.getStartTime());
    if (!map[k]) map[k] = ev.getId();
  });
  return map;
}

function normMat_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/** Ajoute les rappels demandés à un événement, selon les préférences. allow1h=false pour le lycée (gratuit).
 *  Les minutes identiques ne sont ajoutées qu'une fois (ex. cours à 8h : "le matin" = "1h avant"). */
function addReminders_(event, cfg, allow1h) {
  const minutes = [];
  if (cfg.veille) minutes.push(24 * 60); // 1 jour avant
  if (cfg.matin) {
    const start = event.getStartTime();
    const minutesDuJour = start.getHours() * 60 + start.getMinutes();
    const avant = minutesDuJour - 7 * 60; // vise ~7h00 le jour même
    if (avant > 0) minutes.push(avant);
  }
  if (allow1h && cfg.uneHeure) minutes.push(60);
  minutes.filter((m, i) => minutes.indexOf(m) === i).forEach(m => event.addPopupReminder(m));
}

/** Projette les créneaux du lycée (récurrents par jour de semaine) sur les prochains jours et crée les événements manquants.
 *  Un même créneau (jour + horaire + matière) partagé par plusieurs enfants = UN SEUL événement
 *  (avant : un événement par enfant, donc des notifications en double). */
function syncEcoleVersAgenda_(cfg, horizonJours, deadline) {
  // Par défaut, le lycée n'est PAS ajouté à l'agenda du tout : c'est un choix explicite
  // (case "Ajouter le lycée à l'agenda" dans les réglages). Tant qu'elle n'est pas cochée,
  // on ne crée strictement aucun événement pour le lycée.
  if (!cfg.ecoleAgenda) return { n: 0, more: false, echecs: [] };
  const ecole = read_('Ecole');
  if (!ecole.length) return { n: 0, more: false, echecs: [] };
  const enfants = read_('Enfants');
  const groupes = {};
  ecole.forEach(x => {
    const k = x.Jour + '|' + x.Horaire + '|' + normMat_(x.Matiere);
    (groupes[k] = groupes[k] || { jour: x.Jour, horaire: x.Horaire, matiere: x.Matiere, membres: [] }).membres.push(x);
  });
  const liste = Object.keys(groupes).map(k => groupes[k]);
  const cal = familleCal_();
  const today = new Date();
  const calSync = chargerCalSync_();
  const existants = chargerEvenementsExistants_(cal, horizonJours);
  let n = 0, more = false;
  for (let i = 0; i <= horizonJours; i++) {
    if (more) break;
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = fmt_(d);
    const abbr = DAYS[d.getDay()];
    for (const g of liste.filter(g => g.jour === abbr)) {
      if (Date.now() > deadline) { more = true; break; }
      const ids = g.membres.map(x => String(x.ID)).sort();
      const key = 'ecoleG_' + ids.join('+') + '_' + dateStr;
      // déjà créé (nouvelle clé, ou ancienne clé par enfant d'avant ce correctif)
      if (calSync[key] || g.membres.some(x => calSync['ecole_' + x.ID + '_' + dateStr])) continue;
      const m = String(g.horaire || '').match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
      if (!m) continue;
      const start = new Date(d); start.setHours(+m[1], +m[2], 0, 0);
      const end = new Date(d); end.setHours(+m[3], +m[4], 0, 0);
      const noms = g.membres.map(x => (enfants.find(e => String(e.ID) === String(x.EnfantID)) || {}).Nom || '')
        .filter((v, k, a) => v && a.indexOf(v) === k);
      const titre = '🏫 ' + noms.join(' & ') + ' — ' + g.matiere;
      const deja = existants[cleEvt_(titre, start)];
      if (deja) { calSyncSet_(calSync, key, deja); continue; } // adopte l'événement existant
      // Créé directement sur l'agenda partagé "Famille" : visible chez tout le monde,
      // pas besoin d'invitation individuelle à accepter.
      const event = cal.createEvent(titre, start, end);
      // Rappel seulement si en plus explicitement demandé (case "ecoleAlerte").
      if (cfg.ecoleAlerte) addReminders_(event, cfg, false);
      calSyncSet_(calSync, key, event.getId());
      existants[cleEvt_(titre, start)] = event.getId();
      n++;
    }
  }
  return { n, more, echecs: [] };
}

/** Crée les événements manquants pour les séances de cours particuliers "Prévue" à venir. */
function syncCoursVersAgenda_(cfg, horizonJours, deadline) {
  const cours = read_('Cours');
  const enfants = read_('Enfants');
  const cal = familleCal_();
  const todayStr = fmt_(new Date());
  const limiteStr = fmt_(new Date(Date.now() + horizonJours * 86400000));
  const aFaire = read_('Sessions')
    .filter(s => s.Statut === 'Prévue' && String(s.Date).slice(0, 10) >= todayStr && String(s.Date).slice(0, 10) <= limiteStr);
  const calSync = chargerCalSync_();
  const existants = chargerEvenementsExistants_(cal, horizonJours);
  let n = 0, more = false;
  for (const s of aFaire) {
    if (Date.now() > deadline) { more = true; break; }
    const key = 'cours_' + s.ID;
    if (calSync[key]) continue;
    const c = cours.find(c => String(c.ID) === String(s.CoursID));
    if (!c || !c.Heure) continue;
    const m = String(c.Heure).match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const dateBase = new Date(String(s.Date).slice(0, 10) + 'T00:00');
    const start = new Date(dateBase); start.setHours(+m[1], +m[2], 0, 0);
    const end = new Date(dateBase); end.setHours(+m[3], +m[4], 0, 0);
    const enf = enfants.find(e => String(e.ID) === String(c.EnfantID)) || {};
    // Créé directement sur l'agenda partagé "Famille" : visible chez tout le monde,
    // pas besoin d'invitation individuelle à accepter.
    const titre = '📚 ' + (enf.Nom || '') + ' — ' + c.Matiere + (c.Prof ? ' (' + c.Prof + ')' : '');
    const deja = existants[cleEvt_(titre, start)];
    if (deja) { calSyncSet_(calSync, key, deja); continue; } // adopte l'événement existant (pas de doublon)
    const event = cal.createEvent(titre, start, end);
    addReminders_(event, cfg, true);
    calSyncSet_(calSync, key, event.getId());
    existants[cleEvt_(titre, start)] = event.getId();
    n++;

    // Rappel "récupération" 30 min avant la FIN du cours : un petit événement à part
    // (pas juste un rappel sur l'événement principal), car son titre porte le message
    // et une alarme Google ne peut se caler que par rapport au DÉBUT d'un événement.
    if (cfg.rappelFin) {
      const dureeMin = (end.getTime() - start.getTime()) / 60000;
      if (dureeMin > 30) {
        const keyFin = 'coursFin_' + s.ID;
        if (!calSync[keyFin]) {
          const finStart = new Date(end.getTime() - 30 * 60000);
          const finEnd = new Date(finStart.getTime() + 60000); // 1 min, juste pour exister
          const titreFin = '🚗 Récupération ' + (enf.Nom || '') + ' — le cours se termine dans 30 min';
          const dejaFin = existants[cleEvt_(titreFin, finStart)];
          if (dejaFin) {
            calSyncSet_(calSync, keyFin, dejaFin);
          } else {
            const eventFin = cal.createEvent(titreFin, finStart, finEnd);
            eventFin.addPopupReminder(0); // notifie immédiatement à l'heure de cet événement
            calSyncSet_(calSync, keyFin, eventFin.getId());
            existants[cleEvt_(titreFin, finStart)] = eventFin.getId();
          }
        }
      }
    }
  }
  return { n, more, echecs: [] };
}

/**
 * À programmer une fois par jour (voir installerDeclencheurs). Étend la fenêtre d'événements
 * à venir. S'arrête d'elle-même bien avant la limite d'exécution d'Apps Script (6 min) :
 * si tout n'a pas pu être fait, "more" indique qu'il faut relancer (l'appli le fait
 * automatiquement en boucle depuis le bouton "Synchroniser").
 */
function syncCalendrier() { return avecVerrou_(syncCalendrierInterne_); }
function syncCalendrierInterne_() {
  const cfg = getConfig();
  if (!cfg.veille && !cfg.matin && !cfg.uneHeure && !cfg.ecoleAgenda) return { n: 0, more: false };
  const deadline = Date.now() + 4.5 * 60 * 1000; // marge de sécurité sous la limite de 6 min
  const r1 = syncEcoleVersAgenda_(cfg, 10, deadline);
  if (r1.more) return { n: r1.n, more: true, echecs: r1.echecs };
  const r2 = syncCoursVersAgenda_(cfg, 30, deadline);
  return { n: r1.n + r2.n, more: r2.more, echecs: r1.echecs.concat(r2.echecs) };
}
/** Appelable depuis l'appli (bouton "Synchroniser maintenant"). Un seul passage borné dans le temps. */
function syncCalendrierManuel() { return syncCalendrier(); }

/**
 * Supprime tous les événements déjà créés (utile après avoir changé les
 * préférences de rappel, qui ne s'appliquent pas rétroactivement) puis
 * resynchronise (un seul passage borné, comme syncCalendrierManuel).
 * La suppression elle-même est aussi bornée dans le temps pour rester fiable
 * même avec beaucoup d'événements déjà créés.
 */
function resyncCalendrier() { return avecVerrou_(resyncCalendrierInterne_); }
function resyncCalendrierInterne_() {
  const deadline = Date.now() + 4.5 * 60 * 1000; // budget unique partagé suppression + recréation
  const rows = read_('CalSync');
  let i = 0;
  for (; i < rows.length; i++) {
    if (Date.now() > deadline) break;
    try { const ev = getEvenementParId_(rows[i].EventId); if (ev) ev.deleteEvent(); } catch (e) { /* déjà supprimé à la main, tant pis */ }
    delete_('CalSync', rows[i].Cle);
  }
  if (i < rows.length) return { n: 0, more: true }; // pas fini de nettoyer, relance "Tout resynchroniser"

  const cfg = getConfig();
  if (!cfg.veille && !cfg.matin && !cfg.uneHeure && !cfg.ecoleAgenda) return { n: 0, more: false };
  const r1 = syncEcoleVersAgenda_(cfg, 10, deadline);
  if (r1.more) return { n: r1.n, more: true, echecs: r1.echecs };
  const r2 = syncCoursVersAgenda_(cfg, 30, deadline);
  return { n: r1.n + r2.n, more: r2.more, echecs: r1.echecs.concat(r2.echecs) };
}

/**
 * Supprime tous les événements déjà créés dans Google Agenda (sans les recréer),
 * et vide le suivi "CalSync". Borné dans le temps comme les autres : si tout n'a
 * pas pu être supprimé, "more" indique qu'il faut relancer.
 */
function supprimerToutesAlertes() { return avecVerrou_(supprimerToutesAlertesInterne_); }
function supprimerToutesAlertesInterne_() {
  const deadline = Date.now() + 4.5 * 60 * 1000;
  const rows = read_('CalSync');
  let i = 0;
  for (; i < rows.length; i++) {
    if (Date.now() > deadline) break;
    try { const ev = getEvenementParId_(rows[i].EventId); if (ev) ev.deleteEvent(); } catch (e) { /* déjà supprimé à la main, tant pis */ }
    delete_('CalSync', rows[i].Cle);
  }
  return { n: i, more: i < rows.length };
}

/**
 * Crée un événement de test dans quelques minutes avec un rappel presque immédiat,
 * directement sur l'agenda partagé "Famille", pour vérifier que tout le monde le voit
 * et reçoit bien l'alerte, sans attendre un vrai cours. N'est pas suivi dans "CalSync" :
 * c'est un one-shot, à supprimer soi-même dans l'agenda une fois le test fait.
 */
function testAlerte() {
  const cal = familleCal_();
  const start = new Date(Date.now() + 2 * 60 * 1000);
  const end = new Date(Date.now() + 17 * 60 * 1000);
  const event = cal.createEvent('🔔 Test — visible par toute la famille ?', start, end, {
    description: "Ceci est un événement de test sur l'agenda partagé Famille, pour vérifier qu'il apparaît bien chez tout le monde et que l'alerte se déclenche. Tu peux le supprimer une fois vérifié."
  });
  event.addPopupReminder(1); // déclenche ~1 min après la création
  return { heure: Utilities.formatDate(start, Session.getScriptTimeZone(), 'HH:mm'), echecs: [] };
}

/**
 * À lancer UNE SEULE FOIS manuellement depuis l'éditeur Apps Script (menu Exécuter),
 * pas depuis l'appli. Installe le déclencheur quotidien. Redemande l'autorisation
 * (Agenda + déclencheurs) la première fois : c'est normal, il faut l'accepter.
 * Supprime d'abord tous les anciens déclencheurs de CE script pour éviter les doublons.
 */
function installerDeclencheurs() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncCalendrier').timeBased().everyDays(1).atHour(6).create();
}

/**
 * Supprime les événements EN DOUBLE (même titre, même début, même fin) de l'agenda partagé
 * "Famille" sur les 60 prochains jours : en garde un seul. Appelable depuis Réglages.
 */
function supprimerDoublons() { return avecVerrou_(supprimerDoublonsInterne_); }
function supprimerDoublonsInterne_() {
  const cal = familleCal_();
  const vus = {};
  let n = 0;
  cal.getEvents(new Date(Date.now() - 86400000), new Date(Date.now() + 60 * 86400000)).forEach(ev => {
    const k = ev.getTitle() + '|' + ev.getStartTime().getTime() + '|' + ev.getEndTime().getTime();
    if (vus[k]) { ev.deleteEvent(); n++; } else vus[k] = true;
  });
  return { n: n, more: false };
}

/**
 * À lancer UNE FOIS à la main depuis l'éditeur Apps Script (▶ Exécuter), pas depuis l'appli.
 * Avant le passage à l'agenda partagé "Famille", les événements étaient créés sur le calendrier
 * PERSONNEL du compte qui exécute le script (avec invitation des parents). S'il en reste, ils
 * s'ajoutent à ceux de l'agenda Famille -> notifications en double. Cette fonction supprime,
 * dans le calendrier personnel, les événements FUTURS dont le titre commence par 📚, 🏫 ou
 * 🚗 Récupération (ceux créés par l'appli). Le résultat s'affiche dans Affichage > Journaux.
 */
function nettoyerAnciensEvenementsPerso() {
  const perso = CalendarApp.getDefaultCalendar();
  let n = 0;
  perso.getEvents(new Date(), new Date(Date.now() + 365 * 86400000)).forEach(ev => {
    const t = ev.getTitle();
    if (t.indexOf('📚 ') === 0 || t.indexOf('🏫 ') === 0 || t.indexOf('🚗 Récupération') === 0) { ev.deleteEvent(); n++; }
  });
  Logger.log(n + ' ancien(s) événement(s) supprimé(s) du calendrier personnel.');
}
