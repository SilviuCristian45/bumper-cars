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

- Tastatură: săgeți sau WASD (stânga/dreapta = viraj, sus = accelerație, jos = frână și marșarier), Spațiu = boost, P = pauză.
- Telefon (pe orizontală): joystick în stânga (mașina virează spre direcția lui și accelerează cât îl împingi), buton de boost în dreapta.

## Opțiuni de test în URL

`?bots=1..5`, `?rounds=3|5|7`, `?seed=abc`, `?botlevel=usor|mediu|greu`, `?debug` (hitbox-uri, vectori, ce fac boții),
`?touch` / `?touch=0` (forțează controalele de telefon) și `?tune` (panou cu reglaje pentru condus, cu „Copiază valorile”).

Tehnologii: Phaser 3, TypeScript, Vite, Colyseus. Simularea (în `shared/`) e deterministă și rulează
la fel în browser și pe server.
