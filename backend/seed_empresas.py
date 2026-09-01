"""Seed de 20 empresas de prueba (nombre + NIT)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, engine, Base
from app.models.empresa import Empresa

Base.metadata.create_all(bind=engine)

EMPRESAS = [
    ("Bavaria S.A.",                     "860001995-1"),
    ("Ecopetrol",                        "899999068-1"),
    ("Bancolombia",                      "890903938-8"),
    ("Alkosto",                          "860514730-1"),
    ("EPM",                              "890904996-1"),
    ("Colegio San Luis Gonzaga",         "890700123-4"),
    ("Hospital Federico Lleras",         "890700456-2"),
    ("Seguros Bolívar",                  "860002503-1"),
    ("Municipio de Ibagué",              "800113389-2"),
    ("Claro Colombia",                   "830122566-1"),
    ("Nutresa",                          "890900943-1"),
    ("Avianca",                          "890100577-6"),
    ("Caja Compensar",                   "860007336-1"),
    ("Centro Comercial Multicentro",     "809009876-3"),
    ("Industrias Protela",               "890300567-9"),
    ("Comfenalco Valle",                 "890303093-1"),
    ("Éxito S.A.",                       "890900608-9"),
    ("Colombina S.A.",                   "890300681-1"),
    ("Alpina Productos",                 "860037621-1"),
    ("Sura Seguros",                     "890903407-9"),
]


def seed():
    db = SessionLocal()
    try:
        created = 0
        for nombre, nit in EMPRESAS:
            existing = db.query(Empresa).filter(Empresa.nit == nit).first()
            if existing:
                continue
            db.add(Empresa(nombre=nombre, nit=nit))
            created += 1
        db.commit()
        print(f"\n✓ {created} empresas creadas ({len(EMPRESAS) - created} ya existían).")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
