"""
Seed del registro de tures (giras/pasadías/planes promocionales) 2026.

Convierte el roster interno de turismo (semana, día, actividad, recreadores)
en registros `Solicitud`, para que aparezcan en calendario, estadísticas y
horas extra igual que cualquier otro servicio.

Reglas de inferencia (los datos de origen no traen todos los campos del
modelo Solicitud):
  - fecha_evento: se resuelve cruzando el rango de la "semana" con el
    número de día de "dia" (maneja semanas que cruzan de mes).
  - estado: 'finalizado' si la fecha ya pasó respecto a HOY, si no
    'programado' (siempre con recreador(es) asignado, como en el dato
    original).
  - empresa: se extrae "EMPRESA X" del texto si aparece; si no, se usa
    "Comfenalco Tolima - Turismo" (son planes promocionales propios, no
    solicitudes de un cliente externo).
  - horario / cantidad de personas / contacto: se extraen del texto con
    regex cuando vienen explícitos (algunas filas traen el detalle
    completo de una solicitud real); si no, se usan valores por defecto
    razonables y el texto original completo queda en `observaciones`.
"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import date, datetime, timezone
from app.core.database import SessionLocal, engine, Base
from app.models.solicitud import Solicitud
from app.models.user import User
from app.core.security import get_password_hash

Base.metadata.create_all(bind=engine)

HOY = date(2026, 9, 1)

MESES = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6,
    "JULIO": 7, "AGOSTO": 8, "SEPTIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11,
    "DICIEMBRE": 12,
}
MESES_NOMBRES = list(MESES.keys())

NOMBRE_A_USERNAME = {
    "GABRIEL VAQUIRO": "gabriel.vaquiro",
    "ANDRES GARCIA": "andres.garcia",
    "SEBASTIAN LEGUIZAMON": "sebastian.leguizamon",
    "DALMA SUAREZ": "dalma.suarez",
    "JOHNY FANDIÑO -GUIA": "johny.fandino",
    "JOHNY FANDIÑO": "johny.fandino",
    "MERCEDES LEAL": "mercedes.leal",
    "NESTOR VILLA": "nestor.villa",
    "ANGIE ROJAS": "angie.rojas",
    "CAMILO PEÑA": "camilo.pena",
    "ISSA PAEZ": "issa.paez",
    "JUAN DANIEL": "juan.daniel",
    "MAURICIO ARIAS": "mauricio.arias",
    "DANIEL RINCON": "daniel.rincon",
    "DANIEL RUIZ": "daniel.ruiz",
    "BRAYAN BOTERO": "brayan.botero",
    "BAIRON ROJAS": "bairon.rojas",
}

CREADOR_USERNAME = "promotor1"


def extraer_meses(semana: str):
    tokens = re.findall(r"[A-ZÑ]+", semana.upper())
    encontrados = []
    for t in tokens:
        if len(t) < 3:
            continue
        for mes in MESES_NOMBRES:
            if mes.startswith(t) or t.startswith(mes[:4]):
                encontrados.append(mes)
                break
    return encontrados


def extraer_dias_rango(semana: str):
    nums = [int(n) for n in re.findall(r"\d+", semana)]
    if not nums:
        return None, None
    return nums[0], nums[-1]


def extraer_dia_numero(dia: str):
    m = re.search(r"\d+", dia)
    return int(m.group()) if m else None


def resolver_fecha(semana: str, dia: str):
    meses = extraer_meses(semana)
    start_day, end_day = extraer_dias_rango(semana)
    d = extraer_dia_numero(dia)
    if not meses or d is None:
        return None
    mes_inicio = meses[0]
    mes_fin = meses[-1]
    if mes_inicio == mes_fin:
        mes = mes_inicio
    else:
        mes = mes_inicio if (start_day is not None and d >= start_day) else mes_fin
    try:
        return date(2026, MESES[mes], d).isoformat()
    except ValueError:
        return None


def parse_recreadores(texto: str):
    encontrados, no_encontrados = [], []
    for parte in texto.split(","):
        nombre = parte.strip().upper()
        nombre = re.sub(r"\s*-\s*COMPENSA\s*$", "", nombre).strip()
        if not nombre:
            continue
        username = NOMBRE_A_USERNAME.get(nombre)
        if username:
            encontrados.append(username)
        else:
            no_encontrados.append(nombre)
    return encontrados, no_encontrados


HORA_RE = re.compile(
    r"(\d{1,2}:\d{2})\s*([ap]\.?\s*m\.?|M)\s*(?:a|A|-)\s*(\d{1,2}:\d{2})\s*([ap]\.?\s*m\.?|M)",
    re.IGNORECASE,
)


def _a_24h(hhmm, ampm):
    h, m = map(int, hhmm.split(":"))
    ampm = ampm.strip().lower().replace(".", "")
    if ampm == "m":
        pass
    elif ampm == "pm" and h != 12:
        h += 12
    elif ampm == "am" and h == 12:
        h = 0
    return f"{h:02d}:{m:02d}"


def extraer_horario(texto: str):
    m = HORA_RE.search(texto)
    if not m:
        return "08:00", "17:00"
    ini = _a_24h(m.group(1), m.group(2))
    fin = _a_24h(m.group(3), m.group(4))
    return ini, fin


def extraer_personas(texto: str):
    m = re.search(r"(?:No\.?\s*[Dd]e\s*personas|PAX)\D{0,5}(\d+)", texto)
    return int(m.group(1)) if m else None


def extraer_empresa(texto: str):
    m = re.search(r"EMPRESA\s+([A-ZÑÁÉÍÓÚ0-9 ]+?)(?:,|\.|$)", texto.upper())
    if m:
        return m.group(1).strip().title()
    return "Comfenalco Tolima - Turismo"


def extraer_contacto(texto: str):
    contacto, telefono = None, None
    m = re.search(r"Persona de Contacto\s+([A-Za-zÑñÁÉÍÓÚáéíóú ]+?)(?:,|Celular|$)", texto)
    if m:
        contacto = m.group(1).strip()
    m2 = re.search(r"Celular(?: de Contacto)?[.:]?\s*([\d ]{7,})", texto)
    if m2:
        telefono = m2.group(1).strip()
    m3 = re.search(r"(?:COORDINAR CON|PROMOTOR)\s+([A-Za-zÑñÁÉÍÓÚáéíóú ]+?)(?:\.|,|$)", texto)
    if not contacto and m3:
        contacto = m3.group(1).strip()
    return contacto or "Turismo Comfenalco Tolima", telefono or "N/A"


def tipo_servicio_de(texto: str):
    t = texto.upper()
    if "PLAN PROMOCIONAL" in t:
        return "Plan promocional"
    if "PASADIA" in t or "PASADÍA" in t:
        return "Pasadía"
    if "VIAJE" in t:
        return "Viaje / traslado"
    return "Recreación turística"


def ciudad_de(texto: str):
    m = re.search(r"\b(?:A|DESDE)\s+([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ .]{2,30})", texto.upper())
    if m:
        destino = m.group(1).strip().rstrip(".,")
        destino = re.split(r"\s{2,}|,|\.", destino)[0].strip()
        return destino.title()
    return "Tolima"


def seed():
    db = SessionLocal()
    try:
        creador = db.query(User).filter(User.username == CREADOR_USERNAME).first()
        if not creador:
            print(f"✗ No se encontró el usuario creador '{CREADOR_USERNAME}'.")
            return

        if not db.query(User).filter(User.username == "bairon.rojas").first():
            db.add(User(
                username="bairon.rojas",
                email="bairon.rojas@comfenalcotolima.com",
                hashed_password=get_password_hash("recreador123"),
                full_name="Bairon Rojas",
                empresa="Comfenalco Tolima",
                cargo="Recreador",
                is_active=True, is_admin=False, is_recreador=True, is_promotor=False,
            ))
            db.commit()
            print("✓ Usuario nuevo creado: bairon.rojas / recreador123")

        creados, sin_fecha, nombres_no_encontrados = 0, [], set()

        for rec in RECORDS:
            fecha = resolver_fecha(rec["semana"], rec["dia"])
            if not fecha:
                sin_fecha.append(rec)
                continue

            usernames, no_encontrados = parse_recreadores(rec["recreadores"])
            nombres_no_encontrados.update(no_encontrados)
            if not usernames:
                continue

            recreador_objs = db.query(User).filter(User.username.in_(usernames)).all()
            if not recreador_objs:
                continue

            texto = rec["actividad"]
            ini, fin = extraer_horario(texto)
            personas = extraer_personas(texto) or max(len(recreador_objs) * 15, 20)
            contacto, telefono = extraer_contacto(texto)
            empresa = extraer_empresa(texto)
            tipo_servicio = tipo_servicio_de(texto)
            ciudad = ciudad_de(texto)
            estado = "finalizado" if fecha <= HOY.isoformat() else "programado"

            sol = Solicitud(
                empresa=empresa,
                fecha_evento=fecha,
                hora_inicio=ini,
                hora_fin=fin,
                ciudad=ciudad,
                direccion=f"{ciudad} — turismo Comfenalco",
                cantidad_recreadores=len(recreador_objs),
                cantidad_personas=personas,
                tipo_publico="Mixto",
                tipo_servicio=tipo_servicio,
                contacto=contacto,
                telefono_email=telefono,
                observaciones=f'[{rec["semana"].strip()} · {rec["dia"].strip()}] {texto}',
                estado=estado,
                recreador_id=recreador_objs[0].id,
                user_id=creador.id,
            )
            if estado == "finalizado":
                sol.observacion_final = "Actividad de turismo registrada desde el roster 2026."
                sol.fecha_finalizacion = datetime.now(timezone.utc)

            db.add(sol)
            db.flush()
            sol.recreadores = recreador_objs
            creados += 1

        db.commit()
        print(f"\n✓ {creados} solicitudes creadas a partir del roster de tures 2026.")
        if sin_fecha:
            print(f"⚠ {len(sin_fecha)} filas sin fecha resoluble (revisar manualmente):")
            for r in sin_fecha:
                print(f"   - {r['semana']} / {r['dia']} / {r['actividad'][:60]}")
        if nombres_no_encontrados:
            print(f"⚠ Nombres en 'recreadores' que no son recreadores del sistema (excluidos): {sorted(nombres_no_encontrados)}")
    finally:
        db.close()


import json
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "tures_2026.json"), encoding="utf-8") as f:
    RECORDS = json.load(f)

if __name__ == "__main__":
    seed()
