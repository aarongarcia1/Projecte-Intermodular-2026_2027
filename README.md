# Altercom21 · Ciberseguretat professional

Landing page de l'empresa **Altercom21** (Aaron Garcia, Lluc Jornet i Ramon Roda), projecte de classe.

Inclou serveis de ciberseguretat, formulari de pressupost, sol·licitud de cites d'auditoria i descàrrega de **NEXUS**, un escàner de xarxa educatiu fet amb Python + Tkinter.

## Estructura del repositori

```
altercom21/
├── index.html          # Landing page (HTML + CSS + JS en un sol fitxer)
├── README.md
└── descargas/
    └── NEXUS.zip       # ZIP amb nexus.py (l'has de crear tu)
```

## Com crear el ZIP

1. Crea la carpeta `descargas` al costat de `index.html`.
2. Posa `nexus.py` dins d'un ZIP anomenat exactament `NEXUS.zip`.
3. Desa'l a `descargas/NEXUS.zip`.

## Publicar la web amb GitHub Pages

1. Crea un repositori **públic** a GitHub (per exemple, `altercom21`).
2. Puja `index.html`, `README.md` i la carpeta `descargas/` (botó **Add file → Upload files**, o amb git).
3. Ves a **Settings → Pages**.
4. A *Source* tria **Deploy from a branch**, branca `main` i carpeta `/ (root)`. Desa.
5. Al cap d'1-2 minuts la web estarà a `https://EL-TEU-USUARI.github.io/altercom21/`.

### Amb git (terminal)

```bash
git init
git add .
git commit -m "Landing page Altercom21"
git branch -M main
git remote add origin https://github.com/EL-TEU-USUARI/altercom21.git
git push -u origin main
```

## Executar NEXUS

Requisits: Python 3.8+ (a Linux: `sudo apt install python3-tk`).

```bash
# Linux / macOS
chmod +x nexus.py
./nexus.py

# Windows
python nexus.py
```

## Personalitzar

- Canvia `contacto@altercom21.com` per un correu real (final de `index.html` i secció de contacte).
- Els formularis obren el client de correu (`mailto:`). Per enviar-los automàticament es pot usar un servei com Formspree.

## Avís legal

NEXUS és una eina **educativa**. Utilitza-la només en equips i xarxes on tinguis autorització expressa.
