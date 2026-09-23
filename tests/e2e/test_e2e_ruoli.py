"""Ruoli nel browser: operatore (tecnico) contro amministratore, le proposte
e la loro approvazione, e il PIN dell'amministratore (`pin_admin`, messo
nella config del server di prova in memoria: app/config.json non si tocca).

    python -m unittest tests.e2e.test_e2e_ruoli
"""
import unittest

from ._server_e2e import CasoE2E

CELLA_LIBERA = """() => {
  for (const c of document.querySelectorAll('.crono .riga-srv .cella')) {
    if (c.matches('.visita,.stima,.darinnovare,.nontracciato,.completa')) continue;
    if (['s','c','k','r'].every(k => c.dataset[k] === '0')) return c.dataset.cella;
  }
  return null; }"""


class Ruoli(CasoE2E):

    def voci_azioni(self, p):
        p.click('#azioni')
        p.wait_for_selector('.tendina')
        voci = p.eval_on_selector_all('.tendina .voce-et', 'vs => vs.map(v => v.textContent)')
        p.keyboard.press('Escape')
        return voci

    def test_operatore_non_vede_le_voci_da_admin_e_propone(self):
        p = self.pagina(operatore='Biagio')
        self.assertEqual(p.locator('#io .ruolo').count(), 0)
        voci = self.voci_azioni(p)
        for v in ('Completa tutte le spunte', 'Azzera tutte le spunte', 'Impostazioni',
                  'Elimina il diario attività'):
            self.assertNotIn(v, voci)
        self.assertIn('Diario attività', voci)
        # "Rapportino" di un operatore resta una proposta
        k = p.evaluate(CELLA_LIBERA)
        p.locator('.cella[data-cella="%s"]' % k).click()
        p.click('.pop .passo[data-campo="corretta"]')
        p.wait_for_function("""k => document.querySelector('.pop .passo[data-campo=corretta]').getAttribute('aria-checked') === 'mixed'""", arg=k)
        p.keyboard.press('Escape')
        p.wait_for_timeout(500)
        c = self.server.api('/api/bootstrap?anno=2026')['celle'][k]
        self.assertEqual(c['k'], 2, 'la spunta del tecnico sul rapportino deve restare proposta (2)')
        # l'amministratore la vede nella pillola ambra e la approva
        a = self.pagina(operatore='Collaudo')
        a.wait_for_selector('#approva:not([hidden])')
        self.assertIn('da approvare', a.inner_text('#approva'))
        a.click('#approva')
        a.wait_for_selector('.foglio h2:has-text("Da approvare")')
        riga = a.locator('.foglio .elenco-diario li').first
        riga.locator('button:has-text("Approva")').click()
        a.wait_for_timeout(600)
        self.assertEqual(self.server.api('/api/bootstrap?anno=2026')['celle'][k]['k'], 1)
        a.keyboard.press('Escape')
        # il tecnico la vede approvata (SSE) senza ricaricare
        p.wait_for_function("k => document.querySelector(`.cella[data-cella=\"${k}\"]`).dataset.k === '1'", arg=k)

    def test_admin_vede_badge_e_voci(self):
        p = self.pagina(operatore='Collaudo')
        self.assertIn('ADMIN', p.inner_text('#io .ruolo').upper())
        voci = self.voci_azioni(p)
        for v in ('Completa tutte le spunte', 'Azzera tutte le spunte', 'Impostazioni',
                  'Elimina il diario attività'):
            self.assertIn(v, voci)

    def test_avviso_anagrafica_vecchia_una_volta_al_giorno(self):
        c = self.contesto(operatore='Collaudo', avviso_anagrafica=True)
        p = self.pagina(contesto=c)
        p.wait_for_selector('.avviso:has-text("Anagrafica")')
        p.reload()
        p.wait_for_selector('.crono .cella')
        p.wait_for_timeout(500)
        self.assertEqual(p.locator('.avviso:has-text("Anagrafica")').count(), 0)

    def test_operatore_non_si_fa_admin_col_nome(self):
        """Il ruolo viene dal server: un tecnico che forza le impostazioni
        dalla console riceve 403 e il server non cambia."""
        p = self.pagina(operatore='Biagio')
        self.permetti(r'risposta 403: POST .*/api/impostazioni')
        r = p.evaluate("""async () => (await import('/js/api.js')).chiama('/api/impostazioni',
          { metodo: 'POST', body: { inizio_tracciamento: '2020-01', operatore: 'Biagio' } })""")
        self.assertEqual(r['stato'], 403)
        self.assertEqual(self.server.api('/api/bootstrap')['inizio_tracciamento'], '2026-09')


class PinAdmin(CasoE2E):
    """Con `pin_admin` le azioni da amministratore chiedono il PIN."""
    EXTRA_CFG = {'pin_admin': '4321'}

    def setUp(self):
        super().setUp()
        # il primo tentativo senza PIN risponde 403 con pin_richiesto: e' il giro previsto
        self.permetti(r'risposta 403: POST .*/api/(impostazioni|attivita|diario_azzera|ruolo)')

    def apri_impostazioni(self, p, mese):
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Impostazioni")')
        p.wait_for_selector('.foglio h2:has-text("Impostazioni")')
        p.fill('.foglio input[type=month]', mese)
        p.click('.foglio button.bottone:has-text("Salva")')

    def test_pin_giusto_salva_e_resta_per_la_sessione(self):
        p = self.pagina(operatore='Collaudo')
        self.apri_impostazioni(p, '2026-03')
        p.wait_for_selector('#pin-admin')
        self.assertEqual(p.get_attribute('#pin-admin', 'type'), 'password')
        p.fill('#pin-admin', '4321')
        p.press('#pin-admin', 'Enter')
        p.wait_for_selector('.avviso:has-text("Tracciamento a partire da 2026-03")')
        p.wait_for_timeout(300)
        self.assertEqual(self.server.api('/api/bootstrap')['inizio_tracciamento'], '2026-03')
        # seconda volta: niente PIN, e' in sessionStorage
        self.apri_impostazioni(p, '2026-09')
        p.wait_for_selector('.avviso:has-text("2026-09")')
        self.assertEqual(p.locator('#pin-admin').count(), 0)
        self.assertEqual(self.server.api('/api/bootstrap')['inizio_tracciamento'], '2026-09')

    def test_pin_rifiutato_non_dice_salvato(self):
        p = self.pagina(operatore='Collaudo')
        self.apri_impostazioni(p, '2026-05')
        p.wait_for_selector('#pin-admin')
        p.click('.foglio button:has-text("Lascia stare")')      # niente PIN
        p.wait_for_timeout(600)
        self.assertEqual(self.server.api('/api/bootstrap')['inizio_tracciamento'], '2026-09')
        self.assertEqual(p.locator('.avviso:has-text("Tracciamento a partire da 2026-05")').count(), 0,
                         'senza PIN il server rifiuta, ma l\'app dice "Tracciamento a partire da..."')


if __name__ == '__main__':
    unittest.main()
