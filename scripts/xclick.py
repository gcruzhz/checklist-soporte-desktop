#!/usr/bin/env python3
# Clic REAL de ratón a nivel de X11 (XTEST) en coordenadas de la raíz.
# Uso: xclick.py <x> <y>
import sys, time
from Xlib import X, display
from Xlib.ext import xtest

x, y = int(sys.argv[1]), int(sys.argv[2])
d = display.Display()
root = d.screen().root
root.warp_pointer(x, y)
d.sync()
time.sleep(0.2)
xtest.fake_input(d, X.ButtonPress, 1)
d.sync()
time.sleep(0.05)
xtest.fake_input(d, X.ButtonRelease, 1)
d.sync()
print('clic en %s,%s' % (x, y))
