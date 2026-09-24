/* web-cassetto.test.mjs - il pannello di un sito (web/js/cassetto.js).
   Qui la parte che si prova senza DOM: la CONFERMA IN DUE TEMPI dei bottoni
   che buttano i PDF («Elimina» -> «Sicuro?» -> via). Due difetti ripetuti:
   - un DOPPIO CLIC la saltava: il primo clic armava, il secondo (80 ms dopo)
     confermava, e il PDF - o tutti i PDF del sito - se ne andava senza che
     nessuno avesse letto «Sicuro?»;
   - «Elimina tutti»: il timer che riporta l'etichetta scattava anche a
     cancellazione in corso, e il bottone spento diceva di nuovo
     «Elimina tutti (N)» mentre stava ancora eliminando. */
import './web-ambiente.mjs';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { confermaInDueTempi } from '../../web/js/cassetto.js';

const bottone = testo => ({ dataset: {}, textContent: testo, disabled: false });

function orologio() {
  let t = 1_000_000;
  return { ora: () => t, avanti: ms => { t += ms; mock.timers.tick(ms); } };
}

test('il primo clic chiede, il secondo (con calma) conferma', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const o = orologio(), b = bottone('Elimina');
    const opz = { base: 'Elimina', domanda: 'Sicuro?', ora: o.ora };
    assert.equal(confermaInDueTempi(b, opz), false);
    assert.equal(b.textContent, 'Sicuro?');
    o.avanti(700);
    assert.equal(confermaInDueTempi(b, opz), true);
  } finally { mock.timers.reset(); }
});

test('un doppio clic non conferma: il secondo clic arriva troppo presto', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const o = orologio(), b = bottone('Elimina');
    const opz = { base: 'Elimina', domanda: 'Sicuro?', ora: o.ora };
    assert.equal(confermaInDueTempi(b, opz), false);
    o.avanti(80);                                  // il secondo clic del doppio clic
    assert.equal(confermaInDueTempi(b, opz), false);
    assert.equal(b.textContent, 'Sicuro?');        // resta armato: un clic vero dopo conferma
    o.avanti(600);
    assert.equal(confermaInDueTempi(b, opz), true);
  } finally { mock.timers.reset(); }
});

test('senza conferma entro il tempo, il bottone torna com’era', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const o = orologio(), b = bottone('Elimina tutti (3)');
    const opz = { base: 'Elimina tutti (3)', domanda: 'Sicuro? 3 PDF', ms: 4000, ora: o.ora };
    confermaInDueTempi(b, opz);
    o.avanti(4000);
    assert.equal(b.textContent, 'Elimina tutti (3)');
    assert.equal(b.dataset.conferma, '');
    // e il clic dopo ricomincia da capo: chiede di nuovo
    assert.equal(confermaInDueTempi(b, opz), false);
    assert.equal(b.textContent, 'Sicuro? 3 PDF');
  } finally { mock.timers.reset(); }
});

test('a cancellazione in corso il timer non riscrive l’etichetta del bottone spento', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const o = orologio(), b = bottone('Elimina tutti (3)');
    const opz = { base: 'Elimina tutti (3)', domanda: 'Sicuro? 3 PDF', ms: 4000, ora: o.ora };
    confermaInDueTempi(b, opz);
    o.avanti(1000);
    assert.equal(confermaInDueTempi(b, opz), true);
    b.disabled = true; b.textContent = 'Elimino…';  // come fa il cassetto
    o.avanti(3500);                                 // scade il timer del primo clic
    assert.equal(b.textContent, 'Elimino…');
  } finally { mock.timers.reset(); }
});

test('il timer di una richiesta vecchia non disarma quella nuova', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const o = orologio(), b = bottone('Elimina');
    const opz = { base: 'Elimina', domanda: 'Sicuro?', ms: 3000, ora: o.ora };
    confermaInDueTempi(b, opz);                    // t0: armato, il suo timer scade a t0+3000
    o.avanti(1000);
    assert.equal(confermaInDueTempi(b, opz), true);
    // fallito (o finito) il giro, il cassetto rimette il bottone com'era
    b.disabled = false; b.dataset.conferma = ''; b.textContent = 'Elimina';
    o.avanti(500);
    confermaInDueTempi(b, opz);                    // t0+1500: riarmato, scade a t0+4500
    o.avanti(1600);                                // t0+3100: e' scaduto il timer di t0
    assert.equal(b.textContent, 'Sicuro?');
    assert.equal(confermaInDueTempi(b, opz), true);
  } finally { mock.timers.reset(); }
});

test('la tastiera (Invio, spazio) conferma come il mouse, se c’e’ stata la pausa', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const o = orologio(), b = bottone('Elimina');
    const opz = { base: 'Elimina', domanda: 'Sicuro?', ora: o.ora };
    confermaInDueTempi(b, opz);
    o.avanti(400);
    assert.equal(confermaInDueTempi(b, opz), true);
  } finally { mock.timers.reset(); }
});
