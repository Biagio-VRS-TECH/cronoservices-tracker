"""Gemello Python di scripts/validate_palette.js della skill `dataviz`.

Esiste perche' lo script della skill e' in JS e su questi PC non c'e' Node.
Stesse soglie e stesse matrici Machado-Oliveira-Fernandes (severita' 1.0), quindi
i risultati sono confrontabili.

    python docs/ai/valida-tavolozza.py

Il `__main__` in fondo contiene i set effettivamente usati dall'app (i quattro
passi della cella e le quattro classi temporali dei grafici) in tema chiaro e
scuro: se si toccano quei colori in `web/css/theme.css`, cambiare gli hex qui e
rilanciare. Cosa si controlla, per ogni tinta: banda di chiarezza OKLCH,
saturazione minima, contrasto WCAG sulla superficie; e per ogni coppia adiacente
la distanza in OKLab (x100) sotto protanopia/deuteranopia (soglia 8, minimo 6) e
a vista normale (minimo 15).
"""
import math, sys
BAND={'light':(0.43,0.77),'dark':(0.48,0.67)}
CHROMA_FLOOR=0.10; CVD_TARGET=8.0; CVD_FLOOR=6.0; NORMAL_FLOOR=15.0; CONTRAST_MIN=3.0
MACHADO={'protan':[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
 'deutan':[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
 'tritan':[[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]]}
def s2lin(c): return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lin(h):
    h=h.strip().lstrip('#'); return [s2lin(int(h[i:i+2],16)/255) for i in (0,2,4)]
def relLum(h):
    r,g,b=lin(h); return .2126*r+.7152*g+.0722*b
def contrast(a,b):
    hi,lo=sorted([relLum(a),relLum(b)],reverse=True); return (hi+.05)/(lo+.05)
def oklab_lin(v):
    r,g,b=v
    l=(0.4122214708*r+0.5363325363*g+0.0514459929*b)**(1/3) if (0.4122214708*r+0.5363325363*g+0.0514459929*b)>0 else 0
    m=(0.2119034982*r+0.6806995451*g+0.1073969566*b)**(1/3) if (0.2119034982*r+0.6806995451*g+0.1073969566*b)>0 else 0
    s=(0.0883024619*r+0.2817188376*g+0.6299787005*b)**(1/3) if (0.0883024619*r+0.2817188376*g+0.6299787005*b)>0 else 0
    return (0.2104542553*l+0.7936177850*m-0.0040720468*s,
            1.9779984951*l-2.4285922050*m+0.4505937099*s,
            0.0259040371*l+0.7827717662*m-0.8086757660*s)
def oklch(h):
    L,a,b=oklab_lin(lin(h)); return L, math.hypot(a,b)
def sim(h,kind):
    r,g,b=lin(h); M=MACHADO[kind]
    return [min(1,max(0,M[i][0]*r+M[i][1]*g+M[i][2]*b)) for i in range(3)]
def dE(h1,h2,kind=None):
    a=oklab_lin(sim(h1,kind) if kind else lin(h1)); b=oklab_lin(sim(h2,kind) if kind else lin(h2))
    return 100*math.dist(a,b)
def run(pal,mode,surface,nomi=None):
    lo,hi=BAND[mode]; bad=False
    print(f"\n=== modo {mode}, superficie {surface} ===")
    print(f"{'colore':<10} {'nome':<14} {'L':>6} {'C':>6} {'contr':>6}  esiti")
    for i,h in enumerate(pal):
        L,C=oklch(h); cr=contrast(h,surface); e=[]
        e.append('L ok' if lo<=L<=hi else f'L FUORI BANDA [{lo},{hi}]')
        e.append('C ok' if C>=CHROMA_FLOOR else 'C sotto floor (neutro)')
        e.append('contrasto ok' if cr>=CONTRAST_MIN else 'contrasto WARN <3:1')
        if 'FUORI' in e[0]: bad=True
        print(f"{h:<10} {(nomi[i] if nomi else ''):<14} {L:6.3f} {C:6.3f} {cr:6.2f}  {', '.join(e)}")
    print("coppie adiacenti:")
    for i in range(len(pal)-1):
        a,b=pal[i],pal[i+1]
        p,d,t,n=dE(a,b,'protan'),dE(a,b,'deutan'),dE(a,b,'tritan'),dE(a,b)
        worst=min(p,d)
        st='ok' if worst>=CVD_TARGET else ('WARN (6-8)' if worst>=CVD_FLOOR else 'FAIL <6')
        stn='ok' if n>=NORMAL_FLOOR else 'FAIL normale <15'
        if 'FAIL' in st or 'FAIL' in stn: bad=True
        print(f"  {a} vs {b}: protan {p:5.1f} deutan {d:5.1f} tritan {t:5.1f} -> CVD {st}; normale {n:5.1f} {stn}")
    return bad
if __name__=='__main__':
    # 1) i quattro passi della cella  (--st-*)
    passi=['stampata','controllata','rapportino','ricambi']
    run(['#B8860B','#00AEEF','#A0307E','#5B67D6'],'light','#FFFFFF',passi)   # primo passo: oro dalla 28a
    run(['#E2B83C','#35C4FF','#CC5FA8','#7B85EA'],'dark','#14191E',passi)
    # 2) le classi temporali nelle celle  (--cl-*)
    cl=['dovute','stime','da rinnovare','pre-tracc.']
    run(['#00AEEF','#0E7FA8','#C0392B','#8B8D91'],'light','#FFFFFF',cl)
    run(['#35C4FF','#1D89B4','#F2705F','#6E7175'],'dark','#14191E',cl)
    # 3) il completamento: UNA tinta (--completa), che non deve confondersi con
    #    nessuno dei quattro passi. Il terzo passo era proprio questo verde.
    print()
    print("--- --completa contro i quattro passi (distanza minima, CVD inclusa) ---")
    for mode,sup,comp,pal in (('light','#FFFFFF','#00A37A',['#B8860B','#00AEEF','#A0307E','#5B67D6']),
                              ('dark','#14191E','#22C39A',['#E2B83C','#35C4FF','#CC5FA8','#7B85EA'])):
        for nome,h in zip(passi,pal):
            d=min(dE(comp,h),dE(comp,h,'protan'),dE(comp,h,'deutan'))
            print("  %-6s %s vs %-11s %s: %5.1f %s" % (mode,comp,nome,h,d,
                  'ok' if d>=CVD_FLOOR else 'FAIL <6'))
    # 4) la rampa sequenziale "a che punto siamo" (--pr-0..--pr-4). Una rampa
    #    non si giudica come un set categorico: contano la chiarezza MONOTONA e
    #    il fatto che due gradi vicini non collassino (floor 6).
    print()
    print("--- rampa --pr-0..--pr-4 (chiarezza monotona + gradi vicini) ---")
    def _mix(a, b, q):
        A = [int(a[k:k+2], 16) for k in (1, 3, 5)]
        B = [int(b[k:k+2], 16) for k in (1, 3, 5)]
        return '#%02X%02X%02X' % tuple(round(A[k]*q + B[k]*(1-q)) for k in range(3))
    for mode, comp, vuoto in (('light', '#00A37A', '#E4E5E8'),
                              ('dark', '#22C39A', '#24262A')):
        ramp = [vuoto, _mix(comp, vuoto, .26), _mix(comp, vuoto, .50),
                _mix(comp, vuoto, .74), comp]
        Ls = [oklch(c)[0] for c in ramp]
        giu = all(Ls[k] > Ls[k+1] for k in range(4))
        su = all(Ls[k] < Ls[k+1] for k in range(4))
        print("  %-6s %s  L %s  %s" % (mode, ' '.join(ramp),
              ' '.join('%.2f' % l for l in Ls),
              'monotona ok' if (giu or su) else 'CHIAREZZA NON MONOTONA'))
        for k in range(4):
            d = min(dE(ramp[k], ramp[k+1], 'protan'), dE(ramp[k], ramp[k+1], 'deutan'))
            print("        grado %d->%d: %4.1f %s"
                  % (k, k+1, d, 'ok' if d >= CVD_FLOOR else 'FAIL <6'))

    # 5) la rampa dell'anzianita' dell'arretrato (--ar-1..--ar-4). Bin ORDINATI
    #    (entro 1 mese -> oltre 6), quindi rampa sequenziale di un tono solo:
    #    l'ambra dell'arretrato mescolata col vuoto.
    print()
    print("--- rampa --ar-1..--ar-4 (chiarezza monotona + gradi vicini) ---")
    for mode, allerta, vuoto, sup in (('light', '#C2600B', '#E4E5E8', '#FFFFFF'),
                                      ('dark', '#E0913C', '#24262A', '#14191E')):
        ramp = [_mix(allerta, vuoto, .30), _mix(allerta, vuoto, .53),
                _mix(allerta, vuoto, .76), allerta]
        Ls = [oklch(c)[0] for c in ramp]
        giu = all(Ls[k] > Ls[k+1] for k in range(3))
        su = all(Ls[k] < Ls[k+1] for k in range(3))
        print("  %-6s %s  L %s  %s" % (mode, ' '.join(ramp),
              ' '.join('%.2f' % l for l in Ls),
              'monotona ok' if (giu or su) else 'CHIAREZZA NON MONOTONA'))
        for k in range(3):
            d = min(dE(ramp[k], ramp[k+1], 'protan'), dE(ramp[k], ramp[k+1], 'deutan'))
            print("        grado %d->%d: %4.1f %s   contrasto %.2f"
                  % (k + 1, k + 2, d, 'ok' if d >= CVD_FLOOR else 'FAIL <6',
                     contrast(ramp[k], sup)))

    print("""
NOTE sui WARN attesi (non sono regressioni):
- il grigio del primo passo e del pre-tracciamento e' sotto la soglia di
  saturazione di proposito: e' il neutro, non deve chiamare l'occhio;
- il grado piu' chiaro della rampa --ar-* ha 1,8:1 sulla superficie chiara: e'
  un riempimento dentro una barra parte-su-tutto che ha legenda, numeri scritti
  e tabella, cioe' esattamente il compenso che la skill chiede;
- il cyan del marchio su bianco fa 2,53:1 (sotto 3:1): dove riempie una forma
  ci sono sempre etichetta scritta e legenda, che e' cio' che la skill dataviz
  chiede in cambio;
- il rosso della scadenza contratto in tema scuro (#F2705F, L .697) sta appena
  sopra la banda, come ci stava l'ambra che sostituiva (#E0913C, L .723): su
  fondo scuro un rosso dentro banda diventa marrone e non si legge piu' come
  "scadenza". Contrasto 6,2:1 e tutte le coppie separate in CVD;
- in tema scuro il cyan del marchio sta sopra la banda di chiarezza: e' il
  colore del logo, scelta precedente e voluta;
- il terzo passo ("mappatura completa rapportino") e' MAGENTA, non verde: il
  verde e' riservato a "mappatura completa" (--completa), e nei grafici le due
  cose si leggevano come la stessa (vedi decisioni.md 10f). Il magenta e'
  l'unica regione libera restando lontani da cyan, verde, indaco, ambra e
  rosso: il blocco 3) sopra e' il controllo da rifare se si toccano;
- il FAIL di --completa (#00A37A) contro il grigio del primo passo (#8B8D91) in
  tema chiaro e' noto e innocuo: verde e grigio non si toccano da nessuna parte
  (il completamento non entra nella carta dei passi, e il grado 0 della rampa e'
  --st-vuoto #E4E5E8, che dista 9,7). Non e' una regressione: quel verde e quel
  grigio esistevano gia' con questi valori;
- i gradi della rampa in tema chiaro stanno fra 6,0 e 7,0 in CVD, appena sopra
  il floor: e' una rampa SEQUENZIALE, la lettura viene dalla chiarezza monotona,
  dalla legenda e dalla tabella, non dalla distanza di tinta.""")
