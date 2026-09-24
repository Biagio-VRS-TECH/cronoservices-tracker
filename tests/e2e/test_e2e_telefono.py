"""Il telefono: 375x812 e 390x844, col tocco. Niente scorrimento orizzontale
della pagina, comandi principali da pollice (>= 44 px, contando il ::after
che allarga il bersaglio), campi a 16 px (niente zoom di iOS), niente di
fisso che si mangia lo schermo o copre i comandi, pieghevoli che si aprono.
Le immagini dei passi principali vanno in %TEMP%/crono_e2e_foto.

    python -m unittest tests.e2e.test_e2e_telefono
"""
import unittest

from ._server_e2e import CasoE2E, TELEFONO, TELEFONO_GRANDE

# [nome, larghezza, altezza del bersaglio, rettangolo] per ogni elemento visibile
BERSAGLI = """sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length).map(e => {
  const r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after');
  let w = r.width, h = r.height;
  if (a.content !== 'none' && a.position === 'absolute') {
    w = Math.max(w, parseFloat(a.width) || 0); h = Math.max(h, parseFloat(a.height) || 0);
  }
  return [(e.id ? '#' + e.id : e.className || e.tagName) + ' ' + (e.textContent || e.placeholder || '').trim().slice(0, 16),
          Math.round(w), Math.round(h), [r.left, r.top, r.right, r.bottom].map(Math.round)];
})"""

SCORRE_DI_LATO = "document.documentElement.scrollWidth > innerWidth + 1"

# (caselle e bottoni radio non si scrivono: iOS non ingrandisce per quelli)
CAMPI_PICCOLI = """sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length)
  .filter(e => !['checkbox', 'radio', 'range', 'color', 'file'].includes(e.type))
  .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16)
  .map(e => (e.id || e.className || e.tagName) + ' ' + getComputedStyle(e).fontSize)"""

FUORI_SCHERMO = """sel => { const n = document.querySelector(sel); if (!n) return 'manca ' + sel;
  const r = n.getBoundingClientRect();
  return (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1)
    ? sel + ' esce dallo schermo: ' + [r.left, r.top, r.right, r.bottom].map(Math.round) : null; }"""


class Telefono(CasoE2E):
    FORMA = TELEFONO
    NOME = '375'

    def apri(self):
        return self.pagina(forma=self.FORMA, nome='telefono ' + self.NOME)

    def piccoli(self, p, sel, minimo=44):
        return [b for b in p.evaluate(BERSAGLI, sel) if b[1] < minimo or b[2] < minimo]

    def niente_scorrimento(self, p, dove):
        self.assertFalse(p.evaluate(SCORRE_DI_LATO),
                         '%s: la pagina scorre di lato (%s > %s)' % (
                             dove, p.evaluate('document.documentElement.scrollWidth'),
                             p.evaluate('innerWidth')))

    def test_anno_testa_bersagli_campi(self):
        p = self.apri()
        self.foto(p, self.NOME + '-anno')
        self.niente_scorrimento(p, 'vista Anno')
        # la testa e' UNA riga (logo, anno, spia, operatore, tema) piu' la ricerca
        riga = p.evaluate("""() => ['#anno-giu', '#collegamento', '#io', '#tema'].map(s => {
            const r = document.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.top + r.height / 2)]; })""")
        centro = riga[0][1]
        fuori = [s for s, y in riga if abs(y - centro) > 8]
        self.assertFalse(fuori, 'la testa va a capo: %s non stanno sulla riga dell\'anno (%r)' % (fuori, riga))
        alta = p.evaluate("document.querySelector('.testa').getBoundingClientRect().height")
        self.assertLessEqual(alta, 112, 'la testa (sticky) e\' alta %d px' % alta)
        # bersagli dei comandi principali
        sel = ('#app-scelta, #anno-giu, #anno-su, #oggi, #collegamento, #io, #tema, '
               '#viste button, #f-stato button, #f-prov, #f-chiusi, #documenti, #azioni, #aiuto, '
               '.piega-tutti, .riga-cli, .riga-srv .mesi > .q:has(.cella)')
        self.assertFalse(self.piccoli(p, sel), 'bersagli sotto i 44 px')
        # campi a 16 px
        self.assertFalse(p.evaluate(CAMPI_PICCOLI, 'input, select, textarea'))
        # pieghevoli: il cliente si chiude e si riapre col tocco
        cli = p.locator('.blocco').first.get_attribute('data-cli')
        p.locator('.blocco[data-cli="%s"] .riga-cli' % cli).tap()
        p.wait_for_function('c => !document.querySelector(`.blocco[data-cli="${c}"] .riga-srv`)', arg=cli)
        p.locator('.blocco[data-cli="%s"] .riga-cli' % cli).tap()
        p.wait_for_selector('.blocco[data-cli="%s"] .riga-srv' % cli)
        p.locator('.piega-tutti').tap()
        p.wait_for_function('!document.querySelector(".riga-srv")')
        self.foto(p, self.NOME + '-anno-chiusi')
        p.locator('.piega-tutti').tap()
        p.wait_for_selector('.riga-srv')

    def test_anno_popover_da_pollice_e_dentro_lo_schermo(self):
        p = self.apri()
        q = p.locator('.riga-srv .mesi > .q:has(.cella)').nth(2)
        q.scroll_into_view_if_needed()
        q.tap()
        p.wait_for_selector('.pop .passo')
        p.wait_for_timeout(300)
        self.foto(p, self.NOME + '-popover')
        self.assertIsNone(p.evaluate(FUORI_SCHERMO, '.pop'))
        self.assertFalse(self.piccoli(p, '.pop .passo, .pop .pop-piede button'),
                         'nel popover i comandi sono sotto i 44 px')
        self.assertFalse(p.evaluate(CAMPI_PICCOLI, '.pop textarea'))
        self.niente_scorrimento(p, 'popover')
        # la sticky della testa non copre il popover
        coperto = p.evaluate("""() => { const r = document.querySelector('.pop .passo').getBoundingClientRect();
          const n = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !(n && n.closest('.pop')); }""")
        self.assertFalse(coperto, 'il primo passo del popover e\' coperto')
        prima = p.get_attribute('.pop .passo[data-campo="stampata"]', 'aria-checked')
        p.locator('.pop .passo[data-campo="stampata"]').tap()
        p.wait_for_function("v => document.querySelector('.pop .passo[data-campo=stampata]').getAttribute('aria-checked') !== v",
                            arg=prima)
        p.keyboard.press('Escape')

    def test_mese_statistiche_e_barra_multipla(self):
        p = self.apri()
        p.locator('#viste [data-vista="mese"]').tap()
        p.wait_for_selector('.mese-testa')
        p.wait_for_timeout(400)
        self.foto(p, self.NOME + '-mese')
        self.niente_scorrimento(p, 'vista Mese')
        self.assertFalse(self.piccoli(p, '.mese-nav button, .scheda .passo, .scheda .selez'))
        # un tocco su una casella
        passo = p.locator('.scheda .passo[aria-checked="false"]').first
        srv = passo.evaluate("b => b.closest('.scheda').dataset.srv")
        campo = passo.get_attribute('data-campo')
        passo.tap()
        p.wait_for_function("([s, c]) => document.querySelector(`.scheda[data-srv=\"${s}\"] .passo[data-campo=\"${c}\"]`).getAttribute('aria-checked') !== 'false'",
                            arg=[srv, campo])
        # la barra delle azioni multiple (ctrl+clic: sul telefono serve una
        # tastiera, ma se compare deve stare nello schermo)
        ids = p.eval_on_selector_all('.lavoro .scheda', 'ss => ss.slice(0, 2).map(s => s.dataset.srv)')
        for i in ids:
            p.click('.scheda[data-srv="%s"] .selez' % i, modifiers=['Control'])
        p.wait_for_selector('.barra-massa')
        p.wait_for_timeout(400)
        self.foto(p, self.NOME + '-barra-multipla')
        self.assertIsNone(p.evaluate(FUORI_SCHERMO, '.barra-massa'))
        self.assertFalse(self.piccoli(p, '.barra-massa button'))
        p.locator('.barra-massa [data-az="annulla"]').tap()
        p.wait_for_selector('.barra-massa', state='detached')
        # Statistiche
        p.locator('#viste [data-vista="stat"]').tap()
        p.wait_for_selector('.stat .eroe')
        p.wait_for_timeout(900)
        self.niente_scorrimento(p, 'Statistiche')
        self.foto(p, self.NOME + '-statistiche', intera=True)

    def test_finestre_menu_cassetto(self):
        p = self.apri()
        # menu Azioni dentro lo schermo
        p.locator('.strumenti-striscia').evaluate('n => n.scrollLeft = n.scrollWidth')
        p.locator('#azioni').tap()
        p.wait_for_selector('.tendina')
        p.wait_for_timeout(300)           # finita l'entrata (scala): le misure sono quelle vere
        self.assertIsNone(p.evaluate(FUORI_SCHERMO, '.tendina'))
        self.assertFalse(self.piccoli(p, '.tendina .voce'))
        self.foto(p, self.NOME + '-azioni')
        p.locator('.tendina .voce:has-text("Impostazioni")').tap()
        p.wait_for_selector('.foglio h2:has-text("Impostazioni")')
        p.wait_for_timeout(300)           # finita l'entrata della finestra
        self.niente_scorrimento(p, 'Impostazioni')
        lati = p.evaluate("(() => { const r = document.querySelector('.foglio').getBoundingClientRect(); return [r.left, r.right]; })()")
        self.assertTrue(lati[0] >= -1 and lati[1] <= p.evaluate('innerWidth') + 1, 'la finestra esce di lato: %r' % lati)
        self.assertFalse(p.evaluate(CAMPI_PICCOLI, '.foglio input, .foglio select'))
        self.assertFalse(self.piccoli(p, '.foglio .bottone, .foglio .righe-scelta button'))
        self.foto(p, self.NOME + '-impostazioni')
        p.keyboard.press('Escape')
        # legenda
        p.locator('#aiuto').tap()
        p.wait_for_selector('.foglio h2:has-text("Come si legge")')
        self.niente_scorrimento(p, 'legenda')
        self.foto(p, self.NOME + '-legenda')
        p.locator('.foglio button.bottone:has-text("Chiudi")').tap()
        # azione di massa: il campo OK a 16 px
        p.locator('.strumenti-striscia').evaluate('n => n.scrollLeft = n.scrollWidth')
        p.locator('#azioni').tap()
        p.locator('.tendina .voce:has-text("Completa tutte le spunte")').tap()
        p.wait_for_selector('.foglio .campo-ok')
        self.assertFalse(p.evaluate(CAMPI_PICCOLI, '.foglio input'))
        self.foto(p, self.NOME + '-massa')
        p.locator('.foglio button:has-text("Lascia stare")').tap()
        # cassetto del sito
        p.locator('.riga-srv .srv-dest').first.tap()
        p.wait_for_selector('.cassetto')
        p.wait_for_timeout(500)
        self.niente_scorrimento(p, 'cassetto')
        r = p.evaluate("JSON.parse(JSON.stringify(document.querySelector('.cassetto').getBoundingClientRect()))")
        self.assertLessEqual(r['right'], p.evaluate('innerWidth') + 1)
        self.assertGreaterEqual(r['left'], -1)
        self.assertFalse(p.evaluate(CAMPI_PICCOLI, '.cassetto input, .cassetto textarea'))
        self.foto(p, self.NOME + '-cassetto')
        p.keyboard.press('Escape')
        # pannello del collegamento
        p.locator('#collegamento').tap()
        p.wait_for_selector('.foglio h2:has-text("Lavorare in più persone")')
        self.niente_scorrimento(p, 'collegamento')
        p.keyboard.press('Escape')


class TelefonoGrande(Telefono):
    FORMA = TELEFONO_GRANDE
    NOME = '390'


if __name__ == '__main__':
    unittest.main()
