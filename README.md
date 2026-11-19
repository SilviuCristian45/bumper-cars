# Mașinuțe de Bâlci

Joc multiplayer în browser cu mașinuțe tamponate, văzut de sus, într-o arenă de bâlci românesc noaptea.
Până la 6 jucători: intri la un prieten cu un cod de 6 caractere sau joci offline cu boți.

**În construcție.** Etapele sunt în `CLAUDE.md`.

## Pornire

```bash
npm install
npm run dev     # client pe http://localhost:5174, server pe :2568
npm test
npm run sim -- --bots usor,mediu,greu,greu --rounds 5 -v   # un meci doar cu boți, în terminal
```

Nivelurile boților: `usor`, `mediu`, `greu` (2–6 boți). `--seed` schimbă meciul, `-v` arată fiecare eliminare.

## Controale

- Tastatură: săgeți sau WASD (stânga/dreapta = viraj, sus = accelerație, jos = frână și marșarier), Spațiu = boost, P = pauză, Esc = ieși, F = ecran complet.
- Telefon (pe orizontală): joystick în stânga (mașina virează spre direcția lui și accelerează cât îl împingi), buton de boost în dreapta. Din „Setări”: mod stângaci, vibrații, efecte reduse.

## Cum se joacă

Intro → porecla → meniu: „Creează joc”, „Intră la un prieten” (cod de 6 caractere) sau „Joacă offline cu boți”.
În lobby hostul alege 3/5/7 runde și boții (până la 6 mașinuțe, fiecare bot cu nivelul lui), apoi Start.
După meci, hostul îi duce pe toți înapoi în lobby.

Online: „Creează joc” dă un cod de 6 caractere și un link de invitație (`?room=COD`, „Trimite invitația” pe telefon,
„Copiază link” pe calculator). Cine pierde conexiunea are 15 secunde să revină. Dacă serverul nu răspunde,
meniul spune asta și propune jocul offline cu boți.

## Opțiuni de test în URL

`?bots=1..5`, `?rounds=3|5|7`, `?seed=abc`, `?botlevel=usor|mediu|greu`, `?debug` (hitbox-uri, vectori, ce fac boții),
`?touch` / `?touch=0` (forțează controalele de telefon) și `?tune` (panou cu reglaje pentru condus, cu „Copiază valorile”).
Toate în afară de `?touch` sar peste meniuri direct într-un meci local. Reglajele salvate din `?tune` se aplică doar
cu `?tune` în URL și niciodată într-un joc online.

Pentru jocul online: `?lag=120&jitter=30` simulează o rețea lentă (120 ms în plus dus-întors, până la 30 ms aleator
pe fiecare mesaj), iar `?online` păstrează meniurile ca `?debug` să arate și ping-ul, eroarea de predicție,
inputurile neconfirmate și corecțiile mari pe secundă (de exemplu `?online&debug&lag=120&jitter=30`).

Tehnologii: Phaser 3, TypeScript, Vite, Colyseus. Simularea (în `shared/`) e deterministă și rulează
la fel în browser și pe server.
