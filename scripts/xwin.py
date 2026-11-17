#!/usr/bin/env python3
# Auxiliar del smoke 2.3.8i: --list vuelca ventanas; --kill <id> destruye una.
import sys
from Xlib import display

def win_name(d, w):
    for prop in ('_NET_WM_NAME', 'WM_NAME'):
        try:
            v = w.get_full_text_property(d.intern_atom(prop), 0)
            if v:
                return v
        except Exception:
            pass
    return ''
def walk(d, w, depth, out):
    try:
        children = w.query_tree().children
    except Exception:
        return
    for c in children:
        try:
            cls = c.get_wm_class() or ('', '')
        except Exception:
            cls = ('', '')
        out.append((depth, c.id, win_name(d, c), cls))
        walk(d, c, depth + 1, out)

d = display.Display()
root = d.screen().root
if sys.argv[1] == '--list':
    out = []
    walk(d, root, 0, out)
    for depth, wid, name, cls in out:
        print('  ' * depth + 'id=%s name=%r class=%r' % (wid, name, cls))
elif sys.argv[1] == '--kill':
    wid = int(sys.argv[2])
    w = d.create_resource_object('window', wid)
    w.destroy()
    d.sync()
    print('destruida %s' % wid)
elif sys.argv[1] == '--geom':
    wid = int(sys.argv[2])
    w = d.create_resource_object('window', wid)
    g = w.get_geometry()
    print('geom id=%s x=%s y=%s w=%s h=%s border=%s' % (wid, g.x, g.y, g.width, g.height, g.border_width))
    try:
        t = w.query_tree()
        print('parent=%s children=%s' % (t.parent.id, [c.id for c in t.children]))
    except Exception as e:
        print('query_tree err %s' % e)
