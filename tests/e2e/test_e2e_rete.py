"""La rete nel browser: il server che cade (fascia arancione, spunta in coda)
e torna (la coda riparte da sola); due schede aperte che si vedono a vicenda
(SSE).

    python -m unittest tests.e2e.test_e2e_rete
"""
import time, unittest

from ._server_e2e import CasoE2E

CELLA_LIBERA = """(salta) => {
  for (const c of document.querySelectorAll('.crono .riga-srv .cella')) {
    if (c.matches('.visita,.stima,.darinnovare,.nontracciato,.completa')) continue;
    if ((salta || []).includes(c.dataset.cella)) continue;
    if (['s','c','k','r'].every(k => c.dataset[k] === '0')) return c.dataset.cella;
  }
  return null; }"""


class Rete(CasoE2E):

    def cella_server(self, k):
        return self.server.api('/api/bootstrap?anno=2026')['celle'].get(k) or {}

    def test_due_schede_si_vedono_a_vicenda(self):
        c = self.contesto(operatore='Collaudo')
        a = self.pagina(contesto=c, nome='scheda A')
        b = self.pagina(contesto=c, nome='scheda B')
        a.wait_for_timeout(500)             # i due flussi SSE aperti
        k = a.evaluate(CELLA_LIBERA)
        a.locator('.cella[data-cella="%s"]' % k).click()
        a.click('.pop .passo[data-campo="stampata"]')
        a.click('.pop .passo[data-campo="controllata"]')
        self.aspetta_segmenti(b, k, '1100', secondi=8)
        # e al contrario, anche nella vista Mese dell'altra scheda
        a.keyboard.press('Escape')
        b.locator('.cella[data-cella="%s"]' % k).click()
        b.click('.pop .passo[data-campo="stampata"]')
        self.aspetta_segmenti(a, k, '0100', secondi=8)
        b.keyboard.press('Escape')
        # un altro operatore, da un altro browser
        d = self.pagina(operatore='Biagio', nome='Biagio')
        d.wait_for_timeout(500)
        self.server.api('/api/toggle', {'id_service': int(k.split('-')[0]), 'anno': 2026,
                                        'mese': int(k.split('-')[1]), 'campo': 'stampata',
                                        'valore': 1, 'operatore': 'Biagio'})
        for p in (a, b, d):
            self.aspetta_segmenti(p, k, '1100', secondi=8)
        # la presenza: A vede che c'e' anche Biagio (battito ogni 20 s: si forza)
        a.evaluate("import('/js/api.js')")
        a.wait_for_function("document.querySelector('#collegamento-et').textContent.includes('collegat')")

    def test_server_che_cade_e_torna(self):
        # quando il server e' spento le richieste falliscono: e' la prova
        self.permetti(r'ERR_CONNECTION_REFUSED', r'ERR_CONNECTION_RESET', r'ERR_EMPTY_RESPONSE',
                      r'/api/(stream|ping|toggle).*ERR_')
        p = self.pagina()
        k = p.evaluate(CELLA_LIBERA)
        self.server.ferma()
        try:
            p.wait_for_selector('#banner.allerta:not([hidden])', timeout=15000)
            self.assertIn('non raggiungibile', p.inner_text('#banner'))
            self.assertEqual(p.get_attribute('#spia', 'class').split()[-1], 'giu')
            self.foto(p, 'offline-fascia')
            # si continua a spuntare: la spunta va in coda
            p.locator('.cella[data-cella="%s"]' % k).click()
            p.click('.pop .passo[data-campo="stampata"]')
            p.keyboard.press('Escape')
            self.aspetta_segmenti(p, k, '1000')
            p.wait_for_function("document.querySelector('#collegamento-et').textContent.includes('in coda')",
                                timeout=15000)
            self.assertIn('1 in coda', p.inner_text('#collegamento-et'))
            self.assertIn('al sicuro in coda', p.inner_text('#banner'))
            coda = p.evaluate("JSON.parse(localStorage.getItem('cs.coda.v1') || '[]').length")
            self.assertEqual(coda, 1)
            # la coda sopravvive al ricarico? (il bootstrap cade sulla copia locale)
            self.foto(p, 'offline-coda')
            # cambio anno senza server: avviso, niente eccezioni
            p.click('#anno-su')
            p.wait_for_selector('.avviso:has-text("Cambio anno non disponibile")', timeout=15000)
            self.assertEqual(p.inner_text('#anno'), '2026')
        finally:
            self.server.avvia()
        # il server torna: la coda riparte da sola (riaggancio SSE o ritento a 8 s)
        p.wait_for_function("document.querySelector('#banner').hidden", timeout=30000)
        p.wait_for_function("JSON.parse(localStorage.getItem('cs.coda.v1') || '[]').length === 0",
                            timeout=30000)
        fine = time.time() + 5
        while time.time() < fine and self.cella_server(k).get('s') != 1:
            time.sleep(0.2)
        self.assertEqual(self.cella_server(k).get('s'), 1)
        self.assertNotIn('coda', p.inner_text('#collegamento-et'))


if __name__ == '__main__':
    unittest.main()
