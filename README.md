# Mașinuțe de Bâlci

Joc multiplayer în browser cu mașinuțe tamponate, văzut de sus, într-o arenă de bâlci românesc noaptea.
Până la 6 jucători: intri la un prieten cu un cod de 6 caractere sau joci offline cu boți.

**În construcție.** Etapele sunt în `CLAUDE.md`.

## Pornire

```bash
npm install
npm run dev     # client pe http://localhost:5174, server pe :2568
npm test
```

Tehnologii: Phaser 3, TypeScript, Vite, Colyseus. Simularea (în `shared/`) e deterministă și rulează
la fel în browser și pe server.
