"""
Seed de datos de prueba para la semana actual (lun 2026-08-31 a sáb 2026-09-05).

Crea:
  - 5 eventos "programado", cada uno con un recreador distinto
  - 5 solicitudes "pendiente" (sin revisar)
  - 5 solicitudes "por corregir"
  - 5 solicitudes "finalizado"

No borra datos existentes: solo agrega estos 20 registros nuevos.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timezone
from app.core.database import SessionLocal, engine, Base
from app.models.solicitud import Solicitud
from app.models.user import User

Base.metadata.create_all(bind=engine)

MON, TUE, WED, THU, FRI, SAT = (
    "2026-08-31", "2026-09-01", "2026-09-02",
    "2026-09-03", "2026-09-04", "2026-09-05",
)

CREADOR_USERNAME = "promotor1"

# (username_recreador, fecha, inicio, fin, empresa, tipo_servicio, ciudad,
#  tipo_publico, personas, contacto, telefono)
PROGRAMADOS = [
    ("gabriel.vaquiro",       MON, "08:00", "15:00", "Bavaria S.A.",  "Team building",          "Ibagué",  "Adultos", 60, "María García",   "3101234560"),
    ("sebastian.leguizamon",  TUE, "08:00", "16:00", "Ecopetrol",     "Recreación empresarial", "Ibagué",  "Adultos", 50, "Carlos Rivera",  "3201234561"),
    ("mercedes.leal",         WED, "09:00", "15:00", "Bancolombia",   "Actividad deportiva",    "Espinal", "Jóvenes", 40, "Ana Martínez",   "3101234562"),
    ("camilo.pena",           THU, "09:00", "16:00", "Alkosto",       "Evento infantil",        "Ibagué",  "Niños",   70, "Pedro Salcedo",  "3201234563"),
    ("daniel.rincon",         FRI, "08:00", "15:00", "EPM",           "Festival comunitario",   "Honda",   "Mixto",   90, "Lucía Peña",     "3111234564"),
]

# (fecha, inicio, fin, empresa, tipo_servicio, ciudad, tipo_publico, personas, contacto, telefono)
PENDIENTES = [
    (MON, "08:00", "15:00", "Nutresa",                       "Team building",          "Ibagué",  "Adultos", 55, "Andrés Torres",   "3201234565"),
    (TUE, "09:00", "16:00", "Avianca",                       "Recreación empresarial", "Ibagué",  "Adultos", 45, "Sofía Jiménez",   "3121234566"),
    (WED, "08:00", "14:00", "Caja Compensar",                "Evento infantil",        "Ibagué",  "Niños",   65, "Ricardo Gómez",   "3201234567"),
    (THU, "09:00", "17:00", "Centro Comercial Multicentro",  "Festival comunitario",   "Ibagué",  "Mixto",  100, "Valentina Cruz",  "3131234568"),
    (SAT, "09:00", "15:00", "Industrias Protela",            "Actividad deportiva",    "Espinal", "Jóvenes", 35, "Felipe Ortiz",    "3201234569"),
]

# (fecha, inicio, fin, empresa, tipo_servicio, ciudad, tipo_publico, personas, contacto, telefono, motivo_correccion)
POR_CORREGIR = [
    (MON, "09:00", "15:00", "Comfenalco Valle", "Evento infantil",        "Ibagué",  "Niños",   40, "María García",  "3101234560", "Falta especificar la dirección exacta del evento."),
    (TUE, "08:00", "15:00", "Éxito S.A.",       "Recreación empresarial", "Ibagué",  "Adultos", 50, "Carlos Rivera", "3201234561", "El horario no coincide con lo acordado, verificar con el cliente."),
    (WED, "08:00", "16:00", "Colombina S.A.",   "Team building",         "Espinal", "Adultos", 60, "Ana Martínez",  "3101234562", "Cantidad de recreadores solicitada insuficiente para el aforo."),
    (THU, "08:00", "15:00", "Alpina Productos", "Festival comunitario",  "Honda",   "Mixto",   80, "Pedro Salcedo", "3201234563", "Falta el segundo contacto de la empresa."),
    (FRI, "09:00", "14:00", "Sura Seguros",     "Recreación acuática",   "Melgar",  "Adultos", 25, "Lucía Peña",    "3111234564", "Confirmar permiso de uso del espacio acuático."),
]

# (usernames_recreadores, fecha, inicio, fin, empresa, tipo_servicio, ciudad, tipo_publico, personas, contacto, telefono, observacion_final)
FINALIZADOS = [
    (["andres.garcia", "nestor.villa"], MON, "08:00", "15:00", "Municipio de Ibagué",     "Recreación empresarial", "Ibagué", "Adultos", 55, "Andrés Torres",  "3201234565", "Excelente participación del grupo. Todo transcurrió con normalidad."),
    (["angie.rojas"],                   MON, "08:00", "14:00", "Claro Colombia",          "Team building",          "Ibagué", "Adultos", 45, "Sofía Jiménez",  "3121234566", "Muy buena energía. Los participantes quedaron muy satisfechos."),
    (["issa.paez"],                     TUE, "09:00", "15:00", "Hospital Federico Lleras","Evento infantil",        "Ibagué", "Niños",   50, "Ricardo Gómez",  "3201234567", "Actividad completada sin novedades. Equipo muy comprometido."),
    (["mauricio.arias"],                TUE, "08:00", "13:00", "Colegio San Luis Gonzaga","Actividad deportiva",    "Ibagué", "Jóvenes", 35, "Valentina Cruz", "3131234568", "Gran jornada recreativa. Asistencia completa del grupo."),
    (["brayan.botero"],                 MON, "09:00", "14:00", "Seguros Bolívar",         "Recreación acuática",   "Melgar", "Adultos", 20, "Felipe Ortiz",   "3201234569", "Servicio prestado a cabalidad. Sin inconvenientes durante la jornada."),
]


def seed():
    db = SessionLocal()
    try:
        creador = db.query(User).filter(User.username == CREADOR_USERNAME).first()
        if not creador:
            print(f"✗ No se encontró el usuario creador '{CREADOR_USERNAME}'.")
            return

        def rec(username):
            u = db.query(User).filter(User.username == username).first()
            if not u:
                raise ValueError(f"Recreador '{username}' no encontrado")
            return u

        created = 0

        for username, fecha, ini, fin, empresa, tipo_s, ciudad, tipo_p, personas, contacto, tel in PROGRAMADOS:
            r = rec(username)
            sol = Solicitud(
                empresa=empresa, fecha_evento=fecha, hora_inicio=ini, hora_fin=fin,
                ciudad=ciudad, direccion=f"Sede {empresa} — {ciudad}",
                cantidad_recreadores=1, cantidad_personas=personas,
                tipo_publico=tipo_p, tipo_servicio=tipo_s,
                contacto=contacto, telefono_email=tel,
                observaciones="Solicitud programada para la semana actual.",
                estado="programado", recreador_id=r.id, user_id=creador.id,
            )
            db.add(sol); db.flush()
            sol.recreadores = [r]
            created += 1

        for fecha, ini, fin, empresa, tipo_s, ciudad, tipo_p, personas, contacto, tel in PENDIENTES:
            sol = Solicitud(
                empresa=empresa, fecha_evento=fecha, hora_inicio=ini, hora_fin=fin,
                ciudad=ciudad, direccion=f"Sede {empresa} — {ciudad}",
                cantidad_recreadores=2, cantidad_personas=personas,
                tipo_publico=tipo_p, tipo_servicio=tipo_s,
                contacto=contacto, telefono_email=tel,
                observaciones="Solicitud nueva, pendiente de revisión.",
                estado="pendiente", user_id=creador.id,
            )
            db.add(sol)
            created += 1

        for fecha, ini, fin, empresa, tipo_s, ciudad, tipo_p, personas, contacto, tel, motivo in POR_CORREGIR:
            sol = Solicitud(
                empresa=empresa, fecha_evento=fecha, hora_inicio=ini, hora_fin=fin,
                ciudad=ciudad, direccion=f"Sede {empresa} — {ciudad}",
                cantidad_recreadores=2, cantidad_personas=personas,
                tipo_publico=tipo_p, tipo_servicio=tipo_s,
                contacto=contacto, telefono_email=tel,
                observaciones=motivo,
                estado="por corregir", user_id=creador.id,
            )
            db.add(sol)
            created += 1

        for usernames, fecha, ini, fin, empresa, tipo_s, ciudad, tipo_p, personas, contacto, tel, obs_final in FINALIZADOS:
            recreadores = [rec(u) for u in usernames]
            sol = Solicitud(
                empresa=empresa, fecha_evento=fecha, hora_inicio=ini, hora_fin=fin,
                ciudad=ciudad, direccion=f"Sede {empresa} — {ciudad}",
                cantidad_recreadores=len(recreadores), cantidad_personas=personas,
                tipo_publico=tipo_p, tipo_servicio=tipo_s,
                contacto=contacto, telefono_email=tel,
                observaciones="Servicio ya prestado.",
                observacion_final=obs_final,
                fecha_finalizacion=datetime.now(timezone.utc),
                estado="finalizado", recreador_id=recreadores[0].id, user_id=creador.id,
            )
            db.add(sol); db.flush()
            sol.recreadores = recreadores
            created += 1

        db.commit()
        print(f"\n✓ {created} solicitudes creadas para la semana {MON} a {SAT}.")
        print("  - 5 programadas (evento asignado, cada una a un recreador distinto)")
        print("  - 5 pendientes (sin revisar)")
        print("  - 5 por corregir")
        print("  - 5 finalizadas")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
