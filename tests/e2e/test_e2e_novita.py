"""Le Novita' nel tracker vero (js/vrs-novita.js, identico al Planning): il
riassunto si apre da solo una volta, si chiude con Esc e il fuoco torna, il
dettaglio ha le sezioni pieghevoli e lo storico, sul telefono e' un foglio dal
basso con bersagli da 44 px e senza scorrimento di lato. Le immagini vanno in
%TEMP%/crono_e2e_foto.

    python -m unittest tests.e2e.test_e2e_novita
"""
import unittest

from ._server_e2e import CasoE2E, DESKTOP, TELEFONO_GRANDE


class Novita(CasoE2E):

    def apri(self, forma):
        c = self.contesto(forma=forma, novita_viste=False)
        p = self.pagina(contesto=c, nome='novita %s' % forma['viewport']['width'])
        p.wait_for_selector('.vrs-nov-velo', timeout=15000)
        p.wait_for_timeout(1500)
        return c, p

    def test_riassunto_dettaglio_esc_e_non_torna(self):
        c, p = self.apri(DESKTOP)
        self.foto(p, 'riassunto')
        self.assertEqual(p.evaluate('document.activeElement.textContent'), 'Ho capito')
        self.assertEqual(p.evaluate("document.querySelector('.vrs-nov-btn').dataset.nuove"), 'no')
        p.click('.vrs-nov-link')
        p.wait_for_selector('.vrs-nov-sfoglia')
        p.wait_for_timeout(300)
        self.foto(p, 'dettaglio')
        nomi = p.eval_on_selector_all('details.vrs-nov-sez .vrs-nov-sez-nome', 'n => n.map(x => x.textContent)')
        self.assertTrue(set(nomi) <= {'Novità', 'Miglioramenti', 'Bug risolti'} and nomi)
        self.assertIn('settembre 2026', p.text_content('.vrs-nov-sfoglia-data'))
        p.keyboard.press('Escape')
        p.wait_for_function("!document.querySelector('.vrs-nov-velo')")
        self.assertEqual(p.evaluate("document.activeElement.className"), 'vrs-nov-btn')
        # ricaricando non si ripresenta
        p.reload()
        p.wait_for_selector('.crono .cella')
        p.wait_for_timeout(3000)
        self.assertFalse(p.evaluate("!!document.querySelector('.vrs-nov-velo')"))
        # il tasto lo riapre
        p.click('.vrs-nov-btn')
        p.wait_for_selector('.vrs-nov-velo')

    def test_telefono(self):
        c, p = self.apri(TELEFONO_GRANDE)
        self.foto(p, 'telefono-riassunto')
        self.assertFalse(p.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
        piccoli = p.evaluate("""() => [...document.querySelectorAll('.vrs-nov button')]
            .map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).length""")
        self.assertEqual(piccoli, 0, 'bersagli sotto i 44 px nel riassunto')
        # i comandi stanno in fondo, sotto il pollice
        fondo = p.evaluate("document.querySelector('.vrs-nov-ok').getBoundingClientRect().bottom")
        self.assertGreater(fondo, p.evaluate('innerHeight') - 120)
        p.tap('.vrs-nov-link')
        p.wait_for_selector('.vrs-nov-sfoglia')
        p.wait_for_timeout(300)
        aperte = p.eval_on_selector_all('details.vrs-nov-sez', 'd => d.map(x => x.open)')
        self.assertEqual(aperte[0], True)
        self.assertFalse(any(aperte[1:]), 'sul telefono solo la prima sezione parte aperta')
        self.foto(p, 'telefono-dettaglio')


if __name__ == '__main__':
    unittest.main()
