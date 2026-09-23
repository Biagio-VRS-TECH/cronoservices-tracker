"""I due generatori di PDF (web/schede/, web/registro/): la guida (tour)
dall'inizio alla fine senza passi che puntano al vuoto e senza uscire dallo
schermo, anche sul telefono; il dizionario dei nomi del registro, che si
salva nel database del tracker.

    python -m unittest tests.e2e.test_e2e_generatori
"""
import unittest

from ._server_e2e import CasoE2E, DESKTOP, TELEFONO

# Prende la configurazione che le pagine passano a Tour.crea (i passi, coi
# loro selettori): tour.js mette window.Tour, qui lo si avvolge al volo.
SPIA_TOUR = """(() => { let T;
  Object.defineProperty(window, 'Tour', { configurable: true,
    get() { return T; },
    set(v) { const crea = v.crea; v.crea = cfg => { (window.__giri = window.__giri || []).push(cfg); return crea(cfg); }; T = v; } });
})();"""

# Lo stato del passo a schermo.
PASSO = """() => {
  const cfg = (window.__giri || []).slice(-1)[0] || { passi: [] };
  const num = document.querySelector('#tourNum').textContent;
  const i = Number(num.split(' ')[0]) - 1;
  const s = cfg.passi[i] || {};
  const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); };
  /* lo schermo e' quello che si vede (visualViewport): sul telefono una
     pagina piu' larga allarga innerWidth, e un fumetto "centrato" li' e' fuori */
  const vv = window.visualViewport || { width: innerWidth, height: innerHeight };
  return { i, n: cfg.passi.length, titolo: document.querySelector('#tourTitle').textContent,
           sel: s.sel || null, off: s.off || '', buio: document.querySelector('#tourHole').classList.contains('blind'),
           pop: r('#tourPop'), buco: r('#tourHole'), vw: Math.round(vv.width), vh: Math.round(vv.height),
           largo: document.documentElement.scrollWidth,
           avanti: document.querySelector('#tourNext').textContent };
}"""

# Un export del gestionale minimo: SheetJS legge anche una tabella HTML con
# estensione .xls. A1 = cliente, riga 2 = intestazione, poi i componenti.
EXPORT = ('<table><tr><td>CLIENTE DI PROVA E2E</td></tr><tr><td>Componente</td></tr>'
          '<tr><td>990001 - PRESA DI PROVA E2E PER O2 PIANO: 1; REPARTO: DEGENZE; STANZA: 101;</td></tr>'
          '<tr><td>990001 - PRESA DI PROVA E2E PER O2 PIANO: 1; REPARTO: DEGENZE; STANZA: 102;</td></tr>'
          '<tr><td>990002 - VALVOLA DI PROVA E2E PIANO: 0; REPARTO: CENTRALE; STANZA: LOCALE;</td></tr>'
          '</table>')


class Generatori(CasoE2E):
    senza_bersaglio = []      # passi col bersaglio assente MA spiegato ("off"): si elencano

    @classmethod
    def tearDownClass(cls):
        if cls.senza_bersaglio:
            print('\n[e2e] passi della guida senza bersaglio, spiegati a parole:\n  ' +
                  '\n  '.join(cls.senza_bersaglio))
        super().tearDownClass()

    def giro_guida(self, percorso, forma, nome):
        c = self.contesto(forma=forma)
        c.add_init_script(SPIA_TOUR)
        p = self.pagina(contesto=c, percorso=percorso, aspetta=None, nome=nome)
        # al primo utilizzo la guida parte da sola
        p.wait_for_selector('#tourWrap:not([hidden]) #tourPop', timeout=15000)
        p.wait_for_timeout(400)
        problemi, visti = [], []
        for _ in range(60):
            p.wait_for_timeout(250)          # fine della corsa del buco e del fumetto
            s = p.evaluate(PASSO)
            visti.append(s['titolo'])
            self.foto(p, '%s-passo-%02d' % (nome, s['i'] + 1))
            if s['sel'] and s['buio']:
                if s['off']:            # previsto: la guida lo dice a parole ("compare quando...")
                    self.senza_bersaglio.append('%s passo %d "%s" (%s)' % (nome, s['i'] + 1, s['titolo'], s['sel']))
                else:
                    problemi.append('passo %d "%s": il bersaglio %r non c\'e\'' % (s['i'] + 1, s['titolo'], s['sel']))
            if s['largo'] > s['vw'] + 1 and not any('scorre di lato' in x for x in problemi):
                problemi.append('pagina larga %d px su uno schermo di %d: scorre di lato' % (s['largo'], s['vw']))
            x0, y0, x1, y1 = s['pop']
            if x0 < -1 or y0 < -1 or x1 > s['vw'] + 1 or y1 > s['vh'] + 1:
                problemi.append('passo %d "%s": il fumetto esce dallo schermo %r (%dx%d)'
                                % (s['i'] + 1, s['titolo'], s['pop'], s['vw'], s['vh']))
            if not s['buio']:
                bx0, by0, bx1, by1 = s['buco']
                if bx1 <= 0 or by1 <= 0 or bx0 >= s['vw'] or by0 >= s['vh']:
                    problemi.append('passo %d "%s": il bersaglio e\' fuori dallo schermo %r'
                                    % (s['i'] + 1, s['titolo'], s['buco']))
            # Avanti da tastiera (freccia destra): se il fumetto e' fuori schermo
            # il clic non ci arriva, e il giro deve comunque finire per contarlo
            fine = s['avanti'] == 'Ho capito'
            p.keyboard.press('ArrowRight')
            if fine:
                break
        else:
            self.fail('la guida non finisce: %r' % visti)
        p.wait_for_selector('#tourWrap', state='hidden')
        self.assertEqual(len(visti), s['n'], 'passi visti %r' % visti)
        return p, problemi

    def test_guida_schede_computer(self):
        p, problemi = self.giro_guida('/schede/', DESKTOP, 'schede')
        self.assertTrue(p.evaluate("localStorage.getItem('vrsSchedeCampo.tourSeen')"))
        self.assertFalse(problemi, '\n'.join(problemi))

    def test_guida_registro_computer(self):
        p, problemi = self.giro_guida('/registro/', DESKTOP, 'registro')
        self.assertEqual(p.evaluate("localStorage.getItem('cs.registro.tourSeen')"), '1')
        # l'esempio della guida se ne va da solo
        p.wait_for_selector('#empty-state:not([hidden])')
        self.assertFalse(problemi, '\n'.join(problemi))

    def test_guida_schede_telefono(self):
        _, problemi = self.giro_guida('/schede/', TELEFONO, 'schede-tel')
        self.assertFalse(problemi, '\n'.join(problemi))

    def test_guida_registro_telefono(self):
        _, problemi = self.giro_guida('/registro/', TELEFONO, 'registro-tel')
        self.assertFalse(problemi, '\n'.join(problemi))

    def test_dizionario_del_registro_si_salva_nel_tracker(self):
        c = self.contesto()
        c.add_init_script("localStorage.setItem('cs.registro.tourSeen', '1')")
        p = self.pagina(contesto=c, percorso='/registro/', aspetta='#empty-state', nome='registro')
        p.set_input_files('#file', files=[{'name': 'export-prova.xls', 'mimeType': 'application/vnd.ms-excel',
                                           'buffer': EXPORT.encode('utf-8')}])
        p.wait_for_selector('#viste:not([hidden])', timeout=15000)
        p.click('#tabNomi')
        p.wait_for_selector('#nomiCorpo input[data-codice="990001"]')
        self.foto(p, 'dizionario')
        casella = p.locator('#nomiCorpo input[data-campo="nome"][data-codice="990001"]')
        casella.click()
        # il clic trascrive la descrizione: si accorcia
        self.assertIn('PRESA DI PROVA E2E', casella.input_value())
        casella.fill('Presa ossigeno (prova e2e)')
        casella.press('Enter')
        p.wait_for_function("document.querySelector('#nomiStato').textContent.startsWith('Salvato')", timeout=15000)
        voci = self.server.api('/api/dizionario')
        voci = voci.get('voci', voci) if isinstance(voci, dict) else voci
        self.assertTrue([v for v in voci if v.get('codice') == '990001' and v.get('nome') == 'Presa ossigeno (prova e2e)'],
                        'il nome non e\' arrivato al dizionario del server')
        # Esc annulla una modifica non salvata
        casella.fill('da buttare')
        casella.press('Escape')
        self.assertEqual(casella.input_value(), 'Presa ossigeno (prova e2e)')
        # l'ordine nel quadro: un numero fuori scala non parte
        ordine = p.locator('#nomiCorpo input[data-campo="priorita"][data-codice="990001"]')
        ordine.fill('3')
        ordine.press('Enter')
        p.wait_for_function("document.querySelector('#nomiStato').textContent.startsWith('Salvato')", timeout=15000)


if __name__ == '__main__':
    unittest.main()
