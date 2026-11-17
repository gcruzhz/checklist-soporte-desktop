# -*- coding: utf-8 -*-
"""Parche tests detector 2.5.5: punto 3 (gpedit).
- Imports parseRegistryPol / parseSeceditInf.
- makeOverrides: rama secedit en runCmd (s.seceditFails lo rompe) y
  readFileBin (s.polMachine / s.polUser / s.seceditInf como Buffer).
- La asercion 2.5.0 de politicasFuente pasa de 'directiva de grupo' a
  'registro' (la lectura PS del registro ahora se etiqueta asi).
- Inserta la serie 2.5.5 (scripts/test-255-gpedit-snippet.js) antes del
  resumen.
Uso: python3 scripts/patch_test_detect_255.py
"""
import io

P = '/home/hatch/workspace/android/checklist-desktop/scripts/test-detect-checks.js'
s = io.open(P, encoding='utf-8').read()
n0 = len(s)

def rep(old, new, cnt=1, tag=''):
    global s
    c = s.count(old)
    assert c == cnt, 'REP %s: esperado %d, hallado %d: %r' % (tag, cnt, c, old[:90])
    s = s.replace(old, new)

rep('''  parseLocalUserSistemas,
  politicasCumple,''',
'''  parseLocalUserSistemas,
  politicasCumple,
  parseRegistryPol,
  parseSeceditInf,''', tag='imports')

rep('''      if (/^net$/i.test(cmd)) return s.netAccounts || '';''',
'''      if (/^net$/i.test(cmd)) return s.netAccounts || '';
      if (/^secedit$/i.test(cmd)) {
        if (s.seceditFails) throw new Error('secedit sin permisos');
        return 'ok';
      }''', tag='runCmd-secedit')

rep('''    readFile: (p) => {
      const v = (s.confFiles || {})[String(p).toLowerCase()];
      if (v === undefined) throw new Error('archivo no existe: ' + p);
      return v;
    },''',
'''    readFile: (p) => {
      const v = (s.confFiles || {})[String(p).toLowerCase()];
      if (v === undefined) throw new Error('archivo no existe: ' + p);
      return v;
    },
    readFileBin: (p) => {
      const key = String(p).toLowerCase();
      if (key.indexOf('secedit.inf') >= 0) {
        if (s.seceditInf === undefined) throw new Error('sin inf de secedit');
        return s.seceditInf;
      }
      if (key.indexOf('registry.pol') >= 0) {
        if (key.indexOf('machine') >= 0) {
          if (s.polMachine === undefined) throw new Error('sin Registry.pol de equipo');
          return s.polMachine;
        }
        if (s.polUser === undefined) throw new Error('sin Registry.pol de usuario');
        return s.polUser;
      }
      throw new Error('archivo binario no simulado: ' + p);
    },''', tag='readFileBin')

rep("""check('2.5.0 integración: politicasFuente menciona net accounts y directiva', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('net accounts') >= 0 && r.detalles.politicasFuente.indexOf('directiva de grupo') >= 0, r.detalles);""",
"""check('2.5.0 integración: politicasFuente menciona net accounts y registro', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('net accounts') >= 0 && r.detalles.politicasFuente.indexOf('registro') >= 0, r.detalles);""", tag='assert-250-fuente')

snip = io.open('/home/hatch/workspace/android/checklist-desktop/scripts/test-255-gpedit-snippet.js', encoding='utf-8').read()
anchor = "  check('2.5.0 solo protector: bloqueoSegundos 350', r.detalles.politicas && r.detalles.politicas.bloqueoSegundos === 350, r.detalles.politicas);\n"
assert s.count(anchor) == 1, 'ancla resumen no hallada'
s = s.replace(anchor, anchor + '\n' + snip + '\n')

io.open(P, 'w', encoding='utf-8').write(s)
print('OK patch test detect 255: %d -> %d caracteres' % (n0, len(s)))
