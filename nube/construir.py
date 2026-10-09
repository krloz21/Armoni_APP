"""Arma nube/web/ con las páginas de la raíz, para subir al servidor.
Las páginas ya eligen solas la dirección de n8n (con https usan la misma dirección de la página),
así que solo se copian.   Uso:  python3 nube/construir.py"""
import os, shutil

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
os.makedirs(SALIDA, exist_ok=True)
ARCHIVOS = ("index.html", "sw.js", "manifest.webmanifest",
            "icon.png", "icon-192.png", "icon-512.png")
for nombre in ARCHIVOS:
    shutil.copy(os.path.join(RAIZ, nombre), os.path.join(SALIDA, nombre))
print("listo: nube/web/")
