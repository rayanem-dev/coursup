# Coursup — habitudes du projet

- **Livraison :** après chaque série de modifications, pousser la branche de travail, créer la pull request vers `main` et la **fusionner directement** (autorisation permanente du propriétaire, pas besoin de redemander).
- **Langue :** répondre et écrire les commits en français.
- **Vérification avant fusion :** contrôler la syntaxe du JS de `index.html` et de `Code.gs` (`node --check`) et tester le rendu avec des données simulées.
- **Semaine :** elle commence le **dimanche**.
- **Icônes :** liens directs `https://rayanem-dev.github.io/coursup/icon-*.png` (pas de base64 dans `Code.gs`).
- **`Code.gs` :** copie du script Apps Script déployé ; le propriétaire le colle lui-même dans Apps Script, penser à le rappeler quand il change.
- **Version :** à chaque livraison, incrémenter `APP_VERSION` (`index.html`) et `VERSION` (`Code.gs`) avec la même valeur (`AAAA.MM.JJ.n`) ; elle s'affiche en bas de l'appli et signale si le serveur n'est pas à jour.
