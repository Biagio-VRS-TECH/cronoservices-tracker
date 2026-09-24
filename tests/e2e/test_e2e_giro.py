"""Il giro vero nel browser, sul computer: primo accesso, vista Anno, vista
Mese, Statistiche, anni, ricerca e filtri, azioni di massa, impostazioni,
legenda, diario, note, cassetto dei PDF, doppioni, fascia rossa.

    python -m unittest tests.e2e.test_e2e_giro
"""
import base64, re, unittest

from ._server_e2e import CasoE2E, DESKTOP


def pdf_minimo():
    """Un PDF valido di una pagina, fatto a mano (%PDF ... %%EOF, xref giusta)."""
    ogg = [b'<</Type/Catalog/Pages 2 0 R>>',
           b'<</Type/Pages/Kids[3 0 R]/Count 1>>',
           b'<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>']
    out = bytearray(b'%PDF-1.4\n')
    pos = []
    for i, o in enumerate(ogg, 1):
        pos.append(len(out))
        out += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(ogg) + 1)
    for p in pos:
        out += b'%010d 00000 n \n' % p
    out += b'trailer\n<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF\n' % (len(ogg) + 1, xref)
    return bytes(out)


# La prima cella "piena" (mappatura dell'anno, non visita/stima/...) senza passi.
CELLA_LIBERA = """() => {
  for (const c of document.querySelectorAll('.crono .riga-srv .cella')) {
    if (c.matches('.visita,.stima,.darinnovare,.nontracciato,.completa')) continue;
    if (['s','c','k','r'].every(k => c.dataset[k] === '0')) return c.dataset.cella;
  }
  return null; }"""


# I bottoni del selettore che al loro centro hanno sopra un altro elemento.
BOTTONI_COPERTI = """sel => [...document.querySelectorAll(sel)].filter(b => {
  const r = b.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const n = document.elementFromPoint(x, y);
  return !(n && (n === b || b.contains(n)));
}).map(b => b.textContent.trim())"""


class Giro(CasoE2E):

    def apri_pop(self, p, chiave):
        p.locator('.cella[data-cella="%s"]' % chiave).scroll_into_view_if_needed()
        p.locator('.cella[data-cella="%s"]' % chiave).click()
        p.wait_for_selector('.pop .passo')

    def cella_server(self, chiave, anno=2026):
        return self.server.api('/api/bootstrap?anno=%d' % anno)['celle'].get(chiave)

    # --------------------------------------------------------- 1. accesso ---
    def test_primo_accesso_chiede_il_nome_e_lo_firma(self):
        p = self.pagina(operatore=None, aspetta='.foglio input.campo')
        self.assertIn('Chi sta lavorando', p.inner_text('.foglio h2'))
        # Esc non chiude: senza nome non si firma niente
        p.keyboard.press('Escape')
        self.assertEqual(p.locator('.foglio').count(), 1)
        # Invio a vuoto non passa
        p.press('.foglio input.campo', 'Enter')
        self.assertEqual(p.locator('.foglio').count(), 1)
        p.fill('.foglio input.campo', '  Prova E2E  ')
        p.press('.foglio input.campo', 'Enter')
        p.wait_for_selector('.foglio', state='detached')
        self.assertEqual(p.inner_text('#io b'), 'Prova E2E')
        self.assertEqual(p.evaluate("localStorage.getItem('cs.operatore')"), 'Prova E2E')
        p.wait_for_function("document.querySelector('#io').getAttribute('aria-label').includes('Prova E2E')")
        # il server l'ha registrato fra gli operatori
        p.wait_for_timeout(300)
        self.assertIn('Prova E2E', self.server.api('/api/bootstrap')['operatori'])

    # ------------------------------------------------------- 2. vista Anno ---
    def test_anno_griglia_popover_segmenti_e_conferma_del_server(self):
        p = self.pagina()
        self.assertEqual(p.locator('#viste [aria-pressed=true]').inner_text(), 'Anno')
        self.assertGreater(p.locator('.crono .cella').count(), 100)
        # la testa ha dodici mesi, con i totali "chiuse / in scadenza"
        self.assertEqual(p.locator('.crono-testa .m').count(), 12)
        self.assertGreater(p.locator('.crono-testa .tm:not(:empty)').count(), 0)
        k = p.evaluate(CELLA_LIBERA)
        self.assertTrue(k, 'nessuna cella libera nella griglia di prova')
        self.apri_pop(p, k)
        self.assertEqual(p.locator('.pop .passo').count(), 4)
        for i, campo in enumerate(['stampata', 'controllata', 'corretta', 'ricambi']):
            p.click('.pop .passo[data-campo="%s"]' % campo)
            self.aspetta_segmenti(p, k, '1' * (i + 1) + '0' * (3 - i))
        # quattro su quattro: la capsula si accende di verde
        p.wait_for_selector('.cella.completa[data-cella="%s"]' % k)
        self.foto(p, 'anno-cella-completa')
        p.keyboard.press('Escape')
        p.wait_for_selector('.pop', state='detached')
        # il fuoco torna alla cella
        self.assertEqual(p.evaluate('document.activeElement?.dataset?.cella'), k)
        # il server ha tutto (la coda si svuota)
        p.wait_for_function('() => !document.querySelector("#collegamento-et").textContent.includes("invio")')
        p.wait_for_timeout(300)
        c = self.cella_server(k)
        self.assertEqual((c['s'], c['c'], c['k'], c['r']), (1, 1, 1, 1))
        # "Completa/Azzera i passi" del popover: riazzera
        self.apri_pop(p, k)
        self.assertIn('Azzera', p.inner_text('.pop .js-tutte'))
        p.click('.pop .js-tutte')
        self.aspetta_segmenti(p, k, '0000')
        p.wait_for_timeout(300)
        self.assertEqual(p.locator('.pop').count(), 1,
                         '"Azzera i passi di questo mese" chiude il popover (ridisegno della griglia)')
        self.assertIn('Completa', p.inner_text('.pop .js-tutte'))
        p.click('.pop .js-tutte')
        self.aspetta_segmenti(p, k, '1111')
        # Storia
        p.click('.pop button.primario')
        p.wait_for_selector('.pop .storia li')
        p.mouse.click(5, 890)            # clic fuori chiude
        p.wait_for_selector('.pop', state='detached')

    def test_popover_vicino_al_fondo_resta_nello_schermo(self):
        """Il popover si mette sotto la cella, o sopra se sotto non ci sta. Se
        la misura si prende prima di riempire i passi, vicino al fondo della
        finestra esce di sotto per meta' (ed e' fixed: non ci si arriva)."""
        p = self.pagina()
        k = p.evaluate("""() => { const c = [...document.querySelectorAll('.crono .riga-srv .cella')]
            .filter(c => !c.matches('.visita,.stima,.darinnovare,.nontracciato'))[25];
          c.scrollIntoView({ block: 'end' }); scrollBy(0, 40); return c.dataset.cella; }""")
        p.wait_for_timeout(200)
        r = p.evaluate("k => document.querySelector(`.cella[data-cella=\"${k}\"]`).getBoundingClientRect().bottom", k)
        self.assertGreater(r, 700, 'la cella di prova doveva stare in fondo alla finestra')
        p.locator('.cella[data-cella="%s"]' % k).click()
        p.wait_for_selector('.pop .passo')
        fondo = p.evaluate("document.querySelector('.pop').getBoundingClientRect().bottom")
        self.assertLessEqual(fondo, p.evaluate('innerHeight'),
                             'il popover esce dal fondo della finestra (spunte.js apriPop misura prima di disegnaPassi)')

    def test_anno_nome_del_sito_apre_il_cassetto_e_cliente_si_piega(self):
        p = self.pagina()
        riga = p.locator('.riga-srv').first
        sid = riga.get_attribute('data-srv')
        riga.locator('.srv-dest').click()
        p.wait_for_selector('.cassetto')
        self.assertIn('#' + sid, p.inner_text('.cassetto'))
        self.foto(p, 'cassetto')
        p.keyboard.press('Escape')
        p.wait_for_selector('.cassetto', state='detached')
        # clic sul cliente: si chiude e si riapre
        blocco = p.locator('.blocco').first
        cli = blocco.get_attribute('data-cli')
        n = p.locator('.blocco[data-cli="%s"] .riga-srv' % cli).count()
        self.assertGreater(n, 0)
        p.click('.blocco[data-cli="%s"] .riga-cli .cli-nome' % cli)
        p.wait_for_function('c => !document.querySelector(`.blocco[data-cli="${c}"] .riga-srv`)', arg=cli)
        self.assertEqual(p.get_attribute('.blocco[data-cli="%s"] .riga-cli' % cli, 'aria-expanded'), 'false')
        p.click('.blocco[data-cli="%s"] .riga-cli .cli-nome' % cli)
        p.wait_for_selector('.blocco[data-cli="%s"] .riga-srv' % cli)
        # tastiera: Invio sulla riga cliente
        p.focus('.blocco[data-cli="%s"] .riga-cli' % cli)
        p.keyboard.press('Enter')
        p.wait_for_function('c => !document.querySelector(`.blocco[data-cli="${c}"] .riga-srv`)', arg=cli)
        p.keyboard.press('Enter')
        # "Chiudi tutti" / "Apri tutti"
        p.click('.piega-tutti')
        p.wait_for_function('!document.querySelector(".riga-srv")')
        self.assertIn('Apri tutti', p.inner_text('.piega-tutti'))
        p.click('.piega-tutti')
        p.wait_for_selector('.riga-srv')

    def test_nota_chiusa_con_esc_senza_uscire_dal_campo_si_salva(self):
        p = self.pagina()
        k = p.evaluate(CELLA_LIBERA)
        self.apri_pop(p, k)
        p.click('.pop textarea')
        p.keyboard.type('nota scritta e chiusa con Esc')
        p.keyboard.press('Escape')             # col fuoco ancora nel campo
        p.wait_for_selector('.pop', state='detached')
        p.wait_for_timeout(600)
        self.assertEqual(self.cella_server(k)['nota'], 'nota scritta e chiusa con Esc')
        # riaperto: c'e', e dopo la propria nota nessun "intanto ha scritto"
        self.apri_pop(p, k)
        self.assertEqual(p.input_value('.pop textarea'), 'nota scritta e chiusa con Esc')
        self.assertTrue(p.locator('.pop .js-eco-nota').is_hidden())
        # seconda nota: si esce dal campo col clic fuori
        p.fill('.pop textarea', 'seconda nota, clic fuori')
        p.mouse.click(5, 890)
        p.wait_for_selector('.pop', state='detached')
        p.wait_for_timeout(600)
        self.assertEqual(self.cella_server(k)['nota'], 'seconda nota, clic fuori')
        # terza: Tab fuori dal campo (change) e il popover resta aperto
        self.apri_pop(p, k)
        p.fill('.pop textarea', 'terza nota col Tab')
        p.keyboard.press('Tab')
        p.wait_for_timeout(700)
        self.assertTrue(p.locator('.pop .js-eco-nota').is_hidden(),
                        'dopo aver salvato la propria nota compare il banner "intanto ha scritto"')
        self.assertEqual(self.cella_server(k)['nota'], 'terza nota col Tab')
        # la cella dice che ha una nota
        p.keyboard.press('Escape')
        p.wait_for_selector('.cella.con-nota[data-cella="%s"]' % k)

    # ------------------------------------------------------- 3. vista Mese ---
    def test_mese_quattro_caselle_selezione_multipla_e_blocco(self):
        p = self.pagina()
        p.click('#viste [data-vista="mese"]')
        p.wait_for_selector('.mese-testa')
        # un mese con parecchie schede: si prova settembre..dicembre
        for m in (9, 10, 11, 12, 5, 4):
            p.click('.mese-nav [data-mese="%d"]' % m)
            p.wait_for_timeout(250)
            if p.locator('.lavoro .scheda').count() >= 3:
                break
        schede = p.locator('.lavoro .scheda')
        self.assertGreaterEqual(schede.count(), 3)
        self.assertEqual(schede.first.locator('.passo').count(), 4)
        self.foto(p, 'mese')
        # una casella: aria-checked cambia
        libere = p.evaluate("""() => [...document.querySelectorAll('.lavoro .scheda')]
          .filter(s => [...s.querySelectorAll('.passo')].every(b => b.getAttribute('aria-checked') === 'false'))
          .map(s => s.dataset.srv)""")
        self.assertGreaterEqual(len(libere), 2, 'servono due schede vuote nel mese')
        a, b = libere[0], libere[1]
        passo = p.locator('.scheda[data-srv="%s"] .passo[data-campo="stampata"]' % a)
        passo.click()
        p.wait_for_function('s => document.querySelector(`.scheda[data-srv="${s}"] .passo[data-campo="stampata"]`).getAttribute("aria-checked") === "true"', arg=a)
        # selezione multipla col ctrl+clic sul pallino, poi "Completa i 4 passi"
        p.click('.scheda[data-srv="%s"] .selez' % a, modifiers=['Control'])
        p.click('.scheda[data-srv="%s"] .selez' % b, modifiers=['Control'])
        p.wait_for_selector('.barra-massa')
        self.assertIn('2', p.inner_text('.barra-massa b'))
        # un avviso qualunque (stanno in basso al centro, come la barra) non
        # deve coprire i bottoni della barra delle azioni multiple
        p.evaluate("import('/js/ui.js').then(m => m.avviso('Un avviso lungo, come quelli da 15 secondi', { durata: 0 }))")
        p.wait_for_selector('.avviso')
        p.wait_for_timeout(500)           # finite le entrate di barra e avviso
        coperti = p.evaluate(BOTTONI_COPERTI, '.barra-massa button')
        self.assertFalse(coperti, 'un avviso copre i bottoni della barra: %r' % coperti)
        self.foto(p, 'mese-selezione')
        p.click('.barra-massa [data-az="tutte"]')
        p.wait_for_selector('.barra-massa', state='detached')
        # 3 passi su a (uno c'era) + 4 su b
        p.wait_for_selector('.avviso:has-text("7 spunte inviate")')
        for s in (a, b):
            p.wait_for_selector('.scheda.finita[data-srv="%s"]' % s)
        # clic sul pallino di una scheda completa: toglie i quattro passi, con avviso
        p.click('.scheda[data-srv="%s"] .selez' % a)
        p.wait_for_selector('.avviso:has-text("Tolti i 4 passi")')
        p.wait_for_function('s => !document.querySelector(`.scheda[data-srv="${s}"]`).classList.contains("finita")', arg=a)
        # tastiera: 1 sulla scheda col fuoco
        p.focus('.scheda[data-srv="%s"]' % a)
        p.keyboard.press('2')
        p.wait_for_function('s => document.querySelector(`.scheda[data-srv="${s}"] .passo[data-campo="controllata"]`).getAttribute("aria-checked") === "true"', arg=a)

    # ---------------------------------------------- 4. statistiche, anni ----
    def test_statistiche_si_disegnano_e_i_tasti_cambiano_vista(self):
        p = self.pagina()
        p.click('#viste [data-vista="stat"]')
        p.wait_for_selector('.stat .eroe')
        p.wait_for_timeout(800)
        self.assertGreater(p.locator('.stat svg').count(), 3)
        self.assertTrue(p.locator('#riepilogo').is_hidden())
        self.foto(p, 'statistiche', intera=True)
        # Espandi dell'elenco per sito
        esp = p.locator('button:has-text("Espandi")')
        if esp.count():
            esp.first.click()
            p.wait_for_selector('.foglio.largo')
            p.keyboard.press('Escape')
            p.wait_for_selector('.foglio.largo', state='detached')
        # tasti A / M / S
        p.locator('body').click(position={'x': 2, 'y': 300})
        p.keyboard.press('m')
        p.wait_for_selector('.mese-testa')
        p.keyboard.press('a')
        p.wait_for_selector('.crono .cella')
        p.keyboard.press('s')
        p.wait_for_selector('.stat .eroe')

    def test_cambio_anno_frecce_e_oggi(self):
        p = self.pagina()
        self.assertEqual(p.inner_text('#anno'), '2026')
        p.click('#anno-giu')
        p.wait_for_function('document.querySelector("#anno").textContent === "2025" && !document.querySelector("#anno").classList.contains("caricando")')
        p.wait_for_selector('.crono')
        self.assertIn('2025', p.title() + p.inner_text('#anno'))
        # tre clic rapidi: si arriva all'ultimo obiettivo
        p.click('#anno-su'); p.click('#anno-su'); p.click('#anno-su')
        p.wait_for_function('document.querySelector("#anno").textContent === "2028" && !document.querySelector("#anno").classList.contains("caricando")')
        p.click('#oggi')
        p.wait_for_function('document.querySelector("#anno").textContent === "2026" && !document.querySelector("#anno").classList.contains("caricando")')
        p.wait_for_selector('.crono .cella')

    def test_ricerca_e_filtri(self):
        p = self.pagina()
        tutte = p.locator('.riga-srv').count()
        sid = p.locator('.riga-srv').nth(3).get_attribute('data-srv')
        p.keyboard.press('/')
        self.assertEqual(p.evaluate('document.activeElement.id'), 'q')
        p.keyboard.type('#' + sid)
        p.wait_for_function('s => document.querySelectorAll(".riga-srv").length === 1 && document.querySelector(".riga-srv").dataset.srv === s', arg=sid)
        self.assertTrue(p.locator('#cerca-x').is_visible())
        # Esc esce dal campo, la croce svuota
        p.keyboard.press('Escape')
        p.click('#cerca-x')
        p.wait_for_function('n => document.querySelectorAll(".riga-srv").length === n', arg=tutte)
        # ricerca che non trova niente: stato vuoto con la via d'uscita
        p.fill('#q', 'zzzz-nessuno-si-chiama-cosi')
        p.wait_for_selector('.crono .vuoto')
        self.assertIn('Nessun sito', p.inner_text('.crono .vuoto'))
        p.click('#cerca-x')
        p.wait_for_selector('.riga-srv')
        # filtro di stato: Complete, poi il numero in testa lo toglie
        p.click('#f-stato [data-stato="complete"]')
        p.wait_for_function('document.querySelector("#f-stato [data-stato=complete]").getAttribute("aria-pressed") === "true"')
        p.wait_for_timeout(300)
        self.assertLess(p.locator('.riga-srv').count(), tutte)
        p.click('#riepilogo [data-stato="complete"]')
        p.wait_for_function('document.querySelector("#f-stato [data-stato=\'\']").getAttribute("aria-pressed") === "true"')
        # provincia
        opz = p.eval_on_selector_all('#f-prov option', 'os => os.map(o => o.value).filter(Boolean)')
        self.assertTrue(opz)
        p.select_option('#f-prov', opz[0])
        p.wait_for_timeout(400)
        self.assertLess(p.locator('.riga-srv').count(), tutte)
        # il filtro sopravvive al ricarico (salvaFiltri)
        p.reload()
        p.wait_for_selector('.crono')
        self.assertEqual(p.input_value('#f-prov'), opz[0])
        p.select_option('#f-prov', '')
        # Mostra chiusi
        p.click('#f-chiusi')
        self.assertEqual(p.get_attribute('#f-chiusi', 'aria-pressed'), 'true')
        p.click('#f-chiusi')

    # ------------------------------------------------- 5. azioni di massa ---
    def test_massa_completa_con_ok_e_annulla(self):
        p = self.pagina()
        k = p.evaluate(CELLA_LIBERA)
        sid = k.split('-')[0]
        p.fill('#q', '#' + sid)
        p.wait_for_function('document.querySelectorAll(".riga-srv").length === 1')
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Completa tutte le spunte")')
        p.wait_for_selector('.foglio .campo-ok')
        testo = p.inner_text('.foglio')
        self.assertIn('#' + sid, testo)          # la conferma dice i filtri
        self.assertRegex(testo, r'\d+ spunte? da mettere')
        bott = p.locator('.foglio button.bottone:not(.piatto)')
        self.assertTrue(bott.is_disabled(), 'il bottone parte spento finche\' non si scrive OK')
        p.fill('.foglio .campo-ok', 'ok')
        self.assertTrue(bott.is_enabled())
        bott.click()
        p.wait_for_selector('.avviso button:has-text("Annulla")')
        self.aspetta_segmenti(p, k, '1111')
        p.click('.avviso button:has-text("Annulla")')
        self.aspetta_segmenti(p, k, '0000')
        p.wait_for_selector('.avviso:has-text("Annullato")')
        p.wait_for_timeout(500)
        c = self.cella_server(k) or {'s': 0, 'c': 0, 'k': 0, 'r': 0}
        self.assertEqual((c['s'], c['c'], c['k'], c['r']), (0, 0, 0, 0))

    def test_massa_senza_niente_da_fare_non_offre_annulla(self):
        """Il conto e' fatto quando si apre la finestra: se nel frattempo un
        collega ha gia' messo quelle spunte, l'azione cambia 0 spunte e
        l'Annulla non deve comparire (disfarebbe il niente, o altro)."""
        p = self.pagina()
        k = p.evaluate(CELLA_LIBERA)
        sid, mese = (int(x) for x in k.split('-'))
        p.fill('#q', '#%d' % sid)
        p.wait_for_function('document.querySelectorAll(".riga-srv").length === 1')
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Completa tutte le spunte")')
        p.wait_for_selector('.foglio .campo-ok')
        p.fill('.foglio .campo-ok', 'OK')
        # intanto un collega completa la cella (arriva per SSE)
        for campo in ('stampata', 'controllata', 'corretta', 'ricambi'):
            self.server.api('/api/toggle', {'id_service': sid, 'anno': 2026, 'mese': mese,
                                            'campo': campo, 'valore': 1, 'operatore': 'Collaudo'})
        self.aspetta_segmenti(p, k, '1111')
        p.click('.foglio button.bottone:not(.piatto)')
        p.wait_for_selector('.foglio', state='detached')
        p.wait_for_timeout(400)
        self.assertEqual(p.locator('.avviso button:has-text("Annulla")').count(), 0,
                         'con 0 spunte cambiate l\'avviso offre comunque "Annulla"')

    def test_massa_azzera_senza_niente_e_un_chiudi(self):
        p = self.pagina()
        p.fill('#q', 'zzzz-nessuno')
        p.wait_for_selector('.crono .vuoto')
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Azzera tutte le spunte")')
        p.wait_for_selector('.foglio')
        self.assertEqual(p.locator('.foglio .campo-ok:visible').count(), 0)
        self.assertEqual(p.inner_text('.foglio button.bottone:not(.piatto)'), 'Chiudi')
        p.click('.foglio button.bottone:not(.piatto)')
        p.wait_for_selector('.foglio', state='detached')

    # ------------------------------------ 6. impostazioni, legenda, diario ---
    def test_impostazioni_legenda_tasti_diario_doppioni(self):
        p = self.pagina()
        # legenda con "?"
        p.locator('body').click(position={'x': 2, 'y': 300})
        p.keyboard.press('?')
        p.wait_for_selector('.foglio h2:has-text("Come si legge")')
        self.assertIn('Tasti', p.inner_text('.foglio'))
        self.foto(p, 'legenda')
        p.keyboard.press('Escape')
        p.wait_for_selector('.foglio', state='detached')
        p.click('#aiuto')
        p.wait_for_selector('.foglio h2:has-text("Come si legge")')
        p.click('.foglio button.bottone:has-text("Chiudi")')
        # impostazioni (admin)
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Impostazioni")')
        p.wait_for_selector('.foglio h2:has-text("Impostazioni")')
        self.assertEqual(p.input_value('.foglio input[type=month]'), '2026-09')
        self.assertGreater(p.locator('.foglio .righe-scelta button').count(), 0)
        self.foto(p, 'impostazioni')
        p.fill('.foglio input[type=month]', '2026-01')
        p.click('.foglio button.bottone:has-text("Salva")')
        p.wait_for_selector('.avviso:has-text("Tracciamento a partire da 2026-01")')
        p.wait_for_timeout(300)
        self.assertEqual(self.server.api('/api/bootstrap')['inizio_tracciamento'], '2026-01')
        # e si rimette com'era
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Impostazioni")')
        p.fill('.foglio input[type=month]', '2026-09')
        p.click('.foglio button.bottone:has-text("Salva")')
        p.wait_for_selector('.avviso:has-text("2026-09")')
        # diario
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Diario attività")')
        p.wait_for_selector('.foglio h2:has-text("Diario")')
        p.wait_for_function('!document.querySelector(".foglio .diario").textContent.includes("Leggo")')
        self.foto(p, 'diario')
        p.keyboard.press('Escape')
        # doppioni
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Possibili doppioni")')
        p.wait_for_selector('.foglio h2:has-text("Possibili doppioni")')
        p.keyboard.press('Escape')
        # pannello del collegamento e "chi sono"
        p.click('#collegamento')
        p.wait_for_selector('.foglio h2:has-text("Lavorare in più persone")')
        p.keyboard.press('Escape')
        p.click('#io')
        p.wait_for_selector('.foglio h2:has-text("Chi sta lavorando")')
        self.assertIn('amministratore', p.inner_text('.foglio').lower())
        p.keyboard.press('Escape')
        # Azioni fuori dalla vista Anno: la massa rimanda alla vista Anno
        p.click('#viste [data-vista="mese"]')
        p.click('#azioni')
        p.click('.tendina .voce:has-text("Completa tutte le spunte")')
        p.wait_for_selector('.avviso:has-text("vista Anno")')

    # ------------------------------------------------- 7. cassetto e PDF ----
    def test_cassetto_pdf_consegnato_elencato_ed_eliminato(self):
        p = self.pagina()
        riga = p.locator('.riga-srv').nth(1)
        sid = int(riga.get_attribute('data-srv'))
        b64 = base64.b64encode(pdf_minimo()).decode()
        # la consegna che fa il generatore (documenti.salvaDocumento), dallo
        # stesso modulo che usa l'app
        r = p.evaluate("""async ([sid, b64]) => {
          const m = await import('/js/documenti.js');
          const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const pdf = new Blob([bin], { type: 'application/pdf' });
          return await m.salvaDocumento({ id_service: sid, anno: 2026, nome: 'prova e2e.pdf',
                                          pdf, pagine: 1, tipo: 'registro' });
        }""", [sid, b64])
        self.assertTrue(r['documento']['id'])
        riga.locator('.srv-dest').click()
        p.wait_for_selector('.cassetto')
        p.wait_for_selector('.cassetto .doc-lista li:has-text("prova e2e")')
        p.wait_for_timeout(1000)          # l'eco del documento (SSE) ridisegna la sezione
        self.foto(p, 'cassetto-pdf')
        # si apre (scarica) davvero
        voce = p.locator('.cassetto .doc-lista li:has-text("prova e2e")')
        with p.expect_popup() as pop:
            voce.locator('button:has-text("Apri")').click()
        pop.value.close()
        # Elimina in due tempi
        el = voce.locator('.doc-azioni button.debole')    # il testo cambia: niente has-text
        self.assertEqual(el.inner_text(), 'Elimina')
        el.click()
        self.assertIn('Sicuro', el.inner_text())
        p.wait_for_timeout(400)
        el.click()
        p.wait_for_selector('.avviso:has-text("PDF eliminato")')
        p.wait_for_selector('.cassetto .doc-lista li:has-text("prova e2e")', state='detached')
        docs = self.server.api('/api/documenti?anno=2026')['documenti']
        self.assertFalse([d for d in docs if d['id'] == r['documento']['id']])


class FasciaRossa(CasoE2E):
    """Due server in rete: la fascia rossa, e il suo link solo se http(s)."""
    ALTRI_SERVER = [
        {'ip': '10.9.9.9', 'host': 'PC-ALTRO', 'url': 'http://10.9.9.9:8770'},
        {'ip': '10.9.9.8', 'host': 'PC-STRANO', 'url': 'javascript:alert(1)'},
    ]

    def test_fascia_rossa_col_link_solo_http(self):
        p = self.pagina()
        p.wait_for_selector('#banner.grave')
        testo = p.inner_text('#banner')
        self.assertIn('PC-ALTRO', testo)
        self.assertIn('PC-STRANO', testo)
        hrefs = p.eval_on_selector_all('#banner a', 'as => as.map(a => a.getAttribute("href"))')
        self.assertIn('http://10.9.9.9:8770', hrefs)
        self.assertFalse([h for h in hrefs if not re.match(r'^https?://', h or '')],
                         'la fascia rossa fa un link con un indirizzo non http(s): %r' % hrefs)
        self.foto(p, 'fascia-rossa')


if __name__ == '__main__':
    unittest.main()
