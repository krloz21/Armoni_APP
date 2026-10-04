"""Arma nube/web/ a partir de las páginas de la raíz, para subir al servidor.
Cambia las direcciones locales (http://192.168.1.7:5678) por rutas relativas (/webhook/...).
Uso:  python3 nube/construir.py"""
import os, shutil

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

FRASES = [
    ("Revisa que la torre esté prendida y que estés en el WiFi de la casa.", "Revisa tu internet y que Tailscale esté encendido."),
    ("Verifica que la torre esté prendida, que Docker esté corriendo y que estés en el WiFi de la casa.", "Verifica tu internet, que Tailscale esté encendido y que el servidor esté funcionando."),
    ("Revisa que estés en el WiFi de la casa y que el workflow", "Revisa tu internet y que Tailscale esté encendido, y que el workflow"),
    ("¿Estás en el WiFi de la casa?", "¿Tienes internet y Tailscale encendido?"),
    ("Revisa el WiFi de la casa e inténtalo de nuevo.", "Revisa tu internet y que Tailscale esté encendido e inténtalo de nuevo."),
    ("Revisa que estés conectada al WiFi de la casa.", "Revisa tu internet y que Tailscale esté encendido."),
    ("¿Estás conectada al WiFi de la casa?", "Revisa tu internet y que Tailscale esté encendido."),
]

os.makedirs(SALIDA, exist_ok=True)
for nombre in ("index.html", "mama.html"):
    s = open(os.path.join(RAIZ, nombre), encoding="utf-8").read()
    s = s.replace("http://192.168.1.7:5678", "")
    for viejo, nuevo in FRASES:
        s = s.replace(viejo, nuevo)
    assert "192.168" not in s and "WiFi de la casa" not in s, "quedó una dirección o mensaje local en " + nombre
    open(os.path.join(SALIDA, nombre), "w", encoding="utf-8").write(s)
for nombre in ("sw.js", "icon.png"):
    shutil.copy(os.path.join(RAIZ, nombre), os.path.join(SALIDA, nombre))
print("listo: nube/web/")
