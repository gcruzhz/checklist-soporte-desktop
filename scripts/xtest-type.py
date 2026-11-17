#!/usr/bin/env python3
# Tecleo REAL a nivel de X11 (XTEST) para el smoke 2.3.8 — v2.
# Busca la ventana por _NET_WM_NAME, WM_NAME o WM_CLASS (Electron no
# siempre pone WM_NAME). Si no la encuentra, vuelca el árbol de ventanas.
# Uso: xtest-type.py "<subcadena>" "<texto>" | xtest-type.py --list
import sys, time
from Xlib import X, display, XK
from Xlib.ext import xtest
from Xlib.protocol import request

def win_name(d, w):
    for prop in ('_NET_WM_NAME', 'WM_NAME'):
        try:
            v = w.get_full_text_property(d.intern_atom(prop), 0)
            if v:
                return v
        except Exception:
            pass
    return ''
def win_class(d, w):
    try:
        return w.get_wm_class() or ('', '')
    except Exception:
        return ('', '')
def walk(d, w, depth, out):
    try:
        children = w.query_tree().children
    except Exception:
        return
    for c in children:
        out.append((depth, c.id, win_name(d, c), win_class(d, c)))
        walk(d, c, depth + 1, out)

def find(d, root, needle):
    out = []
    walk(d, root, 0, out)
    for depth, wid, name, cls in out:
        if needle.lower() in str(name).lower() or needle.lower() in str(cls[0]).lower() or needle.lower() in str(cls[1]).lower():
            return wid, out
    return None, out

def main():
    d = display.Display()
    root = d.screen().root
    if len(sys.argv) >= 2 and sys.argv[1] == '--list':
        out = []
        walk(d, root, 0, out)
        for depth, wid, name, cls in out:
            print('  ' * depth + 'id=%s name=%r class=%r' % (wid, name, cls))
        return
    needle, text = sys.argv[1], sys.argv[2]
    found, out = find(d, root, needle)
    if found is None:
        print('XTEST sin-ventana; arbol:')
        for depth, wid, name, cls in out:
            print('  ' * depth + 'id=%s name=%r class=%r' % (wid, name, cls))
        sys.exit(2)
    win = d.create_resource_object('window', found)
    win.set_input_focus(X.RevertToParent, X.CurrentTime)
    d.sync()
    time.sleep(0.3)
    focus = d.get_input_focus()
    print('XTEST ventana=%s foco=%s' % (found, focus.focus.id if focus.focus else None))
    for ch in text:
        ks = XK.string_to_keysym(ch)
        if ks == 0:
            continue
        kc = d.keysym_to_keycode(ks)
        if kc == 0:
            continue
        xtest.fake_input(d, X.KeyPress, kc)
        d.sync()
        time.sleep(0.02)
        xtest.fake_input(d, X.KeyRelease, kc)
        d.sync()
        time.sleep(0.03)
    print('XTEST enviado=%r' % text)

if __name__ == '__main__':
    main()
