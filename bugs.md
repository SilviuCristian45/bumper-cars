#1. daca est in alt tab cand incepe jocul, nu-ti mai vezi masina cand revii

   **Rezolvat (2026-11-20).** Reprodus cu `client/scripts/hidden-tab.mjs` (doi clienți în Chrome dirijat prin
   DevTools; B pleacă de pe pagină când gazda apasă Start, sau în timpul rundei, între runde, la podium).
   - Tab ascuns sau pagină înghețată (telefon blocat, conexiunea rămâne): mergea deja. B ajunge în joc în
     < 50 ms și mașina răspunde.
   - **Conexiunea căzută cât era plecat** (telefon care schimbă aplicația, laptop adormit): aici era bug-ul. La
     întoarcere jocul stătea înghețat („Se reconectează”) și mașina nu răspundea încă 1–2 s sau mai mult: SDK-ul
     Colyseus reîncerca la 0,2 s → 5 s, iar încercările îi expirau cât pagina era ascunsă. Măsurat înainte: 1,9 s
     până la conectare și 2,2 s până să miște serverul mașina; acum 0,25 s și 0,4 s.
   - Un socket care pare deschis dar e mort (rețea schimbată) nu era observat deloc.
   Reparația (`client/src/net/ColyseusTransport.ts`, `shared/src/netcode.ts`, `client/src/scenes/LobbyScene.ts`):
   la revenire predicția pornește de la ultima stare de la server (`Predictor.resync`: fără input-uri
   neconfirmate, seq continuă de la `lastSeq`), acumulatorul și ceasul de desen se resetează (fără sute de
   tick-uri recuperate), evenimentele mai vechi de 2 s se aruncă (ca înainte), o reconectare în curs e
   reîncercată imediat, iar dacă serverul nu mai răspunde 4 s (ping la fiecare secundă) conexiunea e dată
   reconectării. Lobby-ul trece în joc și la `visibilitychange`, nu doar din `update()`. Peste 15 s fără
   conexiune locul se pierde, ca până acum (mesaj în meniu).

   **Bombe și Petarde (doar citit, nemodificat):** `client/src/net/ColyseusTransport.ts` nu are nimic la
   `visibilitychange`, nicio reîncercare la revenire și nicio verificare de conexiune moartă. Are aceeași
   reconectare din SDK, deci probabil același simptom după o conexiune căzută în fundal (joc înghețat câteva
   secunde la revenire). Nu are predicție, deci partea cu input-uri vechi nu se aplică. De verificat acolo cu
   un script ca `hidden-tab.mjs`.
